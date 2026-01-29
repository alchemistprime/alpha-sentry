import { config } from 'dotenv';
import { resolve } from 'path';
import { Redis } from '@upstash/redis';
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';

// Load environment variables from parent directory's .env (local dev only)
config({ path: resolve(process.cwd(), '../.env') });

// Support both LANGCHAIN_API_KEY and LANGSMITH_API_KEY (common Vercel naming)
const langsmithApiKey = process.env.LANGCHAIN_API_KEY || process.env.LANGSMITH_API_KEY;
const langsmithProject = process.env.LANGCHAIN_PROJECT || process.env.LANGSMITH_PROJECT || 'alpha-sentry';

// Debug: Log what env vars are available (redact the actual key)
console.log('[LangSmith] Config:', {
  hasLangchainKey: !!process.env.LANGCHAIN_API_KEY,
  hasLangsmithKey: !!process.env.LANGSMITH_API_KEY,
  resolvedKey: langsmithApiKey ? `${langsmithApiKey.slice(0, 8)}...` : 'NONE',
  project: langsmithProject,
  tracingV2: process.env.LANGCHAIN_TRACING_V2,
});

// Ensure LangChain tracing is enabled (Vercel injects env vars, but we need to verify they're set)
// This enables automatic tracing for all LangChain operations
if (langsmithApiKey) {
  process.env.LANGCHAIN_API_KEY = langsmithApiKey;
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGCHAIN_PROJECT = langsmithProject;
  console.log('[LangSmith] Tracing ENABLED for project:', langsmithProject);
} else {
  console.warn('[LangSmith] No API key found (LANGCHAIN_API_KEY or LANGSMITH_API_KEY). Tracing disabled.');
}

// LangSmith client for flushing traces in serverless environment
// Explicitly pass config to ensure it picks up Vercel env vars
const langsmithClient = langsmithApiKey
  ? new Client({
      apiKey: langsmithApiKey,
      apiUrl: process.env.LANGCHAIN_ENDPOINT || process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com',
    })
  : null;

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

// Redis client for session persistence (Vercel KV / Upstash)
// Falls back to in-memory storage if Redis is not configured
const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

// Session TTL: 1 hour in seconds
const SESSION_TTL_SECONDS = 60 * 60;

// Fallback in-memory storage for local development without Redis
const localSessions = new Map<string, { messages: unknown[]; model: string }>();

interface StoredSession {
  messages: unknown[];
  model: string;
}

async function getSession(sessionId: string): Promise<StoredSession | null> {
  if (redis) {
    return await redis.get<StoredSession>(`session:${sessionId}`);
  }
  return localSessions.get(sessionId) || null;
}

async function saveSession(sessionId: string, data: StoredSession): Promise<void> {
  if (redis) {
    await redis.set(`session:${sessionId}`, data, { ex: SESSION_TTL_SECONDS });
  } else {
    localSessions.set(sessionId, data);
  }
}

// Wrap agent execution with LangSmith tracing (if configured)
const runAgentTraced = langsmithApiKey
  ? traceable(
      async function* runAgent(
        agent: { run: (query: string, history: unknown) => AsyncGenerator<unknown> },
        query: string,
        chatHistory: unknown
      ) {
        for await (const event of agent.run(query, chatHistory)) {
          yield event;
        }
      },
      {
        name: 'AlphaSentry Agent',
        run_type: 'chain',
        project_name: langsmithProject,
        client: langsmithClient!,
      }
    )
  : null;

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

  // Get or create session history from Redis
  const InMemoryChatHistory = await getInMemoryChatHistory();
  const model = process.env.DEXTER_MODEL || 'gpt-5.2';

  // Restore session from Redis if it exists
  const storedSession = await getSession(sessionId);
  const chatHistory = storedSession
    ? InMemoryChatHistory.fromMessages(storedSession.messages, storedSession.model)
    : new InMemoryChatHistory(model);

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

        // Use traced wrapper for LangSmith observability (falls back to untraced if not configured)
        const agentRunner = runAgentTraced
          ? runAgentTraced(agent, query, chatHistory)
          : agent.run(query, chatHistory);

        for await (const event of agentRunner) {
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
          // Persist updated session to Redis
          await saveSession(sessionId, chatHistory.toJSON());
        }
      } catch (error) {
        console.error('Agent error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`)
        );
      } finally {
        // Flush LangSmith traces before serverless function terminates
        // This ensures all trace data (including prompts) is sent
        if (langsmithClient) {
          console.log('[LangSmith] Flushing pending trace batches...');
          await langsmithClient.awaitPendingTraceBatches();
          console.log('[LangSmith] Flush complete.');
        } else {
          console.log('[LangSmith] No client configured, skipping flush.');
        }
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
