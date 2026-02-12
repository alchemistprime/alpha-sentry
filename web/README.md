# AlphaSentry Web

Web interface for AlphaSentry, the AI-powered financial research assistant. Built with Next.js 15, Tailwind CSS, and backed by the Mastra agent framework.

Currently lives as a subdirectory of the main Dexter repo. Designed for eventual extraction into a standalone application.

## Architecture

```
web/
├── app/
│   ├── api/chat/route.ts    # SSE streaming endpoint — bridges Mastra agent to the frontend
│   ├── components/          # Reusable UI components (empty, page.tsx has everything inline for now)
│   ├── globals.css          # Tailwind + Bindle brand theme (dark mode, red accent, financial table styling)
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Main chat UI — messages, tool status, thinking indicators, markdown rendering
├── public/
│   └── logo.png             # AlphaSentry logo
├── next.config.ts           # Webpack aliases to resolve parent src/ imports
├── tailwind.config.ts       # Bindle brand colors (red, black, grays)
├── package.json
└── tsconfig.json
```

### How It Connects to the Agent

The web app imports the AlphaSentry agent directly from the parent `src/mastra/` directory. The Next.js webpack config in `next.config.ts` sets up path aliases (`@dexter` → `../src`, `@` → `../src`) and extension resolution so Bun-style `.js` imports resolve to `.ts` files.

Key wiring:

- **`next.config.ts`** — `transpilePackages: ['../src']`, `serverExternalPackages` for Mastra/LibSQL, webpack alias config
- **`app/api/chat/route.ts`** — dynamic imports from `../../../../src/mastra/` to avoid build-time validation

When extracted to standalone, these imports would be replaced with a published package or direct API calls.

## API

### `POST /api/chat`

Streaming endpoint that runs the AlphaSentry agent and returns results via Server-Sent Events.

**Request body:**

```json
{
  "messages": [
    { "role": "user", "content": "What is AAPL's P/E ratio?" }
  ],
  "sessionId": "optional-session-id"
}
```

**Response:** Mixed SSE + Vercel AI SDK text stream.

| Format | Event | Description |
|--------|-------|-------------|
| `data: {...}` | `session` | `{ type: "session", sessionId }` — returned on every request |
| `data: {...}` | `thinking` | `{ type: "thinking", message }` — agent is reasoning |
| `data: {...}` | `tool_start` | `{ type: "tool_start", tool, args }` — tool invocation begins |
| `data: {...}` | `tool_end` | `{ type: "tool_end", tool, args, duration }` — tool completed |
| `data: {...}` | `answer_start` | `{ type: "answer_start" }` — text generation begins |
| `data: {...}` | `error` | `{ type: "error", message }` — something went wrong |
| `0:"text"` | text chunk | Vercel AI SDK format — the actual answer content |

**Session continuity:** Pass back the `sessionId` from the `session` event on subsequent requests. The agent uses Mastra Memory with thread ID `web-{sessionId}` and resource ID `user-{sessionId}` to maintain conversation context.

**Config:** The route reads `DEXTER_MODEL_PROVIDER` and `DEXTER_MODEL` from env vars (defaults: `openai`, `gpt-5.2`). Max 5 tool-call steps per request.

## Running Locally

### Prerequisites

- [Bun](https://bun.sh) runtime
- Parent repo dependencies installed (`bun install` from repo root)
- A `.env` file at the repo root with at least `OPENAI_API_KEY` and `FINANCIAL_DATASETS_API_KEY`

### Development

```bash
# From repo root
bun install && cd web && bun install

# Start dev server
cd web && bun run dev
```

Opens at http://localhost:3000.

### Production Build

```bash
cd web && bun run build
bun run start
```

## Deployment (Vercel)

The app deploys to Vercel from the repo root using the config in the root `vercel.json`:

```json
{
  "buildCommand": "cd web && bun run build",
  "installCommand": "bun install && cd web && bun install",
  "outputDirectory": "web/.next",
  "framework": "nextjs"
}
```

### Required Environment Variables

Set these in the Vercel project dashboard:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the default model (gpt-5.2) |
| `FINANCIAL_DATASETS_API_KEY` | Yes | Financial Datasets API key for market data |
| `LIBSQL_URL` | Yes | Turso LibSQL URL (e.g., `libsql://your-db.turso.io`) — memory persistence |
| `LIBSQL_AUTH_TOKEN` | Yes | Turso auth token for the database above |
| `EXASEARCH_API_KEY` | No | Exa search API key (preferred web search provider) |
| `TAVILY_API_KEY` | No | Tavily API key (fallback if Exa not set) |
| `ANTHROPIC_API_KEY` | No | Required if using Anthropic models |
| `GOOGLE_API_KEY` | No | Required if using Google Gemini models |
| `DEXTER_MODEL_PROVIDER` | No | Model provider override (default: `openai`) |
| `DEXTER_MODEL` | No | Model override (default: `gpt-5.2`) |

Without `LIBSQL_URL`, the app falls back to `/tmp/memory.db` on Vercel (ephemeral — lost between invocations). Set up a [Turso](https://turso.tech) database for persistent memory.

### Vercel Notes

- The API route uses `export const runtime = 'nodejs'` and `export const maxDuration = 300` (5 min timeout for agent tool-calling loops)
- `export const dynamic = 'force-dynamic'` prevents static generation of the API route
- Dynamic `import()` inside the POST handler avoids agent/model validation at Next.js build time
- The 401 errors on `GET /` and `/favicon.ico` in Vercel logs are from Vercel's password protection, not a code issue

## Agent Tools Available

The agent has access to these tools through the API:

| Tool | Description |
|------|-------------|
| `financial_search` | Primary financial data tool — prices, metrics, filings (routes to sub-tools internally) |
| `financial_metrics` | Direct metric lookups (revenue, market cap, P/E, etc.) |
| `read_filings` | SEC filing reader for 10-K, 10-Q, 8-K documents |
| `web_search` | General web search (Exa or Tavily depending on API keys) |
| `web_fetch` | Read any web page content (articles, press releases) |
| `browser` | Playwright-based browser for JavaScript-rendered pages |
| `skill` | Invoke SKILL.md workflows (e.g., DCF valuation) |

## Mastra Studio

For a visual dev UI to inspect the agent, tools, memory, and traces:

```bash
# From repo root
bun run studio
```

Opens Mastra Studio at http://localhost:4111. Swagger API docs at http://localhost:4111/swagger-ui.

## Frontend Details

### Chat UI (`page.tsx`)

Single-page chat interface with:

- **Message history** — user and assistant messages with markdown rendering (react-markdown + remark-gfm)
- **Tool status indicators** — real-time display of tool invocations with spinners, completion times, and argument previews
- **Thinking animations** — rotating verbs ("Analyzing...", "Correlating...", "Synthesizing...") while the agent works
- **Composing indicator** — shown after tools complete but before text streams
- **Suggested queries** — starter prompts on empty state
- **Session management** — "New Chat" button resets session; session ID persists across messages for memory continuity
- **Streaming cursor** — red pulsing cursor during text generation
- **Abort support** — AbortController on fetch for cancellation

### Theming

Bindle brand palette defined in `globals.css` and `tailwind.config.ts`:

- Background: `#0a0a0a` (near-black)
- Accent: `#ff0000` (Bindle red)
- Font: Inter
- Financial tables: monospaced numeric columns, right-aligned, alternating row backgrounds
- Custom scrollbar, tool spinners, and dot-pulse animations

## Standalone Extraction Notes

When porting to a standalone app, the main changes needed:

1. **Remove parent src imports** — replace `../../../../src/mastra/` imports in the API route with a published package, REST API client, or co-located agent code
2. **Remove webpack aliases** — the `@dexter` and `@` aliases in `next.config.ts` that point to `../src`
3. **Remove `transpilePackages`** — no longer needed if agent code is a separate package
4. **Self-contained env** — `.env` would live in the web app root instead of the parent
5. **Own `vercel.json`** — the `web/vercel.json` already has a standalone config; use it instead of the root one
6. **Components directory** — extract inline components from `page.tsx` into `app/components/` (ToolStatusItem, ThinkingIndicator, ComposingIndicator, SuggestionButton, etc.)
