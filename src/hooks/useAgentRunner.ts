import { useState, useCallback, useRef } from 'react';
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
  _inMemoryChatHistoryRef?: unknown,
): UseAgentRunnerResult {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [workingState, setWorkingState] = useState<WorkingState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
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
        updateLastHistoryItem(item => ({
          events: item.events.map(e =>
            e.id === item.activeToolId
              ? { ...e, progressMessage: event.message }
              : e
          ),
        }));
        break;
        
      case 'tool_end':
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
        
      case 'done': {
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
  }, [updateLastHistoryItem]);
  
  // Run a query through the Mastra agent
  const runQuery = useCallback(async (query: string): Promise<RunQueryResult | undefined> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    let finalAnswer: string | undefined;
    
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
    runQuery,
    cancelExecution,
    setError,
  };
}
