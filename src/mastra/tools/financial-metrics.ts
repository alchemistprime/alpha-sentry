import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../tools/types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from '../../tools/finance/fundamentals.js';
import { getKeyRatiosSnapshot, getKeyRatios } from '../../tools/finance/key-ratios.js';

const metricsTools = {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatiosSnapshot,
  getKeyRatios,
};

function buildRouterPrompt(): string {
  return `You are a fundamental analysis routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial statements or metrics, call the appropriate tool(s).

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA

2. **Date Inference**: Convert relative dates to YYYY-MM-DD format:
   - "last year" → report_period_gte 1 year ago
   - "last quarter" → report_period_gte 3 months ago
   - "past 5 years" → report_period_gte 5 years ago, limit 5 (for annual) or 20 (for quarterly)
   - "YTD" → report_period_gte Jan 1 of current year

3. **Tool Selection**:
   - For "current" or "latest" metrics → get_key_ratios_snapshot
   - For historical metrics over time → get_key_ratios
   - For revenue, earnings, profitability → get_income_statements
   - For debt, assets, equity, cash position → get_balance_sheets
   - For cash flow, free cash flow, operating cash → get_cash_flow_statements
   - For comprehensive analysis needing all three → get_all_financial_statements

4. **Period Selection**:
   - Default to "annual" for multi-year trend analysis
   - Use "quarterly" for recent performance or seasonal analysis
   - Use "ttm" (trailing twelve months) for current state metrics

5. **Efficiency**:
   - Prefer specific statement tools over get_all_financial_statements when possible
   - Use get_all_financial_statements when multiple statement types are needed
   - For comparisons between companies, call the same tool for each ticker

Call the appropriate tool(s) now.`;
}

function resolveMastraModel(): string {
  const provider = process.env.DEXTER_MODEL_PROVIDER?.trim() || 'openai';
  const model = process.env.DEXTER_MODEL?.trim() || 'gpt-5.2';
  if (model.includes('/')) return model;
  return `${provider}/${model}`;
}

const metricsRouter = new Agent({
  id: 'metrics-router',
  name: 'Metrics Router',
  instructions: buildRouterPrompt(),
  model: resolveMastraModel(),
  tools: metricsTools,
});

function combineStepResults(steps: Array<{ toolResults: Array<{ payload: { toolName: string; result: unknown; args?: unknown } }> }>): string {
  const combinedData: Record<string, unknown> = {};
  const allUrls: string[] = [];

  for (const step of steps) {
    for (const tr of step.toolResults) {
      const { toolName, result, args } = tr.payload;
      let parsed: { data?: unknown; sourceUrls?: string[] };
      try {
        parsed = typeof result === 'string' ? JSON.parse(result) : (result as { data?: unknown; sourceUrls?: string[] });
      } catch {
        parsed = { data: result };
      }

      const ticker = (args as Record<string, unknown> | undefined)?.ticker as string | undefined;
      const key = ticker ? `${toolName}_${ticker}` : toolName;
      combinedData[key] = parsed.data ?? parsed;

      if (parsed.sourceUrls) {
        allUrls.push(...parsed.sourceUrls);
      }
    }
  }

  return formatToolResult(combinedData, allUrls);
}

export const financialMetrics = createTool({
  id: 'financial_metrics',
  description: `Intelligent agentic search for fundamental analysis. Takes a natural language query and automatically routes to financial statements and key ratios tools. Use for:
- Income statements (revenue, gross profit, operating income, net income, EPS)
- Balance sheets (assets, liabilities, equity, debt, cash)
- Cash flow statements (operating, investing, financing activities, free cash flow)
- Key ratios (P/E, EV/EBITDA, ROE, ROA, margins, dividend yield)
- Multi-period trend analysis
- Multi-company fundamental comparisons`,
  inputSchema: z.object({
    query: z.string().describe('Natural language query about financial statements or metrics'),
  }),
  execute: async ({ query }) => {
    const result = await metricsRouter.generate(query, { maxSteps: 3 });

    if (!result.steps || result.steps.length === 0) {
      return formatToolResult({ error: 'No tools selected for query' }, []);
    }

    const stepsWithResults = result.steps.filter(
      (s: { toolResults: unknown[] }) => s.toolResults && s.toolResults.length > 0,
    );

    if (stepsWithResults.length === 0) {
      return formatToolResult({ error: 'No tools selected for query' }, []);
    }

    return combineStepResults(stepsWithResults);
  },
});
