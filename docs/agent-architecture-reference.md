# Agent Architecture Reference

A universal architectural framework for agentic AI applications, derived from first-principles analysis of how modern AI agents are constructed.

---

## Background: The Landscape

### The Agentic Shift

The AI application layer has moved from chatbots (single-turn Q&A) to agents (autonomous, multi-step task execution). Every major product announcement in 2025-2026 has been about agents — autonomous tool use, multi-step reasoning, persistent memory, human-in-the-loop workflows. This is the product category now, and it's the skillset that matters.

### Language Ecosystem Trends

The AI ecosystem is stratifying by layer:

- **Python owns the research and model layer.** Training, fine-tuning, inference frameworks, ML libraries (PyTorch, JAX, HuggingFace). This is not going anywhere.
- **TypeScript owns the application layer.** This is where agents get built and shipped to users. The growth in the agentic space is disproportionately TypeScript because the use case shifted from "researcher in a notebook" to "engineer shipping a product to users in a browser."

Evidence of the shift:
- Vercel AI SDK: 20M+ monthly downloads, TypeScript-native
- Mastra: From the Gatsby team, TypeScript-native, 20k+ GitHub stars
- OpenAI Agents SDK: Ships in both Python and TypeScript
- Claude Code (Anthropic): Written in TypeScript
- MCP (Model Context Protocol): TypeScript reference implementation came first
- OpenClaw: 150k+ GitHub stars, written in TypeScript/Node.js

Python isn't declining — it's ceiling. It dominates where it dominates (data science, ML, scripting) and that won't change. But the agent-building, tool-orchestrating, product-shipping layer is increasingly TypeScript territory.

Go and Rust appear in the infrastructure layer — the runtimes and servers that agents execute on — not in the agent logic itself.

### Why TypeScript for Agent Products

For applications that are primarily I/O-bound (calling LLM APIs, calling data APIs, parsing JSON, formatting text) rather than compute-bound (matrix math, model inference), TypeScript has concrete advantages:

- **Single stack** — frontend (React/Next.js), backend (Node.js), and agent logic share one language, one type system, one deployment
- **Type safety across the full stack** — Zod schemas, event types, streaming protocols are checked at compile time end-to-end
- **Async-first** — Node's event loop is built for the async I/O pattern that agent tool execution follows
- **Deployment simplicity** — Vercel, Cloudflare Workers, and other JavaScript runtimes enable single-unit deployment of frontend + agent
- **Fast cold starts** — Bun/Node startup is measured in milliseconds, critical for CLI tools and serverless

Python wins when you need local model inference, quantitative computation (NumPy/pandas), or access to the ML research ecosystem directly.

### Framework Landscape

**Agno** (Python, 37k stars) — the strongest memory/learning system. Agents that remember users across sessions, accumulate knowledge, and improve over time. Multi-agent teams with coordinator/router/collaborator modes. Production runtime (AgentOS) included. Python-only — no TypeScript SDK exists.

**Mastra** (TypeScript, 20k stars) — the closest thing to "Agno for TypeScript." Three memory types (conversation history, working memory, semantic recall). Agent networks, workflows, RAG, guardrails, human-in-the-loop. Built on top of Vercel AI SDK for transport. From the team behind Gatsby.

**Vercel AI SDK** (TypeScript, 20M+ monthly downloads) — the transport and orchestration layer. ToolLoopAgent, streaming, multi-provider support, tool execution approval, MCP, DevTools. Excellent infrastructure but no opinion on memory or knowledge — you build that yourself or use Mastra on top.

### The Value Stack

The agent itself is commodity infrastructure. The differentiation in any agentic application comes from three layers:

1. **Tools** — what external systems the agent can interact with (APIs, databases, browsers, file systems)
2. **Domain knowledge** — what the agent knows about the problem space (encoded in system prompts, skills, and fine-tuning)
3. **Memory** — how the agent learns and improves over time (the frontier that separates day-1 capability from day-1000 capability)

For a financial research agent specifically: the financial data API integrations, the SEC filing navigation logic, the domain-specific prompting about how to present financial data — that is the real intellectual property. The agent loop is interchangeable.

---

## 1. LLM Core

A large language model (Claude, GPT, Gemini, etc.). This is the "brain" — it reads text, reasons about it, and produces text. It has no persistent state of its own. Every message, it starts from scratch with whatever context is loaded into its window.

## 2. System Prompt

Thousands of tokens of instructions injected before the user ever says a word. It defines: who the agent is, how it communicates, what conventions to follow, and *when* to use each tool. This is the agent's identity, behavioral constraints, and domain expertise encoded as text.

## 3. Tools

Functions the agent can call. The agent doesn't *execute* code — it emits a structured request ("call Tool X with arguments Y"), the runtime executes it, and hands the agent the result. Tools are the bridge between language and action. They can span file I/O, shell commands, search, APIs, analysis, delegation, and any external system.

## 4. The Loop

This is the core. Every turn:

1. Receive the user's message + context
2. Reason about what to do
3. Either respond with text OR call one or more tools
4. If tools were called, receive results, reason again
5. Repeat until the agent has a complete answer

The loop is what makes an agent an *agent* rather than a chatbot. A chatbot responds once. An agent iterates — gathering data, checking its work, calling more tools — until the task is done.

## 5. Context Management

Everything the agent knows comes through the context window. Instruction files, user state, environment info, prior messages in the conversation, and all tool results. If it's not in the window, the agent doesn't know it.

Context management is the art of deciding what stays in the window and what gets evicted when the window fills up. Strategies include:

- **Threshold-based clearing** — remove oldest tool results when token count exceeds a limit
- **Summarization** — compress earlier results into summaries
- **Scratchpad** — maintain a structured record of all work done, separate from the conversation

## 6. Skills

Loadable instruction sets for specific tasks. Skills are not tools — they are *workflows* that compose multiple tools into a structured process. They are injected on demand, not loaded all at once.

A skill is typically defined as a markdown file with a name, description, and step-by-step instructions the agent follows. Examples: DCF valuation, code review, data migration.

## 7. Delegation

The agent can spawn sub-agents to handle specialized work. This is the multi-agent pattern — a coordinator agent that routes tasks to specialized agents, each with their own tools and instructions.

Delegation can take several forms:

- **Sub-agents** — spawn a new agent instance for a focused task, receive a summary when it completes
- **Inner LLM calls** — use a lighter/cheaper model for routing or classification decisions within a tool
- **Handoff** — transfer the full conversation to a new thread or agent when context is exhausted

## 8. Memory

Within a single conversation, the agent has full history. Across conversations, memory is the gap that separates a useful tool from an intelligent assistant.

Memory has three layers:

- **Conversation history** — messages within the current session
- **Working memory** — scratchpad-like state the agent maintains during a task (tool results, intermediate reasoning)
- **Long-term memory** — persistent knowledge that accumulates across sessions: user preferences, learned patterns, domain knowledge that transfers across interactions

Most agents today only have the first two. The third — true learning across sessions — is the frontier. This is what separates an agent that is equally capable on day 1 and day 1000 from one that actually gets smarter over time.

---

## The Key Insight

All agentic applications are structurally identical. Same pattern, different tools. The architecture is universal — it's the **tools** and **domain knowledge** that make each agent unique.

- Swap file/shell/search tools for financial data tools → financial research agent
- Swap for email/calendar/browser tools → personal assistant (OpenClaw)
- Swap for code editing/testing/deployment tools → coding agent (Claude Code, Amp)

The agent loop, context management, and memory patterns are commodity infrastructure. The differentiation is in what tools you give the agent, what domain knowledge you encode in the system prompt and skills, and how effectively the agent learns and remembers across sessions.

---

## Framework Comparison (TypeScript)

| Concern | Build Yourself | Mastra | Vercel AI SDK |
|---|---|---|---|
| Agent loop | Manual while loop | Built-in Agent class | ToolLoopAgent |
| Tools | Custom schemas | Unified tool API | Zod-based tools |
| Memory | Custom implementation | Conversation + working + semantic | Not built-in |
| Multi-agent | Custom delegation | Agent networks, sub-agents | Sub-agents |
| Workflows | Custom orchestration | Graph-based state machines | Workflow patterns |
| Streaming | Custom SSE | Built-in | Native streaming |
| Observability | Custom logging | OpenTelemetry tracing | DevTools |
| RAG / Knowledge | Custom vector search | Unified vector store API | Not built-in |

---

*Document created: 2026-02-10*
*Context: Architectural analysis during Dexter/AlphaSentry codebase review*
