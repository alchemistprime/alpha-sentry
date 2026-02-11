import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { formatToolResult, parseSearchResults } from '../types.js';
import { logger } from '../../utils/logger.js';

const TavilyInputSchema = z.object({
  query: z.string().describe('The search query to look up on the web'),
});

export const tavilySearch = createTool({
  id: 'web_search',
  description:
    'Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.',
  inputSchema: TavilyInputSchema,
  execute: async (input) => {
    try {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        throw new Error('TAVILY_API_KEY environment variable is not set');
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      const { parsed, urls } = parseSearchResults(result.results ?? result);
      return formatToolResult(parsed, urls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Tavily API] error: ${message}`);
      throw new Error(`[Tavily API] ${message}`);
    }
  },
});
