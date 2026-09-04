# RAG Chatbot API - Complete Guide

Complete retrieval + generation layer for your portfolio chatbot with SSE streaming.

## 🎯 What Was Built

A production-ready API that:
1. ✅ Takes user queries
2. ✅ Retrieves relevant chunks from your knowledge base (Firestore)
3. ✅ Generates scoped, factual responses using Google Gemini
4. ✅ Streams responses in real-time via Server-Sent Events
5. ✅ Handles errors gracefully with clear messages

## 📁 File Structure

```
api/
├── retrieve.js         # Retrieval logic (embedding + similarity)
├── generate.js         # Generation logic (prompting + streaming)
├── chat.js            # Express routes (SSE endpoint)
├── server.js          # Server setup
├── test-client.js     # CLI test client
└── README.md          # Detailed documentation
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

New dependencies:
- `express` - Web server
- `cors` - CORS support

### 2. Ensure Knowledge Base is Populated

```bash
# If you haven't run ingestion yet:
npm run ingest
```

This populates Firestore's `kb_chunks` collection.

### 3. Start API Server

```bash
npm run api
```

Server runs on: `http://localhost:3001`

**Expected output:**
```
======================================================================
Portfolio RAG Chatbot API Server
======================================================================
Server running on: http://localhost:3001
Environment: production

Available endpoints:
  POST http://localhost:3001/api/chat
  GET  http://localhost:3001/api/health

Example request:
  curl -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"query": "What technologies does Mohit use?"}'
======================================================================

✓ Server ready to accept connections
```

### 4. Test with CLI Client

```bash
node api/test-client.js "What backend technologies does Mohit use?"
```

**Expected output:**
```
======================================================================
CHATBOT RESPONSE
======================================================================

📚 Found 4 relevant sources:
   1. skills.md - Backend Technologies (92.3%)
   2. projects/flash-sale-engine.md - Technology Stack (87.1%)
   3. about.md - Technical Focus (81.2%)
   4. faq.md - What backend technologies are you most comfortable with? (79.5%)

💬 Response:

I primarily work with Spring Boot as my main backend framework, along with Redis for caching and distributed locking, and RabbitMQ for message queuing...

======================================================================
✓ Response complete
```

### 5. Test with curl

```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about the Flash Sale Engine project"}'
```

The `-N` flag disables buffering so you see tokens stream in real-time.

## 📡 API Reference

### POST /api/chat

**Request:**
```json
{
  "query": "What backend technologies does Mohit use?"
}
```

**Response:** Server-Sent Events (SSE) stream

**Event Types:**

1. **`retrieval`** - Metadata about retrieved chunks
```
event: retrieval
data: {"chunksFound":4,"sources":[{"filename":"skills.md","heading":"Backend Technologies","similarity":0.923},...]}
```

2. **`token`** - Text chunks from LLM response
```
event: token
data: {"text":"I primarily work"}
```

3. **`done`** - Stream completion
```
event: done
data: {}
```

4. **`error`** - Error occurred
```
event: error
data: {"message":"Failed to generate response","details":"Google API quota exceeded"}
```

**Status Codes:**
- `200` - Success (SSE stream)
- `400` - Invalid query (empty, too long)
- `500` - Server error

**Validation Rules:**
- Query must be non-empty string
- Maximum 500 characters
- Trimmed of whitespace

### GET /api/health

Health check endpoint to verify system status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-09-03T10:30:00.000Z",
  "components": {
    "retrieval": {
      "status": "healthy",
      "chunkCount": 52,
      "embeddingModel": "text-embedding-004",
      "vectorDimensions": 768,
      "scalingLimit": "~1000 chunks (current in-memory approach)"
    },
    "generation": {
      "status": "healthy",
      "model": "gemini-2.0-flash-exp",
      "streaming": true,
      "provider": "Google Gemini"
    }
  }
}
```

**Status Codes:**
- `200` - All systems healthy
- `503` - One or more components unhealthy

## 🎨 Frontend Integration

### Using Fetch API (Recommended)

```javascript
async function queryChatbot(question) {
  const response = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question }),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let eventType = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data:')) {
        const data = JSON.parse(line.slice(6));
        handleEvent(eventType, data);
      }
    }
  }
}

function handleEvent(type, data) {
  switch (type) {
    case 'retrieval':
      console.log(`Found ${data.chunksFound} sources`);
      break;
    case 'token':
      appendToUI(data.text);
      break;
    case 'done':
      console.log('Response complete');
      break;
    case 'error':
      showError(data.message);
      break;
  }
}
```

### React Example

```typescript
import { useState } from 'react';

export function ChatInterface() {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState([]);
  
  async function askQuestion(query: string) {
    setLoading(true);
    setResponse('');
    setSources([]);
    
    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = null;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data:')) {
            const data = JSON.parse(line.slice(6));
            
            switch (eventType) {
              case 'retrieval':
                setSources(data.sources);
                break;
              case 'token':
                setResponse(prev => prev + data.text);
                break;
              case 'error':
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div>
      {/* Your UI here */}
    </div>
  );
}
```

## 🧪 Testing

### 1. Health Check

```bash
curl http://localhost:3001/api/health
```

Should return `200` with healthy status.

### 2. Basic Query

```bash
node api/test-client.js "What technologies does Mohit know?"
```

Should stream a response mentioning Java, Spring Boot, React, etc.

### 3. Query with No Results

```bash
node api/test-client.js "What is the capital of France?"
```

Should respond with "I don't have that information in my portfolio."

### 4. Empty Query (Should Fail)

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": ""}'
```

Should return `400` with error "Query cannot be empty".

### 5. Long Query (Should Fail)

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "'$(python3 -c 'print("a" * 600)')'"}'
```

Should return `400` with error "Query too long".

## 🔧 Configuration

### Environment Variables

Add to your `.env`:

```env
# API Server Configuration
API_PORT=3001              # Optional, defaults to 3001
NODE_ENV=development       # Optional, enables request logging

# Already configured from Phase 1:
GOOGLE_API_KEY=...
FIREBASE_PROJECT_ID=...
# ... other Firebase vars
```

### Tunable Parameters

**Number of chunks to retrieve (retrieve.js):**
```javascript
const DEFAULT_TOP_K = 4;  // Increase for more context, decrease for speed
```

**Similarity threshold (retrieve.js):**
```javascript
const MIN_SIMILARITY_THRESHOLD = 0.3;  // Lower = more lenient, higher = stricter
```

**Query length limit (chat.js):**
```javascript
const MAX_QUERY_LENGTH = 500;  // Adjust based on your needs
```

**LLM model (generate.js):**
```javascript
const GENERATION_MODEL = 'gemini-2.0-flash-exp';
// Alternatives: 'gemini-1.5-flash', 'gemini-1.5-pro'
```

## ⚠️ Scaling Limitations

### What Will Break and When

#### 1. In-Memory Vector Search (>1000 chunks)

**Current approach:** Loads all chunks into memory, computes cosine similarity.

**Breaks at:** ~1000-5000 chunks
- Query latency: >500ms
- Memory usage: ~100MB for 5000 chunks
- Firestore read costs scale linearly

**Fix:** Migrate to vector database (Pinecone, Vertex AI, Weaviate)

**How to detect:** Monitor `/api/health` response:
```json
{
  "retrieval": {
    "chunkCount": 987,  // Getting close!
    "scalingLimit": "~1000 chunks"
  }
}
```

#### 2. Concurrent Connections (>100 users)

**Current approach:** One SSE connection per active user.

**Breaks at:** ~100-500 concurrent users
- Server runs out of file descriptors
- Response latency increases
- CPU usage spikes

**Fix:**
- Request queuing
- Multiple server instances behind load balancer
- Connection pooling

**How to detect:**
- Monitor server CPU/memory
- Track concurrent connection count
- Watch for "EMFILE" errors (too many open files)

#### 3. API Quota (>1M embeddings/month)

**Current approach:** Google Gemini free tier.

**Breaks at:** 1M embedding requests/month (~33k/day)

**Fix:**
- Response caching (Redis)
- Semantic caching (similar queries)
- Upgrade to paid tier

**How to detect:**
- 429 errors from Google API
- Users see "quota exceeded" messages

### When to Act

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Chunks | <500 | 500-1000 | >1000 |
| Concurrent users | <50 | 50-100 | >100 |
| Query latency | <300ms | 300-500ms | >500ms |
| Memory usage | <200MB | 200-500MB | >500MB |

## 🎓 Interview Questions & Answers

### Q: Why did you use SSE instead of WebSocket?

**A:** "SSE matches the communication pattern perfectly for chat. Responses are primarily server-to-client, and SSE provides that one-way streaming with minimal setup. The key advantage is reducing perceived latency — users see the first token in ~500ms instead of waiting 3-5s for a complete response.

I considered WebSocket but decided against it because:
1. We don't need bidirectional real-time — each query is independent
2. SSE has better proxy/firewall compatibility (it's just HTTP)
3. Browsers handle reconnection automatically
4. Simpler implementation (no handshake protocol)

If I were building real-time collaboration or a multiplayer game, I'd use WebSocket instead."

### Q: How does your retrieval system work?

**A:** "It's a semantic search pipeline:

1. **Query embedding:** Convert user question to a 768-dimension vector using Google Gemini's `text-embedding-004` model (same model used during ingestion)

2. **Similarity search:** Fetch all chunks from Firestore and compute cosine similarity between query embedding and each chunk embedding in-memory

3. **Ranking:** Sort by similarity score and return top 4 chunks above a 0.3 threshold

This works well for my portfolio scale (<100 chunks) but doesn't scale beyond ~1000 chunks. At that point, I'd migrate to a vector database like Pinecone that uses approximate nearest neighbor (ANN) algorithms for O(log n) search instead of O(n)."

### Q: How do you prevent hallucination?

**A:** "I use a strict system prompt that scopes the assistant's behavior:

1. **Context-only answers:** Explicitly instructs to answer ONLY from provided chunks
2. **Admission of ignorance:** If context doesn't contain the answer, must say so rather than guessing
3. **Source citation:** Must cite which document/project the answer came from
4. **Scope enforcement:** Redirects off-topic questions back to portfolio content

The system prompt is injected as the first message in the chat history, and the user query includes the retrieved context formatted with clear source labels. This gives the LLM no ambiguity about what it can and cannot answer."

### Q: What would you change for production?

**A:**
1. **Rate limiting:** Prevent abuse (e.g., 10 requests/minute per IP)
2. **Caching:** Cache responses for common queries (Redis)
3. **Monitoring:** Track query latency, error rates, API costs
4. **Authentication:** If not public-facing
5. **Vector DB:** Migrate retrieval to Pinecone/Vertex AI for scalability
6. **Conversation history:** Store last N messages for follow-up questions
7. **Load balancing:** Multiple server instances behind load balancer
8. **CI/CD:** Automated testing and deployment"

## 🐛 Troubleshooting

### Server won't start

**Symptoms:** Error on `npm run api`

**Solutions:**
1. Check port 3001 is available: `lsof -i :3001` (kill if occupied)
2. Verify environment variables: `cat .env`
3. Check Node version: `node --version` (need v16+)

### "Permission denied" from Firestore

**Symptoms:** Error event: "Firestore permission denied"

**Solutions:**
1. Update Firestore rules in Firebase Console
2. Ensure rules allow reads:
   ```javascript
   match /kb_chunks/{document=**} {
     allow read: if true;
   }
   ```

### "Knowledge base is empty"

**Symptoms:** Error event: "Knowledge base is empty"

**Solutions:**
1. Run ingestion: `npm run ingest`
2. Verify chunks in Firebase Console → Firestore → kb_chunks collection

### Query returns no results

**Symptoms:** "I don't have that information" for valid questions

**Solutions:**
1. Lower similarity threshold in `retrieve.js`:
   ```javascript
   const MIN_SIMILARITY_THRESHOLD = 0.2;  // Was 0.3
   ```
2. Increase topK:
   ```javascript
   const DEFAULT_TOP_K = 6;  // Was 4
   ```
3. Check if question uses different terminology than docs

### Slow responses

**Symptoms:** First token takes >2 seconds

**Solutions:**
1. Check Google API latency (network issue?)
2. Reduce number of chunks retrieved (topK)
3. Check Firestore response time (`/api/health`)
4. Monitor server CPU/memory usage

## 📚 Next Steps

### Production Deployment

1. **Deploy to Cloud:**
   - Railway, Render, Fly.io (easiest)
   - AWS Lambda + API Gateway (serverless)
   - Google Cloud Run (containerized)

2. **Add Monitoring:**
   - Sentry (error tracking)
   - DataDog/New Relic (performance)
   - Google Analytics (usage)

3. **Secure API:**
   - Add API key authentication
   - Implement rate limiting
   - Add CORS whitelist

### Feature Enhancements

1. **Conversation History:**
   - Store last 5 messages in Firestore
   - Include in retrieval query
   - Enable follow-up questions

2. **Response Caching:**
   - Redis cache for common queries
   - Semantic caching (similar queries)
   - Reduce API costs

3. **Feedback Loop:**
   - "Was this helpful?" buttons
   - Store feedback in Firestore
   - Use to improve retrieval

## 📖 Documentation

- **Detailed docs:** `api/README.md`
- **Retrieval logic:** `api/retrieve.js` (heavily commented)
- **Generation logic:** `api/generate.js` (heavily commented)
- **SSE endpoint:** `api/chat.js` (heavily commented)

All code is extensively commented for interview prep and future maintenance.
