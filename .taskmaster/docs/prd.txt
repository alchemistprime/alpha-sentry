# Mastra Migration Plan

LangChain → Mastra migration for Dexter/AlphaSentry. Six phases, each independently testable.

**Branch:** `feature/mastra-migration` off `main`
**Runtime:** Bun (not Node)
**Frontends:** Ink CLI (React) + Next.js web UI

---

## Prerequisites

```bash
git checkout main
git pull origin main
git checkout -b feature/mastra-migration
```

Install Mastra packages (Phase 1):
```bash
bun add @mastra/core @mastra/memory @mastra/libsql
```

Verify Bun compatibility immediately:
```bash
# Smoke test — does Mastra import cleanly under Bun?
bun -e "import { Agent } from '@mastra/core/agent'; import { createTool } from '@mastra/core/tools'; console.log('OK')"
```

---

## What to Preserve (The Real IP)

These survive the migration unchanged:

1. **13 finance sub-tools** — prices, fundamentals, filings, insider trades, crypto, estimates, segments, news, key ratios, company facts (the `src/tools/finance/*.ts` modules)
2. **financialdatasets.ai API layer** — `src/tools/finance/api.ts` (callApi, caching, auth)
3. **Domain prompting** — table formatting rules, financial abbreviations, guardrails against exposing API internals
4. **Tool result formatting** — `src/tools/types.ts` (formatToolResult, parseSearchResults)
5. **Skills system** — `src/skills/` SKILL.md-based workflows

## What Gets Replaced (Commodity Infrastructure)

1. Custom `Agent` class → Mastra `Agent`
2. Custom agent loop (while/iteration) → Mastra `maxSteps`
3. LangChain LLM wrappers → Mastra model router (`"openai/gpt-5.2"`)
4. LangChain tool schemas (`DynamicStructuredTool`) → Mastra `createTool()`
5. Custom context management → Mastra memory (message history + working memory)
6. Custom SSE streaming + fake word-by-word → Vercel AI SDK native streaming
7. `@langchain/*` dependencies (7 packages)

---

## Phase 1: Scaffold Mastra Alongside LangChain

**Goal:** Install Mastra, create the `src/mastra/` directory structure, verify Bun compatibility, and write a minimal smoke-test agent that coexists with the existing LangChain agent.

**Duration:** ~2 hours

### 1.1 Install Dependencies

```bash
bun add @mastra/core @mastra/memory @mastra/libsql
```

### 1.2 Create Directory Structure

```
src/mastra/
├── index.ts          # Mastra instance (agents, memory, storage)
├── agents/
│   └── dexter.ts     # Mastra Agent definition (stub)
└── tools/
    └── index.ts      # Re-exports of ported tools (empty initially)
```

### 1.3 Create Mastra Instance

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { dexterAgent } from './agents/dexter.js';

export const mastra = new Mastra({
  agents: { dexterAgent },
});
```

### 1.4 Create Stub Agent

```typescript
// src/mastra/agents/dexter.ts
import { Agent } from '@mastra/core/agent';

export const dexterAgent = new Agent({
  id: 'dexter',
  name: 'Dexter',
  instructions: 'You are Dexter, a helpful financial research assistant.',
  model: 'openai/gpt-5.2',
  // tools: {} — added in Phase 2
  // memory: — added in Phase 4
});
```

### 1.5 Smoke Test

```typescript
// src/mastra/smoke-test.ts
import { mastra } from './index.js';

const agent = mastra.getAgent('dexterAgent');
const response = await agent.generate('What is a P/E ratio?');
console.log(response.text);
```

```bash
bun run src/mastra/smoke-test.ts
```

### 1.6 Verification Checklist

- [ ] `bun run src/mastra/smoke-test.ts` produces a text response
- [ ] `bun run start` still works (existing LangChain agent unaffected)
- [ ] `bun run typecheck` passes
- [ ] No import conflicts between `@mastra/core` and `@langchain/core`

---

## Phase 2: Port Financial Tools to Mastra Format

**Goal:** Convert all 13 finance leaf tools + browser + search + skill tools from `DynamicStructuredTool` to `createTool()`. Meta-tools (financial_search, read_filings) are NOT ported yet — they stay as LangChain tools temporarily.

**Duration:** ~1 day

### 2.1 Tool Conversion Pattern

Each tool follows this mechanical transformation:

**Before (LangChain):**
```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const getPriceSnapshot = new DynamicStructuredTool({
  name: 'get_price_snapshot',
  description: 'Fetches the most recent price snapshot...',
  schema: PriceSnapshotInputSchema,
  func: async (input) => {
    const { data, url } = await callApi('/prices/snapshot/', { ticker: input.ticker });
    return formatToolResult(data.snapshot || {}, [url]);
  },
});
```

**After (Mastra):**
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getPriceSnapshot = createTool({
  id: 'get_price_snapshot',
  description: 'Fetches the most recent price snapshot...',
  inputSchema: PriceSnapshotInputSchema,
  execute: async (input) => {
    const { data, url } = await callApi('/prices/snapshot/', { ticker: input.ticker });
    return formatToolResult(data.snapshot || {}, [url]);
  },
});
```

Key differences:
- `name` → `id`
- `schema` → `inputSchema`
- `func` → `execute`
- `new DynamicStructuredTool({...})` → `createTool({...})`
- No class instantiation — `createTool` is a function call

### 2.2 Tools to Port (16 leaf tools)

Port in this order (grouped by module):

**Prices** (`src/tools/finance/prices.ts`):
1. `get_price_snapshot`
2. `get_prices`

**Fundamentals** (`src/tools/finance/fundamentals.ts`):
3. `get_income_statements`
4. `get_balance_sheets`
5. `get_cash_flow_statements`
6. `get_all_financial_statements`

**Key Ratios** (`src/tools/finance/key-ratios.ts`):
7. `get_key_ratios_snapshot`
8. `get_key_ratios`

**Filings** (`src/tools/finance/filings.ts`):
9. `get_filings`
10. `get_10K_filing_items`
11. `get_10Q_filing_items`
12. `get_8K_filing_items`

**Other Finance** (one tool each):
13. `get_analyst_estimates` (`estimates.ts`)
14. `get_segmented_revenues` (`segments.ts`)
15. `get_insider_trades` (`insider_trades.ts`)
16. `get_company_facts` (`company_facts.ts`)

**Crypto** (`src/tools/finance/crypto.ts`):
17. `get_crypto_price_snapshot`
18. `get_crypto_prices`
19. `get_crypto_tickers`

**News** (`src/tools/finance/news.ts`):
20. `get_news`

**Non-finance tools:**
21. `web_search` (Exa variant) — `src/tools/search/`
22. `web_search` (Tavily variant) — `src/tools/search/`
23. `browser` — `src/tools/browser/`
24. `skill` — `src/tools/skill.ts`

### 2.3 Progress Callback Pattern

Current tools use `config.metadata.onProgress` for streaming status updates to the UI. In Mastra, use the tool execution context:

```typescript
export const someFinanceTool = createTool({
  id: 'some_finance_tool',
  description: '...',
  inputSchema: z.object({ ... }),
  execute: async (input, context) => {
    // context provides abortSignal, toolCallId, etc.
    // For progress, we'll bridge this in Phase 3 when wiring to the agent
    const result = await callApi('/endpoint/', { ... });
    return formatToolResult(result.data, [result.url]);
  },
});
```

Note: The `onProgress` callback pattern needs a bridge — Mastra tools don't natively support progress events the same way. Options:
- Use Mastra's `onInputAvailable`/`onOutput` lifecycle hooks for basic status
- For real-time progress during long tool execution, emit via a shared EventEmitter or channel pattern

### 2.4 Do NOT Port Yet

- `financial_search` (meta-tool with inner LLM routing) → Phase 3
- `read_filings` (meta-tool with two-step LLM workflow) → Phase 3

These depend on having the leaf tools AND the Mastra agent loop in place.

### 2.5 New Tool Registry

Create a Mastra-compatible registry alongside the existing one:

```typescript
// src/mastra/tools/index.ts
import { getPriceSnapshot, getPrices } from '../../tools/finance/prices.js';
import { getIncomeStatements, getBalanceSheets, ... } from '../../tools/finance/fundamentals.js';
// ... all leaf tools

export const financeTools = {
  getPriceSnapshot,
  getPrices,
  getIncomeStatements,
  getBalanceSheets,
  // ... all 20+ tools
};
```

### 2.6 Verification

```bash
# Unit test each tool's execute() with mocked callApi
bun test src/tools/finance/*.test.ts

# Typecheck
bun run typecheck

# Existing agent still works (LangChain registry unchanged)
bun run start
```

- [ ] Each tool's `execute()` produces the same output shape as the old `func()`
- [ ] `bun run typecheck` passes with no errors from `@mastra/core/tools`
- [ ] Existing `bun run start` still works (old registry untouched)

---

## Phase 3: Replace Agent Class with Mastra Agent

**Goal:** Replace the custom `Agent` class (`src/agent/agent.ts`) with Mastra's `Agent` class. Port the meta-tools (financial_search, read_filings). Wire the full system prompt. Emit compatible events for CLI/web UI consumption.

**Duration:** ~2 days

### 3.1 Port Meta-Tools as Sub-Agent Tools

The `financial_search` and `read_filings` tools use inner LLM calls for routing. In Mastra, implement these as **tools that internally use a sub-agent**.

**financial_search approach:**

```typescript
// src/mastra/tools/financial-search.ts
import { createTool } from '@mastra/core/tools';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { financeLeafTools } from './finance/index.js';

const financialRouter = new Agent({
  id: 'financial-router',
  name: 'Financial Router',
  instructions: buildRouterPrompt(),  // reuse existing router prompt
  model: 'openai/gpt-5.2',           // inherits from parent or configurable
  tools: financeLeafTools,            // all 20 leaf tools registered directly
});

export const financialSearch = createTool({
  id: 'financial_search',
  description: 'Intelligent agentic search for financial data...',
  inputSchema: z.object({
    query: z.string().describe('Natural language query about financial data'),
  }),
  execute: async (input) => {
    const result = await financialRouter.generate(input.query, { maxSteps: 3 });
    // Extract tool results from steps and combine
    return combineFinancialResults(result.steps);
  },
});
```

**read_filings approach — two-step sub-agent:**

```typescript
// src/mastra/tools/read-filings.ts
// Step 1: sub-agent finds filings metadata
// Step 2: sub-agent reads specific filing content
// Same two-step pattern, but using Mastra agents instead of raw LLM calls
```

**Alternative (simpler):** Register the `financialRouter` sub-agent directly on the main agent via `agents: { financialRouter }`. Mastra auto-converts it to a tool named `agent-financialRouter`. Downside: less control over the aggregation/formatting of results.

**Decision:** Use the `createTool` wrapper approach for now — it preserves the existing output contract (`{ data, sourceUrls }`) and the existing system prompt policy ("call financial_search ONCE").

### 3.2 Wire the Full System Prompt

Mastra uses `instructions` (string or array of system messages). Port the existing `buildSystemPrompt()`:

```typescript
// src/mastra/agents/dexter.ts
import { Agent } from '@mastra/core/agent';
import { buildSystemPrompt } from '../../agent/prompts.js';
import { allTools } from '../tools/index.js';

export const dexterAgent = new Agent({
  id: 'dexter',
  name: 'Dexter',
  instructions: buildSystemPrompt('openai/gpt-5.2'),  // reuse existing prompt builder
  model: 'openai/gpt-5.2',
  tools: allTools,
});
```

For Anthropic prompt caching, use Mastra's `providerOptions`:
```typescript
instructions: {
  role: 'system',
  content: buildSystemPrompt(model),
  providerOptions: {
    anthropic: { cacheControl: { type: 'ephemeral' } },
  },
},
```

### 3.3 Multi-Provider Model Support

Mastra uses model router strings (`"provider/model"`) instead of LangChain class instantiation:

| Current (LangChain) | Mastra model string |
|---|---|
| `new ChatOpenAI({ model: 'gpt-5.2' })` | `'openai/gpt-5.2'` |
| `new ChatAnthropic({ model: 'claude-sonnet-4' })` | `'anthropic/claude-sonnet-4'` |
| `new ChatGoogleGenerativeAI({ model: 'gemini-3-flash-preview' })` | `'google/gemini-3-flash-preview'` |
| `new ChatOpenAI({ model: 'grok-4-1', baseURL: 'x.ai' })` | `'xai/grok-4-1'` (if supported) or custom |
| `new ChatOllama({ model: 'llama3' })` | `'ollama/llama3'` |

**Action:** Update `src/model/llm.ts` to export a function that returns Mastra-compatible model strings. Some providers (xAI/Grok, Moonshot, DeepSeek) may need the OpenRouter path: `'openrouter:xai/grok-4-1-fast-reasoning'`.

Check Mastra's [supported models list](https://mastra.ai/models) for exact string format.

### 3.4 Event Bridge

The Ink CLI and web UI consume `AgentEvent` types (`tool_start`, `tool_end`, `thinking`, `answer_start`, `done`). Mastra's `agent.stream()` produces a different event shape.

Create an event bridge:

```typescript
// src/mastra/event-bridge.ts
import type { AgentEvent } from '../agent/types.js';

export async function* bridgeEvents(
  mastraStream: Awaited<ReturnType<typeof agent.stream>>
): AsyncGenerator<AgentEvent> {
  // Mastra provides onStepFinish callback and textStream
  // Map these to existing AgentEvent types
  
  // For tool events: use onStepFinish to detect tool calls
  // For text: yield from textStream
  // For done: use onFinish callback
}
```

This bridge lets the existing CLI (`src/cli.tsx`) and web route consume events without changes initially.

### 3.5 Agent Runner Hook

Update `src/hooks/use-agent-runner.ts` to use the Mastra agent instead of the custom Agent class:

```typescript
// Before:
const agent = Agent.create({ model, modelProvider, signal });
for await (const event of agent.run(query, chatHistory)) { ... }

// After:
const agent = mastra.getAgent('dexterAgent');
const stream = await agent.stream(query, { maxSteps: 10 });
for await (const event of bridgeEvents(stream)) { ... }
```

### 3.6 Scratchpad Decision

**Keep the scratchpad as an audit trail**, separate from Mastra's memory. Mastra manages context internally (via message history + working memory), so the scratchpad's role changes:

- **Before:** Single source of truth for agent context + audit trail
- **After:** Audit trail only (tool calls, args, results, timestamps to disk)

Write a lightweight scratchpad that only appends to JSONL:

```typescript
// src/mastra/audit-log.ts
// Append-only JSONL logger for tool calls
// No longer responsible for context management (Mastra handles that)
// Used for debugging, compliance, and history
```

Wire it via `onStepFinish`:
```typescript
const stream = await agent.stream(query, {
  maxSteps: 10,
  onStepFinish: ({ toolCalls, toolResults }) => {
    for (const call of toolCalls) {
      auditLog.append({ tool: call.name, args: call.args, result: call.result });
    }
  },
});
```

### 3.7 Verification

```bash
# Mastra agent responds to financial queries using tools
bun run src/mastra/smoke-test.ts "What is Apple's current stock price?"

# CLI still works via event bridge
bun run start

# Typecheck
bun run typecheck
```

- [ ] Mastra agent calls `financial_search` tool and returns financial data
- [ ] CLI displays tool events (start/end) and final answer
- [ ] Audit log JSONL file is written to `.dexter/scratchpad/`
- [ ] Multi-provider support works (test with at least OpenAI + one other)

---

## Phase 4: Add Memory

**Goal:** Add Mastra's three memory types — message history (conversation continuity), working memory (persistent user/research state), and semantic recall (cross-session search).

**Duration:** ~1 day

### 4.1 Storage Setup

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

const storage = new LibSQLStore({
  id: 'dexter-storage',
  url: 'file:.dexter/memory.db',
});

const vector = new LibSQLVector({
  id: 'dexter-vector',
  url: 'file:.dexter/memory.db',
});
```

### 4.2 Memory Configuration

```typescript
// src/mastra/memory.ts
import { Memory } from '@mastra/memory';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

export const memory = new Memory({
  storage,
  vector,
  embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  options: {
    // Message history — recent conversation context
    lastMessages: 20,

    // Working memory — persistent research state
    workingMemory: {
      enabled: true,
      template: `# Research Context

## User Profile
- Name:
- Preferred Tickers:
- Analysis Style: [e.g., Fundamental, Technical, Both]

## Current Research
- Active Tickers:
- Key Findings:
- Open Questions:

## Session State
- Last Query Topic:
- Data Sources Used:
`,
    },

    // Semantic recall — cross-session search
    semanticRecall: {
      topK: 5,
      messageRange: 2,
      scope: 'resource',
    },
  },
});
```

### 4.3 Wire Memory to Agent

```typescript
// src/mastra/agents/dexter.ts
import { Agent } from '@mastra/core/agent';
import { memory } from '../memory.js';

export const dexterAgent = new Agent({
  id: 'dexter',
  name: 'Dexter',
  instructions: buildSystemPrompt(model),
  model: 'openai/gpt-5.2',
  tools: allTools,
  memory,
});
```

### 4.4 Thread/Resource Management

Each conversation needs a thread ID and resource ID:

```typescript
// CLI: thread per session, resource per user
const response = await agent.generate(query, {
  maxSteps: 10,
  memory: {
    thread: `cli-${sessionId}`,
    resource: 'cli-user',
  },
});

// Web UI: thread per session, resource per session ID
const response = await agent.stream(query, {
  maxSteps: 5,
  memory: {
    thread: `web-${sessionId}`,
    resource: `user-${sessionId}`,
  },
});
```

### 4.5 Replace InMemoryChatHistory

The existing `InMemoryChatHistory` class + Redis session storage in the web route becomes unnecessary — Mastra's memory handles this via its storage adapter:

- **Before:** `InMemoryChatHistory` → Redis (web) / in-memory (CLI)
- **After:** Mastra Memory → LibSQL (local) or PostgreSQL (production)

For the web UI on Vercel, switch storage to PostgreSQL or Upstash:
```typescript
// Production (Vercel):
import { UpstashStore, UpstashVector } from '@mastra/upstash';
```

### 4.6 Verification

```bash
# Multi-turn conversation retains context
bun run src/mastra/smoke-test.ts
# Ask: "What is AAPL's P/E ratio?"
# Then: "How does it compare to MSFT?"
# Agent should remember AAPL context

# Working memory persists across sessions
# Start, ask about AAPL, quit, restart, ask "what were we looking at?"
```

- [ ] Agent remembers previous messages in the same thread
- [ ] Working memory updates with user preferences/research state
- [ ] Semantic recall finds relevant past messages
- [ ] `bun run typecheck` passes
- [ ] `.dexter/memory.db` file is created and populated

---

## Phase 5: Strip LangChain Dependencies

**Goal:** Remove all 7 `@langchain/*` packages and the `langsmith` package. Update all imports. Clean up dead code.

**Duration:** ~3 hours

### 5.1 Dependencies to Remove

```bash
bun remove @langchain/core @langchain/openai @langchain/anthropic \
  @langchain/google-genai @langchain/ollama @langchain/exa @langchain/tavily \
  langsmith
```

### 5.2 Files to Update

| File | Change |
|---|---|
| `src/model/llm.ts` | Delete entirely — replaced by Mastra model router |
| `src/agent/agent.ts` | Delete entirely — replaced by `src/mastra/agents/dexter.ts` |
| `src/agent/scratchpad.ts` | Keep as audit log, remove LangChain type imports if any |
| `src/agent/prompts.ts` | Keep — still used for system prompt building |
| `src/agent/types.ts` | Keep — event types still used by CLI/web bridges |
| `src/tools/registry.ts` | Delete — replaced by `src/mastra/tools/index.ts` |
| `src/tools/finance/*.ts` | Already ported in Phase 2 (remove old LangChain versions) |
| `src/tools/search/*.ts` | Port Exa/Tavily wrappers to `createTool()` |
| `src/tools/browser/index.ts` | Port to `createTool()` |
| `src/tools/skill.ts` | Port to `createTool()` |
| `web/app/api/chat/route.ts` | Remove LangSmith imports (tracing via Mastra OpenTelemetry) |

### 5.3 Tracing Migration

Replace LangSmith with Mastra's built-in OpenTelemetry tracing:

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: { dexterAgent },
  logger: createLogger({ name: 'Dexter', level: 'info' }),
  // OpenTelemetry tracing replaces LangSmith
});
```

If LangSmith tracing is still desired, it can be kept via direct `langsmith` SDK calls separate from LangChain, or use Mastra's OTLP export to a LangSmith-compatible endpoint.

### 5.4 Verification

```bash
# No @langchain imports remain
grep -r "@langchain" src/ --include="*.ts" --include="*.tsx"
# Should return zero results

# Full functionality test
bun run typecheck
bun test
bun run start
# Ask a financial query, verify tools work, answer is generated
```

- [ ] Zero `@langchain` imports in `src/`
- [ ] `package.json` has no `@langchain/*` dependencies
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] CLI works end-to-end
- [ ] Web UI works end-to-end

---

## Phase 6: Web UI Streaming with Vercel AI SDK

**Goal:** Replace the custom SSE streaming + fake word-by-word delay with Vercel AI SDK native streaming. True token-by-token streaming from the LLM.

**Duration:** ~3 hours

### 6.1 Current Problem

The web route generates the full answer, then drips it out word-by-word with artificial delays (`15 + Math.random() * 20` ms). This adds latency and complexity.

### 6.2 Update Web Dependencies

```bash
# In web/ directory
cd web
bun add @mastra/core @mastra/ai-sdk
# ai package already installed (v4)
```

### 6.3 New Chat Route

```typescript
// web/app/api/chat/route.ts
import { mastra } from '../../../src/mastra/index.js';
import { toAISdkV5Stream } from '@mastra/ai-sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  const lastMessage = messages[messages.length - 1];
  const query = lastMessage.content;

  const agent = mastra.getAgent('dexterAgent');

  const stream = await agent.stream(query, {
    maxSteps: 5,
    memory: {
      thread: `web-${sessionId || crypto.randomUUID()}`,
      resource: `user-${sessionId}`,
    },
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Audit logging (optional)
    },
  });

  // Convert Mastra stream to AI SDK compatible format
  const aiStream = toAISdkV5Stream(stream, { from: 'agent' });

  return new Response(aiStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

### 6.4 Update Frontend

The web frontend should use Vercel AI SDK's `useChat` hook for consumption:

```typescript
// web/app/components/Chat.tsx
import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });
  // ... render messages with real-time streaming
}
```

### 6.5 Tool Events in Stream

Mastra streams include tool call/result events. These can be consumed via AI SDK's data stream parts:

```typescript
// Tool events appear as data-tool-call and data-tool-result parts
// The frontend can detect these to show tool status UI
```

### 6.6 Remove Dead Code

- Delete the fake word-by-word streaming logic
- Delete the custom SSE encoder
- Delete the `sendEvent`/`sendText` helpers
- Delete the LangSmith traceable wrapper
- Delete Redis session management (Mastra memory handles persistence)

### 6.7 Verification

```bash
cd web
bun run build   # Next.js build succeeds
bun run dev     # Dev server starts

# Test in browser:
# 1. Send "What is AAPL's P/E ratio?"
# 2. See real-time token streaming (not word-by-word fake)
# 3. See tool status events in UI
# 4. Send follow-up "How does it compare to MSFT?"
# 5. Agent uses memory for context
```

- [ ] Real token-by-token streaming (no artificial delays)
- [ ] Tool events displayed in UI
- [ ] Multi-turn conversation works via memory
- [ ] `next build` succeeds
- [ ] No `langsmith` imports in `web/`

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Bun incompatibility with Mastra packages | Test import in Phase 1 before any other work |
| Mastra doesn't support xAI/Grok/Moonshot/DeepSeek directly | Use OpenRouter as fallback: `'openrouter:xai/grok-4-1'` |
| Event parity — Mastra may not expose `tool_progress` events | Accept degraded progress UX; keep `tool_start`/`tool_end` |
| Context regression — removing explicit context clearing | Mastra memory manages this; working memory template limits scope |
| Vercel AI SDK v4 → v5 incompatibility | Use `@mastra/ai-sdk` adapter; pin versions |
| LibSQL not available on Vercel serverless | Use Upstash or PostgreSQL storage adapter for production |
| Meta-tool double-hop latency increases | Monitor; if too slow, flatten tools directly onto main agent |

---

## Post-Migration Improvements (Not in Scope)

These become possible after the migration but are separate work:

1. **Deterministic routing** — Replace inner LLM calls in financial_search with keyword matching for common patterns ("revenue" → `getIncomeStatements`)
2. **Cache TTL** — Add expiration to non-immutable data cache entries
3. **Auth + rate limiting** — Add API key auth to the web route
4. **Mastra Studio** — Use `mastra dev` for local agent testing/debugging
5. **Observational memory** — Add long-term memory that survives context clearing
6. **Agent networks** — Multi-agent collaboration for complex research queries
7. **Evals/scorers** — Mastra built-in eval framework for quality measurement

---

*Document created: 2026-02-10*
*Context: LangChain → Mastra migration planning for Dexter/AlphaSentry*
