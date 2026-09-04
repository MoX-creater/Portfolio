/**
 * ChatWidget - Terminal-style RAG chatbot for portfolio site
 * 
 * Features:
 * - Floating button + expandable panel
 * - SSE streaming responses with typing effect
 * - Conversation history (in-memory)
 * - Source attribution from backend
 * - Error handling
 * - Starter question chips
 * - Terminal aesthetic (monospace, minimal, no emojis)
 * 
 * Technical notes:
 * - Uses fetch+ReadableStream for SSE (not EventSource, which doesn't support POST)
 * - Manual SSE parsing (~20 lines, gives us POST body support)
 * - Tokens appended as they stream (real-time typing effect)
 */

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    filename: string;
    heading: string;
    similarity: number;
  }>;
  error?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = API_BASE_URL.replace(/\/$/, '').endsWith('/api/chat')
  ? API_BASE_URL.replace(/\/$/, '')
  : `${API_BASE_URL.replace(/\/$/, '')}/api/chat`;
const MAX_QUERY_LENGTH = 500;
const CHAR_WARNING_THRESHOLD = 450; // Show counter at 90%

const STARTER_QUESTIONS = [
  "What's the Flash Sale Engine?",
  "What's your tech stack?",
  "Tell me about your backend experience",
  "What projects have you built?",
];

// ============================================================================
// Main Component
// ============================================================================

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false); // Before first token arrives
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);
  
  // ============================================================================
  // SSE Stream Handling
  // ============================================================================
  
  async function sendMessage(query: string) {
    if (!query.trim() || isStreaming) return;
    
    const trimmedQuery = query.trim();
    
    // Add user message
    const userMessage: Message = { role: 'user', content: trimmedQuery };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setIsTyping(true);
    
    // Create assistant message placeholder
    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMessage]);
    
    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmedQuery }),
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        let friendly =
          response.status === 429
            ? "You've hit the demo rate limit, try again later"
            : 'Having trouble generating a response right now, try again in a moment';
        try {
          const data = await response.json();
          if (typeof data?.error === 'string' && data.error.trim()) {
            friendly = data.error;
          }
        } catch {
          // Non-JSON error body; keep the status-based fallback.
        }
        const err = new Error(friendly);
        err.userFacing = true;
        throw err;
      }
      
      if (!response.body) {
        throw new Error('No response body');
      }
      
      // Parse SSE stream manually
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = '';
      let eventType: string | null = null;
      let sources: Message['sources'] = undefined;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Split into lines (SSE format)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (eventType) {
                case 'retrieval':
                  // Store sources for attribution
                  sources = data.sources;
                  setIsTyping(false); // First event received
                  break;
                  
                case 'token':
                  // Append token to last message
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === 'assistant') {
                      lastMsg.content += data.text;
                      if (sources && !lastMsg.sources) {
                        lastMsg.sources = sources;
                      }
                    }
                    return updated;
                  });
                  setIsTyping(false);
                  break;
                  
                case 'done':
                  // Stream complete
                  break;
                  
                case 'error':
                  // Backend error
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === 'assistant') {
                      lastMsg.content = `Error: ${data.message}`;
                      lastMsg.error = true;
                    }
                    return updated;
                  });
                  setIsTyping(false);
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User cancelled - don't show error
        return;
      }
      
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = error.userFacing
            ? error.message
            : `Network error: ${error.message}. Check that the API server is running.`;
          lastMsg.error = true;
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  }
  
  // ============================================================================
  // Event Handlers
  // ============================================================================
  
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }
  
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }
  
  function handleStarterClick(question: string) {
    setInput(question);
    inputRef.current?.focus();
  }
  
  function handleToggle() {
    setIsOpen(!isOpen);
  }
  
  // ============================================================================
  // Character Counter
  // ============================================================================
  
  const charCount = input.length;
  const showCounter = charCount >= CHAR_WARNING_THRESHOLD;
  const isOverLimit = charCount > MAX_QUERY_LENGTH;
  
  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={handleToggle}
          className="fixed bottom-6 right-6 z-[100]
                     bg-neutral-900 border border-neutral-700 
                     text-green-400 
                     p-4 rounded-lg 
                     shadow-lg hover:shadow-green-400/20
                     transition-all duration-200
                     hover:border-green-400/50
                     group"
          aria-label="Open chat"
        >
          <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}
      
      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[100]
                        w-[420px] h-[600px] 
                        bg-neutral-950 border-2 border-green-400/30
                        rounded-lg shadow-2xl shadow-green-400/10
                        flex flex-col
                        font-mono text-sm">
          
          {/* Header */}
          <div className="flex items-center justify-between 
                          px-4 py-3 
                          border-b border-green-400/30
                          bg-neutral-900/50">
            <div className="flex items-center gap-2">
              <span className="text-green-400">$</span>
              <span className="text-neutral-300">portfolio-chat</span>
            </div>
            <button
              onClick={handleToggle}
              className="text-neutral-400 hover:text-green-400 
                         transition-colors p-1"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-neutral-500 text-xs space-y-3">
                <p className="text-green-400/80">// Welcome to the portfolio chatbot</p>
                <p>Ask me about my projects, technical skills, or background.</p>
                <p className="text-neutral-600">
                  Type your question below or click a starter question:
                </p>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                {/* Message Label */}
                <div className={`text-xs mb-1 ${
                  msg.role === 'user' 
                    ? 'text-cyan-400' 
                    : msg.error 
                      ? 'text-red-400' 
                      : 'text-green-400'
                }`}>
                  {msg.role === 'user' ? '> user' : '< assistant'}
                </div>
                
                {/* Message Content */}
                <div className={`inline-block max-w-[85%] p-3 rounded ${
                  msg.role === 'user'
                    ? 'bg-cyan-950/50 border border-cyan-400/30 text-cyan-100'
                    : msg.error
                      ? 'bg-red-950/50 border border-red-400/30 text-red-200'
                      : 'bg-neutral-900/50 border border-green-400/20 text-neutral-200'
                }`}>
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content || (isTyping && idx === messages.length - 1 && (
                      <span className="text-neutral-500">...</span>
                    ))}
                  </div>
                  
                  {/* Source Attribution */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-green-400/20 text-xs text-neutral-500">
                      <div className="text-green-400/60 mb-1">Sources:</div>
                      {msg.sources.slice(0, 3).map((source, i) => (
                        <div key={i} className="truncate">
                          • {source.filename} - {source.heading}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Typing Indicator (before first token) */}
            {isTyping && (
              <div className="text-left">
                <div className="text-xs mb-1 text-green-400">
                  &lt; assistant
                </div>
                <div className="inline-flex items-center gap-2 
                                bg-neutral-900/50 border border-green-400/20 
                                px-3 py-2 rounded">
                  <Loader2 className="w-3 h-3 text-green-400 animate-spin" />
                  <span className="text-neutral-500 text-xs">thinking...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Starter Questions (show if no messages) */}
          {messages.length === 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {STARTER_QUESTIONS.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => handleStarterClick(question)}
                  className="text-xs px-3 py-1.5 
                             bg-neutral-900 border border-green-400/30 
                             text-green-400 rounded
                             hover:bg-green-400/10 hover:border-green-400/50
                             transition-all duration-200"
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          
          {/* Input Area */}
          <div className="border-t border-green-400/30 p-4 bg-neutral-900/50">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about my projects..."
                  className="w-full px-3 py-2 
                             bg-neutral-950 border border-green-400/30 
                             text-neutral-200 placeholder-neutral-600
                             rounded resize-none
                             focus:outline-none focus:border-green-400/60
                             disabled:opacity-50 disabled:cursor-not-allowed
                             font-mono text-sm"
                  rows={2}
                  disabled={isStreaming}
                  maxLength={MAX_QUERY_LENGTH + 50} // Soft limit (visual only)
                />
                
                {/* Character Counter */}
                {showCounter && (
                  <div className={`absolute bottom-1 right-1 text-xs ${
                    isOverLimit ? 'text-red-400' : 'text-neutral-500'
                  }`}>
                    {charCount}/{MAX_QUERY_LENGTH}
                  </div>
                )}
              </div>
              
              <button
                type="submit"
                disabled={isStreaming || !input.trim() || isOverLimit}
                className="px-4 py-2 
                           bg-green-400/10 border border-green-400/30 
                           text-green-400 rounded
                           hover:bg-green-400/20 hover:border-green-400/50
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200
                           flex items-center justify-center
                           min-w-[50px]"
                aria-label="Send message"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
            
            {/* Warning for over-limit */}
            {isOverLimit && (
              <div className="mt-2 text-xs text-red-400">
                Query exceeds {MAX_QUERY_LENGTH} character limit
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
