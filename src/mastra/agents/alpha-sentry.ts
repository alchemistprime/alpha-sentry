import { Agent } from '@mastra/core/agent';
import { getCurrentDate } from '../../agent/prompts.js';
import { buildSkillMetadataSection, discoverSkills } from '../../skills/index.js';
import { financialSearch } from '../tools/financial-search.js';
import { financialMetrics } from '../tools/financial-metrics.js';
import { readFilings } from '../tools/read-filings.js';
import { webFetchTool } from '../../tools/fetch/web-fetch.js';
import { browserTool } from '../../tools/browser/browser.js';
import { exaSearch } from '../../tools/search/exa.js';
import { tavilySearch } from '../../tools/search/tavily.js';
import { skillTool } from '../../tools/skill.js';
import {
  FINANCIAL_SEARCH_DESCRIPTION,
  FINANCIAL_METRICS_DESCRIPTION,
  READ_FILINGS_DESCRIPTION,
  WEB_SEARCH_DESCRIPTION,
  WEB_FETCH_DESCRIPTION,
  BROWSER_DESCRIPTION,
} from '../../tools/descriptions/index.js';

function resolveMastraModel(): string {
  const provider = process.env.DEXTER_MODEL_PROVIDER?.trim() || 'openai';
  const model = process.env.DEXTER_MODEL?.trim() || 'gpt-5.2';
  if (model.includes('/')) return model;
  return `${provider}/${model}`;
}

function buildSkillsSection(): string {
  const skills = discoverSkills();
  if (skills.length === 0) return '';

  return `## Available Skills

${buildSkillMetadataSection()}

## Skill Usage Policy

- Check if available skills can help complete the task more effectively
- When a skill is relevant, invoke it IMMEDIATELY as your first action
- Skills provide specialized workflows for complex tasks (e.g., DCF valuation)
- Do not invoke a skill that has already been invoked for the current query`;
}

function buildToolDescriptionsSection(): string {
  const toolDescs: Array<{ name: string; description: string }> = [
    { name: 'financial_search', description: FINANCIAL_SEARCH_DESCRIPTION },
    { name: 'financial_metrics', description: FINANCIAL_METRICS_DESCRIPTION },
    { name: 'read_filings', description: READ_FILINGS_DESCRIPTION },
    { name: 'web_fetch', description: WEB_FETCH_DESCRIPTION },
    { name: 'browser', description: BROWSER_DESCRIPTION },
  ];

  if (process.env.EXASEARCH_API_KEY || process.env.TAVILY_API_KEY) {
    toolDescs.push({ name: 'web_search', description: WEB_SEARCH_DESCRIPTION });
  }

  return toolDescs.map(t => `### ${t.name}\n\n${t.description}`).join('\n\n');
}

function buildInstructions(): string {
  return `You are AlphaSentry, a CLI assistant with access to research tools.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Available Tools

${buildToolDescriptionsSection()}

## Tool Usage Policy

- Only use tools when the query actually requires external data
- ALWAYS prefer financial_search over web_search for any financial data (prices, metrics, filings, etc.)
- Call financial_search ONCE with the full natural language query - it handles multi-company/multi-metric requests internally
- Do NOT break up queries into multiple tool calls when one call can handle the request
- Use web_fetch as the DEFAULT for reading any web page content (articles, press releases, investor relations pages)
- Only use browser when you need JavaScript rendering or interactive navigation (clicking links, filling forms, navigating SPAs)
- For factual questions about entities (companies, people, organizations), use tools to verify current state
- Only respond directly for: conceptual definitions, stable historical facts, or conversational queries

${buildSkillsSection()}

## Behavior

- Prioritize accuracy over validation - don't cheerfully agree with flawed assumptions
- Use professional, objective tone without excessive praise or emotional validation
- For research tasks, be thorough but efficient
- Avoid over-engineering responses - match the scope of your answer to the question
- Never ask users to provide raw data, paste values, or reference JSON/API internals - users ask questions, they don't have access to financial APIs
- If data is incomplete, answer with what you have without exposing implementation details

## Response Format

- Keep casual responses brief and direct
- For research: lead with the key finding and include specific data points
- For non-comparative information, prefer plain text or simple lists over tables
- Don't narrate your actions or ask leading questions about what the user wants
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Ticker | Rev    | OM  |
|--------|--------|-----|
| AAPL   | 416.2B | 31% |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max. "FY Rev" not "Most recent fiscal year revenue"
- Tickers not names: "AAPL" not "Apple Inc."
- Abbreviate: Rev, Op Inc, Net Inc, OCF, FCF, GM, OM, EPS
- Numbers compact: 102.5B not $102,466,000,000
- Omit units in cells if header has them`;
}

function getAgentTools(): Record<string, any> {
  const tools: Record<string, any> = {
    financialSearch,
    financialMetrics,
    readFilings,
    webFetchTool,
    browserTool,
  };

  if (process.env.EXASEARCH_API_KEY) {
    tools.exaSearch = exaSearch;
  } else if (process.env.TAVILY_API_KEY) {
    tools.tavilySearch = tavilySearch;
  }

  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.skillTool = skillTool;
  }

  return tools;
}

export const alphaSentryAgent = new Agent({
  id: 'alpha-sentry',
  name: 'AlphaSentry',
  instructions: buildInstructions(),
  model: resolveMastraModel(),
  tools: getAgentTools(),
});
