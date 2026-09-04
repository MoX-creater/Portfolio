import { useState, useRef, useEffect } from 'react';
import './ChatWidget.css';

/**
 * RAG Chatbot Widget Component
 * 
 * Terminal-style chat interface with SSE streaming via fetch+ReadableStream
 * 
 * Why fetch+ReadableStream instead of EventSource:
 * - EventSource only supports GET requests (can't send POST body)
 * - We need to send { query: "..." } in request body
 * - fetch gives us full control over request method and headers
 * - ReadableStream allows parsing custom SSE event types
 * 
 * SSE Format from backend:
 * event: <type>\n
 * data: <json>\n\n
 * 
 * We manually parse this format to extract event type and data
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/chat';

const STARTER_QUESTIONS = [
  "What's the Flash Sale Engine?",
  "What backend technologies do you use?",
  "What's your tech stack?",
  "Tell me about your projects"
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showCharCount, setShowCharCount] = useState(false);
  
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show character count when approaching limit
  useEffect(() => {
    setShowCharCount(input.length > 400);
  }, [input.length]);

  /**
   * Parses SSE stream from fetch response
   * 
   * SSE format:
   * event: <eventType>\n
   * data: <jsonData>\n\n
   * 
   * This parser:
   * 1. Reads the stream chunk by chunk
   * 2. Buffers incomplete lines
   * 3. Detects "event:" and "data:" lines
   * 4. Pairs them together
   * 5. Calls onEvent({ type, data }) for each complete event
   */
  async function parseSSEStream(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (split by \n)
        const lines = buffer.split('\n');
        
        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            // Start of new event
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            // Data for current event
            const dataStr = line.slice(5).trim();
            
            if (currentEvent && dataStr) {
              try {
                const data = JSON.parse(dataStr);
                onEvent({ type: currentEvent, data });
              } catch (e) {
                console.error('Failed to parse SSE data:', e, dataStr);
              }
              
              currentEvent = null; // Reset for next event
            }
          }
          // Empty line separates events, ignore
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function sendMessage(queryText) {
    const trimmed = queryText.trim();
    
    // Validation
    if (!trimmed) return;
    if (trimmed.length > 500) {
      alert('Message too long. Maximum 500 characters.');
      return;
    }
    if (isStreaming) return;

    // Add user message
    const userMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Create assistant message placeholder
    const assistantMessageId = Date.now();
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      sources: null,
      isStreaming: true,
      error: null
    };
    setMessages(prev => [...prev, assistantMessage]);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmed }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse SSE stream
      await parseSSEStream(response, ({ type, data }) => {
        setMessages(prev => {
          const updated = [...prev];
          const msgIndex = updated.findIndex(m => m.id === assistantMessageId);
          
          if (msgIndex === -1) return prev;

          const msg = { ...updated[msgIndex] };

          switch (type) {
            case 'retrieval':
              // Store sources for attribution
              msg.sources = data.sources || [];
              break;

            case 'token':
              // Append streaming text
              msg.content += data.text || '';
              break;

            case 'done':
              // Mark stream as complete
              msg.isStreaming = false;
              break;

            case 'error':
              // Handle error from backend
              msg.error = data.message || 'An error occurred';
              msg.isStreaming = false;
              
              // User-friendly error message
              if (data.details?.includes('quota') || data.details?.includes('overloaded')) {
                msg.content = "I'm having trouble generating a response right now. Please try again in a moment.";
              } else if (data.details?.includes('API key')) {
                msg.content = "There's a configuration issue on my end. Please contact the site owner.";
              } else {
                msg.content = "Sorry, I encountered an error. Please try asking again.";
              }
              break;

            default:
              console.warn('Unknown SSE event type:', type, data);
          }

          updated[msgIndex] = msg;
          return updated;
        });
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Chat error:', error);
        
        // Update message with error state
        setMessages(prev => {
          const updated = [...prev];
          const msgIndex = updated.findIndex(m => m.id === assistantMessageId);
          
          if (msgIndex !== -1) {
            updated[msgIndex] = {
              ...updated[msgIndex],
              content: "Failed to connect to the chatbot. Please check your connection and try again.",
              error: error.message,
              isStreaming: false
            };
          }
          
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleStarterClick(question) {
    setInput(question);
  }

  function handleKeyDown(e) {
    // Submit on Enter (but not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="chat-widget">
      {/* Floating toggle button */}
      {!isOpen && (
        <button
          className="chat-toggle"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
        >
          <span className="chat-toggle-text">$ chat</span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel">
          {/* Header */}
          <div className="chat-header">
            <span className="chat-title">$ mohit.chat</span>
            <button
              className="chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              [x]
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>&gt; Ask me about my projects, skills, or background</p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`chat-message chat-message--${msg.role}`}>
                <div className="chat-message-header">
                  {msg.role === 'user' ? '> you' : '> mohit'}
                </div>
                <div className="chat-message-content">
                  {msg.content || (msg.isStreaming && !msg.error && '▊')}
                  {msg.error && (
                    <div className="chat-message-error">
                      [error: {msg.error}]
                    </div>
                  )}
                </div>
                {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                  <div className="chat-message-sources">
                    Sources: {msg.sources.map(s => s.filename).join(', ')}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            {/* Starter questions (only show when no messages) */}
            {messages.length === 0 && (
              <div className="chat-starters">
                {STARTER_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    className="chat-starter"
                    onClick={() => handleStarterClick(q)}
                    disabled={isStreaming}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSubmit} className="chat-input-form">
              <div className="chat-input-wrapper">
                <input
                  type="text"
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? "Waiting..." : "Ask a question..."}
                  disabled={isStreaming}
                  maxLength={500}
                  autoComplete="off"
                />
                {showCharCount && (
                  <span className="chat-char-count">
                    {input.length}/500
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="chat-send"
                disabled={isStreaming || !input.trim()}
              >
                {isStreaming ? '[...]' : '[send]'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
