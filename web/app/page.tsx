'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ToolStatus {
  id: string;
  tool: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  duration?: number;
  error?: string;
}

interface ThinkingStatus {
  message: string;
}

// Format tool name from snake_case to Title Case
function formatToolName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Format tool arguments for display
function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return '';

  if (Object.keys(args).length === 1 && 'query' in args) {
    const query = String(args.query);
    return query.length > 60 ? `"${query.slice(0, 60)}..."` : `"${query}"`;
  }

  return Object.entries(args)
    .map(([key, value]) => {
      const strValue = String(value);
      return `${key}=${strValue.length > 40 ? strValue.slice(0, 40) + '...' : strValue}`;
    })
    .join(', ');
}

// Format duration
function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [thinkingStatus, setThinkingStatus] = useState<ThinkingStatus | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Start a new chat session
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setToolStatuses([]);
    setThinkingStatus(null);
    setStreamingContent('');
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolStatuses, thinkingStatus, streamingContent]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setToolStatuses([]);
    setThinkingStatus(null);
    setStreamingContent('');

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          sessionId, // Include session ID for conversation continuity
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // Handle SSE data events (interim status)
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'session':
                  // Store session ID for conversation continuity
                  setSessionId(data.sessionId);
                  break;

                case 'thinking':
                  setThinkingStatus({ message: data.message });
                  break;

                case 'tool_start':
                  setThinkingStatus(null);
                  setToolStatuses(prev => [
                    ...prev,
                    {
                      id: `${data.tool}-${Date.now()}`,
                      tool: data.tool,
                      status: 'running',
                      args: data.args,
                    },
                  ]);
                  break;

                case 'tool_end':
                  setToolStatuses(prev =>
                    prev.map(t =>
                      t.tool === data.tool && t.status === 'running'
                        ? { ...t, status: 'completed', duration: data.duration }
                        : t
                    )
                  );
                  break;

                case 'tool_error':
                  setToolStatuses(prev =>
                    prev.map(t =>
                      t.tool === data.tool && t.status === 'running'
                        ? { ...t, status: 'error', error: data.error }
                        : t
                    )
                  );
                  break;

                case 'answer_start':
                  setThinkingStatus(null);
                  break;

                case 'error':
                  setError(data.message);
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
            continue;
          }

          // Handle Vercel AI SDK text format: 0:"text"
          if (line.startsWith('0:"')) {
            try {
              // Extract the text between 0:" and the trailing "
              const match = line.match(/^0:"(.*)"/);
              if (match) {
                const text = match[1]
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
                finalContent += text;
                setStreamingContent(finalContent);
              }
            } catch (e) {
              console.error('Failed to parse text chunk:', e);
            }
          }
        }
      }

      // Add the final assistant message
      if (finalContent) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: finalContent,
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setToolStatuses([]);
      setThinkingStatus(null);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, messages, sessionId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b border-neutral-800">
        <Image
          src="/logo.png"
          alt="Bindle"
          width={40}
          height={40}
          className="w-10 h-10"
        />
        <div className="flex-1">
          <h1 className="font-semibold text-3xl">Alpha Sentry</h1>
          <p className="text-[10px] text-gray-500">Financial Research Agent</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            className="px-3 py-1.5 text-sm border border-neutral-700 hover:border-neutral-500 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            New Chat
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Image
              src="/logo.png"
              alt="Bindle"
              width={64}
              height={64}
              className="w-16 h-16 mb-4 opacity-80"
            />
            <h2 className="text-2xl font-semibold text-white mb-4">Alpha Sentry</h2>
            <p className="max-w-md mb-8 text-gray-400">
              Ask me anything about financial markets, company fundamentals,
              stock analysis, or economic trends.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm max-w-2xl">
              <SuggestionButton
                text="What's Apple's revenue growth over the past 3 years?"
                onClick={setInput}
              />
              <SuggestionButton
                text="Compare Tesla and Ford's profit margins"
                onClick={setInput}
              />
              <SuggestionButton
                text="Analyze NVIDIA's latest earnings report"
                onClick={setInput}
              />
              <SuggestionButton
                text="What are the key metrics for evaluating banks?"
                onClick={setInput}
              />
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-red-600 text-white rounded-2xl px-4 py-3 max-w-[80%]">
                  <p>{message.content}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Image
                    src="/logo.png"
                    alt="Bindle"
                    width={32}
                    height={32}
                    className="w-8 h-8 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="prose prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Thinking status */}
        {thinkingStatus && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Bindle"
                width={32}
                height={32}
                className="w-8 h-8 thinking-pulse"
              />
            </div>
            <div className="bg-neutral-900 rounded-lg px-4 py-3 text-gray-300 max-w-[80%] border border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-red-500">●</span>
                <span>{thinkingStatus.message.length > 150
                  ? thinkingStatus.message.slice(0, 150) + '...'
                  : thinkingStatus.message}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tool statuses - shown during processing */}
        {toolStatuses.length > 0 && (
          <div className="flex items-start gap-3">
            <Image
              src="/logo.png"
              alt="Bindle"
              width={32}
              height={32}
              className="w-8 h-8 flex-shrink-0"
            />
            <div className="flex-1 bg-neutral-900 rounded-lg p-4 tool-status border border-neutral-800">
              <div className="space-y-3">
                {toolStatuses.map((status) => (
                  <ToolStatusItem key={status.id} status={status} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex items-start gap-3">
            <Image
              src="/logo.png"
              alt="Bindle"
              width={32}
              height={32}
              className="w-8 h-8 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
                <span className="inline-block w-2 h-5 bg-red-500 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (only when no other status is shown) */}
        {isLoading && !thinkingStatus && toolStatuses.length === 0 && !streamingContent && (
          <div className="flex items-start gap-3">
            <Image
              src="/logo.png"
              alt="Bindle"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <div className="flex items-center gap-3 text-gray-500">
              <LoadingDots />
              <span>Starting analysis...</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-800">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about stocks, earnings, financial metrics..."
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function SuggestionButton({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      className="text-left bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg px-4 py-3 text-gray-400 hover:text-white transition-all"
    >
      {text}
    </button>
  );
}

function ToolStatusItem({ status }: { status: ToolStatus }) {
  return (
    <div className="tool-status-item">
      <span className="tool-status-icon">
        {status.status === 'running' ? (
          <span className="tool-spinner" />
        ) : status.status === 'completed' ? (
          <span className="text-green-500">✓</span>
        ) : (
          <span className="text-red-500">✗</span>
        )}
      </span>
      <div className="flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="tool-status-name">{formatToolName(status.tool)}</span>
          {status.args && (
            <span className="tool-status-args">({formatArgs(status.args)})</span>
          )}
        </div>
        {status.status === 'running' && (
          <div className="tool-status-result">
            Searching...
          </div>
        )}
        {status.status === 'completed' && status.duration && (
          <div className="tool-status-result">
            Completed in {formatDuration(status.duration)}
          </div>
        )}
        {status.status === 'error' && status.error && (
          <div className="text-red-500 text-sm mt-0.5">
            Error: {status.error}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="flex gap-1">
      <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}
