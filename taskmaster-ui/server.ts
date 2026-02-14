import { watch } from "fs";
import { resolve, join, dirname } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 4200;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---------------------------------------------------------------------------
// Locate tasks.json — walk up from CWD (or --project) looking for
// .taskmaster/tasks/tasks.json
// ---------------------------------------------------------------------------

function findTasksJson(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = resolve("/");
  while (true) {
    const candidate = join(dir, ".taskmaster", "tasks", "tasks.json");
    if (Bun.file(candidate).size !== 0) {
      try {
        // Bun.file().size is lazy — actually stat the file
        const stat = Bun.file(candidate);
        // Access .size to trigger resolution; catch if missing
        if (stat.size >= 0) return candidate;
      } catch {
        /* not here */
      }
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return null;
}

function resolveProjectArg(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--project");
  if (idx !== -1 && args[idx + 1]) return resolve(args[idx + 1]);
  return process.cwd();
}

const startDir = resolveProjectArg();
const TASKS_PATH = findTasksJson(startDir);

if (!TASKS_PATH) {
  console.error(
    `❌  Could not find .taskmaster/tasks/tasks.json walking up from ${startDir}`
  );
  process.exit(1);
}

console.log(`📋  Tasks file: ${TASKS_PATH}`);

// ---------------------------------------------------------------------------
// Tasks data helpers
// ---------------------------------------------------------------------------

interface Subtask {
  id: number;
  title: string;
  description: string;
  status: string;
  dependencies?: string[];
  [key: string]: unknown;
}

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  dependencies: string[];
  subtasks: Subtask[];
  details: string;
  testStrategy: string;
  updatedAt: string;
  blocks?: string[];
  [key: string]: unknown;
}

interface TagData {
  tasks: Task[];
  metadata?: Record<string, unknown>;
}

type TasksFile = Record<string, TagData>;

async function readTasksFile(): Promise<TasksFile | null> {
  try {
    const file = Bun.file(TASKS_PATH!);
    return (await file.json()) as TasksFile;
  } catch {
    return null;
  }
}

function allTasks(data: TasksFile): { tag: string; task: Task }[] {
  return Object.entries(data).flatMap(([tag, { tasks }]) =>
    tasks.map((task) => ({ tag, task }))
  );
}

function computeStats(data: TasksFile) {
  const entries = allTasks(data);
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const { tag, task } of entries) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
    byTag[tag] = (byTag[tag] || 0) + 1;
  }

  return {
    total: entries.length,
    byStatus,
    byPriority,
    byTag,
    tags: Object.keys(data),
  };
}

// ---------------------------------------------------------------------------
// SSE — file watcher + connected clients
// ---------------------------------------------------------------------------

type SSEClient = { controller: ReadableStreamDefaultController<Uint8Array> };
const sseClients = new Set<SSEClient>();

function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const client of sseClients) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Debounce watcher — tasks.json can get multiple rapid writes
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(TASKS_PATH, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const data = await readTasksFile();
    if (data) {
      broadcastSSE("tasks", data);
      broadcastSSE("stats", computeStats(data));
    }
  }, 250);
});

// ---------------------------------------------------------------------------
// Static file serving helper
// ---------------------------------------------------------------------------

const INDEX_PATH = join(dirname(new URL(import.meta.url).pathname), "index.html");

// ---------------------------------------------------------------------------
// JSON / Error response helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function notFound(message = "Not found") {
  return json({ error: message }, 404);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET / — serve index.html ────────────────────────────────────────
    if (pathname === "/" || pathname === "/index.html") {
      const file = Bun.file(INDEX_PATH);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "text/html", ...CORS_HEADERS },
        });
      }
      return new Response("index.html not found", { status: 404 });
    }

    // ── GET /api/tasks ──────────────────────────────────────────────────
    if (pathname === "/api/tasks") {
      const data = await readTasksFile();
      if (!data) return json({ error: "Could not read tasks.json" }, 500);
      return json(data);
    }

    // ── GET /api/tasks/:id ──────────────────────────────────────────────
    const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (taskMatch) {
      const id = Number(taskMatch[1]);
      const data = await readTasksFile();
      if (!data) return json({ error: "Could not read tasks.json" }, 500);
      const found = allTasks(data).find((e) => e.task.id === id);
      if (!found) return notFound(`Task ${id} not found`);
      return json(found);
    }

    // ── GET /api/stats ──────────────────────────────────────────────────
    if (pathname === "/api/stats") {
      const data = await readTasksFile();
      if (!data) return json({ error: "Could not read tasks.json" }, 500);
      return json(computeStats(data));
    }

    // ── GET /events — SSE ───────────────────────────────────────────────
    if (pathname === "/events") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const client: SSEClient = { controller };
          sseClients.add(client);

          // Send initial snapshot
          readTasksFile().then((data) => {
            if (data) {
              const init = `event: init\ndata: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(new TextEncoder().encode(init));
            }
          });

          // Cleanup on abort
          req.signal.addEventListener("abort", () => {
            sseClients.delete(client);
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...CORS_HEADERS,
        },
      });
    }

    return notFound();
  },
});

console.log(`
🚀  Task Master UI server running
    URL:    http://localhost:${server.port}
    Tasks:  ${TASKS_PATH}
    SSE:    /events
    API:    /api/tasks  /api/tasks/:id  /api/stats
`);
