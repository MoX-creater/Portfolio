# Frequently Asked Questions

## Career & Availability

### Are you looking for full-time or internship positions?

I'm currently seeking SDE and backend engineering internships. I'm in my 4th year at Chandigarh University (graduating 2027), so I'm focused on internship opportunities. [NEED INPUT: Full-time availability post-graduation in 2027]

### What's your availability?

[NEED INPUT: Specific availability - e.g., "Available for summer 2027 internships starting May" or "Available immediately for 6-month internship"]

### What kind of roles are you targeting?

I'm targeting backend engineering and SDE roles, particularly positions involving:
- Distributed systems and high-concurrency architectures
- Microservices with Spring Boot
- Caching strategies (Redis) and message queues (RabbitMQ)
- Real-time systems (WebSockets, Socket.io, WebRTC)
- Full-stack positions where I can leverage my React + backend skills

### Are you open to relocation?

[NEED INPUT: Relocation preferences - e.g., "Yes, open to relocating anywhere in India" or "Open to remote/hybrid arrangements"]

### What's your expected timeline for an internship?

[NEED INPUT: Expected duration - e.g., "6-month internship" or "3-6 months depending on the company"]

## Technical Questions

### What's your strongest project and why?

The Flash Sale Engine is my strongest project because it tackles real-world distributed systems challenges at scale. Handling 10,000+ concurrent requests with zero inventory overselling required deep understanding of:
- Distributed locking mechanisms (Redisson)
- Cache-aside patterns with Redis
- Event-driven architecture with RabbitMQ
- Trade-offs between consistency and availability

It demonstrates my ability to build production-grade systems that handle extreme concurrency, which is directly applicable to backend roles at scale.

### What backend technologies are you most comfortable with?

I'm most comfortable with the Spring Boot ecosystem in Java. I've built a high-concurrency system using Spring Boot with Redis for caching/locking, RabbitMQ for async processing, and PostgreSQL for persistence. I also have strong experience with Node.js/Express for lighter-weight backends and real-time applications using Socket.io.

### Have you worked with microservices?

The Flash Sale Engine follows microservices principles: it's event-driven, decouples concerns (request handling vs. persistence), and uses message queues for inter-service communication. While it's not a full microservices deployment with multiple services, it demonstrates understanding of asynchronous communication, distributed locking, and eventual consistency—core microservices patterns.

### What's your experience with system design?

I've designed and implemented systems with specific scalability and performance requirements:
- Flash Sale Engine: designed for 10,000+ concurrent users with sub-50ms latency
- DropLink: peer-to-peer architecture eliminating server bottlenecks
- Typing Speed App: real-time multiplayer with state synchronization

I approach system design by identifying bottlenecks, choosing appropriate trade-offs (CAP theorem), and validating with load testing.

### How do you handle high-concurrency scenarios?

In the Flash Sale Engine, I used multiple strategies:
1. **Redis caching**: Moved inventory reads from database to in-memory cache
2. **Distributed locking**: Redisson locks prevent race conditions across instances
3. **Atomic operations**: Redis DECR ensures inventory decrements are atomic
4. **Async processing**: RabbitMQ decouples fast path (API response) from slow path (database write)
5. **Idempotency**: Unique request IDs prevent duplicate processing on retries

### What databases have you worked with?

- **PostgreSQL**: Used for transactional order data in Flash Sale Engine
- **Redis**: Extensive experience with caching and distributed locking
- **Firebase Firestore**: NoSQL database for telemetry and real-time data in Typing Speed App
- **MySQL**: Academic and early project experience

I'm comfortable with both SQL (relational modeling, query optimization) and NoSQL (document stores, key-value caches).

### Do you have experience with AI/ML integration?

Yes, I integrated Google Gemini API in the Typing Speed App for:
- Generating adaptive typing passages based on user error patterns
- Producing AI-driven performance summaries and improvement suggestions
- Implemented prompt engineering for structured outputs
- Handled API rate limiting, response caching, and error fallbacks

My focus is on LLM API integration for practical applications rather than training models from scratch.

### What's your approach to learning new technologies?

I learn by building. When I wanted to understand high-concurrency patterns, I built the Flash Sale Engine. When I wanted to learn WebRTC, I built DropLink. I read documentation, study existing implementations, build a working prototype, then iterate based on what breaks or performs poorly. My GitHub and projects reflect this hands-on approach.

## Problem-Solving & Algorithms

### What's your competitive programming background?

I'm an active competitive programmer with:
- **LeetCode**: 700+ problems solved, 1700 rating in Java
- **Codeforces**: 1000+ rating

I primarily use Java for DSA and have strong foundations in algorithms, data structures, dynamic programming, and graph algorithms. This helps me write efficient, optimized code in production projects.

### How do you approach debugging complex issues?

My approach is systematic:
1. Reproduce the issue reliably
2. Isolate the problem (binary search through the codebase)
3. Form hypotheses about root cause
4. Test hypotheses with logs, debuggers, or simplified test cases
5. Verify the fix doesn't break anything else

In the Flash Sale Engine, when I discovered race conditions, I used load testing to reproduce reliably, added detailed logging to trace concurrent requests, identified the unprotected critical section, and added distributed locks.

### What's the most challenging bug you've fixed?

[NEED INPUT: If you have a specific debugging story that demonstrates problem-solving skills, add it here. Otherwise, can reference the race condition fix in Flash Sale Engine or network variability issues in DropLink]

## Project-Specific Questions

### How did you validate the Flash Sale Engine's performance claims?

I used Apache JMeter for load testing:
- Configured 10,000+ concurrent virtual users
- Sent purchase requests simultaneously for limited inventory
- Measured API response times (verified sub-50ms latency)
- Validated zero overselling by comparing total orders to initial inventory
- Tested across multiple runs to ensure consistency

### Can you explain the WebRTC architecture in DropLink?

DropLink uses a three-phase architecture:
1. **Signaling**: WebSocket server exchanges SDP offers/answers and ICE candidates between peers
2. **Connection**: WebRTC establishes peer-to-peer connection (1-3 seconds)
3. **Transfer**: Files transferred directly via RTCDataChannel, no server involvement

The server only facilitates the initial handshake. File data never touches the server, ensuring privacy and eliminating storage costs.

### How does the AI adaptation work in the Typing Speed App?

The system collects detailed telemetry: which characters cause errors, in what context, and how frequently. This data is sent to Google Gemini with a prompt like:

"Generate a typing passage that emphasizes these character combinations: [user's weak bigrams]. Include these characters 30% more than normal English text."

Gemini generates a passage targeting those specific weaknesses. Over time, as the user improves on certain characters, new telemetry shifts focus to different weak areas.

## Culture & Work Style

### Do you prefer working independently or in a team?

I'm comfortable with both. My projects demonstrate I can independently own a problem end-to-end: design, implement, test, and iterate. At the same time, I've collaborated on academic projects and I'm eager to work in a team environment where I can learn from senior engineers and contribute to larger codebases.

### How do you stay updated with technology trends?

I follow tech blogs, engineering blogs from companies like Netflix and Uber, and actively participate in developer communities. I also learn by building—when I see a pattern like event-driven architecture mentioned frequently, I implement it myself (like with RabbitMQ in the Flash Sale Engine) to truly understand it.

### What's your preferred development environment?

I use VS Code for development across all languages. For backend work, I prefer IntelliJ IDEA when working extensively with Java/Spring Boot. I'm comfortable with Git for version control, Docker for containerization, and command-line tools for debugging and deployment.
