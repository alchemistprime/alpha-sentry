import { describe, it, expect } from 'bun:test';
import { bridgeEvents } from './event-bridge.js';

function createMockStream(chunks: Array<{ type: string; [key: string]: unknown }>) {
  return {
    fullStream: (async function* () {
      for (const c of chunks) {
        yield { type: c.type, payload: c };
      }
    })(),
    text: Promise.resolve('test answer'),
    usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
    steps: Promise.resolve([{}, {}]),
  };
}

async function collectEvents(stream: AsyncGenerator<unknown>) {
  const events: unknown[] = [];
  for await (const e of stream) {
    events.push(e);
  }
  return events;
}

describe('bridgeEvents', () => {
  it('emits tool_start then tool_end for tool call + result', async () => {
    const stream = createMockStream([
      { type: 'tool-call', toolCallId: 'tc1', toolName: 'web_search', args: { q: 'test' } },
      { type: 'tool-result', toolCallId: 'tc1', toolName: 'web_search', args: { q: 'test' }, result: 'found it' },
    ]);

    const events = await collectEvents(bridgeEvents(stream));

    expect(events[0]).toMatchObject({ type: 'tool_start', tool: 'web_search', args: { q: 'test' } });
    expect(events[1]).toMatchObject({ type: 'tool_end', tool: 'web_search', result: 'found it' });
    expect((events[1] as any).duration).toBeGreaterThanOrEqual(0);
  });

  it('emits answer_start on first text-delta and only once', async () => {
    const stream = createMockStream([
      { type: 'text-delta' },
      { type: 'text-delta' },
      { type: 'text-start' },
    ]);

    const events = await collectEvents(bridgeEvents(stream));
    const answerStarts = events.filter((e: any) => e.type === 'answer_start');

    expect(answerStarts).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'answer_start' });
  });

  it('emits answer_start on text-start chunk', async () => {
    const stream = createMockStream([
      { type: 'text-start' },
    ]);

    const events = await collectEvents(bridgeEvents(stream));
    expect(events[0]).toEqual({ type: 'answer_start' });
  });

  it('done event includes correct answer, toolCalls, and token usage', async () => {
    const stream = createMockStream([
      { type: 'tool-call', toolCallId: 'tc1', toolName: 'browser', args: { url: 'https://example.com' } },
      { type: 'tool-result', toolCallId: 'tc1', toolName: 'browser', args: { url: 'https://example.com' }, result: 'page content' },
    ]);

    const events = await collectEvents(bridgeEvents(stream));
    const done = events.find((e: any) => e.type === 'done') as any;

    expect(done).toBeDefined();
    expect(done.answer).toBe('test answer');
    expect(done.toolCalls).toHaveLength(1);
    expect(done.toolCalls[0].tool).toBe('browser');
    expect(done.toolCalls[0].result).toBe('page content');
    expect(done.iterations).toBe(2);
    expect(done.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('emits thinking event on step-start', async () => {
    const stream = createMockStream([
      { type: 'step-start' },
    ]);

    const events = await collectEvents(bridgeEvents(stream));
    expect(events[0]).toEqual({ type: 'thinking', message: 'Processing...' });
  });

  it('calls onAudit callback on tool-result', async () => {
    const auditEntries: unknown[] = [];
    const stream = createMockStream([
      { type: 'tool-call', toolCallId: 'tc1', toolName: 'web_search', args: { q: 'test' } },
      { type: 'tool-result', toolCallId: 'tc1', toolName: 'web_search', args: { q: 'test' }, result: 'data' },
    ]);

    await collectEvents(bridgeEvents(stream, {
      onAudit: async (entry) => { auditEntries.push(entry); },
    }));

    expect(auditEntries).toHaveLength(1);
    const entry = auditEntries[0] as any;
    expect(entry.tool).toBe('web_search');
    expect(entry.toolCallId).toBe('tc1');
    expect(entry.resultSummary).toBe('data');
    expect(entry.ts).toBeDefined();
  });
});
