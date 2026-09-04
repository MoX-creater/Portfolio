/**
 * RAG Chatbot Backend Example
 * 
 * This demonstrates how to integrate the knowledge base with your Express backend
 * to create a RAG-powered chatbot that answers questions about your portfolio.
 * 
 * Usage:
 * 1. Import searchKnowledgeBase and Google Gemini client
 * 2. On user question, retrieve relevant chunks
 * 3. Build context from chunks
 * 4. Send context + question to Gemini
 * 5. Return AI-generated answer
 */

import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchKnowledgeBase } from './query-kb.js';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const CHAT_MODEL = 'gemini-2.0-flash-exp'; // Fast, good quality

// ============================================================================
// RAG Chat Endpoint
// ============================================================================

app.post('/api/chat', async (req, res) => {
  try {
    const { question, conversationHistory = [] } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    console.log(`\n[CHAT] User question: ${question}`);
    
    // Step 1: Retrieve relevant context from knowledge base
    const relevantChunks = await searchKnowledgeBase(
      question,
      topK = 3,           // Get top 3 most relevant chunks
      minSimilarity = 0.5 // Only chunks with >50% similarity
    );
    
    console.log(`[CHAT] Found ${relevantChunks.length} relevant chunks`);
    
    // Step 2: Build context from retrieved chunks
    const context = relevantChunks.length > 0
      ? relevantChunks
          .map((chunk, idx) => 
            `[Source ${idx + 1}: ${chunk.filename} - ${chunk.heading}]\n${chunk.content}`
          )
          .join('\n\n---\n\n')
      : 'No specific context found. Answer based on general knowledge.';
    
    // Step 3: Build prompt with context
    const systemPrompt = `You are Mohit Kumar's portfolio assistant. Answer questions about Mohit based on the provided context.

Guidelines:
- Answer in first person as if you are Mohit
- Be concise and specific
- Use details from the context
- If the context doesn't contain relevant info, say "I don't have specific information about that in my portfolio, but..."
- Be professional but friendly
- Don't make up information not in the context

Context from Mohit's portfolio:
${context}`;

    const userPrompt = `Question: ${question}

Answer:`;
    
    // Step 4: Generate response with Gemini
    console.log('[CHAT] Generating response...');
    
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'Understood. I will answer questions about Mohit based on the context provided, speaking in first person as Mohit.' }],
        },
        // Include conversation history if provided
        ...conversationHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
      ],
    });
    
    const result = await chat.sendMessage(userPrompt);
    const answer = result.response.text();
    
    console.log('[CHAT] Response generated');
    
    // Step 5: Return response with sources
    res.json({
      answer: answer,
      sources: relevantChunks.map(chunk => ({
        filename: chunk.filename,
        heading: chunk.heading,
        similarity: chunk.similarity,
      })),
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate response',
      details: error.message 
    });
  }
});

// ============================================================================
// Simple Chat Endpoint (without RAG, for comparison)
// ============================================================================

app.post('/api/chat-simple', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
    const result = await model.generateContent(question);
    const answer = result.response.text();
    
    res.json({ answer });
    
  } catch (error) {
    console.error('[CHAT-SIMPLE] Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    features: {
      rag: true,
      knowledge_base: true,
    }
  });
});

// ============================================================================
// Example Usage
// ============================================================================

const PORT = process.env.PORT || 3000;

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('RAG Chatbot Server');
    console.log('='.repeat(70));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log(`  POST /api/chat         - RAG-powered chat (with knowledge base)`);
    console.log(`  POST /api/chat-simple  - Simple chat (no knowledge base)`);
    console.log(`  GET  /api/health       - Health check`);
    console.log('\nExample request:');
    console.log(`  curl -X POST http://localhost:${PORT}/api/chat \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"question": "What backend technologies does Mohit use?"}'`);
    console.log('='.repeat(70));
  });
}

export default app;
