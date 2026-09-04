# Portfolio Website with RAG Chatbot

A modern portfolio website built with React and Vite, featuring a RAG (Retrieval-Augmented Generation) chatbot powered by Google Gemini and Firebase Firestore.

## 🚀 Quick Start

### For the Main Website
```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### For the RAG Chatbot

**Complete setup guide:** `RAG_SETUP_GUIDE.md`

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your Google Gemini API key and Firebase config

# 3. Ingest knowledge base
npm run ingest

# 4. Test queries
npm run query

# 5. Run chatbot backend (optional)
npm run chatbot
```

## 📁 Project Structure

```
portfolio-website/
├── src/                          # React frontend source
│   ├── app/
│   │   ├── components/          # UI components
│   │   └── App.tsx              # Main app component
│   └── ...
│
├── knowledge-base/               # RAG chatbot knowledge base
│   ├── about.md                 # Personal info, education, contact
│   ├── skills.md                # Technical skills breakdown  
│   ├── faq.md                   # Common recruiter questions
│   └── projects/                # Project documentation
│       ├── flash-sale-engine.md
│       ├── droplink.md
│       └── typing-speed-app.md
│
├── scripts/                     # RAG chatbot scripts
│   ├── ingest.js               # Knowledge base ingestion
│   ├── query-kb.js             # Query/search functionality
│   ├── chatbot-example.js      # Express backend example
│   └── README.md               # Detailed documentation
│
├── public/                      # Static assets
│   └── resume.pdf
│
├── .env.example                 # Environment template
├── RAG_SETUP_GUIDE.md          # Quick setup guide (START HERE)
├── RAG_ARCHITECTURE.md         # System architecture
├── RAG_IMPLEMENTATION_SUMMARY.md # Complete overview
├── FIRESTORE_SCHEMA.md         # Database schema
├── TESTING_CHECKLIST.md        # Testing guide
└── README.md                   # This file
```

## ✨ Website Features

- Responsive single-page portfolio layout
- Project cards with expandable architecture details
- Skills and experience sections
- Resume download CTA
- Social links and contact section
- RAG-powered chatbot (optional)

## 🤖 RAG Chatbot Features

- **Semantic Search**: Vector similarity search using Google Gemini embeddings
- **Knowledge Base**: Markdown-based documentation (easy to update)
- **Idempotent**: Re-ingestion updates chunks without duplication
- **Zero Cost**: Within free tier limits (Gemini + Firestore)
- **Production Ready**: Error handling, logging, rate limiting built-in

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **`RAG_SETUP_GUIDE.md`** | Quick setup instructions (5 minutes) |
| **`scripts/README.md`** | Detailed documentation and best practices |
| **`RAG_ARCHITECTURE.md`** | System architecture and data flow |
| **`FIRESTORE_SCHEMA.md`** | Database schema and indexes |
| **`TESTING_CHECKLIST.md`** | Comprehensive testing guide |
| **`RAG_IMPLEMENTATION_SUMMARY.md`** | Complete overview |

**Start with:** `RAG_SETUP_GUIDE.md`

## 🛠️ Available Scripts

### Website Scripts
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production

### RAG Chatbot Scripts
- `npm run ingest` - Ingest knowledge base into Firestore
- `npm run query` - Test query functionality
- `npm run chatbot` - Run Express backend example

## 🔧 Technology Stack

### Frontend
- React 18
- Vite 6
- Tailwind CSS
- Radix UI components
- Lucide React icons
- Framer Motion

### RAG Chatbot
- **Embeddings**: Google Gemini API (text-embedding-004)
- **Storage**: Firebase Firestore
- **Backend**: Node.js/Express
- **LLM**: Google Gemini (gemini-2.0-flash-exp)
- **Vector Search**: In-memory cosine similarity

## 📊 RAG System Overview

```
Markdown Files → Chunking → Embeddings → Firestore
                                              ↓
User Question → Query Embedding → Vector Search → Context
                                                      ↓
                                              Gemini LLM → Answer
```

**Performance:**
- Ingestion: ~15-25 seconds for 50 chunks
- Query: <300ms for retrieval + ~1s for AI response
- Cost: $0/month (within free tiers)

## 🎯 Quick Integration Example

```javascript
import { searchKnowledgeBase } from './scripts/query-kb.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// In your Express backend
app.post('/api/chat', async (req, res) => {
  const { question } = req.body;
  
  // 1. Find relevant context
  const chunks = await searchKnowledgeBase(question, 3);
  
  // 2. Build context
  const context = chunks
    .map(c => `[${c.heading}]\n${c.content}`)
    .join('\n\n');
  
  // 3. Generate response
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent(
    `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer as Mohit:`
  );
  
  res.json({ answer: result.response.text() });
});
```

See `scripts/chatbot-example.js` for complete implementation.

## 🔐 Environment Variables

Required in `.env`:

```env
# Google Gemini API
GOOGLE_API_KEY=your_api_key_here

# Firebase Configuration  
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

Get keys from:
- [Google AI Studio](https://aistudio.google.com/app/apikey)
- [Firebase Console](https://console.firebase.google.com/)

## 📈 Scaling Considerations

**Current setup works well for:**
- ✅ Portfolio sites (<100 chunks)
- ✅ Personal projects (<1000 chunks)
- ✅ Rapid prototyping
- ✅ Zero infrastructure complexity

**Migrate to Pinecone/Vertex AI when:**
- You exceed 1000 chunks
- Query latency >500ms is unacceptable
- You need advanced metadata filtering

See `FIRESTORE_SCHEMA.md` for migration guide.

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "No markdown files found" | Check `/knowledge-base` directory exists |
| "GOOGLE_API_KEY not set" | Create `.env` from `.env.example` |
| "Permission denied" | Update Firestore rules in Firebase Console |
| Query returns no results | Lower `minSimilarity` threshold to 0.3 |

Complete troubleshooting guide: `scripts/README.md` → Troubleshooting

## ✅ Testing

Follow `TESTING_CHECKLIST.md` for comprehensive testing:

1. Environment setup
2. Knowledge base content
3. Ingestion pipeline
4. Firestore verification
5. Query functionality
6. Quality tests
7. Idempotency
8. Performance validation

## 💰 Cost Breakdown

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|------------|------|
| Gemini Embeddings | 1M/month | ~100 | $0 |
| Firestore Reads | 50K/day | ~100-1000 | $0 |
| Firestore Writes | 20K/day | ~100 | $0 |
| Firestore Storage | 1 GB | <1 MB | $0 |

**Total: $0/month**

## 📖 Learn More

- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Firebase Firestore Docs](https://firebase.google.com/docs/firestore)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Vector Embeddings Guide](https://www.pinecone.io/learn/vector-embeddings/)

## 🤝 Support

1. Check documentation (see table above)
2. Review troubleshooting sections
3. Test with provided examples
4. Verify environment configuration

## 📝 License

ISC

## 👤 Author

Mohit Kumar
- Email: mohitk3001@gmail.com
- LinkedIn: [mohit-mahanta-027778290](https://linkedin.com/in/mohit-mahanta-027778290)
- GitHub: [MoX-creater](https://github.com/MoX-creater)
