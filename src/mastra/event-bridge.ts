import type { AgentEvent } from '../agent/types.js';
import type { AuditEntry } from './audit-log.js';

interface StreamChunk {
  type: string;
  payload: {
    toolCallId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    result?: unknown;
    [key: string]: unknown;
  };
}

export interface BridgeOptions {
  onAudit?: (entry: AuditEntry) => Promise<void>;
}

export async function* bridgeEvents(
  stream: {
    fullStream: AsyncIterable<StreamChunk>;
    text: Promise<string>;
    usage: Promise<{ inputTokens?: number; outputTokens?: number } | undefined>;
    steps: Promise<unknown[]>;
  },
  options?: BridgeOptions,
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now();
  const toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }> = [];
  const toolStartTimes = new Map<string, number>();
  let answerStartEmitted = false;

  for await (const chunk of stream.fullStream as AsyncIterable<StreamChunk>) {
    switch (chunk.type) {
      case 'step-start': {
        yield { type: 'thinking', message: 'Processing...' };
        break;
      }

      case 'tool-call': {
        const toolCallId = chunk.payload.toolCallId ?? '';
        const toolName = chunk.payload.toolName ?? '';
        const args = (chunk.payload.args ?? {}) as Record<string, unknown>;
        toolStartTimes.set(toolCallId, Date.now());
        yield { type: 'tool_start', tool: toolName, args };
        break;
      }

      case 'tool-result': {
        const toolCallId = chunk.payload.toolCallId ?? '';
        const toolName = chunk.payload.toolName ?? '';
        const args = (chunk.payload.args ?? {}) as Record<string, unknown>;
        const result = chunk.payload.result;
        const toolStart = toolStartTimes.get(toolCallId) ?? Date.now();
        const duration = Date.now() - toolStart;
        toolStartTimes.delete(toolCallId);

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        toolCalls.push({ tool: toolName, args, result: resultStr });
        yield { type: 'tool_end', tool: toolName, args, result: resultStr, duration };

        if (options?.onAudit) {
          const sourceUrls: string[] = [];
          if (typeof result === 'object' && result !== null) {
            const r = result as Record<string, unknown>;
            if (Array.isArray(r.urls)) sourceUrls.push(...(r.urls as string[]));
            else if (typeof r.url === 'string') sourceUrls.push(r.url);
          }
          const summary = resultStr.length > 200 ? resultStr.slice(0, 200) + '...' : resultStr;
          options.onAudit({
            ts: new Date().toISOString(),
            tool: toolName,
            args,
            resultSummary: summary,
            sourceUrls,
            toolCallId,
            duration,
          });
        }
        break;
      }

      case 'text-start':
      case 'text-delta': {
        if (!answerStartEmitted) {
          answerStartEmitted = true;
          yield { type: 'answer_start' };
        }
        break;
      }

      default:
        break;
    }
  }

  const text = await stream.text;
  const usage = await stream.usage;
  const totalTime = Date.now() - startTime;
  const steps = await stream.steps;

  yield {
    type: 'done',
    answer: text,
    toolCalls,
    iterations: steps.length,
    totalTime,
    tokenUsage: usage
      ? {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        }
      : undefined,
  };
}
