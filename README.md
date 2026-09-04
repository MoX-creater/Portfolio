# Portfolio Website with RAG Chatbot

A personal portfolio site built with React and Vite, featuring an embedded chatbot that answers questions about my background and projects. The chatbot is built on a retrieval-augmented generation (RAG) pipeline — grounding every response in a curated knowledge base rather than relying on free-form generation — with a custom evaluation harness to measure answer quality.

**Live site:** [portfolio1-7zp.pages.dev](https://portfolio1-7zp.pages.dev)

---

## Why This Exists

Most portfolio sites just list projects. This one lets a recruiter or engineer ask direct questions about my experience and get answers grounded in real source material — the same kind of system (RAG pipeline + eval harness) I'm aiming to build professionally, applied to my own site as a working demo.

## Architecture

```
knowledge-base/*.md
      │  chunked by heading
      ▼
  Embeddings (Google Gemini API)
      │
      ▼
  Firestore (vector store)
      │
      ▼
User query ──► Query embedding ──► Similarity search ──► Retrieved chunks
                                                                │
                                                                ▼
                                                      Gemini LLM (streamed)
                                                                │
                                                                ▼
                                                   SSE response ──► React widget
```

- **Retrieval:** query text is embedded and compared against stored chunk embeddings via cosine similarity; the top matches are returned with their source file, heading, and similarity score.
- **Generation:** retrieved chunks are passed to the LLM as grounding context, with a system prompt that scopes answers strictly to that context and instructs the model to decline rather than guess when the knowledge base doesn't cover a question.
- **Streaming:** responses are streamed to the client over Server-Sent Events, with retrieval sources emitted as a distinct event before the answer begins streaming.

## Project Structure

```
portfolio-website/
├── src/                       # React frontend
│   ├── components/            # UI components, including the chat widget
│   └── App.tsx
│
├── api/                       # Express backend
│   ├── server.js              # Entry point
│   ├── chat.js                # /api/chat route, SSE streaming, disconnect handling
│   ├── retrieve.js            # Query embedding + Firestore similarity search
│   └── generate.js            # LLM generation, retry logic for transient errors
│
├── scripts/
│   ├── ingest.js               # Knowledge base ingestion (chunk → embed → store)
│   └── check-firestore.js      # Verifies collection state and embedding dimensions
│
├── knowledge-base/             # Source of truth for the chatbot
│   ├── about.md
│   ├── skills.md
│   ├── faq.md
│   └── projects/
│       ├── flash-sale-engine.md
│       ├── droplink.md
│       └── typing-speed-app.md
│
├── eval/
│   ├── questions.json          # Test question set (factual, project-specific, out-of-scope)
│   └── run-eval.js             # LLM-as-judge scoring: faithfulness, relevance, correct refusal
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── firestore-schema.md
│   ├── frontend-chat.md
│   └── testing-checklist.md
│
├── .env.example
└── README.md
```

## Tech Stack

**Frontend:** React, Vite, deployed on Cloudflare Pages
**Backend:** Node.js / Express, deployed on Render
**Embeddings:** Google Gemini API (`gemini-embedding-001`, 768-dim)
**Generation:** Google Gemini API (model configurable via `GENERATION_MODEL` — kept as an env var rather than hardcoded, since model availability shifts over time)
**Vector store:** Firebase Firestore
**Streaming:** Server-Sent Events (fetch + ReadableStream on the client, since the request needs a POST body)

## Running Locally

```bash
npm install
cp .env.example .env
# fill in GOOGLE_API_KEY, Firebase config, GENERATION_MODEL

npm run ingest        # chunk knowledge-base/, embed, store in Firestore
npm run dev            # frontend, http://localhost:5173
node api/server.js     # backend, http://localhost:3001
```

Verify the knowledge base ingested correctly:
```bash
npm run check-firestore
```

## Evaluation

The `/eval` harness runs a fixed question set against the live pipeline and scores each response using an LLM-as-judge for:

- **Faithfulness** — does the answer avoid stating anything not supported by the retrieved context?
- **Relevance** — does it actually address what was asked?
- **Correct refusal** — for out-of-scope questions, does it decline rather than hallucinate?
- **Retrieval quality** — did the retrieved sources match what the question needed?

```bash
npm run eval
```

This is the piece I'd point to first in an interview — it's the difference between "I called an LLM API" and "I built something I can measure the reliability of."

**Caveat worth naming honestly:** LLM-as-judge scoring is not ground truth — it inherits the biases and blind spots of whatever model is doing the judging. It's a useful signal for catching regressions and comparing prompt/retrieval changes, not a substitute for human review of edge cases.

## Design Decisions & Trade-offs

- **Firestore over a dedicated vector DB:** sufficient for a knowledge base this size (tens of chunks, not thousands), and avoids adding another service to operate. Worth revisiting if the knowledge base grows substantially or query latency becomes a bottleneck.
- **Model name kept in an env var, not hardcoded:** Gemini model availability changes — building and deploying this project involved several rounds of models being deprecated mid-development. Making this configurable meant a redeploy could fix it without a code change.
- **Explicit CORS allowlist, not wildcard:** this endpoint calls a metered LLM API, so open CORS would let any site embed and consume the quota.
- **Per-IP rate limiting:** protects against abuse on a public, unauthenticated endpoint.

## Known Limitations

- Render's free tier spins down after inactivity — the first request after idle can take up to a minute to respond.
- Retrieval and generation both depend on Gemini API availability and rate limits; the backend retries transient failures but does not fail over to a different provider.

## Author

Mohit Kumar
- Email: mohitk3001@gmail.com
- LinkedIn: [mohit-mahanta-027778290](https://linkedin.com/in/mohit-mahanta-027778290)
- GitHub: [MoX-creater](https://github.com/MoX-creater)
