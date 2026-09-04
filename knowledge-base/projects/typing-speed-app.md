# Typing Speed & Multiplayer Race Platform

## Overview

A real-time typing test platform that tracks user performance, analyzes typing patterns, and uses AI to generate personalized practice content. Features include live multiplayer race rooms, detailed error analytics, and adaptive difficulty based on user weaknesses.

## Problem It Solves

Traditional typing test platforms provide generic passages and basic WPM metrics, but don't help users improve systematically. Key problems addressed:

- **Generic practice content**: One-size-fits-all passages don't target individual weaknesses
- **Limited analytics**: Most platforms only show WPM, not where errors actually occur
- **No progression tracking**: Users can't see improvement over time
- **Isolated practice**: No competitive or social element to maintain engagement

This platform solves these through detailed error telemetry, AI-generated adaptive content, and real-time multiplayer racing.

## Technology Stack

- **Frontend**: React.js
- **Backend**: Node.js + Express.js
- **Real-time Communication**: Socket.io
- **Database**: Firebase Firestore
- **AI Integration**: Google Gemini API
- **[NEED INPUT: Hosting/deployment stack if applicable]**

## Architecture

### Core Components

1. **Real-Time Race Rooms**: Socket.io-based multiplayer lobbies with live progress tracking
2. **Performance Analytics**: Per-user error maps, WPM trends, accuracy by character class
3. **AI Content Generation**: Gemini API generates passages targeting user's weak characters
4. **Telemetry Pipeline**: Captures keystroke data, computes metrics, persists to Firestore
5. **Performance Summary**: AI-generated post-race analysis and improvement suggestions

### Data Flow

1. User types → Frontend captures every keystroke with timestamp
2. On-the-fly calculation of WPM, accuracy, error positions
3. In multiplayer: real-time progress broadcast via Socket.io
4. Post-test: error data (which characters, context, frequency) sent to backend
5. Backend persists telemetry to Firestore and requests AI analysis
6. Gemini API generates adaptive passages and performance summaries
7. UI displays results with trends over time

## Key Technical Decisions

### Why Socket.io?

Multiplayer races require sub-second latency for live progress updates. Socket.io provides reliable, bidirectional real-time communication with automatic reconnection handling. It abstracts WebSocket complexity and provides room-based broadcasting out of the box.

### Why Firebase Firestore?

Firestore's real-time listeners fit the use case of tracking user progress over time. It provides flexible document structure for per-user error maps and time-series WPM data. The NoSQL model handles varying telemetry schemas as features evolve.

### Why Google Gemini API?

Gemini can process structured error data and generate contextually relevant typing passages that target specific character combinations where users make mistakes. It also produces natural language performance summaries that explain patterns in user data (e.g., "You're 15% slower on punctuation than alphanumeric characters").

### AI Rate Limiting & Caching

To handle API costs and rate limits:
- **Response caching**: Common error patterns trigger cached passage retrieval
- **Rate limiting**: Per-user throttling prevents API abuse
- **Edge-case handling**: Fallback to pre-generated passages if API fails

## Features Implemented

### Real-Time Multiplayer Races

- Socket.io room system for matchmaking
- Live progress bars showing each racer's position
- WPM and accuracy computed on every keystroke
- Race countdown and synchronized start

### Error Telemetry Pipeline

- **Error maps**: Stores which characters/bigrams cause most errors per user
- **WPM trends**: Time-series data showing improvement over sessions
- **Accuracy by character class**: Separate metrics for letters, numbers, punctuation
- **Contextual errors**: Records surrounding characters when errors occur

### AI-Driven Features

1. **Adaptive passage generation**: Gemini generates passages emphasizing user's weak characters
2. **Post-race summaries**: AI analyzes performance and provides actionable feedback
3. **Post-test analysis**: Compares current session to historical data, identifies trends

### UI Redesign

Shipped a results page redesign in React focusing on:
- Clear visualization of WPM trends over time
- Heatmap of error-prone characters
- AI-generated insights prominently displayed
- Comparison with previous sessions

## Performance & Optimization

- **Real-time metrics**: WPM and accuracy calculated on every keystroke with negligible latency
- **AI response caching**: Reduces redundant API calls for similar error patterns
- **Rate limiting**: Prevents excessive API usage without degrading UX
- **Edge-case handling**: Graceful fallbacks when AI API is unavailable

## Challenges Faced

### Challenge 1: Synchronizing Multiplayer State
**Problem**: Race state (countdown, typing progress) needed to stay synchronized across all clients in a room.

**Solution**: Server acts as single source of truth. Race countdown and start signal broadcast from server. Each client sends only their own progress updates, server broadcasts aggregated state to all participants.

### Challenge 2: Real-Time WPM Calculation
**Problem**: Traditional WPM calculation (total words / time in minutes) is only accurate at the end. Real-time display needed accurate intermediate values.

**Solution**: Calculate WPM based on correctly typed characters up to current position, divided by elapsed time. Adjust for errors using gross WPM vs. net WPM formulas.

### Challenge 3: AI API Cost & Latency
**Problem**: Calling Gemini API on every test completion would be expensive and slow.

**Solution**: Implemented three-tier strategy:
1. Cache common error patterns → passage mappings
2. Batch process telemetry for trending analysis
3. Rate limit per-user API calls with intelligent queuing

### Challenge 4: Error Context Collection
**Problem**: Just knowing "user made an error on 'e'" isn't useful. Context matters (e.g., "th**e**" vs. "**e**nd").

**Solution**: Store surrounding 3-5 characters when error occurs. This allows AI to generate passages with those specific bigrams/trigrams to target the actual weakness.

## What I Learned

- Real-time multiplayer architecture with Socket.io
- WebSocket room management and state synchronization
- Prompt engineering for structured AI outputs
- LLM API integration patterns (rate limiting, caching, fallbacks)
- NoSQL data modeling for telemetry and time-series data
- Real-time metrics calculation and optimization
- Designing adaptive systems that personalize based on user data
