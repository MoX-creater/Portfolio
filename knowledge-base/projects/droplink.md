# P2P File Sharing App (DropLink)

## Overview

DropLink is a peer-to-peer file transfer application that enables direct browser-to-browser file sharing without server storage. Files are transferred directly between users using WebRTC data channels, with a signaling server only used to establish the initial peer connection.

## Problem It Solves

Traditional file sharing requires uploading files to a server, which then sends them to the recipient. This approach has several limitations:

- **Storage costs**: Server must store files temporarily
- **Privacy concerns**: Files pass through a third-party server
- **Upload/download overhead**: Files are transferred twice (sender → server → receiver)
- **File size limits**: Server storage constraints limit transfer sizes

DropLink solves these by creating a direct peer-to-peer connection between browsers, eliminating the need for server-side file storage.

## Technology Stack

- **Frontend**: React.js
- **Peer Communication**: WebRTC (RTCPeerConnection, RTCDataChannel)
- **Signaling Server**: Node.js + Express.js + WebSockets
- **NAT Traversal**: ICE candidates with STUN servers

## Architecture

### Core Components

1. **React Frontend**: UI for selecting files, generating share links, and monitoring transfer progress
2. **WebSocket Signaling Server**: Facilitates peer discovery and WebRTC handshake (SDP exchange)
3. **WebRTC Data Channels**: Actual file transfer happens peer-to-peer
4. **STUN Servers**: Help peers discover their public IP addresses for NAT traversal

### Connection Flow

1. Sender opens the app → generates unique room ID
2. Sender shares room link with receiver
3. Receiver opens link → joins same room via WebSocket
4. Signaling server exchanges WebRTC SDP offers/answers and ICE candidates
5. WebRTC peer connection establishes (1-3 seconds in local testing)
6. File transfer occurs directly over WebRTC data channel
7. No file data passes through the server

## Key Technical Decisions

### Why WebRTC?

WebRTC enables true peer-to-peer communication in browsers without plugins. The RTCDataChannel API allows arbitrary binary data transfer, making it perfect for file sharing. Once the connection is established, files transfer directly between clients.

### Why WebSockets for Signaling?

WebRTC requires exchanging connection metadata (SDP offers/answers, ICE candidates) before peers can connect. WebSockets provide a low-latency, bidirectional channel for this signaling phase. The signaling server only facilitates the handshake and doesn't touch file data.

### Why STUN Servers?

Most users are behind NAT (Network Address Translation), meaning their local IP isn't publicly accessible. STUN servers help peers discover their public IP addresses and ports, enabling direct connections even behind NAT.

## Performance Metrics

- **Connection Time**: Peer connections establish within 1-3 seconds in local testing
- **Transfer Speed**: 2-8 MB/s in favorable local network conditions
- **Server Load**: Minimal — signaling only, no file data transferred through server
- **Network Conditions**: Performance validated across multiple sessions

## Challenges Faced

### Challenge 1: NAT Traversal
**Problem**: Initial testing failed when users were on different networks because NAT prevented direct connections.

**Solution**: Integrated ICE (Interactive Connectivity Establishment) framework with STUN servers. This allows peers to discover their public IPs and negotiate the best connection path, even across NAT boundaries.

### Challenge 2: Reliable Data Transfer
**Problem**: WebRTC data channels are message-based, not stream-based. Sending large files as a single message causes memory issues.

**Solution**: Implemented chunked file transfer where files are split into smaller chunks (e.g., 16KB) and sent sequentially. Receiver reassembles chunks in order.

### Challenge 3: Connection State Management
**Problem**: WebRTC connections have multiple states (connecting, connected, disconnected, failed). UI needed to reflect these states accurately.

**Solution**: Implemented connection state listeners and UI feedback for each state. Added reconnection logic for temporary disconnections.

### Challenge 4: Browser Compatibility
**Problem**: Different browsers have slightly different WebRTC API implementations.

**Solution**: Used adapter.js shim for cross-browser compatibility. Tested on Chrome, Firefox, and Edge.

## What I Learned

- WebRTC architecture: signaling vs. media/data channels
- NAT traversal techniques (STUN, ICE candidates)
- WebSocket communication patterns for real-time apps
- Binary data handling in JavaScript (Blob, ArrayBuffer, TypedArrays)
- Chunked data transfer for large files
- Peer connection lifecycle management
- Network variability handling and fallback strategies
