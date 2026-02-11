import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const PriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch the price snapshot for. For example, 'AAPL' for Apple."
    ),
});

export const getPriceSnapshot = createTool({
  id: 'get_price_snapshot',
  description: `Fetches the most recent price snapshot for a specific stock ticker, including the latest price, trading volume, and other open, high, low, and close price data.`,
  inputSchema: PriceSnapshotInputSchema,
  execute: async (input) => {
    const params = { ticker: input.ticker };
    const { data, url } = await callApi('/prices/snapshot/', params);
    return formatToolResult(data.snapshot || {}, [url]);
  },
});

const PricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch aggregated prices for. For example, 'AAPL' for Apple."
    ),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  interval_multiplier: z
    .number()
    .default(1)
    .describe('Multiplier for the interval. Defaults to 1.'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Must be in past. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Must be today or in the past. Required.'),
});

export const getPrices = createTool({
  id: 'get_prices',
  description: `Retrieves historical price data for a stock over a specified date range, including open, high, low, close prices, and volume.`,
  inputSchema: PricesInputSchema,
  execute: async (input) => {
    const params = {
      ticker: input.ticker,
      interval: input.interval,
      interval_multiplier: input.interval_multiplier,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const endDate = new Date(input.end_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, url } = await callApi('/prices/', params, { cacheable: endDate < today });
    return formatToolResult(data.prices || [], [url]);
  },
});
