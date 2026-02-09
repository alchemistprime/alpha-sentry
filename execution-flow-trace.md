## Execution Flow: "How is the company Carvana doing?"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER INPUT: "How is the company Carvana doing?"                            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. src/index.tsx:12                                                        │
│     Entry point - renders <CLI /> component via Ink                         │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. src/cli.tsx:81-107                                                      │
│     handleSubmit() - receives query, calls runQuery(query)                  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. src/hooks/useAgentRunner.ts:131-201                                     │
│     runQuery() - creates Agent, starts streaming loop                       │
│     • Creates AbortController                                               │
│     • Adds query to UI history                                              │
│     • Saves to InMemoryChatHistory                                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. src/agent/agent.ts:44-49                                                │
│     Agent.create() - builds the agent                                       │
│     • getTools(model) → loads tool instances                                │
│     • buildSystemPrompt(model) → creates system prompt                      │
└───────────────┬─────────────────────────────────────────┬───────────────────┘
                ▼                                         ▼
┌───────────────────────────────────┐   ┌─────────────────────────────────────┐
│  4a. src/tools/registry.ts:70-72  │   │  4b. src/agent/prompts.ts:100-160   │
│  getTools() - returns:            │   │  buildSystemPrompt() - creates      │
│  • financial_search               │   │  system prompt with:                │
│  • web_search (if API key)        │   │  • Date context                     │
│  • skill (if skills exist)        │   │  • Tool descriptions                │
└───────────────────────────────────┘   │  • Usage policies                   │
                                        │  • Response format rules            │
                                        └─────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. src/hooks/useAgentRunner.ts:162-163                                     │
│     agent.run(query, chatHistory) - starts async generator                  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. src/agent/agent.ts:55-136                                               │
│     *run() - main agent loop (async generator)                              │
│     • Creates Scratchpad for this query                                     │
│     • Builds initial prompt with chat history                               │
│     • Enters iteration loop (max 10)                                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  7. src/agent/scratchpad.ts:42-65                                           │
│     new Scratchpad(query) - creates append-only log                         │
│     • Creates .dexter/scratchpad/{timestamp}_{hash}.jsonl                   │
│     • Writes init entry with original query                                 │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  8. src/agent/agent.ts:73                                                   │
│     callModel(currentPrompt) - first LLM call                               │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  9. src/model/llm.ts:114-144                                                │
│     callLlm() - orchestrates LLM call                                       │
│     • Creates ChatPromptTemplate (system + user)                            │
│     • getChatModel() → instantiates provider (OpenAI, Anthropic, etc.)      │
│     • Binds tools to model                                                  │
│     • Invokes chain with retry logic                                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  10. LLM RESPONSE                                                           │
│      LLM returns AIMessage with tool_calls:                                 │
│      [{ name: "financial_search",                                           │
│         args: { query: "Carvana company performance metrics" } }]           │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  11. src/utils/ai-message.ts:24-26                                          │
│      hasToolCalls() → returns true                                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  12. src/agent/agent.ts:107-114                                             │
│      executeToolCalls() - iterates through tool calls                       │
│      yields: { type: 'tool_start', tool: 'financial_search', args: {...} }  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  13. src/agent/agent.ts:217-222                                             │
│      tool.invoke(toolArgs) - executes financial_search                      │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  14. src/tools/finance/financial-search.ts:110-181                          │
│      financial_search.func() - LLM-powered router                           │
│      • Calls inner LLM with buildRouterPrompt()                             │
│      • LLM decides which finance tools to call                              │
│      • For "how is Carvana doing" might select:                             │
│        - get_price_snapshot (current price)                                 │
│        - get_financial_metrics_snapshot (P/E, market cap)                   │
│        - get_income_statements (revenue trends)                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  15. src/tools/finance/financial-search.ts:125-152                          │
│      Promise.all() - executes selected tools in parallel                    │
└────────┬────────────────────────────┬───────────────────────────┬───────────┘
         ▼                            ▼                           ▼
┌────────────────────┐  ┌─────────────────────────┐  ┌────────────────────────┐
│ 15a. prices.ts:18  │  │ 15b. metrics.ts         │  │ 15c. fundamentals.ts   │
│ getPriceSnapshot   │  │ getFinancialMetrics     │  │ getIncomeStatements    │
│ .func()            │  │ Snapshot.func()         │  │ .func()                │
└────────┬───────────┘  └────────────┬────────────┘  └───────────┬────────────┘
         ▼                           ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  16. src/tools/finance/api.ts:8-39                                          │
│      callApi(endpoint, params) - HTTP request to Financial Datasets API     │
│      • Builds URL: https://api.financialdatasets.ai/prices/snapshot/        │
│      • Adds x-api-key header                                                │
│      • Returns { data, url }                                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  17. EXTERNAL API RESPONSE                                                  │
│      Financial Datasets API returns JSON data for CVNA                      │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  18. src/tools/types.ts:6-12                                                │
│      formatToolResult(data, sourceUrls) - wraps response                    │
│      Returns: { data: {...}, sourceUrls: [...] }                            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  19. src/agent/agent.ts:226                                                 │
│      yields: { type: 'tool_end', tool: 'financial_search', result, duration}│
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  20. src/agent/agent.ts:157-171                                             │
│      summarizeToolResult() - compresses result for next iteration           │
│      • Uses fast model (e.g., gpt-4.1 instead of gpt-5.2)                   │
│      • buildToolSummaryPrompt() from prompts.ts:210-226                     │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  21. src/agent/scratchpad.ts:71-85                                          │
│      addToolResult(toolName, args, result, llmSummary)                      │
│      • Appends to JSONL file for durability                                 │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  22. src/agent/agent.ts:117                                                 │
│      buildIterationPrompt(query, scratchpad.getToolSummaries())             │
│      • If LLM needs more data → back to step 8 (loop)                       │
│      • If sufficient → proceeds to final answer                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  23. src/agent/agent.ts:83 (no more tool calls)                             │
│      LLM responds without tool_calls → ready for final answer               │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  24. src/agent/agent.ts:93-103                                              │
│      Final answer generation                                                │
│      • buildFullContextForAnswer(scratchpad) → gets FULL data               │
│      • buildFinalAnswerPrompt(query, fullContext)                           │
│      • yields: { type: 'answer_start' }                                     │
│      • callModel(finalPrompt, false) → no tools, just answer                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  25. src/agent/agent.ts:102                                                 │
│      yields: { type: 'done', answer: "...", toolCalls: [...], iterations }  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  26. src/hooks/useAgentRunner.ts:164-170                                    │
│      for await (const event of stream) - processes events                   │
│      handleEvent(event) → updates React state                               │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  27. src/cli.tsx:190-192                                                    │
│      React re-renders with updated history                                  │
│      <HistoryItemView /> displays answer to user                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary: Files Touched (in order)

| Step | File | Function/Line |
|------|------|---------------|
| 1 | `src/index.tsx` | Entry, renders CLI |
| 2 | `src/cli.tsx` | `handleSubmit()` |
| 3 | `src/hooks/useAgentRunner.ts` | `runQuery()` |
| 4 | `src/agent/agent.ts` | `Agent.create()` |
| 4a | `src/tools/registry.ts` | `getTools()` |
| 4b | `src/agent/prompts.ts` | `buildSystemPrompt()` |
| 5-6 | `src/agent/agent.ts` | `*run()` generator |
| 7 | `src/agent/scratchpad.ts` | `new Scratchpad()` |
| 8-9 | `src/model/llm.ts` | `callLlm()` |
| 10-11 | `src/utils/ai-message.ts` | `hasToolCalls()` |
| 12-13 | `src/agent/agent.ts` | `executeToolCalls()` |
| 14-15 | `src/tools/finance/financial-search.ts` | Router + parallel execution |
| 15a-c | `src/tools/finance/prices.ts`, `metrics.ts`, `fundamentals.ts` | Individual tools |
| 16 | `src/tools/finance/api.ts` | `callApi()` → HTTP |
| 17 | **External** | Financial Datasets API |
| 18 | `src/tools/types.ts` | `formatToolResult()` |
| 20 | `src/agent/prompts.ts` | `buildToolSummaryPrompt()` |
| 21 | `src/agent/scratchpad.ts` | `addToolResult()` |
| 22 | `src/agent/prompts.ts` | `buildIterationPrompt()` |
| 24 | `src/agent/prompts.ts` | `buildFinalAnswerPrompt()` |
| 26 | `src/hooks/useAgentRunner.ts` | Event handling |
| 27 | `src/cli.tsx` | UI render |
