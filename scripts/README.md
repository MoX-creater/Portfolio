# RAG Knowledge Base Ingestion Pipeline

This directory contains scripts for ingesting markdown documentation into a vector database for RAG (Retrieval-Augmented Generation) chatbot functionality.

## 📁 Files

- **`ingest.js`** - Main ingestion script that processes markdown files and stores embeddings
- **`query-kb.js`** - Example query script demonstrating vector similarity search
- **`README.md`** - This file

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `firebase` - Firestore database
- `@google/generative-ai` - Google Gemini API for embeddings
- `dotenv` - Environment variable management

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required variables:**
- `GOOGLE_API_KEY` - Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Firebase config (get from Firebase Console → Project Settings → General → Your apps)

### 3. Run Ingestion

```bash
npm run ingest
```

This will:
1. ✅ Scan `/knowledge-base` for markdown files
2. ✅ Chunk each file by `##` headings
3. ✅ Generate embeddings using Google Gemini
4. ✅ Store chunks + embeddings in Firestore
5. ✅ Display summary of results

**Idempotency**: Re-running the script updates existing chunks rather than duplicating them.

### 4. Test Queries (Optional)

```bash
npm run query
```

This runs example queries against your knowledge base to verify ingestion worked.

## 📊 How It Works

### Chunking Strategy

The ingestion script chunks markdown files by `##` headings (not `#` or `###`). This ensures:

- **Semantic coherence**: Each chunk is a complete section about one topic
- **Optimal retrieval**: Query matches return focused, relevant content
- **Better embeddings**: Embeddings capture the meaning of cohesive sections

Example:
```markdown
# My Projects                    ← Ignored (file title)

## Flash Sale Engine             ← Chunk boundary
Content about flash sale...

### Key Features                 ← Part of same chunk
More content...

## Another Project               ← New chunk boundary
```

### Embedding Generation

Uses Google Gemini's `text-embedding-004` model:
- **Dimensions**: 768
- **Free tier**: 1M embeddings/month
- **Quality**: State-of-the-art as of 2026
- **Rate limiting**: 100ms delay between requests (built-in)

### Firestore Schema

Each chunk is stored as a document in the `kb_chunks` collection:

```javascript
{
  id: "md5_hash_of_filename_section",
  filename: "projects/flash-sale-engine.md",
  heading: "Key Technical Decisions",
  content: "Full section text...",
  sectionIndex: 3,
  embedding: [0.023, -0.045, ...], // 768 dimensions
  embeddingDimension: 768,
  createdAt: "2026-09-03T10:30:00Z",
  updatedAt: "2026-09-03T10:30:00Z"
}
```

## 🔍 Querying the Knowledge Base

### In-Memory Vector Search (Current Approach)

Since Firestore doesn't have native vector search, we:
1. Fetch all chunks from Firestore
2. Compute cosine similarity in-memory
3. Return top K results

**This works fine for small datasets (<1000 chunks).**

Example query code:
```javascript
import { searchKnowledgeBase } from './scripts/query-kb.js';

const results = await searchKnowledgeBase(
  "What backend tech does Mohit use?",
  topK = 3,
  minSimilarity = 0.5
);
```

See `query-kb.js` for full implementation.

### Integrating with Your Backend

In your Node.js/Express backend:

```javascript
import { searchKnowledgeBase } from './scripts/query-kb.js';

app.post('/api/chat', async (req, res) => {
  const { question } = req.body;
  
  // 1. Find relevant context from knowledge base
  const relevantChunks = await searchKnowledgeBase(question, 3);
  
  // 2. Build context for LLM
  const context = relevantChunks
    .map(chunk => `[${chunk.heading}]\n${chunk.content}`)
    .join('\n\n');
  
  // 3. Send to Gemini with context
  const prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
  const response = await genAI.generateContent(prompt);
  
  res.json({ answer: response.text() });
});
```

## 📈 Scaling Considerations

### Current Setup: Good For...
- ✅ Portfolio sites (<100 chunks)
- ✅ Personal projects (<1000 chunks)
- ✅ Rapid prototyping
- ✅ Zero infrastructure complexity

### When to Migrate to Vector Database

If you exceed **1000 chunks** or need **<50ms query latency**, migrate to:

#### Option 1: Pinecone (Recommended)
- Free tier: 1M vectors
- Native vector search
- 2-3 lines of code to migrate
- [Quick start guide](https://docs.pinecone.io/docs/quickstart)

#### Option 2: Vertex AI Vector Search
- Integrated with GCP/Firebase
- More complex setup
- Better if you're already in GCP ecosystem

#### Option 3: Chroma (Open Source)
- Self-hosted
- Good for development
- Requires separate server

### Migration is Easy

The chunking logic and schema remain identical. Only the storage layer changes:

```javascript
// Before (Firestore)
await firestoreBatch.set(docRef, chunkData);

// After (Pinecone)
await index.upsert([{ id: chunkId, values: embedding, metadata: chunkData }]);
```

## 🛠️ Troubleshooting

### "No markdown files found"
- Check that `/knowledge-base` directory exists
- Ensure files have `.md` extension
- Verify path in `KNOWLEDGE_BASE_DIR` constant

### "GOOGLE_API_KEY not set"
- Create `.env` file from `.env.example`
- Get API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Ensure `.env` is in root directory (not `/scripts`)

### "Firebase configuration not set"
- Fill in all `FIREBASE_*` variables in `.env`
- Get from Firebase Console → Project Settings
- Don't share these publicly (add `.env` to `.gitignore`)

### "Failed to generate embedding"
- Check API key is valid
- Verify you haven't hit rate limits (1M/month free tier)
- Ensure content isn't empty or malformed
- Check internet connection

### "Firestore permission denied"
- Update Firestore security rules:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /kb_chunks/{document=**} {
        allow read, write: if true; // Or add proper auth
      }
    }
  }
  ```

### Query returns no results
- Verify chunks were ingested: Check Firebase Console
- Lower `minSimilarity` threshold (try 0.3 instead of 0.5)
- Check that query and content use similar language
- Ensure embeddings were generated (check `embeddingDimension` field)

## 📝 Best Practices

### Organizing Knowledge Base

```
knowledge-base/
├── about.md              # Background, education, contact
├── skills.md             # Technical skills breakdown
├── faq.md                # Common questions
└── projects/
    ├── project-1.md      # One file per project
    ├── project-2.md
    └── project-3.md
```

### Writing Effective Markdown

✅ **Good** - Clear headings, complete sections:
```markdown
## Problem It Solves

The Flash Sale Engine handles extreme concurrency...
[Complete explanation]

## Architecture

The system consists of three main components...
[Complete explanation]
```

❌ **Bad** - Fragmented sections, incomplete info:
```markdown
## Problem

Concurrency.

## Tech

Spring Boot, Redis.
```

### When to Re-Ingest

Run `npm run ingest` after:
- ✅ Adding new markdown files
- ✅ Updating existing content
- ✅ Changing heading structure
- ✅ Fixing typos or errors

**No need to delete old chunks** - the script handles updates automatically.

## 🔐 Security

### Environment Variables
- Never commit `.env` to version control
- Add `.env` to `.gitignore`
- Use environment variables in production (not `.env` file)

### Firestore Rules
The example above uses `allow read, write: if true` for simplicity. In production:

```javascript
// Production rules (example)
match /kb_chunks/{document=**} {
  allow read: if true;  // Public read for chatbot
  allow write: if request.auth != null;  // Auth required for writes
}
```

## 💰 Cost Estimates

With your current setup (~50-100 chunks):

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|------------|------|
| Google Gemini Embeddings | 1M/month | ~100 chunks + queries | $0 |
| Firestore Reads | 50K/day | ~100-1000/day | $0 |
| Firestore Writes | 20K/day | ~100/re-ingest | $0 |
| Firestore Storage | 1 GB | <1 MB | $0 |

**Total monthly cost: $0** (well within free tiers)

## 📚 Additional Resources

- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Vector Embeddings Explained](https://www.pinecone.io/learn/vector-embeddings/)

## 🤝 Need Help?

Check `FIRESTORE_SCHEMA.md` in the root directory for:
- Detailed schema documentation
- Firestore index setup instructions
- Migration path to vector databases
- Example query patterns
