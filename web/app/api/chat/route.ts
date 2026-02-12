export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { config } = await import('dotenv');
  const { resolve } = await import('path');
  const { createAlphaSentryAgent } = await import('../../../../src/mastra/agents/alpha-sentry.js');
  const { bridgeEvents } = await import('../../../../src/mastra/event-bridge.js');
  const { appendAudit } = await import('../../../../src/mastra/audit-log.js');

  config({ path: resolve(process.cwd(), '../.env') });

  const { messages, sessionId: clientSessionId } = await req.json();

  const sessionId = clientSessionId || crypto.randomUUID();

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return new Response('No user message found', { status: 400 });
  }

  const query = lastMessage.content;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agent = createAlphaSentryAgent(
          process.env.DEXTER_MODEL_PROVIDER || 'openai',
          process.env.DEXTER_MODEL || 'gpt-5.2',
        );

        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        const sendText = (text: string) => {
          const escaped = text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n');
          controller.enqueue(encoder.encode(`0:"${escaped}"\n`));
        };

        sendEvent({ type: 'session', sessionId });

        const agentStream = await agent.stream(query, {
          maxSteps: 5,
          memory: {
            thread: `web-${sessionId}`,
            resource: `user-${sessionId}`,
          },
        });

        for await (const event of bridgeEvents(agentStream as any, { onAudit: appendAudit })) {
          switch (event.type) {
            case 'thinking':
              sendEvent({ type: 'thinking', message: event.message });
              break;

            case 'tool_start':
              sendEvent({ type: 'tool_start', tool: event.tool, args: event.args });
              break;

            case 'tool_end':
              sendEvent({ type: 'tool_end', tool: event.tool, args: event.args, duration: event.duration });
              break;

            case 'answer_start':
              sendEvent({ type: 'answer_start' });
              break;

            case 'done':
              if (event.answer) {
                sendText(event.answer);
              }
              break;
          }
        }
      } catch (error) {
        console.error('Agent error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
