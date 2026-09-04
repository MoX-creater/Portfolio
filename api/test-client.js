/**
 * Test Client for RAG Chatbot API
 * 
 * Demonstrates how to consume the SSE streaming endpoint
 * 
 * Usage: node api/test-client.js "Your question here"
 */

import https from 'https';
import http from 'http';

const API_URL = process.env.API_URL || 'http://localhost:3001/api/chat';

/**
 * Sends a query to the chatbot API and streams the response
 */
async function queryChatbot(query) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify({ query });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = client.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
        });
        return;
      }
      
      let buffer = '';
      let eventType = null;
      
      console.log('\n' + '='.repeat(70));
      console.log('CHATBOT RESPONSE');
      console.log('='.repeat(70));
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data:')) {
            const data = JSON.parse(line.slice(6));
            
            switch (eventType) {
              case 'retrieval':
                console.log(`\n📚 Found ${data.chunksFound} relevant sources:`);
                data.sources.forEach((source, idx) => {
                  console.log(`   ${idx + 1}. ${source.filename} - ${source.heading} (${(source.similarity * 100).toFixed(1)}%)`);
                });
                console.log('\n💬 Response:\n');
                break;
                
              case 'token':
                process.stdout.write(data.text);
                break;
                
              case 'done':
                console.log('\n\n' + '='.repeat(70));
                console.log('✓ Response complete');
                resolve();
                break;
                
              case 'error':
                console.error('\n\n❌ Error:', data.message);
                if (data.details) {
                  console.error('   Details:', data.details);
                }
                reject(new Error(data.message));
                break;
            }
          }
        }
      });
      
      res.on('end', () => {
        if (buffer.length > 0) {
          console.log('\n\n⚠️  Incomplete response');
        }
        resolve();
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Main execution
 */
async function main() {
  const query = process.argv[2];
  
  if (!query) {
    console.error('Usage: node api/test-client.js "Your question here"');
    console.error('\nExamples:');
    console.error('  node api/test-client.js "What backend technologies does Mohit use?"');
    console.error('  node api/test-client.js "Tell me about the Flash Sale Engine"');
    console.error('  node api/test-client.js "What is Mohit\'s educational background?"');
    process.exit(1);
  }
  
  console.log('Query:', query);
  console.log('API URL:', API_URL);
  
  try {
    await queryChatbot(query);
  } catch (error) {
    console.error('\n\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
