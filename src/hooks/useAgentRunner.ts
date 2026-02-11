import { useState, useCallback, useRef } from 'react';
import { randomUUID } from 'crypto';
import { bridgeEvents } from '../mastra/event-bridge.js';
import { appendAudit } from '../mastra/audit-log.js';
import { createAlphaSentryAgent } from '../mastra/agents/alpha-sentry.js';
import type { HistoryItem, WorkingState } from '../components/index.js';
import type { AgentConfig, AgentEvent, DoneEvent } from '../agent/index.js';

// ============================================================================
// Types
// ============================================================================

export interface RunQueryResult {
  answer: string;
}

export interface UseAgentRunnerResult {
  // State
  history: HistoryItem[];
  workingState: WorkingState;
  error: string | null;
  isProcessing: boolean;
  streamingAnswer: string;
  
  // Actions
  runQuery: (query: string) => Promise<RunQueryResult | undefined>;
  cancelExecution: () => void;
  setError: (error: string | null) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentRunner(
  agentConfig: AgentConfig,
): UseAgentRunnerResult {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [workingState, setWorkingState] = useState<WorkingState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState<string>('');
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(randomUUID());
  const textBufferRef = useRef<string>('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestProgressRef = useRef<string>('');
  
  // Helper to update the last (processing) history item
  const updateLastHistoryItem = useCallback((
    updater: (item: HistoryItem) => Partial<HistoryItem>
  ) => {
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.status !== 'processing') return prev;
      return [...prev.slice(0, -1), { ...last, ...updater(last) }];
    });
  }, []);
  
  const flushTextBuffer = useCallback(() => {
    if (textBufferRef.current) {
      const buffered = textBufferRef.current;
      textBufferRef.current = '';
      setStreamingAnswer(prev => prev + buffered);
    }
    flushTimerRef.current = null;
  }, []);

  const flushProgress = useCallback(() => {
    if (latestProgressRef.current) {
      const msg = latestProgressRef.current;
      latestProgressRef.current = '';
      updateLastHistoryItem(item => ({
        events: item.events.map(e =>
          e.id === item.activeToolId
            ? { ...e, progressMessage: msg }
            : e
        ),
      }));
    }
    progressTimerRef.current = null;
  }, [updateLastHistoryItem]);

  // Handle agent events
  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'thinking':
        setWorkingState({ status: 'thinking' });
        updateLastHistoryItem(item => ({
          events: [...item.events, {
            id: `thinking-${Date.now()}`,
            event,
            completed: true,
          }],
        }));
        break;
        
      case 'tool_start': {
        const toolId = `tool-${event.tool}-${Date.now()}`;
        setWorkingState({ status: 'tool', toolName: event.tool });
        updateLastHistoryItem(item => ({
          activeToolId: toolId,
          events: [...item.events, {
            id: toolId,
            event,
            completed: false,
          }],
        }));
        break;
      }

      case 'tool_progress':
        latestProgressRef.current = event.message;
        if (!progressTimerRef.current) {
          progressTimerRef.current = setTimeout(flushProgress, 200);
        }
        break;
        
      case 'tool_end':
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        latestProgressRef.current = '';
        setWorkingState({ status: 'thinking' });
        updateLastHistoryItem(item => ({
          activeToolId: undefined,
          events: item.events.map(e => 
            e.id === item.activeToolId
              ? { ...e, completed: true, endEvent: event }
              : e
          ),
        }));
        break;
        
      case 'tool_error':
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        latestProgressRef.current = '';
        setWorkingState({ status: 'thinking' });
        updateLastHistoryItem(item => ({
          activeToolId: undefined,
          events: item.events.map(e => 
            e.id === item.activeToolId
              ? { ...e, completed: true, endEvent: event }
              : e
          ),
        }));
        break;
        
      case 'answer_start':
        setWorkingState({ status: 'answering', startTime: Date.now() });
        break;

      case 'text_delta':
        textBufferRef.current += event.delta;
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(flushTextBuffer, 66);
        }
        break;
        
      case 'done': {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        textBufferRef.current = '';
        setStreamingAnswer('');
        const doneEvent = event as DoneEvent;
        updateLastHistoryItem(() => ({
          answer: doneEvent.answer,
          status: 'complete' as const,
          duration: doneEvent.totalTime,
          tokenUsage: doneEvent.tokenUsage,
          tokensPerSecond: doneEvent.tokensPerSecond,
        }));
        setWorkingState({ status: 'idle' });
        break;
      }
    }
  }, [updateLastHistoryItem, flushTextBuffer, flushProgress]);
  
  // Run a query through the Mastra agent
  const runQuery = useCallback(async (query: string): Promise<RunQueryResult | undefined> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    let finalAnswer: string | undefined;
    
    setStreamingAnswer('');
    setHistory(prev => [...prev, {
      id: Date.now().toString(),
      query,
      events: [],
      answer: '',
      status: 'processing',
      startTime: Date.now(),
    }]);
    
    setError(null);
    setWorkingState({ status: 'thinking' });
    
    try {
      const agent = createAlphaSentryAgent(agentConfig.modelProvider, agentConfig.model);
      const stream = await agent.stream(query, {
        maxSteps: 10,
        memory: {
          thread: `cli-${sessionIdRef.current}`,
          resource: 'cli-user',
        },
      });
      
      for await (const event of bridgeEvents(stream as any, { onAudit: appendAudit })) {
        if (abortController.signal.aborted) break;
        if (event.type === 'done') {
          finalAnswer = (event as DoneEvent).answer;
        }
        handleEvent(event);
      }
      
      if (finalAnswer) {
        return { answer: finalAnswer };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setHistory(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.status !== 'processing') return prev;
          return [...prev.slice(0, -1), { ...last, status: 'interrupted' }];
        });
        setWorkingState({ status: 'idle' });
        return undefined;
      }
      
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setHistory(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.status !== 'processing') return prev;
        return [...prev.slice(0, -1), { ...last, status: 'error' }];
      });
      setWorkingState({ status: 'idle' });
      return undefined;
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleEvent, agentConfig.model, agentConfig.modelProvider]);
  
  // Cancel the current execution
  const cancelExecution = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    textBufferRef.current = '';
    setStreamingAnswer('');
    
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    latestProgressRef.current = '';
    
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.status !== 'processing') return prev;
      return [...prev.slice(0, -1), { ...last, status: 'interrupted' }];
    });
    setWorkingState({ status: 'idle' });
  }, []);
  
  const isProcessing = history.length > 0 && history[history.length - 1].status === 'processing';
  
  return {
    history,
    workingState,
    error,
    isProcessing,
    streamingAnswer,
    runQuery,
    cancelExecution,
    setError,
  };
}
