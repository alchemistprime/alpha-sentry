## Dexter - Autonomous Financial Research Agent

This is **Dexter**, an autonomous AI agent built specifically for financial research and analysis. Think of it as "Claude Code for finance."

### Core Architecture

| Layer | Technology |
|-------|------------|
| Runtime | Bun (TypeScript) |
| CLI UI | React + Ink (terminal rendering) |
| Web UI | Next.js 15 + React 19 |
| LLM Framework | LangChain |
| Tracing | LangSmith |

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `agent/` | Core agentic loop, scratchpad memory, prompts |
| `tools/` | Finance tools (prices, filings, fundamentals) + web search |
| `skills/` | Extensible workflows (e.g., DCF valuation) |
| `components/` | Ink-based CLI UI components |
| `hooks/` | React hooks for agent state management |
| `model/` | Multi-provider LLM abstraction (OpenAI, Anthropic, Gemini, Ollama, xAI) |
| `utils/` | Config, markdown tables, env handling |
| `evals/` | Evaluation framework |

### Key Features

- **Agentic Loop** - Iterative reasoning with tool execution (max 10 iterations)
- **Scratchpad** - Append-only JSONL memory in `.dexter/scratchpad/`
- **Context Compaction** - LLM summaries reduce token usage during iterations
- **Tool Deduplication** - Prevents redundant tool calls per query
- **Multi-Provider LLM** - OpenAI, Anthropic, Google, xAI, Ollama support
- **Real-time Events** - Streaming updates for thinking, tool execution, answers

### Financial Data Tools

The `tools/finance/` directory provides integrations with Financial Datasets API:
- Stock/crypto prices, fundamentals (income, balance sheet, cash flow)
- SEC filings (10-K, 10-Q, 8-K), analyst estimates, news, insider trades
- LLM-powered routing via `financial_search` tool

### Skill System

Skills are markdown-based workflows loaded from:
1. `src/skills/` (builtin)
2. `~/.dexter/skills/` (user)
3. `.dexter/skills/` (project)

The built-in DCF valuation skill demonstrates step-by-step intrinsic value calculation.
