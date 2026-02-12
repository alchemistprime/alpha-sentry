# AlphaSentry

AI-powered financial research agent. Ask questions about stocks, earnings, filings, and metrics — get data-backed answers from live market data.

Built with TypeScript, [Mastra](https://mastra.ai) (agent framework), [Ink](https://github.com/vadimdemedes/ink) (CLI), and Next.js (web).

Originally forked from [virattt/dexter](https://github.com/virattt/dexter).

## What It Does

- Answers financial research questions using live market data (prices, income statements, balance sheets, cash flows, SEC filings, analyst estimates, insider trades)
- Routes queries through specialized sub-agents that select the right data tools automatically
- Maintains conversation memory across sessions (working memory + semantic recall)
- Runs a DCF valuation skill for intrinsic value analysis
- Available as a CLI terminal app and a web chat interface

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- API keys (see [Environment Variables](#environment-variables))

## Install

```bash
git clone https://github.com/alchemistprime/alpha-sentry.git
cd alpha-sentry
bun install
cp .env.example .env
# Edit .env with your API keys
```

## Run

**CLI** (interactive terminal):

```bash
bun start
```

**Web app** (Next.js chat UI):

```bash
cd web && bun install && bun run dev
```

Opens at http://localhost:3000. See [web/README.md](web/README.md) for full web app documentation.

**Mastra Studio** (visual agent inspector):

```bash
bun run studio
```

Opens at http://localhost:4111. Lets you chat with the agent, test tools individually, inspect memory/threads, and view traces.

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Default model provider (gpt-5.2) |
| `FINANCIAL_DATASETS_API_KEY` | Yes | Market data — prices, fundamentals, filings |
| `EXASEARCH_API_KEY` | No | Web search (preferred provider) |
| `TAVILY_API_KEY` | No | Web search (fallback if Exa not set) |
| `ANTHROPIC_API_KEY` | No | For Claude models |
| `GOOGLE_API_KEY` | No | For Gemini models |
| `XAI_API_KEY` | No | For Grok models |
| `OPENROUTER_API_KEY` | No | For OpenRouter-hosted models |
| `LIBSQL_URL` | No | Turso LibSQL URL for remote memory persistence |
| `LIBSQL_AUTH_TOKEN` | No | Turso auth token (required with `LIBSQL_URL`) |

### Model Selection

Default model is `gpt-5.2` on OpenAI. Switch providers interactively in the CLI with the `/model` command, or set env vars:

```bash
DEXTER_MODEL_PROVIDER=anthropic
DEXTER_MODEL=claude-sonnet-4-20250514
```

Supported providers: OpenAI, Anthropic, Google, xAI, OpenRouter, Ollama (local).

## Project Structure

```
src/
├── mastra/                  # Mastra agent framework layer
│   ├── index.ts             # Mastra instance (registers agent + storage)
│   ├── agents/              # AlphaSentry agent definition
│   ├── tools/               # Mastra tool wrappers (financial-search, read-filings, financial-metrics)
│   ├── memory.ts            # LibSQL-backed memory (message history, working memory, semantic recall)
│   ├── model-router.ts      # Multi-provider model string routing
│   ├── event-bridge.ts      # Mastra stream → AgentEvent bridge for CLI/web
│   └── audit-log.ts         # JSONL audit trail of tool calls
├── tools/
│   ├── finance/             # Financial data tools (prices, fundamentals, filings, ratios, etc.)
│   ├── search/              # Web search (Exa, Tavily)
│   ├── browser/             # Playwright-based web scraping
│   └── fetch/               # Web page fetcher
├── skills/                  # SKILL.md-based workflows
│   └── dcf/                 # DCF valuation skill
├── components/              # Ink CLI components
├── hooks/                   # React hooks (agent runner, model selection, input history)
├── cli.tsx                  # CLI interface
└── index.tsx                # Entry point

web/                         # Next.js web chat interface
├── app/
│   ├── api/chat/route.ts    # SSE streaming API endpoint
│   └── page.tsx             # Chat UI
└── README.md                # Web app documentation
```

## Tools

| Tool | Description |
|------|-------------|
| `financial_search` | Primary financial data tool — routes queries to specialized sub-tools for prices, fundamentals, filings, ratios, estimates, insider trades |
| `financial_metrics` | Direct metric lookups (revenue, market cap, P/E, EPS, etc.) |
| `read_filings` | SEC filing reader — 10-K, 10-Q, 8-K documents with section extraction |
| `web_search` | General web search via Exa or Tavily |
| `web_fetch` | Read web page content (articles, press releases, investor relations) |
| `browser` | Playwright browser for JavaScript-rendered pages |
| `skill` | Invoke SKILL.md workflows (e.g., DCF valuation) |

## Memory

AlphaSentry uses Mastra Memory backed by LibSQL for persistence across sessions:

- **Message history** — last 20 messages per thread
- **Working memory** — persistent user profile, active tickers, session state
- **Semantic recall** — retrieves relevant older messages by embedding similarity

Local development uses `file:.dexter/memory.db`. For production (Vercel), set `LIBSQL_URL` and `LIBSQL_AUTH_TOKEN` pointing to a [Turso](https://turso.tech) database.

## Development

```bash
bun run dev          # CLI with watch mode
bun run typecheck    # Type checking
bun test             # Run tests
bun run studio       # Mastra Studio
```

## Deployment

The web app deploys to Vercel. See [web/README.md](web/README.md) for Vercel configuration, required env vars, and deployment notes.

## License

MIT
