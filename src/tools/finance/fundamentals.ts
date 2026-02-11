import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch financial statements for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly', 'ttm'])
    .describe(
      "The reporting period for the financial statements. 'annual' for yearly, 'quarterly' for quarterly, and 'ttm' for trailing twelve months."
    ),
  limit: z
    .number()
    .default(10)
    .describe(
      'Maximum number of report periods to return (default: 10). Returns the most recent N periods based on the period type.'
    ),
  report_period_gt: z
    .string()
    .optional()
    .describe('Filter for financial statements with report periods after this date (YYYY-MM-DD).'),
  report_period_gte: z
    .string()
    .optional()
    .describe(
      'Filter for financial statements with report periods on or after this date (YYYY-MM-DD).'
    ),
  report_period_lt: z
    .string()
    .optional()
    .describe('Filter for financial statements with report periods before this date (YYYY-MM-DD).'),
  report_period_lte: z
    .string()
    .optional()
    .describe(
      'Filter for financial statements with report periods on or before this date (YYYY-MM-DD).'
    ),
});

function createParams(input: z.infer<typeof FinancialStatementsInputSchema>): Record<string, string | number | undefined> {
  return {
    ticker: input.ticker,
    period: input.period,
    limit: input.limit,
    report_period_gt: input.report_period_gt,
    report_period_gte: input.report_period_gte,
    report_period_lt: input.report_period_lt,
    report_period_lte: input.report_period_lte,
  };
}

export const getIncomeStatements = createTool({
  id: 'get_income_statements',
  description: `Fetches a company's income statements, detailing its revenues, expenses, net income, etc. over a reporting period. Useful for evaluating a company's profitability and operational efficiency.`,
  inputSchema: FinancialStatementsInputSchema,
  execute: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/financials/income-statements/', params);
    return formatToolResult(data.income_statements || {}, [url]);
  },
});

export const getBalanceSheets = createTool({
  id: 'get_balance_sheets',
  description: `Retrieves a company's balance sheets, providing a snapshot of its assets, liabilities, shareholders' equity, etc. at a specific point in time. Useful for assessing a company's financial position.`,
  inputSchema: FinancialStatementsInputSchema,
  execute: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/financials/balance-sheets/', params);
    return formatToolResult(data.balance_sheets || {}, [url]);
  },
});

export const getCashFlowStatements = createTool({
  id: 'get_cash_flow_statements',
  description: `Retrieves a company's cash flow statements, showing how cash is generated and used across operating, investing, and financing activities. Useful for understanding a company's liquidity and solvency.`,
  inputSchema: FinancialStatementsInputSchema,
  execute: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/financials/cash-flow-statements/', params);
    return formatToolResult(data.cash_flow_statements || {}, [url]);
  },
});

export const getAllFinancialStatements = createTool({
  id: 'get_all_financial_statements',
  description: `Retrieves all three financial statements (income statements, balance sheets, and cash flow statements) for a company in a single API call. This is more efficient than calling each statement type separately when you need all three for comprehensive financial analysis.`,
  inputSchema: FinancialStatementsInputSchema,
  execute: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/financials/', params);
    return formatToolResult(data.financials || {}, [url]);
  },
});
