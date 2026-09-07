# RAG Chatbot API Documentation

Retrieval + generation layer for the portfolio chatbot, with SSE streaming.

## Architecture

```
User Query
    │
    ▼
POST /api/chat  (chat.js)
    │
    ├─→ 1. Validate input
    │     • query exists, non-empty
    │     • length ≤ 500 chars
    │
    ├─→ 2. Retrieve  (retrieve.js)
    │     • embed the query (Gemini)
    │     • fetch chunk embeddings from Firestore
    │     • compute cosine similarity in-memory
    │     • return top-k chunks + similarity scores
    │
    ├─→ 3. Generate  (generate.js)
    │     • build a system prompt scoped to the retrieved context
    │     • stream the response from Gemini
    │     • retry transient failures with the existing retry policy
    │     • try the fallback model once after exhausted high-demand 503 failures
    │
    └─→ 4. Stream to client (SSE)
          • event: retrieval  — sources + similarity scores
          • event: token      — text chunks as they arrive
          • event: done       — stream complete
          • event: error      — failure, with a client-safe message
```

## Files

- **`retrieve.js`** — query embedding + Firestore similarity search
- **`generate.js`** — prompt construction + streaming generation, with retry logic
- **`chat.js`** — the `/api/chat` route: validation, orchestration, SSE writing, disconnect handling
- **`server.js`** — server setup, CORS, rate limiting, startup

### Key functions

```javascript
// retrieve.js
export async function retrieve(query, topK = 4)
// Returns relevant chunks with similarity scores. Throws on embedding
// failure, Firestore errors, or an empty knowledge base.
```

```javascript
// generate.js
export async function* generateStream(query, chunks)
// Async generator yielding text chunks, streamed from the Gemini API.
```

```javascript
// chat.js
router.post('/chat', async (req, res) => { ... })
// Validates input, calls retrieve → generate, streams the result via SSE.
```

## Running the API

```bash
npm install
node api/server.js
```

Server runs on `http://localhost:3001` locally (Render assigns `PORT` in production — the server reads `process.env.PORT || 3001`, so this works in both environments without a code change).

### Test with curl

```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What backend technologies does Mohit use?"}'
```

Expected SSE stream:
```
event: retrieval
data: {"chunksFound":4,"sources":[{"filename":"skills.md","heading":"Backend Technologies","similarity":0.75}]}

event: token
data: {"text":"I"}

event: token
data: {"text":" primarily work with"}

...

event: done
data: {}
```

Health check:
```bash
curl http://localhost:3001/api/health
```

## Why Server-Sent Events

| | Plain request/response | SSE |
|---|---|---|
| Perceived latency | Wait for the full response | First token arrives as soon as generation starts |
| UX | Spinner, then a wall of text | Response builds token by token |
| Connection | One request, one response | Persistent connection until `done` |

**SSE vs WebSocket, for this use case:** the traffic here is almost entirely server → client (streaming an answer); the client only sends something new when the user submits another query, which is naturally a separate request. That asymmetry is exactly what SSE is for. WebSocket would add a handshake and bidirectional complexity this app doesn't need — it would make sense for something like live collaboration or a multiplayer feature, not a single-turn chat response.

**Trade-off:** SSE can't carry client → server data after the connection opens. Not a problem here, since each query is a fresh request.

### Frontend integration

Native `EventSource` doesn't support POST requests with a body, which this endpoint requires — so the frontend uses `fetch` with manual SSE parsing instead:

```javascript
const response = await fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: userQuery }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split('\n\n');
  buffer = events.pop(); // keep any incomplete event for the next chunk

  for (const rawEvent of events) {
    const lines = rawEvent.split('\n');
    const eventType = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
    const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
    if (eventType && dataLine) {
      handleEvent(eventType, JSON.parse(dataLine));
    }
  }
}
```

## Error Handling

**Input validation (400):**
```json
{ "error": "Query is required" }
```
```json
{ "error": "Query too long. Maximum 500 characters allowed." }
```

**Retrieval or generation failures (SSE event, not an HTTP error status — the stream is already open):**
```
event: error
data: {"message":"Having trouble generating a response right now, try again in a moment"}
```
The client only ever sees a generic, safe message here — the real error (e.g. a specific API failure or quota message) is logged server-side, not exposed to the response.

**Health check (503 if unhealthy):**
```json
{
  "status": "unhealthy",
  "components": {
    "retrieval": { "status": "unhealthy", "error": "..." },
    "generation": { "status": "healthy" }
  }
}
```

## Configuration

```env
GOOGLE_API_KEY=your_api_key
FIREBASE_PROJECT_ID=your_project_id
GENERATION_MODEL=models/gemini-3.6-flash   # see note below
FALLBACK_GENERATION_MODEL=models/gemini-3.5-flash-lite
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=3600000
ALLOWED_ORIGINS=https://portfolio1-7zp.pages.dev
```

> **Why `GENERATION_MODEL` is an env var, not hardcoded:** during development, Gemini model names were deprecated and swapped out multiple times — a model that worked one day 404'd the next. Keeping this configurable means a deprecation is a Render dashboard change, not a redeploy.

`FALLBACK_GENERATION_MODEL` is attempted once only when all primary retries fail with a high-demand 503. Set it to a stable, lower-demand model such as `models/gemini-3.5-flash-lite`, and configure the same variable in Render.

**Tunable parameters:**
- `retrieve.js` — `DEFAULT_TOP_K` (chunks retrieved per query), similarity threshold for filtering low-relevance matches
- `chat.js` — `MAX_QUERY_LENGTH` (currently 500 chars)

## Scaling Considerations

This is intentionally a small-scale, low-cost design. It's worth being explicit about where it would need to change under real load, rather than pretending it's infinitely scalable:

**In-memory similarity search (`retrieve.js`)**
Works fine for the current knowledge base size (dozens of chunks). If the knowledge base grew into the thousands, fetching every chunk and computing similarity in-memory on every request would become a real latency and cost problem — that's the point to migrate to a dedicated vector database with native similarity search.

**Concurrent SSE connections**
Each open chat request holds a connection for the duration of generation. Fine at portfolio-site traffic levels; would need connection limits, load balancing, or a queue at meaningfully higher concurrency.

**API quota**
The backend retries transient generation failures using the configured retry policy, then tries the fallback model once for exhausted high-demand 503 failures. A sustained spike in traffic could still hit Gemini's rate/quota limits — this happened during development from testing volume alone, not real traffic. Per-IP rate limiting (see `RATE_LIMIT_MAX`) is the current mitigation.

**Stateless queries**
Each request is independent — there's no conversation memory across turns. A follow-up question like "tell me more about that" has no prior context to resolve against. Adding session-based history would be the next step if multi-turn conversation mattered here.

## Testing

**Manual retrieval check:**
```javascript
import { retrieve } from './api/retrieve.js';
const results = await retrieve('What is the Flash Sale Engine?', 4);
console.log(results);
```

**Manual generation check:**
```javascript
import { generateStream } from './api/generate.js';
for await (const token of generateStream('Tell me about this', chunks)) {
  process.stdout.write(token);
}
```

**End-to-end:** see the `/eval` harness for automated, scored testing rather than one-off manual checks — that's the more meaningful test suite for this project's actual purpose.

## What's Actually Implemented vs. Still Open

**In place:**
- Full retrieve → generate pipeline with streaming
- Strict context-scoping to reduce hallucination, with graceful decline on out-of-scope questions
- Input validation, per-IP rate limiting, explicit CORS allowlist
- Retry logic for transient generation failures
- Health check endpoint
- Automated eval harness (faithfulness, relevance, correct-refusal scoring)

**Deliberately out of scope for this project:**
- Authentication (this is a public, read-only demo endpoint by design)
- Response caching (traffic volume doesn't currently justify the complexity)
- Multi-turn conversation memory
- Vector database migration (not needed at current knowledge base size)

## Further Reading

- [Server-Sent Events spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SSE vs WebSocket](https://ably.com/topic/server-sent-events-vs-websockets)
