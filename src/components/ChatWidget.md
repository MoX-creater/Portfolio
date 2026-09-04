# Chat Widget Component

Terminal-style RAG chatbot widget with SSE streaming support.

## Features

- ✅ Terminal aesthetic (monospace, minimal, green-on-black)
- ✅ Real-time streaming via fetch + ReadableStream (supports POST with body)
- ✅ Parses custom SSE event types (retrieval, token, done, error)
- ✅ Source attribution from retrieval metadata
- ✅ Starter question chips
- ✅ Character count near limit
- ✅ Error handling with user-friendly messages
- ✅ Mobile responsive
- ✅ Keyboard navigation (Enter to send)
- ✅ Automatic scroll to latest message

## Usage

### 1. Environment Variable

Create `.env` in your project root:

```env
VITE_API_URL=http://localhost:3001/api/chat
```

For production (Cloudflare Pages), set this in your deployment settings.

### 2. Import in Your App

```jsx
// src/App.jsx
import ChatWidget from './components/ChatWidget';

function App() {
  return (
    <div className="app">
      {/* Your existing portfolio content */}
      
      {/* Chat widget - renders as floating button */}
      <ChatWidget />
    </div>
  );
}
```

That's it! The widget is self-contained with no props needed.

## How SSE Parsing Works

### Why fetch + ReadableStream instead of EventSource?

**EventSource limitations:**
- Only supports GET requests
- Can't send POST body (we need `{ query: "..." }`)
- Can't set custom headers easily

**Our approach:**
```javascript
// 1. Make POST request with fetch
const response = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: userInput })
});

// 2. Get ReadableStream from response body
const reader = response.body.getReader();

// 3. Read chunks and parse SSE format manually
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  // Decode bytes to text
  const text = decoder.decode(value);
  
  // Parse SSE format:
  // event: <type>\n
  // data: <json>\n\n
  parseSSELines(text);
}
```

### SSE Format from Backend

Your backend sends:

```
event: retrieval
data: {"chunksFound": 4, "sources": [...]}

event: token
data: {"text": "According to my"}

event: token
data: {"text": " portfolio, I use"}

event: done
data: {}
```

Our parser:
1. Buffers incoming chunks (may arrive mid-line)
2. Splits by `\n` to get complete lines
3. Pairs `event:` and `data:` lines
4. Calls handler with `{ type, data }` for each event

## Customization

### Change Colors

Edit `ChatWidget.css`:

```css
/* Green terminal theme (default) */
--terminal-bg: #000;
--terminal-fg: #0f0;
--terminal-accent: #0ff;

/* Amber terminal theme */
--terminal-bg: #000;
--terminal-fg: #fa0;
--terminal-accent: #fc0;
```

### Change Starter Questions

Edit `STARTER_QUESTIONS` array in `ChatWidget.jsx`:

```javascript
const STARTER_QUESTIONS = [
  "Your custom question 1",
  "Your custom question 2",
  // ...
];
```

### Change API Endpoint

Update `.env`:

```env
# Development
VITE_API_URL=http://localhost:3001/api/chat

# Production
VITE_API_URL=https://api.yourdomain.com/api/chat
```

## Error Handling

The widget handles common errors gracefully:

| Backend Error | User-Facing Message |
|--------------|---------------------|
| Quota exceeded | "I'm having trouble... try again in a moment" |
| API key invalid | "Configuration issue... contact site owner" |
| Network failure | "Failed to connect... check your connection" |
| Generic error | "Encountered an error... try asking again" |

## Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari 14.1+
- ✅ Mobile browsers

Requires:
- `fetch` API
- `ReadableStream` API
- ES2020+ (async/await, optional chaining)

## Performance Notes

- **Stream parsing**: Efficient, handles backpressure
- **Re-renders**: Only updates affected message during streaming
- **Memory**: Conversation history kept in memory (no persistence)
- **Cleanup**: Abort controller cancels request on unmount

## Accessibility

- ✅ Keyboard navigation (Tab, Enter)
- ✅ ARIA labels on buttons
- ✅ Focus visible indicators
- ✅ High contrast mode support
- ✅ Reduced motion support
- ✅ Screen reader friendly

## Deployment (Cloudflare Pages)

### Environment Variables

In Cloudflare Pages dashboard:

```
Production:
VITE_API_URL = https://api.yourdomain.com/api/chat

Preview:
VITE_API_URL = https://api-preview.yourdomain.com/api/chat
```

### CORS

Ensure your backend allows requests from your Cloudflare Pages domain:

```javascript
// api/chat.js
router.use(cors({
  origin: [
    'http://localhost:5173', // Vite dev
    'https://yoursite.pages.dev', // Cloudflare preview
    'https://yourdomain.com' // Production
  ]
}));
```

## Testing Locally

```bash
# 1. Start backend
cd api
node server.js
# Running on http://localhost:3001

# 2. Start frontend (new terminal)
npm run dev
# Running on http://localhost:5173

# 3. Open browser
# http://localhost:5173
# Click floating chat button
```

## Troubleshooting

### "Failed to connect" error

- Check backend is running: `curl http://localhost:3001/api/health`
- Check CORS headers in browser DevTools Network tab
- Verify `VITE_API_URL` in `.env`

### Stream never completes

- Check backend logs for errors
- Verify backend sends `event: done\ndata: {}\n\n`
- Check browser DevTools Console for parsing errors

### Styling doesn't match

- Clear browser cache (Ctrl+Shift+R)
- Check `ChatWidget.css` is imported in `ChatWidget.jsx`
- Verify no conflicting global CSS

## Interview Talking Points

**"Walk me through how you handle SSE streaming"**

"The browser's EventSource API only supports GET, but my chatbot needs POST with a request body. So I use fetch + ReadableStream for full control.

I manually parse the SSE format: each event has `event: <type>` and `data: <json>` lines separated by double newlines. My parser buffers incoming chunks, splits by newline, pairs event/data lines, and calls a handler for each complete event.

This gives me custom event types (retrieval, token, done, error) which I handle distinctly - retrieval stores sources for attribution, token appends to the streaming message, done marks completion, and error shows user-friendly fallback text."

**"How do you prevent race conditions with streaming state?"**

"I use functional setState with the message ID to find the exact message being updated. Each token appends to that specific message's content, avoiding conflicts. I also track streaming state to disable the send button and prevent concurrent requests."

**"What happens if the user closes the widget mid-stream?"**

"I store an AbortController ref. When the component unmounts or user sends a new message, I call abort() which cancels the fetch, closes the stream reader, and prevents memory leaks. The backend detects the disconnect via `res.on('close')` and stops generation."
