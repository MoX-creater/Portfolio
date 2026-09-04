/**
 * Check Firestore kb_chunks collection
 * 
 * Verifies:
 * - If collection exists
 * - How many documents
 * - Sample document structure
 * - Embedding dimensions if any exist
 */

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

dotenv.config();

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

async function checkFirestore() {
  console.log('\n' + '='.repeat(70));
  console.log('Firestore kb_chunks Collection Check');
  console.log('='.repeat(70));
  
  try {
    const chunksRef = collection(db, 'kb_chunks');
    const snapshot = await getDocs(chunksRef);
    
    console.log(`\nTotal documents: ${snapshot.size}`);
    
    if (snapshot.empty) {
      console.log('\n✓ Collection is empty - ready for fresh ingestion');
      return;
    }
    
    // Check first document
    const firstDoc = snapshot.docs[0];
    const data = firstDoc.data();
    
    console.log('\nSample document structure:');
    console.log(`  ID: ${firstDoc.id}`);
    console.log(`  filename: ${data.filename || 'MISSING'}`);
    console.log(`  heading: ${data.heading || 'MISSING'}`);
    console.log(`  content length: ${data.content?.length || 0} chars`);
    console.log(`  embedding exists: ${!!data.embedding}`);
    
    if (data.embedding) {
      console.log(`  embedding dimensions: ${data.embedding.length}`);
      console.log(`  embeddingDimension field: ${data.embeddingDimension || 'MISSING'}`);
      
      // Check if dimensions match expected
      if (data.embedding.length !== 768) {
        console.warn(`\n⚠️  WARNING: Embedding dimension is ${data.embedding.length}, expected 768`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('Recommendation:');
    if (snapshot.size > 0 && data.embedding) {
      console.log('  Data exists with embeddings.');
      console.log('  If you changed the embedding model, you MUST re-run ingestion.');
      console.log('  Run: npm run ingest');
    } else {
      console.log('  No valid embeddings found. Run ingestion.');
      console.log('  Run: npm run ingest');
    }
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nCheck your Firebase configuration in .env\n');
  }
}

checkFirestore();
