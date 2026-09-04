# RAG Chatbot API Documentation

Complete retrieval + generation layer for your portfolio chatbot with SSE streaming.

## 🏗️ Architecture

```
User Query
    ↓
┌────────────────────────────────────────┐
│  POST /api/chat                        │
│  (Express Route)                       │
└────────────┬───────────────────────────┘
             │
             ├─→ 1. Validate Input (chat.js)
             │   ├─ Check query exists
             │   ├─ Check length (<500 chars)
             │   └─ Trim whitespace
             │
             ├─→ 2. Retrieve (retrieve.js)
             │   ├─ Generate query embedding (Gemini)
             │   ├─ Fetch all chunks from Firestore
             │   ├─ Compute cosine similarity (in-memory)
             │   └─ Return top-4 chunks
             │
             ├─→ 3. Generate (generate.js)
             │   ├─ Build system prompt (scoping rules)
             │   ├─ Format context from chunks
             │   ├─ Stream response (Gemini)
             │   └─ Yield tokens as they arrive
             │
             └─→ 4. Stream to Client (SSE)
                 ├─ Event: retrieval (metadata)
                 ├─ Event: token (text chunks)
                 ├─ Event: done (completion)
                 └─ Event: error (if failure)
```

## 📁 Files

### Core Modules

- **`retrieve.js`** - Retrieval logic (embedding + similarity search)
- **`generate.js`** - Generation logic (prompt building + streaming)
- **`chat.js`** - Express routes (SSE endpoint)
- **`server.js`** - Server setup and startup

### Key Functions

#### `retrieve.js`
```javascript
export async function retrieve(query, topK = 4)
```
- Takes user query string
- Returns array of relevant chunks with similarity scores
- **Throws** on embedding failure, Firestore errors, empty KB

#### `generate.js`
```javascript
export async function* generateStream(query, chunks)
```
- Async generator that yields text chunks
- Builds scoped prompt with strict rules
- Streams response from Gemini

#### `chat.js`
```javascript
router.post('/chat', async (req, res) => {...})
```
- Validates input
- Calls retrieve → generate
- Streams via SSE
- Handles errors gracefully

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

New dependencies added:
- `express` - Web server
- `cors` - Cross-origin requests

### 2. Start API Server
```bash
npm run api
```

Server runs on: `http://localhost:3001`

For development (with logging):
```bash
npm run api:dev
```

### 3. Test with curl

**Basic query:**
```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What backend technologies does Mohit use?"}'
```

**Expected output (SSE stream):**
```
event: retrieval
data: {"chunksFound":4,"sources":[...]}

event: token
data: {"text":"I"}

event: token
data: {"text":" primarily"}

event: token
data: {"text":" work with"}

...

event: done
data: {}
```

**Health check:**
```bash
curl http://localhost:3001/api/health
```

## 🌊 Server-Sent Events (SSE) Explained

### Why SSE Instead of Plain Fetch?

| Aspect | Plain Fetch | SSE |
|--------|------------|-----|
| **Latency** | Wait 3-5s for full response | First token in ~500ms |
| **UX** | Loading spinner only | See response build in real-time |
| **Cancellation** | Can't stop once started | Can abort mid-stream |
| **Connection** | One request/response | Persistent connection |
| **Complexity** | Simple | Slightly more complex |

### SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| **Direction** | Server → Client only | Bidirectional |
| **Setup** | Simple HTTP | Handshake required |
| **Reconnection** | Automatic | Manual |
| **Browser Support** | Native EventSource API | Native WebSocket API |
| **Proxy/Firewall** | Works everywhere | Sometimes blocked |
| **Use Case** | Chat, notifications, logs | Gaming, collaboration, real-time data |

**For RAG chatbot:** SSE is ideal because:
- Mostly server → client (streaming responses)
- Client → server only for new queries (separate HTTP request)
- Simpler implementation
- Better browser compatibility

**When to use WebSocket instead:**
- Need bidirectional real-time communication
- Multiple messages per second in both directions
- Real-time collaboration features

### Frontend Integration (SSE)

```javascript
// Frontend code to consume SSE stream
const eventSource = new EventSource('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'What projects has Mohit built?' })
});

// Handle retrieval metadata
eventSource.addEventListener('retrieval', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Found ${data.chunksFound} relevant sources`);
});

// Handle response tokens
eventSource.addEventListener('token', (e) => {
  const data = JSON.parse(e.data);
  appendToResponse(data.text); // Add to UI
});

// Handle completion
eventSource.addEventListener('done', () => {
  eventSource.close();
  console.log('Response complete');
});

// Handle errors
eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data);
  console.error('Error:', data.message);
  eventSource.close();
});
```

**Note:** Native EventSource doesn't support POST. Use `fetch` with manual SSE parsing:

```javascript
const response = await fetch('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'Your question here' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('event:')) {
      const eventType = line.slice(7).trim();
    } else if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(6));
      handleEvent(eventType, data);
    }
  }
}
```

## 🎯 Interview Explanation: SSE Streaming

**Question:** "Why did you use Server-Sent Events for your chatbot?"

**Answer:**

> "I chose SSE for the chatbot because it matches the communication pattern perfectly. In a chat interface, responses are primarily server-to-client, and SSE provides that one-way streaming with minimal setup. The key advantage is reducing perceived latency — instead of users waiting 3-5 seconds staring at a loading spinner, they see the first tokens appear in under 500ms and watch the response build in real-time, just like ChatGPT.
>
> I considered WebSocket but decided against it because:
> 1. We don't need bidirectional real-time communication — the client only sends a new message when the user submits a query, which can be a separate HTTP request
> 2. SSE has better compatibility with proxies and firewalls since it's just HTTP
> 3. Browsers handle reconnection automatically with EventSource
> 4. The implementation is simpler — no handshake protocol
>
> The trade-off is that SSE can't send data from client to server after the connection is established, but that's not an issue for chat where each query is independent. If I were building real-time collaboration or a multiplayer game, I'd use WebSocket instead."

**Follow-up:** "What about scaling concerns?"

> "At high concurrency, SSE connections consume server resources since each client holds an open HTTP connection. I'd implement:
> 1. Request queuing to limit concurrent streams
> 2. Connection timeouts to prevent abandoned connections
> 3. Load balancing across multiple server instances
> 4. Caching for common queries (though that's harder with streams)
>
> For my portfolio site, I'm expecting <100 concurrent users max, so a single Node.js server handles this fine. At enterprise scale (1000s of concurrent users), I'd use a WebSocket gateway or a managed service like Pusher/Ably."

## 🚨 Error Handling

### Input Validation Errors (400)
```json
{
  "error": "Query is required"
}
```
```json
{
  "error": "Query too long. Maximum 500 characters allowed."
}
```

### Retrieval Errors (SSE stream)
```
event: error
data: {"message":"Failed to search knowledge base","details":"..."}
```

### Generation Errors (SSE stream)
```
event: error
data: {"message":"Failed to generate response","details":"Google API quota exceeded"}
```

### Health Check Unhealthy (503)
```json
{
  "status": "unhealthy",
  "components": {
    "retrieval": { "status": "unhealthy", "error": "..." },
    "generation": { "status": "healthy" }
  }
}
```

## ⚠️ Scaling Limitations

### Current Design Breaks At:

#### 1. **>1000 Chunks in Knowledge Base**
**Problem:** `retrieve.js` loads all chunks into memory and computes similarity client-side.

**Symptoms:**
- Query latency >500ms
- High memory usage (~100MB+ for 5000 chunks)
- Firestore reads scaling cost

**Solution:**
Migrate to a vector database:
```javascript
// Replace retrieve.js Firestore fetch with:
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index('portfolio-kb');

const results = await index.query({
  vector: queryEmbedding,
  topK: 4,
  includeMetadata: true,
});
```

**Migration effort:** ~1-2 hours

#### 2. **>100 Concurrent Users**
**Problem:** Each SSE connection holds open an HTTP connection.

**Symptoms:**
- Server runs out of file descriptors
- Response latency increases
- Server becomes unresponsive

**Solution:**
- Implement request queuing
- Use multiple server instances behind load balancer
- Add Redis for distributed connection tracking

#### 3. **High Query Volume (>10k/day)**
**Problem:** Google API free tier quota (1M requests/month for embeddings).

**Symptoms:**
- 429 rate limit errors
- Users get "quota exceeded" errors

**Solution:**
- Implement response caching (Redis)
- Upgrade to paid API tier
- Use semantic caching (cluster similar queries)

#### 4. **Complex Conversations**
**Problem:** Current design treats each query independently (stateless).

**Symptoms:**
- Can't handle follow-up questions
- No conversation context

**Solution:**
- Add conversation history storage (Firestore)
- Include last N messages in retrieval query
- Implement session management

### When to Worry
- ✅ <500 chunks: Current design is perfect
- ⚠️ 500-1000 chunks: Monitor latency
- ❌ >1000 chunks: Migrate to vector DB
- ✅ <50 concurrent users: Fine
- ⚠️ 50-100 concurrent: Add monitoring
- ❌ >100 concurrent: Need load balancing

## 🔧 Configuration

### Environment Variables (.env)
```env
# Google Gemini API
GOOGLE_API_KEY=your_api_key

# Firebase
FIREBASE_PROJECT_ID=your_project_id
# ... (other Firebase vars)

# API Server
API_PORT=3001           # Optional, defaults to 3001
NODE_ENV=development    # Optional, enables request logging
```

### Tunable Parameters

**In retrieve.js:**
```javascript
const DEFAULT_TOP_K = 4;              // Number of chunks to retrieve
const MIN_SIMILARITY_THRESHOLD = 0.3; // Filter low-relevance chunks
```

**In chat.js:**
```javascript
const MAX_QUERY_LENGTH = 500;         // Prevent abuse
const REQUEST_TIMEOUT_MS = 60000;     // 60 seconds
```

**In generate.js:**
```javascript
const GENERATION_MODEL = 'gemini-2.0-flash-exp'; // LLM model
```

## 🧪 Testing

### Unit Test Retrieval
```javascript
import { retrieve } from './api/retrieve.js';

const results = await retrieve('What is the Flash Sale Engine?', 4);
console.log(results);
// Should return chunks from flash-sale-engine.md
```

### Unit Test Generation
```javascript
import { generateStream } from './api/generate.js';

const chunks = [{ content: '...', source: 'test' }];

for await (const token of generateStream('Tell me about this', chunks)) {
  process.stdout.write(token);
}
```

### Integration Test
```bash
# Start server
npm run api

# In another terminal
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What technologies does Mohit know?"}'
```

## 📊 Performance Expectations

| Operation | Latency | Notes |
|-----------|---------|-------|
| Query embedding | ~100-150ms | Google API call |
| Fetch chunks | ~50-100ms | Firestore query |
| Similarity compute | ~10-20ms | In-memory, O(n) |
| **Total retrieval** | **~160-270ms** | Sum of above |
| First token | ~500ms | LLM cold start |
| Subsequent tokens | ~50ms each | Streaming |
| **Full response** | **~3-5s** | 50-100 tokens |

## 🎓 Key Takeaways

### What You Built
1. ✅ Complete RAG pipeline (retrieve → generate)
2. ✅ Streaming SSE responses for better UX
3. ✅ Strict scoping to prevent hallucination
4. ✅ Graceful error handling
5. ✅ Input validation and security

### Design Trade-offs
1. **In-memory vector search** → Simple but doesn't scale beyond 1000 chunks
2. **SSE vs WebSocket** → Simpler, sufficient for chat use case
3. **Google Gemini** → Free tier, matches existing stack
4. **Stateless queries** → Simpler but no conversation context

### Production-Ready Features
- ✅ Error handling with actionable messages
- ✅ Input validation (empty, length checks)
- ✅ Health check endpoint
- ✅ CORS support
- ✅ Request timeouts
- ✅ Graceful shutdown

### Still Need For Production
- ⚠️ Rate limiting (prevent abuse)
- ⚠️ Authentication (if not public)
- ⚠️ Response caching (reduce API costs)
- ⚠️ Logging/monitoring (track usage)
- ⚠️ Vector database (if scaling beyond 1000 chunks)

## 📚 Further Reading

- [Server-Sent Events Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SSE vs WebSocket](https://ably.com/topic/server-sent-events-vs-websockets)
- [Vector Databases Comparison](https://www.pinecone.io/learn/vector-database/)
- [RAG Best Practices](https://www.anthropic.com/index/retrieval-augmented-generation)
