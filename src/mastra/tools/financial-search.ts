import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../tools/types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getPriceSnapshot, getPrices } from '../../tools/finance/prices.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from '../../tools/finance/fundamentals.js';
import { getKeyRatiosSnapshot, getKeyRatios } from '../../tools/finance/key-ratios.js';
import { getNews } from '../../tools/finance/news.js';
import { getAnalystEstimates } from '../../tools/finance/estimates.js';
import { getSegmentedRevenues } from '../../tools/finance/segments.js';
import { getCryptoPriceSnapshot, getCryptoPrices, getCryptoTickers } from '../../tools/finance/crypto.js';
import { getInsiderTrades } from '../../tools/finance/insider_trades.js';
import { getCompanyFacts } from '../../tools/finance/company_facts.js';

const financeTools = {
  getPriceSnapshot,
  getPrices,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatiosSnapshot,
  getKeyRatios,
  getNews,
  getAnalystEstimates,
  getSegmentedRevenues,
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  getInsiderTrades,
  getCompanyFacts,
};

function buildRouterPrompt(): string {
  return `You are a financial data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate financial tool(s).

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA

2. **Date Inference**: Convert relative dates to YYYY-MM-DD format:
   - "last year" → start_date 1 year ago, end_date today
   - "last quarter" → start_date 3 months ago, end_date today
   - "past 5 years" → start_date 5 years ago, end_date today
   - "YTD" → start_date Jan 1 of current year, end_date today

3. **Tool Selection**:
   - For "current" or "latest" data, use snapshot tools (get_price_snapshot, get_key_ratios_snapshot)
   - For "historical" or "over time" data, use date-range tools
   - For P/E ratio, market cap, valuation metrics → get_key_ratios_snapshot
   - For revenue, earnings, profitability → get_income_statements
   - For debt, assets, equity → get_balance_sheets
   - For cash flow, free cash flow → get_cash_flow_statements
   - For comprehensive analysis → get_all_financial_statements

4. **Efficiency**:
   - Prefer specific tools over general ones when possible
   - Use get_all_financial_statements only when multiple statement types needed
   - For comparisons between companies, call the same tool for each ticker

Call the appropriate tool(s) now.`;
}

function resolveMastraModel(): string {
  const provider = process.env.DEXTER_MODEL_PROVIDER?.trim() || 'openai';
  const model = process.env.DEXTER_MODEL?.trim() || 'gpt-5.2';
  if (model.includes('/')) return model;
  return `${provider}/${model}`;
}

const financialRouter = new Agent({
  id: 'financial-router',
  name: 'Financial Router',
  instructions: buildRouterPrompt(),
  model: resolveMastraModel(),
  tools: financeTools,
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

export const financialSearch = createTool({
  id: 'financial_search',
  description: `Intelligent agentic search for financial data. Takes a natural language query and automatically routes to appropriate financial data tools. Use for:
- Stock prices (current or historical)
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics (P/E ratio, market cap, EPS, dividend yield)
- Analyst estimates and price targets
- Company news
- Insider trading activity
- Cryptocurrency prices`,
  inputSchema: z.object({
    query: z.string().describe('Natural language query about financial data'),
  }),
  execute: async ({ query }) => {
    const result = await financialRouter.generate(query, { maxSteps: 3 });

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
