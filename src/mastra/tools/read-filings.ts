import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../tools/types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getFilings, get10KFilingItems, get10QFilingItems, get8KFilingItems, getFilingItemTypes, type FilingItemTypes } from '../../tools/finance/filings.js';

const step1Tools = { getFilings };
const step2Tools = { get10KFilingItems, get10QFilingItems, get8KFilingItems };

function buildStep1Prompt(): string {
  return `You are a SEC filings routing assistant.
Current date: ${getCurrentDate()}

Given a user query about SEC filings, call get_filings to fetch available filings.

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA

2. **Filing Type Inference**:
   - Risk factors, business description, annual data → 10-K
   - Quarterly results, recent performance → 10-Q
   - Material events, acquisitions, earnings announcements → 8-K
   - If unclear, omit filing_type to get recent filings of any type

3. **Limit**: Default to 3 filings unless query specifies otherwise

Call get_filings now with appropriate parameters.`;
}

function buildStep2Prompt(
  originalQuery: string,
  filingsData: unknown,
  itemTypes: FilingItemTypes,
): string {
  const format10K = itemTypes['10-K'].map(i => `${i.name} (${i.title})`).join(', ');
  const format10Q = itemTypes['10-Q'].map(i => `${i.name} (${i.title})`).join(', ');

  return `You are a SEC filings content retrieval assistant.
Current date: ${getCurrentDate()}

Original user query: "${originalQuery}"

Available filings:
${JSON.stringify(filingsData, null, 2)}

## Valid Item Names

**10-K items:** ${format10K}

**10-Q items:** ${format10Q}

## Guidelines

1. Select the most relevant filing(s) based on the original query
2. Maximum 3 filings to read
3. **Always specify items** when the query targets specific sections - don't fetch entire filings unnecessarily:
   - Risk factors → items: ["Item-1A"]
   - Business description → items: ["Item-1"]
   - MD&A → items: ["Item-7"] (10-K) or ["Part-1,Item-2"] (10-Q)
   - Financial statements → items: ["Item-8"] (10-K) or ["Part-1,Item-1"] (10-Q)
4. If the query is broad or unclear, omit items to get the full filing
5. Call the appropriate items tool based on filing_type:
   - 10-K filings → get_10K_filing_items
   - 10-Q filings → get_10Q_filing_items
   - 8-K filings → get_8K_filing_items

Call the appropriate filing items tool(s) now.`;
}

function resolveMastraModel(): string {
  const provider = process.env.DEXTER_MODEL_PROVIDER?.trim() || 'openai';
  const model = process.env.DEXTER_MODEL?.trim() || 'gpt-5.2';
  if (model.includes('/')) return model;
  return `${provider}/${model}`;
}

export const readFilings = createTool({
  id: 'read_filings',
  description: `Intelligent tool for reading SEC filing content. Takes a natural language query and retrieves full text from 10-K, 10-Q, or 8-K filings. Use for:
- Reading annual reports (10-K): business description, risk factors, MD&A
- Reading quarterly reports (10-Q): quarterly financials, MD&A
- Reading current reports (8-K): material events, acquisitions, earnings`,
  inputSchema: z.object({
    query: z.string().describe('Natural language query about SEC filing content to read'),
  }),
  execute: async ({ query }) => {
    const step1Agent = new Agent({
      id: 'filings-step1',
      name: 'Filings Step 1',
      instructions: buildStep1Prompt(),
      model: resolveMastraModel(),
      tools: step1Tools,
    });

    const step1Result = await step1Agent.generate(query, { maxSteps: 2 });

    const filingsResults = step1Result.steps
      .flatMap((s: { toolResults: Array<{ payload: { toolName: string; result: unknown } }> }) => s.toolResults)
      .filter((tr: { payload: { toolName: string } }) =>
        tr.payload.toolName === 'getFilings' || tr.payload.toolName === 'get_filings',
      );

    if (filingsResults.length === 0) {
      return formatToolResult({ error: 'Failed to parse query for filings' }, []);
    }

    let filingsData: { data?: unknown[]; sourceUrls?: string[] };
    try {
      const raw = filingsResults[0].payload.result;
      filingsData = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof filingsData);
    } catch {
      return formatToolResult({ error: 'Failed to parse filings result' }, []);
    }

    if (!filingsData.data || !Array.isArray(filingsData.data) || filingsData.data.length === 0) {
      return formatToolResult({ error: 'No filings found' }, filingsData.sourceUrls || []);
    }

    const itemTypes = await getFilingItemTypes();

    const step2Agent = new Agent({
      id: 'filings-step2',
      name: 'Filings Step 2',
      instructions: buildStep2Prompt(query, filingsData.data, itemTypes),
      model: resolveMastraModel(),
      tools: step2Tools,
    });

    const step2Result = await step2Agent.generate(query, { maxSteps: 3 });

    const allToolResults = step2Result.steps.flatMap(
      (s: { toolResults: Array<{ payload: { toolName: string; result: unknown; args?: unknown } }> }) => s.toolResults,
    );

    if (allToolResults.length === 0) {
      return formatToolResult(
        { error: 'Failed to select filings to read', availableFilings: filingsData.data },
        filingsData.sourceUrls || [],
      );
    }

    const combinedData: Record<string, unknown> = {};
    const allUrls: string[] = [...(filingsData.sourceUrls || [])];

    for (const tr of allToolResults) {
      const { result, args } = tr.payload;
      let parsed: { data?: unknown; sourceUrls?: string[] };
      try {
        parsed = typeof result === 'string' ? JSON.parse(result) : (result as typeof parsed);
      } catch {
        parsed = { data: result };
      }

      const accession = (args as Record<string, unknown> | undefined)?.accession_number as string | undefined;
      const key = accession || tr.payload.toolName;
      combinedData[key] = parsed.data ?? parsed;

      if (parsed.sourceUrls) {
        allUrls.push(...parsed.sourceUrls);
      }
    }

    return formatToolResult(combinedData, allUrls);
  },
});
