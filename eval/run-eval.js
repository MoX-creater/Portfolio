/**
 * RAG eval harness
 *
 * Hits POST /api/chat (SSE), reconstructs retrieved context from local KB
 * files using the source filenames/headings the API actually returned, then
 * scores each response:
 *   - faithfulness / relevance / key-facts: LLM-as-judge (Gemini, JSON)
 *   - correct refusal: deterministic + judge (out-of-scope only)
 *   - retrieval: filename overlap vs expected_source
 *
 * Usage:
 *   1. Start the API: npm run api
 *   2. Run eval:      npm run eval
 *
 * Env:
 *   EVAL_API_URL       default http://localhost:3001/api/chat
 *   GOOGLE_API_KEY     required for the judge
 *   GENERATION_MODEL   used as judge model (same as chat)
 *   JUDGE_MODEL        optional override
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KB_DIR = path.join(ROOT, 'knowledge-base');

dotenv.config({ path: path.join(ROOT, '.env') });

const API_URL = process.env.EVAL_API_URL || 'http://localhost:3001/api/chat';
const JUDGE_MODEL = process.env.JUDGE_MODEL || process.env.GENERATION_MODEL;
const REQUEST_TIMEOUT_MS = 90_000;
const DELAY_BETWEEN_QUESTIONS_MS = 400;
const KEY_FACTS_PASS_THRESHOLD = 0.5;

const DECLINE_PATTERNS = [
  /i don['’]?t have/i,
  /do not have that/i,
  /not in my (portfolio|documentation|knowledge)/i,
  /i don['’]?t know/i,
  /can['’]?t (answer|help with) that/i,
  /out of (my )?scope/i,
  /unrelated to (my )?portfolio/i,
  /feel free to ask about (my )?projects/i,
  /i['’]?m here to answer questions about/i,
  /no relevant information/i,
];

// ---------------------------------------------------------------------------
// SSE client
// ---------------------------------------------------------------------------

async function askChat(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} from ${API_URL}: ${body.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('Chat API returned no response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = null;
  let answer = '';
  let sources = [];
  let errorEvent = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        if (eventType === 'retrieval') {
          sources = Array.isArray(data.sources) ? data.sources : [];
        } else if (eventType === 'token') {
          answer += data.text || '';
        } else if (eventType === 'error') {
          errorEvent = data;
        }
      }
    }
  }

  if (errorEvent && !answer) {
    throw new Error(errorEvent.message || errorEvent.details || 'Chat API error event');
  }

  return { answer: answer.trim(), sources, errorEvent };
}

// ---------------------------------------------------------------------------
// Reconstruct retrieved context from local markdown (same ## chunking as ingest)
// ---------------------------------------------------------------------------

function chunkByHeadings(markdown) {
  const lines = markdown.split('\n');
  const chunks = [];
  let currentHeading = 'Introduction';
  let currentContent = [];
  let sectionIndex = 0;

  for (const line of lines) {
    if (line.match(/^##\s+[^#]/)) {
      if (currentContent.length > 0) {
        chunks.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
          sectionIndex: sectionIndex++,
        });
      }
      currentHeading = line.replace(/^##\s+/, '').trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    chunks.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
      sectionIndex,
    });
  }

  return chunks.filter((c) => c.content.length > 0);
}

const kbCache = new Map();

async function loadKbFile(filename) {
  const normalized = filename.replaceAll('\\', '/').replace(/^knowledge-base\//, '');
  if (kbCache.has(normalized)) return kbCache.get(normalized);

  const fullPath = path.join(KB_DIR, normalized);
  const markdown = await readFile(fullPath, 'utf8');
  const chunks = chunkByHeadings(markdown);
  const record = { markdown, chunks };
  kbCache.set(normalized, record);
  return record;
}

async function reconstructContext(sources) {
  if (!sources.length) {
    return { context: '', warnings: ['no sources returned by retrieval'] };
  }

  const parts = [];
  const warnings = [];

  for (const source of sources) {
    try {
      const { chunks, markdown } = await loadKbFile(source.filename);
      const match = chunks.find(
        (c) => c.heading.trim().toLowerCase() === String(source.heading || '').trim().toLowerCase()
      );
      if (match) {
        parts.push(`[${source.filename} — ${match.heading}]\n${match.content}`);
      } else {
        warnings.push(`heading miss: ${source.filename} / ${source.heading}; used full file`);
        parts.push(`[${source.filename} — FULL FILE FALLBACK]\n${markdown}`);
      }
    } catch (err) {
      warnings.push(`could not read ${source.filename}: ${err.message}`);
    }
  }

  return { context: parts.join('\n\n---\n\n'), warnings };
}

// ---------------------------------------------------------------------------
// Retrieval scoring
// ---------------------------------------------------------------------------

function normalizeFilename(name) {
  return String(name || '')
    .replaceAll('\\', '/')
    .replace(/^knowledge-base\//, '')
    .toLowerCase()
    .trim();
}

function filenamesMatch(expected, retrieved) {
  const e = normalizeFilename(expected);
  const r = normalizeFilename(retrieved);
  if (!e || !r) return false;
  return e === r || r.endsWith(e) || e.endsWith(r) || r.includes(path.posix.basename(e));
}

function scoreRetrieval(expectedSources, retrievedSources) {
  if (!expectedSources.length) {
    return {
      applicable: false,
      hit: null,
      recall: null,
      matched: [],
      retrieved_filenames: retrievedSources.map((s) => s.filename),
    };
  }

  const retrievedFiles = retrievedSources.map((s) => s.filename);
  const matched = expectedSources.filter((expected) =>
    retrievedFiles.some((got) => filenamesMatch(expected, got))
  );

  return {
    applicable: true,
    hit: matched.length > 0,
    recall: Number((matched.length / expectedSources.length).toFixed(3)),
    matched,
    retrieved_filenames: retrievedFiles,
  };
}

function looksLikeDecline(text) {
  if (!text) return false;
  return DECLINE_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// LLM-as-judge
// ---------------------------------------------------------------------------

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function judgeOnce(model, prompt) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });
  return extractJson(result.response.text());
}

function buildJudgePrompt({ question, expectedBehavior, expectedKeyFacts, answer, context }) {
  return `You are an evaluation judge for a portfolio RAG chatbot.
Score ONLY from the evidence given. Do not use outside knowledge.
Return JSON only, matching this schema exactly:

{
  "faithfulness": { "verdict": "pass" | "fail", "unsupported_claims": [string], "reasoning": string },
  "relevance": { "verdict": "pass" | "fail", "reasoning": string },
  "key_facts": { "found": [string], "missing": [string] },
  "refusal": { "declined": boolean, "hallucinated_answer": boolean, "reasoning": string }
}

Rules:
- faithfulness: FAIL if the answer states any concrete fact not supported by RETRIEVED CONTEXT. A refusal that does not invent facts is PASS. Citing a source name is fine. Soft hedging is fine.
- relevance: PASS if the answer addresses the user question. For expected_behavior=decline, a clear refusal/redirect is relevant.
- key_facts: For each item in expected_key_facts, put it in found if the answer conveys that fact (paraphrase OK), else missing. If expected_key_facts is empty, both arrays must be empty.
- refusal.declined: true if the assistant refused / said it doesn't have the info / redirected to portfolio topics.
- refusal.hallucinated_answer: true if it answered an out-of-scope question with a specific claim not grounded in context (e.g. naming a capital, food, GPA, or writing homework code as if that were portfolio fact).

expected_behavior: ${expectedBehavior}

QUESTION:
${question}

EXPECTED_KEY_FACTS:
${JSON.stringify(expectedKeyFacts)}

RETRIEVED CONTEXT:
${context || '(empty — no chunks retrieved)'}

ANSWER:
${answer || '(empty)'}
`;
}

async function runJudge(model, payload) {
  const prompt = buildJudgePrompt(payload);
  try {
    return await judgeOnce(model, prompt);
  } catch (firstErr) {
    try {
      return await judgeOnce(model, prompt);
    } catch (secondErr) {
      throw new Error(`Judge JSON parse/call failed: ${secondErr.message || firstErr.message}`);
    }
  }
}

function verdictPass(block) {
  return String(block?.verdict || '').toLowerCase() === 'pass';
}

function scoreQuestion({ item, answer, retrieval, judge, declineHeuristic }) {
  const expectedDecline = item.expected_behavior === 'decline';
  const declined = expectedDecline
    ? Boolean(judge?.refusal?.declined) || declineHeuristic
    : Boolean(judge?.refusal?.declined);
  const hallucinated = Boolean(judge?.refusal?.hallucinated_answer);

  const keyFacts = Array.isArray(item.expected_key_facts) ? item.expected_key_facts : [];
  const found = Array.isArray(judge?.key_facts?.found) ? judge.key_facts.found : [];
  const keyFactsRecall = keyFacts.length === 0 ? null : Number((found.length / keyFacts.length).toFixed(3));

  const faithfulness = verdictPass(judge?.faithfulness);
  const relevance = verdictPass(judge?.relevance);

  const correctRefusal = expectedDecline ? declined && !hallucinated : null;

  let passed;
  if (expectedDecline) {
    passed = Boolean(correctRefusal) && faithfulness;
  } else {
    const retrievalOk = retrieval.applicable ? retrieval.hit === true : true;
    const factsOk = keyFactsRecall === null ? true : keyFactsRecall >= KEY_FACTS_PASS_THRESHOLD;
    passed = faithfulness && relevance && retrievalOk && factsOk && !declined;
  }

  return {
    faithfulness,
    relevance,
    correct_refusal: correctRefusal,
    declined,
    hallucinated_answer: hallucinated,
    key_facts_recall: keyFactsRecall,
    key_facts_found: found,
    key_facts_missing: judge?.key_facts?.missing || [],
    passed,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function pad(str, n) {
  const s = String(str);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function yn(value) {
  if (value === null || value === undefined) return 'n/a';
  return value ? 'PASS' : 'FAIL';
}

function printTable(rows) {
  const header = [
    pad('ID', 5),
    pad('Category', 14),
    pad('Behavior', 9),
    pad('Faith', 6),
    pad('Rel', 6),
    pad('Refuse', 6),
    pad('Retr', 6),
    pad('Facts', 6),
    pad('Result', 6),
  ].join(' ');

  console.log('\n' + header);
  console.log('-'.repeat(header.length));

  for (const row of rows) {
    console.log(
      [
        pad(row.id, 5),
        pad(row.category, 14),
        pad(row.expected_behavior, 9),
        pad(yn(row.faithfulness), 6),
        pad(yn(row.relevance), 6),
        pad(yn(row.correct_refusal), 6),
        pad(row.retrieval_hit === null ? 'n/a' : yn(row.retrieval_hit), 6),
        pad(row.key_facts_recall === null ? 'n/a' : row.key_facts_recall.toFixed(2), 6),
        pad(row.passed ? 'PASS' : 'FAIL', 6),
      ].join(' ')
    );
  }
}

function aggregate(results) {
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { passed: 0, total: 0 };
    }
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
  }

  const faithfulness = results.filter((r) => r.scores.faithfulness !== null);
  const relevance = results.filter((r) => r.scores.relevance !== null);
  const refusal = results.filter((r) => r.scores.correct_refusal !== null);
  const retrieval = results.filter((r) => r.retrieval.applicable);

  const rate = (arr, pick) => {
    if (!arr.length) return null;
    const passed = arr.filter(pick).length;
    return { passed, total: arr.length, rate: Number((passed / arr.length).toFixed(3)) };
  };

  const overallPassed = results.filter((r) => r.scores.passed).length;

  return {
    overall: {
      passed: overallPassed,
      total: results.length,
      rate: results.length ? Number((overallPassed / results.length).toFixed(3)) : 0,
    },
    by_category: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [
        k,
        { ...v, rate: Number((v.passed / v.total).toFixed(3)) },
      ])
    ),
    faithfulness: rate(faithfulness, (r) => r.scores.faithfulness),
    relevance: rate(relevance, (r) => r.scores.relevance),
    correct_refusal: rate(refusal, (r) => r.scores.correct_refusal),
    retrieval_hit: rate(retrieval, (r) => r.retrieval.hit),
  };
}

function printSummary(summary) {
  const fmt = (block) =>
    !block ? 'n/a' : `${block.passed}/${block.total} (${(block.rate * 100).toFixed(1)}%)`;

  console.log('\nAggregate');
  console.log(`  overall:          ${fmt(summary.overall)}`);
  console.log(`  faithfulness:     ${fmt(summary.faithfulness)}`);
  console.log(`  relevance:        ${fmt(summary.relevance)}`);
  console.log(`  correct refusal:  ${fmt(summary.correct_refusal)}`);
  console.log(`  retrieval hit:    ${fmt(summary.retrieval_hit)}`);
  console.log('  by category:');
  for (const [cat, block] of Object.entries(summary.by_category)) {
    console.log(`    ${pad(cat, 14)} ${fmt(block)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is required for the LLM-as-judge. Set it in .env');
  }
  if (!JUDGE_MODEL) {
    throw new Error('Set GENERATION_MODEL or JUDGE_MODEL in .env for the judge call');
  }

  const questionsPath = path.join(__dirname, 'questions.json');
  const payload = JSON.parse(await readFile(questionsPath, 'utf8'));
  const questions = payload.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('eval/questions.json has no questions');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const judgeModel = genAI.getGenerativeModel({ model: JUDGE_MODEL });

  console.log(`Eval API:     ${API_URL}`);
  console.log(`Judge model:  ${JUDGE_MODEL}`);
  console.log(`Questions:    ${questions.length}`);

  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const item = questions[i];
    process.stdout.write(`\n[${i + 1}/${questions.length}] ${item.id} ${item.question}\n`);

    const row = {
      id: item.id,
      category: item.category,
      expected_behavior: item.expected_behavior,
      question: item.question,
      expected_key_facts: item.expected_key_facts,
      expected_source: item.expected_source,
    };

    try {
      const { answer, sources, errorEvent } = await askChat(item.question);
      const { context, warnings } = await reconstructContext(sources);
      const retrieval = scoreRetrieval(item.expected_source || [], sources);

      const judge = await runJudge(judgeModel, {
        question: item.question,
        expectedBehavior: item.expected_behavior,
        expectedKeyFacts: item.expected_key_facts || [],
        answer,
        context,
      });

      const scores = scoreQuestion({
        item,
        answer,
        retrieval,
        judge,
        declineHeuristic: looksLikeDecline(answer),
      });

      results.push({
        ...row,
        answer,
        sources,
        context_warnings: warnings,
        retrieval,
        judge,
        scores,
        api_error: errorEvent || null,
      });

      console.log(
        `  → ${scores.passed ? 'PASS' : 'FAIL'}  faith=${yn(scores.faithfulness)} rel=${yn(scores.relevance)} retr=${
          retrieval.applicable ? yn(retrieval.hit) : 'n/a'
        }`
      );
    } catch (err) {
      results.push({
        ...row,
        answer: null,
        sources: [],
        context_warnings: [],
        retrieval: scoreRetrieval(item.expected_source || [], []),
        judge: null,
        scores: {
          faithfulness: false,
          relevance: false,
          correct_refusal: item.expected_behavior === 'decline' ? false : null,
          declined: false,
          hallucinated_answer: false,
          key_facts_recall: null,
          key_facts_found: [],
          key_facts_missing: item.expected_key_facts || [],
          passed: false,
          error: err.message,
        },
        api_error: err.message,
      });
      console.log(`  → ERROR  ${err.message}`);
    }

    if (i < questions.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_QUESTIONS_MS));
    }
  }

  const tableRows = results.map((r) => ({
    id: r.id,
    category: r.category,
    expected_behavior: r.expected_behavior,
    faithfulness: r.scores.faithfulness,
    relevance: r.scores.relevance,
    correct_refusal: r.scores.correct_refusal,
    retrieval_hit: r.retrieval.applicable ? r.retrieval.hit : null,
    key_facts_recall: r.scores.key_facts_recall,
    passed: r.scores.passed,
  }));

  printTable(tableRows);

  const summary = aggregate(results);
  printSummary(summary);

  const output = {
    ran_at: new Date().toISOString(),
    api_url: API_URL,
    judge_model: JUDGE_MODEL,
    question_count: questions.length,
    pass_criteria: {
      answer:
        'faithfulness PASS AND relevance PASS AND retrieval hit AND key_facts_recall >= 0.5 AND did not decline',
      decline: 'correct refusal (declined, no hallucinated answer) AND faithfulness PASS',
      retrieval: 'hit if any expected_source filename appears in retrieved sources; skipped when expected_source is empty',
    },
    summary,
    results,
  };

  await mkdir(__dirname, { recursive: true });
  const outPath = path.join(__dirname, 'results.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote ${outPath}`);

  // Non-zero exit if overall is below a demo-ready bar so CI can fail closed.
  if (summary.overall.rate < 0.8) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nEval harness failed:', err.message);
  process.exit(1);
});
