# Firestore Schema for RAG Knowledge Base

## Collection: `kb_chunks`

Each document represents one chunk (## section) from a markdown file.

### Document Structure

```javascript
{
  // Deterministic ID based on filename + section index (for idempotency)
  id: "a3f5e8d9c2b1a0f4e6d8c7b5a3f1e9d2",
  
  // Source file path (relative to /knowledge-base)
  filename: "projects/flash-sale-engine.md",
  
  // Section heading (the ## heading text)
  heading: "Key Technical Decisions",
  
  // Section content (everything under that heading until next ##)
  content: "### Why Redis + Redisson?\n\nRedis provides atomic...",
  
  // Section index within the file (0-based)
  sectionIndex: 3,
  
  // Embedding vector (768 dimensions for text-embedding-004)
  embedding: [0.023, -0.045, 0.012, ...], // Array of floats
  
  // Embedding dimension (for validation)
  embeddingDimension: 768,
  
  // Timestamps
  createdAt: "2026-09-03T10:30:00.000Z",
  updatedAt: "2026-09-03T10:30:00.000Z"
}
```

### Field Types

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | MD5 hash of `filename-sectionIndex` |
| `filename` | string | Relative path from /knowledge-base |
| `heading` | string | Section heading (without ##) |
| `content` | string | Full section text content |
| `sectionIndex` | number | 0-based index of section in file |
| `embedding` | array | Float array (768 dimensions) |
| `embeddingDimension` | number | Length of embedding array |
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | ISO 8601 timestamp |

## Firestore Indexes Required

### For Idempotency (deletion during re-ingestion)

Create a composite index:
- Collection: `kb_chunks`
- Fields:
  - `filename` (Ascending)
  - `__name__` (Ascending)

**How to create:**
1. Go to Firebase Console → Firestore Database → Indexes
2. Click "Create Index"
3. Set collection ID: `kb_chunks`
4. Add field: `filename` (Ascending)
5. Add field: `Document ID` (Ascending)
6. Create

Alternatively, the index will be auto-created when you first run the ingestion script and Firestore detects the query pattern. Check the console logs for an index creation link.

## Vector Similarity Search Limitation

**⚠️ IMPORTANT**: Firestore does NOT have native vector similarity search (like cosine similarity or k-NN).

### Current Workaround (for small datasets < 1000 chunks)

For your portfolio knowledge base (~50-100 chunks), you can:

1. **Fetch all chunks** from Firestore to your backend
2. **Compute cosine similarity in-memory** between query embedding and all chunk embeddings
3. **Return top K results**

This is what I recommend initially. See the example query script below.

### Production Alternatives (when scaling beyond 1000 chunks)

If your knowledge base grows significantly, consider:

1. **Pinecone** (recommended)
   - Free tier: 1M vectors
   - Native vector search with metadata filtering
   - Simple API, well-documented
   - 2-3 lines of code to switch from Firestore

2. **Vertex AI Vector Search** (Google Cloud)
   - Integrated with Firebase/GCP
   - More complex setup
   - Better if you're already deep in GCP ecosystem

3. **Chroma** (open-source)
   - Self-hosted
   - Good for development/testing
   - Requires separate server

## Example Query Script (vector-search.js)

Here's how to query the knowledge base with your current setup:

\`\`\`javascript
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize (same as ingest.js)
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Computes cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Searches knowledge base for relevant chunks
 */
async function searchKnowledgeBase(query, topK = 3) {
  // 1. Generate embedding for query
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(query);
  const queryEmbedding = result.embedding.values;
  
  // 2. Fetch all chunks from Firestore
  const chunksRef = collection(db, 'kb_chunks');
  const snapshot = await getDocs(chunksRef);
  
  // 3. Compute similarity scores
  const results = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const similarity = cosineSimilarity(queryEmbedding, data.embedding);
    
    results.push({
      id: data.id,
      filename: data.filename,
      heading: data.heading,
      content: data.content,
      similarity: similarity,
    });
  });
  
  // 4. Sort by similarity and return top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

// Example usage
const results = await searchKnowledgeBase("What backend technologies does Mohit use?", 3);
console.log(results);
\`\`\`

## Migration Path to Vector Database

When you're ready to scale, here's how to migrate to Pinecone:

1. **Install Pinecone**: `npm install @pinecone-database/pinecone`
2. **Modify ingest.js**: Replace Firestore writes with Pinecone upserts
3. **Update query logic**: Replace in-memory search with Pinecone query

The schema and chunking logic remain identical. Only the storage layer changes.

## Estimated Costs (Free Tier Limits)

- **Google Gemini embeddings**: 1M embeddings/month free
- **Firestore reads**: 50K reads/day free
- **Pinecone (if migrating)**: 1M vectors free tier

For your portfolio site with ~50-100 chunks, you'll stay well within free limits.
