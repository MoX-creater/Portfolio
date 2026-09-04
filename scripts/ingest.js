/**
 * Knowledge Base Ingestion Script for RAG Chatbot
 * 
 * This script:
 * 1. Recursively reads all markdown files from /knowledge-base
 * 2. Chunks each file by ## headings
 * 3. Generates embeddings using Google Gemini API
 * 4. Stores chunks + embeddings + metadata in Firestore
 * 5. Is idempotent - re-running updates existing chunks
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc, query, where, getDocs } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../knowledge-base');
const COLLECTION_NAME = 'kb_chunks';
const EMBEDDING_MODEL = 'models/gemini-embedding-001'; // Correct model name
const EMBEDDING_DIMENSIONS = 768; // Explicitly set dimensions
const BATCH_SIZE = 500; // Firestore batch write limit

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
// Utility Functions
// ============================================================================

/**
 * Recursively finds all markdown files in a directory
 */
async function findMarkdownFiles(dir) {
  const files = [];
  
  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await traverse(dir);
  return files;
}

/**
 * Chunks a markdown file by ## headings
 * Returns array of { heading, content, sectionIndex }
 */
function chunkByHeadings(markdownContent, filename) {
  const lines = markdownContent.split('\n');
  const chunks = [];
  let currentHeading = 'Introduction'; // Default for content before first heading
  let currentContent = [];
  let sectionIndex = 0;
  
  for (const line of lines) {
    // Check if line is a ## heading (not # or ###)
    if (line.match(/^##\s+[^#]/)) {
      // Save previous section if it has content
      if (currentContent.length > 0) {
        chunks.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
          sectionIndex: sectionIndex++,
        });
      }
      
      // Start new section
      currentHeading = line.replace(/^##\s+/, '').trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentContent.length > 0) {
    chunks.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
      sectionIndex: sectionIndex++,
    });
  }
  
  // Filter out empty chunks
  return chunks.filter(chunk => chunk.content.length > 0);
}

/**
 * Generates a deterministic chunk ID based on filename and section
 * This ensures idempotency - same file/section always gets same ID
 */
function generateChunkId(filename, sectionIndex) {
  const input = `${filename}-${sectionIndex}`;
  return crypto.createHash('md5').update(input).digest('hex');
}

/**
 * Generates embedding for text using Google Gemini API
 * Uses models/gemini-embedding-001 with explicit 768 dimensions
 */
async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: EMBEDDING_MODEL,
    });
    
    // Call embedContent with explicit dimensions
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
    
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Batch generates embeddings with rate limiting
 * Adds delay between requests to avoid rate limits
 */
async function generateEmbeddingsBatch(chunks, delayMs = 100) {
  const embeddings = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Generating embedding ${i + 1}/${chunks.length} for: ${chunk.heading}`);
    
    try {
      // Combine heading and content for richer embedding
      const textToEmbed = `${chunk.heading}\n\n${chunk.content}`;
      const embedding = await generateEmbedding(textToEmbed);
      embeddings.push(embedding);
      
      // Rate limiting delay (except for last item)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`  Failed to generate embedding for "${chunk.heading}":`, error.message);
      // Push null to maintain index alignment, will filter later
      embeddings.push(null);
    }
  }
  
  return embeddings;
}

/**
 * Deletes existing chunks for a file to ensure idempotency
 */
async function deleteExistingChunks(relativeFilename) {
  const chunksRef = collection(db, COLLECTION_NAME);
  const q = query(chunksRef, where('filename', '==', relativeFilename));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 0;
  }
  
  // Delete in batches
  const batch = writeBatch(db);
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  return snapshot.size;
}

/**
 * Stores chunks with embeddings in Firestore
 */
async function storeChunks(chunks, embeddings, filename) {
  const chunksRef = collection(db, COLLECTION_NAME);
  const batch = writeBatch(db);
  let batchCount = 0;
  let storedCount = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    
    // Skip chunks that failed embedding generation
    if (!embedding) {
      console.warn(`  Skipping chunk "${chunk.heading}" due to embedding failure`);
      continue;
    }
    
    const chunkId = generateChunkId(filename, chunk.sectionIndex);
    const docRef = doc(chunksRef, chunkId);
    
    const docData = {
      id: chunkId,
      filename: filename,
      heading: chunk.heading,
      content: chunk.content,
      sectionIndex: chunk.sectionIndex,
      embedding: embedding,
      embeddingDimension: embedding.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    batch.set(docRef, docData);
    batchCount++;
    storedCount++;
    
    // Commit batch if we hit Firestore's limit
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} chunks`);
      batchCount = 0;
    }
  }
  
  // Commit remaining chunks
  if (batchCount > 0) {
    await batch.commit();
  }
  
  return storedCount;
}

/**
 * Processes a single markdown file
 */
async function processFile(filePath) {
  const relativeFilename = path.relative(KNOWLEDGE_BASE_DIR, filePath).replace(/\\/g, '/');
  console.log(`\nProcessing: ${relativeFilename}`);
  
  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Chunk by headings
    const chunks = chunkByHeadings(content, relativeFilename);
    console.log(`  Found ${chunks.length} sections`);
    
    if (chunks.length === 0) {
      console.log('  No content to process, skipping');
      return { success: true, chunks: 0 };
    }
    
    // Delete existing chunks for this file (idempotency)
    const deletedCount = await deleteExistingChunks(relativeFilename);
    if (deletedCount > 0) {
      console.log(`  Deleted ${deletedCount} existing chunks`);
    }
    
    // Generate embeddings
    const embeddings = await generateEmbeddingsBatch(chunks);
    
    // Store in Firestore
    const storedCount = await storeChunks(chunks, embeddings, relativeFilename);
    console.log(`  ✓ Stored ${storedCount} chunks`);
    
    return { success: true, chunks: storedCount };
  } catch (error) {
    console.error(`  ✗ Error processing file:`, error.message);
    return { success: false, error: error.message, chunks: 0 };
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Knowledge Base Ingestion Pipeline');
  console.log('='.repeat(70));
  console.log(`Knowledge Base Directory: ${KNOWLEDGE_BASE_DIR}`);
  console.log(`Firestore Collection: ${COLLECTION_NAME}`);
  console.log(`Embedding Model: ${EMBEDDING_MODEL}`);
  console.log('='.repeat(70));
  
  // Validate environment variables
  if (!process.env.GOOGLE_API_KEY) {
    console.error('ERROR: GOOGLE_API_KEY not set in .env file');
    process.exit(1);
  }
  
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('ERROR: Firebase configuration not set in .env file');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  try {
    // Find all markdown files
    console.log('\nScanning for markdown files...');
    const markdownFiles = await findMarkdownFiles(KNOWLEDGE_BASE_DIR);
    console.log(`Found ${markdownFiles.length} markdown files\n`);
    
    if (markdownFiles.length === 0) {
      console.log('No markdown files found. Exiting.');
      return;
    }
    
    // Process each file
    const results = [];
    for (const filePath of markdownFiles) {
      const result = await processFile(filePath);
      results.push(result);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('INGESTION SUMMARY');
    console.log('='.repeat(70));
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`Files Processed: ${markdownFiles.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Total Chunks Created: ${totalChunks}`);
    console.log(`Duration: ${duration}s`);
    
    if (failureCount > 0) {
      console.log('\nErrors:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.error}`);
      });
    }
    
    console.log('='.repeat(70));
    console.log('✓ Ingestion complete!');
    
  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    process.exit(1);
  }
}

// Run the script
main();
