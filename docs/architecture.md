# RAG Chatbot Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         RAG CHATBOT SYSTEM                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Knowledge Base  │────▶│ Ingestion Script │────▶│  Firestore   │
│   (Markdown)     │     │   (ingest.js)    │     │  kb_chunks   │
└──────────────────┘     └──────────────────┘     └──────────────┘
   about.md                      │                    ├─ chunk 1
   skills.md                     │                    ├─ chunk 2
   faq.md                        │                    ├─ chunk 3
   projects/*.md                 ▼                    └─ chunk N
                          Google Gemini API
                       (text-embedding-004)
                          Generate 768-dim
                             vectors


┌──────────────────────────────────────────────────────────────────┐
│                        QUERY FLOW (RUNTIME)                      │
└──────────────────────────────────────────────────────────────────┘

User Question
     │
     ▼
┌─────────────────┐
│  Express API    │
│  /api/chat      │
└────────┬────────┘
         │
         ├─────────────────────────────────────────────────┐
         │                                                  │
         ▼                                                  ▼
┌────────────────────┐                            ┌────────────────┐
│ Generate Question  │                            │ Fetch All      │
│ Embedding          │                            │ Chunks from    │
│ (Gemini API)       │                            │ Firestore      │
└────────┬───────────┘                            └────────┬───────┘
         │                                                  │
         │                                                  │
         └──────────────────┬───────────────────────────────┘
                            │
                            ▼
                   ┌────────────────────┐
                   │ Compute Cosine     │
                   │ Similarity         │
                   │ (In-Memory)        │
                   └────────┬───────────┘
                            │
                            ▼
                   ┌────────────────────┐
                   │ Sort by Similarity │
                   │ Return Top 3       │
                   └────────┬───────────┘
                            │
                            ▼
                   ┌────────────────────┐
                   │ Build Context      │
                   │ from Chunks        │
                   └────────┬───────────┘
                            │
                            ▼
                   ┌────────────────────┐
                   │ Send to Gemini     │
                   │ with Context       │
                   └────────┬───────────┘
                            │
                            ▼
                      AI Response
                            │
                            ▼
                      Return to User
```

## Detailed Component Breakdown

### 1. Knowledge Base (Source)
```
knowledge-base/
├── about.md              ← Personal info, education, contact
├── skills.md             ← Technical skills breakdown
├── faq.md                ← Common questions
└── projects/
    ├── flash-sale-engine.md
    ├── droplink.md
    └── typing-speed-app.md
```

**Format**: Markdown with `##` section headings

### 2. Ingestion Pipeline (ingest.js)

```
For each .md file:
  ├─ Read file content
  ├─ Parse and chunk by ## headings
  ├─ For each chunk:
  │   ├─ Generate MD5 ID (filename + section index)
  │   ├─ Call Gemini API for embedding
  │   ├─ Wait 100ms (rate limiting)
  │   └─ Store in Firestore with metadata
  └─ Log summary statistics
```

**Idempotency**: Deletes existing chunks for file before re-ingesting

### 3. Vector Embeddings (Google Gemini)

```
Input: "## Key Technical Decisions\n\nRedis provides atomic..."
         │
         ▼
   Gemini API (text-embedding-004)
         │
         ▼
Output: [0.023, -0.045, 0.012, ..., 0.089]  (768 dimensions)
```

**Why 768 dimensions?**
- Industry standard for semantic search
- Balances quality vs. storage/compute
- Captures nuanced meaning relationships

### 4. Firestore Storage

```javascript
kb_chunks (collection)
  └─ a3f5e8d9c2b1... (document)
      ├─ id: "a3f5e8d9c2b1..."
      ├─ filename: "projects/flash-sale-engine.md"
      ├─ heading: "Key Technical Decisions"
      ├─ content: "Redis provides atomic..."
      ├─ sectionIndex: 3
      ├─ embedding: [0.023, -0.045, ...]  ← 768 floats
      ├─ embeddingDimension: 768
      ├─ createdAt: "2026-09-03T10:30:00Z"
      └─ updatedAt: "2026-09-03T10:30:00Z"
```

### 5. Query Flow (Runtime)

#### Step 1: User asks question
```
"What backend technologies does Mohit use?"
```

#### Step 2: Generate query embedding
```javascript
const queryEmbedding = await generateEmbedding(
  "What backend technologies does Mohit use?"
);
// → [0.034, -0.021, 0.056, ...]  (768 dims)
```

#### Step 3: Fetch all chunks from Firestore
```javascript
const chunks = await getDocs(collection(db, 'kb_chunks'));
// → 52 chunks loaded
```

#### Step 4: Compute similarity scores
```javascript
chunks.forEach(chunk => {
  const similarity = cosineSimilarity(
    queryEmbedding,
    chunk.embedding
  );
  // → 0.87 (87% similar)
});
```

**Cosine Similarity Explained:**
```
cos(θ) = (A · B) / (||A|| × ||B||)

Where:
- A · B = dot product of vectors
- ||A|| = magnitude of vector A
- ||B|| = magnitude of vector B
- Result: -1 to 1 (higher = more similar)
```

#### Step 5: Sort and return top K
```javascript
results.sort((a, b) => b.similarity - a.similarity);
return results.slice(0, 3);  // Top 3

// Example results:
// 1. skills.md → Backend Technologies (similarity: 0.92)
// 2. projects/flash-sale-engine.md → Tech Stack (similarity: 0.87)
// 3. about.md → Technical Focus (similarity: 0.81)
```

#### Step 6: Build context for LLM
```javascript
const context = `
[Source 1: skills.md - Backend Technologies]
Primary backend framework: Spring Boot
Experience with Redis caching and distributed locking...

[Source 2: projects/flash-sale-engine.md - Tech Stack]
Backend: Spring Boot
Cache & Locking: Redis with Redisson distributed locks
Message Queue: RabbitMQ...

[Source 3: about.md - Technical Focus]
Backend development with Java and Spring Boot...
`;
```

#### Step 7: Send to Gemini with context
```javascript
const prompt = `
Context from Mohit's portfolio:
${context}

Question: What backend technologies does Mohit use?

Answer as Mohit in first person:
`;

const response = await gemini.generateContent(prompt);
```

#### Step 8: AI generates response
```
"I primarily work with Spring Boot for backend development,
along with Redis for caching and distributed locking, and
RabbitMQ for message queuing. In my Flash Sale Engine project,
I used this stack to handle 10,000+ concurrent requests..."
```

## Performance Characteristics

### Ingestion (One-Time)
```
50 chunks × 200ms per embedding = ~10 seconds
+ Firestore writes = ~12-15 seconds total

Re-ingestion: Similar (overwrites existing chunks)
```

### Query (Runtime)
```
1. Generate query embedding:   ~100-150ms
2. Fetch all chunks:            ~50-100ms
3. Compute similarities:        ~10-20ms (in-memory)
4. Generate AI response:        ~500-1500ms
─────────────────────────────────────────
Total latency:                  ~660-1770ms
```

**Bottleneck**: AI response generation (not retrieval)

### Scaling Limits (Current Architecture)

| Chunks | Firestore Fetch | Similarity Compute | Total Query Time |
|--------|----------------|-------------------|------------------|
| 100    | ~50ms          | ~10ms             | ~60ms            |
| 500    | ~100ms         | ~20ms             | ~120ms           |
| 1000   | ~150ms         | ~30ms             | ~180ms           |
| 5000   | ~400ms         | ~100ms            | ~500ms ⚠️        |

**Recommendation**: Migrate to Pinecone at ~1000 chunks

## Data Flow Diagram

```
┌──────────────┐
│ Markdown     │  Source content (human-readable)
│ Files        │
└──────┬───────┘
       │ npm run ingest
       │
       ▼
┌──────────────┐
│ Chunking     │  Split by ## headings
│ Logic        │  (semantic boundaries)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Embedding    │  Convert text → vectors
│ Generation   │  (Google Gemini API)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Firestore    │  Persistent storage
│ Storage      │  (chunks + embeddings)
└──────┬───────┘
       │
       │ User question arrives
       │
       ▼
┌──────────────┐
│ Vector       │  Find similar chunks
│ Search       │  (cosine similarity)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Context      │  Build prompt with
│ Building     │  relevant chunks
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ LLM          │  Generate answer
│ Generation   │  (Gemini Flash)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Response     │  Return to user
│ to User      │
└──────────────┘
```

## Why This Architecture?

### Trade-offs Made

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Firestore** | You're already using it | No native vector search |
| **In-memory search** | Simple, works at your scale | Won't scale to 10K+ chunks |
| **Chunk by headings** | Semantic coherence | Can't chunk mid-section |
| **Google Gemini** | Free tier, you're using it | Slightly slower than OpenAI |

### When to Reconsider

**Migrate to Pinecone if:**
- ❌ You exceed 1000 chunks
- ❌ Query latency >500ms is unacceptable
- ❌ You need metadata filtering (e.g., "only search projects")

**Migrate to OpenAI embeddings if:**
- ❌ Google rate limits become an issue
- ❌ You need 1536-dim embeddings for higher quality

**Add caching layer if:**
- ❌ Same questions asked repeatedly
- ❌ Need <100ms cached response time

## Security Considerations

```
┌─────────────────────────────────────────┐
│ Security Layer                          │
├─────────────────────────────────────────┤
│ ✓ API keys in .env (not committed)     │
│ ✓ Firestore rules: read=public         │
│ ✓ Firestore rules: write=auth only     │
│ ✓ Rate limiting on API endpoints       │
│ ✗ Input sanitization (TODO)            │
│ ✗ Query result caching (TODO)          │
└─────────────────────────────────────────┘
```

## Cost Architecture

```
Free Tier Limits:
├─ Google Gemini: 1M embeddings/month
│   Your usage: ~100 chunks + ~1000 queries/month = <0.1% usage
│
├─ Firestore Reads: 50K/day
│   Your usage: ~100-1000/day = <2% usage
│
├─ Firestore Writes: 20K/day
│   Your usage: ~100/re-ingest = <1% usage
│
└─ Firestore Storage: 1 GB
    Your usage: ~1 MB = <0.1% usage

Total Cost: $0/month ✓
```

## Summary

**Current Architecture**: Optimized for portfolio-scale RAG chatbot

✅ **Strengths**:
- Zero cost (within free tiers)
- Simple setup (no additional infrastructure)
- Fast development (working in 5 minutes)
- Easy to understand and modify

⚠️ **Limitations**:
- Won't scale beyond 1000 chunks
- No advanced metadata filtering
- In-memory search (not production-grade at scale)

**Migration Path**: Clear path to Pinecone/Vertex AI when needed
