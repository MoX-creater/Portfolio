# RAG Chatbot Testing Checklist

Use this checklist to verify your RAG chatbot is working correctly.

## ✅ Phase 1: Environment Setup

- [ ] `.env` file created from `.env.example`
- [ ] `GOOGLE_API_KEY` set (test: should start with `AIzaSy`)
- [ ] All `FIREBASE_*` variables set
- [ ] Firebase project created
- [ ] Firestore Database enabled in Firebase Console
- [ ] Firestore rules updated to allow reads/writes
- [ ] Dependencies installed (`npm install`)

**Test command:**
```bash
node -e "require('dotenv').config(); console.log('API Key:', process.env.GOOGLE_API_KEY ? '✓ Set' : '✗ Missing')"
```

---

## ✅ Phase 2: Knowledge Base Content

- [ ] `/knowledge-base` directory exists
- [ ] `about.md` exists with `##` headings
- [ ] `skills.md` exists with `##` headings
- [ ] `faq.md` exists with `##` headings
- [ ] `/knowledge-base/projects/` directory exists
- [ ] At least 3 project `.md` files exist
- [ ] All markdown files have at least one `##` heading
- [ ] No empty markdown files

**Test command:**
```bash
ls knowledge-base/*.md
ls knowledge-base/projects/*.md
```

---

## ✅ Phase 3: Ingestion

- [ ] Run `npm run ingest` without errors
- [ ] Output shows "Found X markdown files" (X ≥ 5)
- [ ] Output shows "Total Chunks Created: Y" (Y ≥ 40)
- [ ] All files show "✓ Stored N chunks"
- [ ] No "Failed" count in summary
- [ ] Duration is reasonable (~20-40 seconds)

**Expected output:**
```
======================================================================
Knowledge Base Ingestion Pipeline
======================================================================
...
Scanning for markdown files...
Found 6 markdown files

Processing: about.md
  Found 7 sections
  Generating embedding 1/7 for: Background
  ...
  ✓ Stored 7 chunks

...

======================================================================
INGESTION SUMMARY
======================================================================
Files Processed: 6
Successful: 6
Failed: 0
Total Chunks Created: 52
Duration: 23.45s
======================================================================
✓ Ingestion complete!
```

---

## ✅ Phase 4: Firestore Verification

### In Firebase Console:

- [ ] Navigate to Firestore Database
- [ ] `kb_chunks` collection exists
- [ ] Collection has documents (count ≈ chunks created)
- [ ] Click on a random document
- [ ] Document has `filename` field (string)
- [ ] Document has `heading` field (string)
- [ ] Document has `content` field (string)
- [ ] Document has `embedding` field (array)
- [ ] `embedding` array has ~768 numbers
- [ ] Document has `embeddingDimension` = 768
- [ ] Document has `createdAt` timestamp
- [ ] Document has `updatedAt` timestamp

**Example document structure:**
```javascript
{
  id: "a3f5e8d9c2b1a0f4e6d8c7b5a3f1e9d2",
  filename: "projects/flash-sale-engine.md",
  heading: "Key Technical Decisions",
  content: "### Why Redis + Redisson?\n\nRedis...",
  sectionIndex: 3,
  embedding: [0.023, -0.045, 0.012, ...], // 768 numbers
  embeddingDimension: 768,
  createdAt: "2026-09-03T10:30:00.000Z",
  updatedAt: "2026-09-03T10:30:00.000Z"
}
```

---

## ✅ Phase 5: Query Testing

- [ ] Run `npm run query` without errors
- [ ] Output shows "Searching for: [question]"
- [ ] Output shows "Loaded X chunks" (X = total chunks)
- [ ] Output shows "Found Y results above threshold"
- [ ] At least 1 result returned
- [ ] Results show similarity scores (0-1 range)
- [ ] Results show relevant content previews
- [ ] Results are sorted by similarity (highest first)

**Expected output:**
```
Searching for: "What backend technologies does Mohit use?"
======================================================================
Generating query embedding...
Fetching knowledge base chunks...
Loaded 52 chunks
Computing similarity scores...

Found 12 results above threshold (0.5)
Returning top 3 results

1. Backend Technologies
   File: skills.md
   Similarity: 92.34%
   Preview: Primary backend framework. Built production-grade REST APIs...

2. Technology Stack
   File: projects/flash-sale-engine.md
   Similarity: 87.12%
   Preview: Backend: Spring Boot, Cache & Locking: Redis with Redisson...

3. Technical Focus
   File: about.md
   Similarity: 81.45%
   Preview: My primary expertise is in backend development with Java...

✓ Query complete!
```

---

## ✅ Phase 6: Query Quality Tests

Test with these questions and verify results make sense:

### Test 1: Technical Skills
**Question:** "What programming languages does Mohit know?"

- [ ] Query runs successfully
- [ ] Returns results from `skills.md`
- [ ] Mentions Java, JavaScript, SQL
- [ ] Similarity >70%

### Test 2: Project Details
**Question:** "Tell me about the flash sale engine"

- [ ] Query runs successfully
- [ ] Returns results from `projects/flash-sale-engine.md`
- [ ] Mentions Spring Boot, Redis, RabbitMQ
- [ ] Similarity >80%

### Test 3: Specific Technology
**Question:** "What experience does Mohit have with Redis?"

- [ ] Query runs successfully
- [ ] Returns results from multiple files
- [ ] Mentions distributed locking, caching
- [ ] Similarity >75%

### Test 4: General Background
**Question:** "What is Mohit's educational background?"

- [ ] Query runs successfully
- [ ] Returns results from `about.md`
- [ ] Mentions Chandigarh University
- [ ] Similarity >70%

### Test 5: Edge Case - Irrelevant Query
**Question:** "What is the capital of France?"

- [ ] Query runs successfully
- [ ] Low similarity scores (<50%)
- [ ] May return 0 results (expected)
- [ ] No errors

---

## ✅ Phase 7: Idempotency Test

- [ ] Note current chunk count in Firestore
- [ ] Make a small edit to one markdown file
- [ ] Run `npm run ingest` again
- [ ] Output shows "Deleted X existing chunks" for edited file
- [ ] Total chunk count stays roughly the same
- [ ] Firestore shows updated `updatedAt` timestamp
- [ ] No duplicate documents created
- [ ] Query still returns relevant results

---

## ✅ Phase 8: Backend Integration (Optional)

If testing the Express backend example:

- [ ] Run `npm run chatbot` (or `node scripts/chatbot-example.js`)
- [ ] Server starts without errors
- [ ] Shows "Server running on http://localhost:3000"
- [ ] Health check works: `curl http://localhost:3000/api/health`
- [ ] Chat endpoint works (see test below)

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What backend technologies does Mohit use?"}'
```

**Expected response:**
```json
{
  "answer": "I primarily work with Spring Boot for backend development...",
  "sources": [
    {
      "filename": "skills.md",
      "heading": "Backend Technologies",
      "similarity": 0.9234
    },
    ...
  ],
  "timestamp": "2026-09-03T10:30:00.000Z"
}
```

---

## ✅ Phase 9: Error Handling

Test error scenarios to ensure graceful handling:

### Test 1: Missing API Key
- [ ] Remove `GOOGLE_API_KEY` from `.env`
- [ ] Run `npm run ingest`
- [ ] Should show error: "GOOGLE_API_KEY not set"
- [ ] Should exit without crashing
- [ ] Restore API key

### Test 2: Invalid Firebase Config
- [ ] Change `FIREBASE_PROJECT_ID` to invalid value
- [ ] Run `npm run query`
- [ ] Should show Firebase error (not crash)
- [ ] Restore correct config

### Test 3: Empty Knowledge Base
- [ ] Temporarily rename `/knowledge-base` to `/knowledge-base-backup`
- [ ] Run `npm run ingest`
- [ ] Should show "No markdown files found"
- [ ] Should exit gracefully
- [ ] Restore directory

### Test 4: Malformed Markdown
- [ ] Create test file with no `##` headings
- [ ] Run `npm run ingest`
- [ ] Should show "No content to process, skipping"
- [ ] Should continue with other files
- [ ] Delete test file

---

## ✅ Phase 10: Performance Validation

- [ ] Ingestion completes in <60 seconds
- [ ] Query (first run) completes in <5 seconds
- [ ] Query (subsequent) completes in <3 seconds
- [ ] Firestore reads are <1000/query
- [ ] No rate limit errors from Gemini API
- [ ] Memory usage stays reasonable (<500 MB)

**Performance benchmarks:**
```
Ingestion:
- 50 chunks: 15-25 seconds ✓
- 100 chunks: 30-40 seconds ✓
- 200 chunks: 60-80 seconds ✓

Query:
- Embedding generation: ~100-150ms ✓
- Firestore fetch: ~50-100ms ✓
- Similarity compute: ~10-20ms ✓
- Total: <300ms (before AI response) ✓
```

---

## 🐛 Common Issues & Solutions

### Issue: "No markdown files found"
**Solution:** 
- Check `/knowledge-base` directory exists
- Ensure files have `.md` extension
- Run from project root, not `/scripts` directory

### Issue: "Failed to generate embedding"
**Solution:**
- Verify API key is correct
- Check internet connection
- Check Gemini API quota (shouldn't be exceeded)
- Try with simpler/shorter content first

### Issue: "Permission denied" from Firestore
**Solution:**
- Update Firestore rules in Firebase Console
- Ensure rules are published
- Wait 30 seconds for propagation

### Issue: Query returns no results
**Solution:**
- Verify chunks were ingested (check Firestore)
- Lower `minSimilarity` threshold (try 0.3)
- Check query uses similar language to content
- Test with direct quote from markdown file

### Issue: Duplicate chunks in Firestore
**Solution:**
- Should not happen (idempotency built-in)
- If it does, manually delete collection and re-ingest
- Check that chunk IDs are deterministic (MD5 hash)

---

## ✅ Final Checklist

- [ ] All Phase 1-5 tests pass
- [ ] At least 3 query quality tests pass
- [ ] Idempotency test passes
- [ ] No errors in Firestore Console
- [ ] Documentation reviewed and understood
- [ ] `.env` is in `.gitignore` (not committed)
- [ ] Ready to integrate with backend

**If all checked: 🎉 Your RAG chatbot is ready!**

---

## 📊 Health Check Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Environment | ✓ / ✗ | API keys set correctly |
| Knowledge Base | ✓ / ✗ | Markdown files with headings |
| Ingestion | ✓ / ✗ | Chunks created in Firestore |
| Embeddings | ✓ / ✗ | 768-dim vectors generated |
| Query | ✓ / ✗ | Returns relevant results |
| Idempotency | ✓ / ✗ | Re-ingestion updates, not duplicates |
| Performance | ✓ / ✗ | Meets latency benchmarks |

**Overall Status:** ✓ Ready / ⚠️ Issues / ✗ Not Ready

---

## 🚀 Next Steps After Testing

1. **Integrate with frontend:**
   - Create chat UI component
   - Connect to Express backend
   - Add streaming responses (optional)

2. **Production optimization:**
   - Add Redis caching for common queries
   - Implement rate limiting per user
   - Monitor token usage and costs

3. **Enhancements:**
   - Add conversation history
   - Implement follow-up questions
   - Add feedback mechanism
   - A/B test different prompts

4. **Monitoring:**
   - Track query latency
   - Monitor Firestore usage
   - Log popular questions
   - Measure answer quality

---

## 📚 References

- Setup: `RAG_SETUP_GUIDE.md`
- Architecture: `RAG_ARCHITECTURE.md`
- Detailed docs: `scripts/README.md`
- Schema: `FIRESTORE_SCHEMA.md`
