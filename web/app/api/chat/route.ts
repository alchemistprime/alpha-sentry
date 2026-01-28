import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from parent directory's .env
config({ path: resolve(process.cwd(), '../.env') });

// Dynamic imports to handle module resolution
async function getAgent() {
  const { Agent } = await import('../../../../src/agent/agent.js');
  return Agent;
}

async function getInMemoryChatHistory() {
  const { InMemoryChatHistory } = await import('../../../../src/utils/in-memory-chat-history.js');
  return InMemoryChatHistory;
}

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for complex queries

// Session storage - maps session ID to chat history instance
// In production, you'd want Redis or similar for persistence across server restarts
const sessions = new Map<string, InstanceType<Awaited<ReturnType<typeof getInMemoryChatHistory>>>>();

// Clean up old sessions after 1 hour of inactivity
const SESSION_TTL = 60 * 60 * 1000;
const sessionLastAccess = new Map<string, number>();

function cleanupOldSessions() {
  const now = Date.now();
  for (const [sessionId, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_TTL) {
      sessions.delete(sessionId);
      sessionLastAccess.delete(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldSessions, 10 * 60 * 1000);

export async function POST(req: Request) {
  const { messages, sessionId: clientSessionId } = await req.json();

  // Use client-provided session ID or generate new one
  const sessionId = clientSessionId || crypto.randomUUID();

  // Get the latest user message
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return new Response('No user message found', { status: 400 });
  }

  const query = lastMessage.content;

  // Get or create session history
  const InMemoryChatHistory = await getInMemoryChatHistory();
  let chatHistory = sessions.get(sessionId);

  if (!chatHistory) {
    chatHistory = new InMemoryChatHistory(process.env.DEXTER_MODEL || 'gpt-5.2');
    sessions.set(sessionId, chatHistory);
  }

  // Update last access time
  sessionLastAccess.set(sessionId, Date.now());

  // Save the user query to history
  chatHistory.saveUserQuery(query);

  // Create a ReadableStream for streaming the response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const Agent = await getAgent();
        const agent = Agent.create({
          model: process.env.DEXTER_MODEL || 'gpt-5.2',
          modelProvider: process.env.DEXTER_MODEL_PROVIDER || 'openai',
          maxIterations: 5, // Limit iterations for web UI responsiveness
        });

        // Helper to send a data event (for interim status)
        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Helper to send text chunk
        const sendText = (text: string) => {
          const escaped = text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n');
          controller.enqueue(encoder.encode(`0:"${escaped}"\n`));
        };

        // Send session ID back to client
        sendEvent({ type: 'session', sessionId });

        let finalAnswer = '';

        for await (const event of agent.run(query, chatHistory)) {
          switch (event.type) {
            case 'thinking':
              sendEvent({
                type: 'thinking',
                message: event.message,
              });
              break;

            case 'tool_start':
              sendEvent({
                type: 'tool_start',
                tool: event.tool,
                args: event.args,
              });
              break;

            case 'tool_end':
              sendEvent({
                type: 'tool_end',
                tool: event.tool,
                args: event.args,
                duration: event.duration,
              });
              break;

            case 'tool_error':
              sendEvent({
                type: 'tool_error',
                tool: event.tool,
                error: event.error,
              });
              break;

            case 'answer_start':
              sendEvent({ type: 'answer_start' });
              break;

            case 'done':
              finalAnswer = event.answer;
              // Stream the final answer word by word for natural feel
              const words = finalAnswer.split(/(\s+)/); // Split but keep whitespace
              for (const word of words) {
                if (word) {
                  sendText(word);
                  // Vary delay slightly for more natural feel
                  const delay = word.trim().length === 0 ? 5 : 15 + Math.random() * 20;
                  await new Promise((r) => setTimeout(r, delay));
                }
              }
              break;
          }
        }

        // Save the answer to history for future context
        if (finalAnswer && chatHistory) {
          await chatHistory.saveAnswer(finalAnswer);
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
