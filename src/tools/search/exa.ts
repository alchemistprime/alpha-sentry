import { createTool } from '@mastra/core/tools';
import Exa from 'exa-js';
import { z } from 'zod';
import { formatToolResult, parseSearchResults } from '../types.js';
import { logger } from '@/utils';

let exaClient: Exa | null = null;

function getExaClient(): Exa {
  if (!exaClient) {
    exaClient = new Exa(process.env.EXASEARCH_API_KEY);
  }
  return exaClient;
}

export const exaSearch = createTool({
  id: 'web_search',
  description:
    'Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.',
  inputSchema: z.object({
    query: z.string().describe('The search query to look up on the web'),
  }),
  execute: async (input) => {
    try {
      const result = await getExaClient().searchAndContents(input.query, {
        text: true,
        numResults: 5,
      });
      const { parsed, urls } = parseSearchResults(result);
      return formatToolResult(parsed, urls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Exa API] error: ${message}`);
      throw new Error(`[Exa API] ${message}`);
    }
  },
});
