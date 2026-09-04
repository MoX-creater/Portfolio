/**
 * Retrieval Module for RAG Chatbot
 * 
 * Handles:
 * - Query embedding generation (using same model as ingestion)
 * - Vector similarity search against Firestore kb_chunks
 * - Returns top-k most relevant chunks with scores
 * 
 * SCALING LIMITATION:
 * Firestore lacks native vector search, so we fetch all chunks into memory
 * and compute cosine similarity client-side. This works fine for <1000 chunks
 * but will NOT scale beyond that. For larger datasets, migrate to:
 * - Pinecone (recommended, free tier: 1M vectors)
 * - Vertex AI Vector Search (GCP-native)
 * - Weaviate, Qdrant, or Chroma (self-hosted options)
 */

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Validate API key is loaded at module initialization
if (!process.env.GOOGLE_API_KEY) {
  throw new Error(
    'GOOGLE_API_KEY environment variable is not set. ' +
    'Create a .env file in the project root with your API key. ' +
    'See .env.example for reference.'
  );
}

// ============================================================================
// Configuration
// ============================================================================

const COLLECTION_NAME = 'kb_chunks';
const EMBEDDING_MODEL = 'models/gemini-embedding-001'; // Correct model name - MUST match ingestion
const EMBEDDING_DIMENSIONS = 768; // Explicitly set dimensions - MUST match ingestion
const DEFAULT_TOP_K = 4;
const MIN_SIMILARITY_THRESHOLD = 0.3; // Filter out irrelevant results

// ============================================================================
// Firebase Initialization
// ============================================================================

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================================
// Google Gemini API Initialization
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ============================================================================
// Vector Similarity Functions
// ============================================================================

/**
 * Computes cosine similarity between two vectors
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 * Returns value between -1 and 1 (higher = more similar)
 * 
 * SCALING NOTE: This is O(n) where n = embedding dimension (768).
 * Computing for all chunks is O(m*n) where m = number of chunks.
 * At 1000 chunks, this is ~768k operations, which is fine.
 * At 100k chunks, you need a proper vector database.
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  // Handle zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates embedding for query text using Google Gemini API
 * MUST use same model and dimensions as ingestion to ensure compatibility
 * Uses models/gemini-embedding-001 with explicit 768 dimensions
 */
async function generateQueryEmbedding(queryText) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: EMBEDDING_MODEL,
    });
    
    // Call embedContent with explicit dimensions (must match ingestion)
    const result = await model.embedContent({
      content: { parts: [{ text: queryText }] },
      taskType: 'RETRIEVAL_QUERY', // Different task type for queries
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
    
    return result.embedding.values;
  } catch (error) {
    // Provide actionable error context
    if (error.message?.includes('API key')) {
      throw new Error('Invalid or missing Google API key. Check GOOGLE_API_KEY environment variable.');
    }
    if (error.message?.includes('quota')) {
      throw new Error('Google API quota exceeded. Wait and retry, or check your quota limits.');
    }
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      throw new Error(`Invalid embedding model: ${EMBEDDING_MODEL}. Check model name is correct.`);
    }
    throw new Error(`Failed to generate query embedding: ${error.message}`);
  }
}

/**
 * Fetches all chunks from Firestore
 * 
 * SCALING LIMITATION: This loads ALL chunks into memory.
 * - Fine for <1000 chunks (~50-100ms)
 * - Acceptable for <5000 chunks (~200-500ms)
 * - Breaks beyond that (memory + latency)
 * 
 * Solution: Use a real vector database with ANN (approximate nearest neighbors)
 */
async function fetchAllChunks() {
  try {
    const chunksRef = collection(db, COLLECTION_NAME);
    console.log('[retrieve.js] Querying Firestore kb_chunks collection...');
    const snapshot = await getDocs(chunksRef);
    console.log(`[retrieve.js] Firestore returned ${snapshot.size} documents`);
    
    if (snapshot.empty) {
      throw new Error('Knowledge base is empty. Run ingestion first (npm run ingest).');
    }
    
    const chunks = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Validate chunk has required fields
      if (!data.embedding || !data.content) {
        console.warn(`Chunk ${doc.id} missing embedding or content, skipping`);
        return;
      }
      
      chunks.push({
        id: data.id,
        filename: data.filename,
        heading: data.heading,
        content: data.content,
        embedding: data.embedding,
        sectionIndex: data.sectionIndex,
      });
    });
    
    return chunks;
  } catch (error) {
    if (error.message?.includes('permission-denied')) {
      throw new Error('Firestore permission denied. Check your Firestore security rules.');
    }
    throw new Error(`Failed to fetch chunks from Firestore: ${error.message}`);
  }
}

/**
 * Performs similarity search against all chunks
 * Returns top-k chunks sorted by similarity score
 */
function searchChunks(queryEmbedding, chunks, topK = DEFAULT_TOP_K) {
  // Compute similarity for all chunks
  const results = chunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    
    return {
      id: chunk.id,
      filename: chunk.filename,
      heading: chunk.heading,
      content: chunk.content,
      similarity: similarity,
      // Metadata for citation
      source: `${chunk.filename} - ${chunk.heading}`,
    };
  });
  
  // Filter by minimum threshold to avoid noise
  const filtered = results.filter(r => r.similarity >= MIN_SIMILARITY_THRESHOLD);
  
  // Sort by similarity (descending) and take top-k
  filtered.sort((a, b) => b.similarity - a.similarity);
  
  return filtered.slice(0, topK);
}

// ============================================================================
// Main Retrieval Function
// ============================================================================

/**
 * Main retrieval function: takes query, returns relevant chunks
 * 
 * @param {string} query - User's question
 * @param {number} topK - Number of chunks to return (default: 4)
 * @returns {Promise<Array>} - Array of {id, filename, heading, content, similarity, source}
 * 
 * THROWS:
 * - If query embedding fails (API error, quota, etc.)
 * - If Firestore fetch fails (permissions, network, etc.)
 * - If knowledge base is empty
 * 
 * SCALING CONSIDERATIONS:
 * - Current: O(n) where n = number of chunks
 * - Works for <1000 chunks
 * - For 10k+ chunks, migrate to Pinecone/Vertex AI
 * - For 100k+ chunks, MUST use a vector database
 */
export async function retrieve(query, topK = DEFAULT_TOP_K) {
  // Validate input
  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }
  
  if (query.trim().length === 0) {
    throw new Error('Query cannot be empty');
  }
  
  // 1. Generate embedding for user query
  const queryEmbedding = await generateQueryEmbedding(query);
  
  // 2. Fetch all chunks from Firestore
  // SCALING BOTTLENECK: This loads everything into memory
  const allChunks = await fetchAllChunks();
  
  // 3. Compute similarities and return top-k
  const results = searchChunks(queryEmbedding, allChunks, topK);
  
  // Return empty array if no results above threshold (not an error)
  return results;
}

/**
 * Health check function to validate retrieval system
 * Useful for monitoring and debugging
 */
export async function healthCheck() {
  try {
    // Check if we can connect to Firestore
    const chunksRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(chunksRef);
    
    const chunkCount = snapshot.size;
    
    // Check if API key is configured
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY not configured');
    }
    
    return {
      status: 'healthy',
      chunkCount: chunkCount,
      embeddingModel: EMBEDDING_MODEL,
      vectorDimensions: EMBEDDING_DIMENSIONS,
      scalingLimit: '~1000 chunks (current in-memory approach)',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}
