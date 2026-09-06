# Knowledge Base Ingestion Pipeline

Scripts for ingesting markdown documentation into Firestore as embeddings, for retrieval by the portfolio chatbot's RAG pipeline.

## Files

- **`ingest.js`** — chunks markdown files, generates embeddings, stores them in Firestore
- **`check-firestore.js`** — verifies the `kb_chunks` collection state (document count, embedding dimensions, sample structure)

Query/retrieval logic itself lives in `api/retrieve.js`, since it's called at request time by the backend rather than run standalone.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Required:
- `GOOGLE_API_KEY` — from [Google AI Studio](https://aistudio.google.com/app/apikey)
- `FIREBASE_PROJECT_ID` and related Firebase config — from Firebase Console → Project Settings → General → Your apps

### 3. Run ingestion

```bash
npm run ingest
```

This will:
1. Scan `/knowledge-base` for markdown files
2. Chunk each file by `##` headings
3. Generate embeddings via the Gemini embedding API
4. Store chunks + embeddings in Firestore
5. Print a summary

**Idempotent** — re-running updates existing chunks by filename/heading rather than duplicating them.

### 4. Verify ingestion

```bash
npm run check-firestore
```

Confirms document count, sample chunk structure, and embedding dimensions.

## How It Works

### Chunking strategy

Files are chunked by `##` headings (not `#` or `###`), so each chunk is a complete, semantically coherent section:

```markdown
# My Projects                    ← ignored (file title)

## Flash Sale Engine             ← chunk boundary
Content about the project...

### Key Features                 ← stays part of the same chunk
More content...

## Another Project               ← new chunk boundary
```

### Embedding generation

Uses Google Gemini's `gemini-embedding-001` model at 768 dimensions.

> **Note on model names:** Gemini model availability has shifted several times during this project's development — models that worked one week returned 404s the next. The embedding and generation model names are kept in environment variables (`GENERATION_MODEL`, etc.) rather than hardcoded, specifically so a deprecation can be handled with a config change instead of a code change and redeploy.

### Firestore schema

Each chunk is stored as a document in the `kb_chunks` collection:

```javascript
{
  id: "hash_of_filename_and_heading",
  filename: "projects/flash-sale-engine.md",
  heading: "Key Technical Decisions",
  content: "Full section text...",
  embedding: [0.023, -0.045, ...],  // 768 dimensions
  embeddingDimension: 768,
  createdAt: "...",
  updatedAt: "..."
}
```

## Retrieval

Firestore doesn't have native vector search available in this setup, so retrieval works by:
1. Fetching chunk embeddings from Firestore
2. Computing cosine similarity against the query embedding
3. Returning the top-k matches with their similarity scores

This is adequate at the current scale (dozens of chunks). See **Scaling Considerations** below for when this stops being true.

## Scaling Considerations

**Current setup works well for:**
- Portfolio-scale knowledge bases (tens to low hundreds of chunks)
- Rapid iteration without standing up a separate vector database

**Worth migrating off Firestore's in-memory similarity search if:**
- The knowledge base grows into the thousands of chunks
- Query latency becomes noticeably slow as a result

**Options if that happens:** a dedicated vector database (e.g. Pinecone, Qdrant) or a managed vector search service (e.g. Vertex AI Vector Search) — the chunking and embedding logic wouldn't need to change, only the storage/query layer.

## Troubleshooting

**"No markdown files found"**
Check that `/knowledge-base` exists and files have a `.md` extension.

**"GOOGLE_API_KEY not set" / embedding call fails**
Confirm `.env` exists in the project root (not `/scripts`), and that the key is valid — test directly with:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```

**Model 404 errors ("model not found" / "no longer available to new users")**
Gemini model names get deprecated without much notice. Run the command above, find a model in the response with `embedContent` (for embeddings) or `streamGenerateContent`/`generateContent` (for generation) in its `supportedGenerationMethods`, and update the relevant env var.

**"Firestore permission denied"**
Check Firestore security rules in Firebase Console. For a read-only chatbot in production, writes should not be open — ingestion should only run from a trusted environment (local machine or CI), not be world-writable:
```javascript
match /kb_chunks/{document=**} {
  allow read: if true;
  allow write: if false; // run ingestion via Admin SDK / trusted context only
}
```

**Query returns no results**
Verify chunks exist via `npm run check-firestore`. If they exist but nothing matches, check whether the similarity threshold in `api/retrieve.js` is too strict for the query phrasing.

## Best Practices

**Organize the knowledge base by topic, one file per subject:**
```
knowledge-base/
├── about.md
├── skills.md
├── faq.md
└── projects/
    ├── project-1.md
    ├── project-2.md
```

**Write complete sections, not fragments** — a chunk gets embedded and retrieved as a whole, so a heading with one sentence under it retrieves poorly compared to a heading with a full, self-contained explanation.

**Re-run ingestion after any content change** — adding files, editing existing content, or changing heading structure. No need to manually clear old chunks first; ingestion is idempotent.

## Security

- Never commit `.env` — it should be in `.gitignore`, along with any service account credentials.
- In production, set environment variables directly on the hosting platform (Render, etc.) rather than shipping a `.env` file.
- Keep Firestore write access restricted — see the permission-denied section above.

## Related Docs

- `docs/architecture.md` — full system architecture
- `docs/firestore-schema.md` — schema and index details
- `docs/testing-checklist.md` — manual + eval testing guide
- `/eval` — the automated evaluation harness (faithfulness, relevance, correct refusal scoring)
