# High-Concurrency Flash Sale Engine

## Overview

The Flash Sale Engine is a high-performance backend system designed to handle the extreme concurrency patterns of flash sales and limited-inventory scenarios. It processes 10,000+ concurrent requests in under 5 seconds with zero inventory overselling.

## Problem It Solves

Flash sales create massive traffic spikes where thousands of users compete for limited inventory. The core challenges are:

- **Race conditions**: Multiple requests trying to purchase the same item simultaneously
- **Inventory overselling**: Selling more units than available due to concurrent access
- **Database bottlenecks**: Direct database writes can't handle extreme write concurrency
- **User experience**: Users need fast feedback even under load

This system solves these problems through distributed locking, caching, and asynchronous processing.

## Technology Stack

- **Backend**: Spring Boot
- **Cache & Locking**: Redis with Redisson distributed locks
- **Message Queue**: RabbitMQ
- **Database**: PostgreSQL
- **Containerization**: Docker
- **Load Testing**: Apache JMeter

## Architecture

### Core Components

1. **Redis Cache Layer**: Pre-loads inventory into Redis for fast reads and atomic decrements
2. **Distributed Locking**: Redisson distributed locks prevent race conditions on inventory checks
3. **Event-Driven Processing**: RabbitMQ decouples request validation from order persistence
4. **Idempotent Order Processing**: Request deduplication ensures exactly-once semantics

### Request Flow

1. Client sends purchase request → API endpoint
2. Redis atomic decrement checks and reserves inventory (with distributed lock)
3. If successful, order event published to RabbitMQ
4. API returns success immediately (sub-50ms latency)
5. RabbitMQ consumer asynchronously persists order to PostgreSQL
6. Idempotency checks prevent duplicate processing

## Key Technical Decisions

### Why Redis + Redisson?

Redis provides atomic operations (DECR) for inventory management. Redisson adds distributed locking capabilities, ensuring only one thread/process can modify inventory for a given product at a time. This eliminates race conditions across multiple application instances.

### Why RabbitMQ?

Direct database writes during high concurrency create bottlenecks. RabbitMQ decouples the fast path (inventory reservation) from the slow path (database persistence). This keeps API latency under 50ms while guaranteeing eventual consistency.

### Why Asynchronous Processing?

Synchronous database writes would make the API wait for PostgreSQL commits, which don't scale under extreme load. By making database operations asynchronous, the API can respond immediately after Redis confirms inventory availability.

## Performance Metrics

- **Concurrent Requests**: 10,000+ requests in under 5 seconds
- **API Latency**: Sub-50ms response time
- **Overselling**: Zero inventory overselling (validated via load testing)
- **Order Processing**: Exactly-once semantics through idempotent request handling
- **Validation**: Performance verified using Apache JMeter load tests

## Challenges Faced

### Challenge 1: Race Conditions
**Problem**: Initial implementation had race conditions where multiple threads could read the same inventory count and both proceed with purchase.

**Solution**: Implemented Redisson distributed locks around Redis operations. Only one request can hold the lock for a product at a time, making inventory checks and decrements atomic.

### Challenge 2: Database Write Bottleneck
**Problem**: Directly writing orders to PostgreSQL during high concurrency caused response times to spike.

**Solution**: Introduced RabbitMQ to decouple request handling from database persistence. API responds after Redis confirmation, while RabbitMQ consumers handle database writes asynchronously.

### Challenge 3: Exactly-Once Processing
**Problem**: Network retries and message redelivery could cause duplicate orders.

**Solution**: Implemented idempotent request handling using unique request IDs. Each order is processed exactly once even if the message is redelivered.

## What I Learned

- Distributed locking patterns for concurrent resource access
- Event-driven architecture design for scalability
- Trade-offs between consistency and availability (CAP theorem in practice)
- Performance testing and bottleneck identification with JMeter
- Redis data structures and atomic operations
- RabbitMQ message patterns and consumer configurations
