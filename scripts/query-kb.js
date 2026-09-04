/**
 * Knowledge Base Query Script (Example)
 * 
 * Demonstrates how to search the knowledge base using vector similarity.
 * Since Firestore doesn't have native vector search, we:
 * 1. Fetch all chunks
 * 2. Compute cosine similarity in-memory
 * 3. Return top K results
 * 
 * This works fine for small datasets (<1000 chunks).
 * For larger datasets, migrate to Pinecone or Vertex AI Vector Search.
 */

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

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
const EMBEDDING_MODEL = 'models/gemini-embedding-001'; // Correct model name
const EMBEDDING_DIMENSIONS = 768; // Explicitly set dimensions
const COLLECTION_NAME = 'kb_chunks';

// ============================================================================
// Vector Similarity Functions
// ============================================================================

/**
 * Computes cosine similarity between two vectors
 * Returns value between -1 and 1 (higher = more similar)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates embedding for text using Google Gemini API
 * Uses models/gemini-embedding-001 with explicit 768 dimensions
 */
async function generateEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
  
  return result.embedding.values;
}

/**
 * Searches knowledge base for relevant chunks
 */
async function searchKnowledgeBase(query, topK = 3, minSimilarity = 0.5) {
  console.log(`\nSearching for: "${query}"`);
  console.log('='.repeat(70));
  
  try {
    // 1. Generate embedding for query
    console.log('Generating query embedding...');
    const queryEmbedding = await generateEmbedding(query);
    
    // 2. Fetch all chunks from Firestore
    console.log('Fetching knowledge base chunks...');
    const chunksRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(chunksRef);
    
    if (snapshot.empty) {
      console.log('Knowledge base is empty. Run ingestion first.');
      return [];
    }
    
    console.log(`Loaded ${snapshot.size} chunks`);
    
    // 3. Compute similarity scores
    console.log('Computing similarity scores...');
    const results = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const similarity = cosineSimilarity(queryEmbedding, data.embedding);
      
      // Only include results above threshold
      if (similarity >= minSimilarity) {
        results.push({
          id: data.id,
          filename: data.filename,
          heading: data.heading,
          content: data.content,
          similarity: similarity,
        });
      }
    });
    
    // 4. Sort by similarity and return top K
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);
    
    console.log(`\nFound ${results.length} results above threshold (${minSimilarity})`);
    console.log(`Returning top ${topResults.length} results\n`);
    
    return topResults;
    
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    throw error;
  }
}

/**
 * Pretty-prints search results
 */
function displayResults(results) {
  if (results.length === 0) {
    console.log('No results found.\n');
    return;
  }
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.heading}`);
    console.log(`   File: ${result.filename}`);
    console.log(`   Similarity: ${(result.similarity * 100).toFixed(2)}%`);
    console.log(`   Preview: ${result.content.substring(0, 150)}...`);
    console.log('-'.repeat(70));
  });
}

// ============================================================================
// Main Execution (Example Queries)
// ============================================================================

async function main() {
  // Validate environment
  if (!process.env.GOOGLE_API_KEY) {
    console.error('ERROR: GOOGLE_API_KEY not set');
    process.exit(1);
  }
  
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('ERROR: Firebase configuration not set');
    process.exit(1);
  }
  
  // Example queries
  const queries = [
    "What backend technologies does Mohit use?",
    "Tell me about the flash sale engine project",
    "What's Mohit's experience with distributed systems?",
    "Does Mohit have experience with AI integration?",
  ];
  
  console.log('='.repeat(70));
  console.log('Knowledge Base Query Examples');
  console.log('='.repeat(70));
  
  // Run first query as example
  const query = queries[0];
  const results = await searchKnowledgeBase(query, topK = 3, minSimilarity = 0.5);
  displayResults(results);
  
  // Uncomment to test more queries:
  /*
  for (const query of queries) {
    const results = await searchKnowledgeBase(query, 3, 0.5);
    displayResults(results);
  }
  */
  
  console.log('\n✓ Query complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for use in other modules
export { searchKnowledgeBase, cosineSimilarity, generateEmbedding };
