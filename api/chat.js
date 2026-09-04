/**
 * Express Chat API Route
 *
 * POST /api/chat — SSE streaming RAG responses
 *
 * Flow:
 * 1. Rate limit (per IP)
 * 2. Validate query (empty / length / obvious injection tripwire)
 * 3. Retrieve chunks
 * 4. Generate with retries on transient Gemini failures
 * 5. Stream tokens via SSE
 */

import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { retrieve } from './retrieve.js';
import { generateStream } from './generate.js';

const router = express.Router();

const MAX_QUERY_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10);
const RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? String(60 * 60 * 1000),
  10
);

const RATE_LIMIT_MESSAGE = "You've hit the demo rate limit, try again later";
const GENERATION_FALLBACK =
  'Having trouble generating a response right now, try again in a moment';
const RETRIEVAL_FALLBACK =
  'Having trouble searching the knowledge base right now, try again in a moment';
const UNEXPECTED_FALLBACK =
  'Something went wrong. Please try again in a moment.';
const INJECTION_FALLBACK =
  'That looks like an attempt to override the assistant. Ask about my projects, skills, or background instead.';

// High-precision tripwire only — real isolation lives in generate.js (systemInstruction).
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions/i,
  /forget\s+(all\s+)?(your|the)\s+(previous|prior|above)\s+(instructions|rules|prompt)/i,
  /disregard\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /override\s+(the\s+)?(system|previous)\s+(prompt|instructions)/i,
  /you\s+are\s+now\s+(DAN|jailbroken|unrestricted|a\s+different)/i,
  /\bjailbreak\b/i,
  /new\s+system\s+prompt\s*:/i,
];

function parsePositiveInt(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const rateLimitMax = parsePositiveInt(RATE_LIMIT_MAX, 10);
const rateLimitWindowMs = parsePositiveInt(RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000);

const chatRateLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  limit: rateLimitMax || 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => rateLimitMax === 0,
  handler: (req, res) => {
    console.warn(
      `[abuse] rate_limited ip=${clientIp(req)} ts=${new Date().toISOString()} len=${queryLength(req)}`
    );
    res.status(429).json({ error: RATE_LIMIT_MESSAGE });
  },
});

router.use(cors());
router.use(express.json());

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function queryLength(req) {
  const query = req.body?.query;
  return typeof query === 'string' ? query.length : 0;
}

function logRequest(req) {
  console.log(
    `[abuse] ip=${clientIp(req)} ts=${new Date().toISOString()} path=${req.originalUrl || req.path} len=${queryLength(req)}`
  );
}

function looksLikeInjection(text) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Empty / whitespace / length already existed — extended with injection tripwire only.
 */
function validateQuery(query) {
  if (!query) {
    return { valid: false, error: 'Query is required' };
  }

  if (typeof query !== 'string') {
    return { valid: false, error: 'Query must be a string' };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters allowed.`,
    };
  }

  if (looksLikeInjection(trimmed)) {
    return { valid: false, error: INJECTION_FALLBACK };
  }

  return { valid: true };
}

function isRetryableGenerationError(error) {
  const message = error?.message || '';
  return (
    message.includes('503') ||
    message.includes('overloaded') ||
    message.includes('timeout') ||
    message.includes('quota')
  );
}

function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sendSSE(res, eventType, data) {
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function endSSE(res) {
  res.write('event: done\n');
  res.write('data: {}\n\n');
  res.end();
}

function sendClientError(res, { sseStarted, isClientDisconnected, message }) {
  if (isClientDisconnected) return;

  if (!sseStarted && !res.headersSent) {
    res.status(503).json({ error: message });
    return;
  }

  sendSSE(res, 'error', { message });
  endSSE(res);
}

router.post('/chat', chatRateLimiter, async (req, res) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);

  let isClientDisconnected = false;
  let sseStarted = false;

  logRequest(req);

  try {
    const { query } = req.body;
    const validation = validateQuery(query);

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const trimmedQuery = query.trim();

    setupSSE(res);
    sseStarted = true;

    res.on('close', () => {
      if (!res.writableEnded) {
        console.log('[chat.js] Client disconnected before completion');
        isClientDisconnected = true;
      }
    });

    let retrievedChunks;

    try {
      retrievedChunks = await retrieve(trimmedQuery);

      sendSSE(res, 'retrieval', {
        chunksFound: retrievedChunks.length,
        sources: retrievedChunks.map((c) => ({
          filename: c.filename,
          heading: c.heading,
          similarity: c.similarity,
        })),
      });

      if (retrievedChunks.length === 0) {
        sendSSE(res, 'token', {
          text: "I don't have any relevant information about that in my portfolio. Feel free to ask about my projects, technical skills, or background!",
        });
        endSSE(res);
        return;
      }
    } catch (error) {
      console.error('[chat.js] Retrieval error:', error);
      sendClientError(res, {
        sseStarted,
        isClientDisconnected,
        message: RETRIEVAL_FALLBACK,
      });
      return;
    }

    try {
      console.log('[chat.js] Starting generation, chunks:', retrievedChunks.length);

      let tokenCount = 0;
      let attempt = 0;
      let success = false;
      let lastError = null;

      while (attempt <= MAX_RETRIES && !success && !isClientDisconnected) {
        try {
          attempt += 1;
          if (attempt > 1) {
            console.log(`[chat.js] Retry attempt ${attempt}/${MAX_RETRIES + 1}`);
          }

          tokenCount = 0;
          for await (const textChunk of generateStream(trimmedQuery, retrievedChunks)) {
            tokenCount += 1;

            if (isClientDisconnected) {
              console.log('[chat.js] Client disconnected during generation, stopping');
              return;
            }

            sendSSE(res, 'token', { text: textChunk });
          }

          success = true;
          console.log(`[chat.js] Generation complete, tokens: ${tokenCount}`);
        } catch (error) {
          lastError = error;
          console.error('[chat.js] Generation attempt failed:', error.message);

          const canRetry =
            isRetryableGenerationError(error) &&
            attempt <= MAX_RETRIES &&
            tokenCount === 0 &&
            !isClientDisconnected;

          if (canRetry) {
            console.log(
              `[chat.js] Transient API error, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES + 1})`
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            throw error;
          }
        }
      }

      if (success && !isClientDisconnected) {
        endSSE(res);
      } else if (!success && !isClientDisconnected) {
        throw lastError || new Error('Generation failed');
      }
    } catch (error) {
      console.error('[chat.js] Generation failed after retries:', error);
      sendClientError(res, {
        sseStarted,
        isClientDisconnected,
        message: GENERATION_FALLBACK,
      });
    }
  } catch (error) {
    console.error('[chat.js] Unexpected error:', error);
    sendClientError(res, {
      sseStarted,
      isClientDisconnected,
      message: UNEXPECTED_FALLBACK,
    });
  }
});

router.get('/health', async (req, res) => {
  try {
    const { healthCheck: retrieveHealth } = await import('./retrieve.js');
    const { healthCheck: generateHealth } = await import('./generate.js');

    const [retrieveStatus, generateStatus] = await Promise.all([
      retrieveHealth(),
      generateHealth(),
    ]);

    const overallHealthy =
      retrieveStatus.status === 'healthy' && generateStatus.status === 'healthy';

    res.status(overallHealthy ? 200 : 503).json({
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      components: {
        retrieval: retrieveStatus,
        generation: generateStatus,
      },
    });
  } catch (error) {
    console.error('[chat.js] Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

router.use((error, req, res, next) => {
  console.error('[chat.js] Unhandled error:', error);

  if (!res.headersSent) {
    res.status(500).json({ error: UNEXPECTED_FALLBACK });
  }
});

export { rateLimitMax, rateLimitWindowMs };
export default router;
