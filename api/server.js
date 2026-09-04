/**
 * Express Server for RAG Chatbot API
 * 
 * Starts the API server and mounts the chat routes
 * 
 * Usage:
 *   npm run api (production)
 *   npm run api:dev (development with auto-reload)
 */

import express from 'express';
import dotenv from 'dotenv';
import chatRouter, { rateLimitMax, rateLimitWindowMs } from './chat.js';

// Load environment variables
dotenv.config();

// ============================================================================
// Startup Sanity Checks
// ============================================================================

// Check required environment variables at startup (fail fast and loud)
const requiredEnvVars = [
  'GOOGLE_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('\n' + '='.repeat(70));
  console.error('❌ STARTUP FAILED: Missing required environment variables');
  console.error('='.repeat(70));
  console.error('\nMissing variables:');
  missingVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error('\nAction required:');
  console.error('  1. Copy .env.example to .env');
  console.error('  2. Fill in your actual API keys and Firebase config');
  console.error('  3. Restart the server');
  console.error('\n' + '='.repeat(70) + '\n');
  process.exit(1);
}

// Log that keys are loaded (masked for security)
console.log('\n' + '='.repeat(70));
console.log('Environment Variables Check');
console.log('='.repeat(70));
console.log(`GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY.substring(0, 10)}...${process.env.GOOGLE_API_KEY.slice(-4)} ✓`);
console.log(`FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID} ✓`);
console.log('='.repeat(70) + '\n');

const app = express();
const PORT = process.env.API_PORT || 3001;

// Required so express-rate-limit keys on the real client IP behind
// Cloudflare / a reverse proxy, not the proxy's address.
app.set('trust proxy', 1);

// ============================================================================
// Middleware
// ============================================================================

// Parse JSON bodies (must be before routes)
app.use(express.json());

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================================
// Routes
// ============================================================================

// Mount chat API routes under /api
app.use('/api', chatRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Portfolio RAG Chatbot API',
    version: '1.0.0',
    endpoints: {
      chat: 'POST /api/chat',
      health: 'GET /api/health',
    },
    documentation: 'See README.md for usage examples',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
    availableRoutes: [
      'POST /api/chat',
      'GET /api/health',
    ],
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('Portfolio RAG Chatbot API Server');
  console.log('='.repeat(70));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log('\nAvailable endpoints:');
  console.log(`  POST http://localhost:${PORT}/api/chat`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(
    rateLimitMax === 0
      ? '\nRate limit: disabled (RATE_LIMIT_MAX=0)'
      : `\nRate limit: ${rateLimitMax} req / ${Math.round(rateLimitWindowMs / 60000)} min per IP`
  );
  console.log('\nExample request:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/chat \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"query": "What technologies does Mohit use?"}'`);
  console.log('='.repeat(70));
  console.log('\n✓ Server ready to accept connections\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\nSIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
