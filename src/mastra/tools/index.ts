import { getPriceSnapshot, getPrices } from '../../tools/finance/prices.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from '../../tools/finance/fundamentals.js';
import { getKeyRatiosSnapshot, getKeyRatios } from '../../tools/finance/key-ratios.js';
import { getFilings, get10KFilingItems, get10QFilingItems, get8KFilingItems } from '../../tools/finance/filings.js';
import { getAnalystEstimates } from '../../tools/finance/estimates.js';
import { getSegmentedRevenues } from '../../tools/finance/segments.js';
import { getInsiderTrades } from '../../tools/finance/insider_trades.js';
import { getCompanyFacts } from '../../tools/finance/company_facts.js';
import { getCryptoPriceSnapshot, getCryptoPrices, getCryptoTickers } from '../../tools/finance/crypto.js';
import { getNews } from '../../tools/finance/news.js';
import { exaSearch } from '../../tools/search/exa.js';
import { tavilySearch } from '../../tools/search/tavily.js';
import { browserTool } from '../../tools/browser/browser.js';
import { skillTool } from '../../tools/skill.js';

export const financeTools = {
  getPriceSnapshot,
  getPrices,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatiosSnapshot,
  getKeyRatios,
  getFilings,
  get10KFilingItems,
  get10QFilingItems,
  get8KFilingItems,
  getAnalystEstimates,
  getSegmentedRevenues,
  getInsiderTrades,
  getCompanyFacts,
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  getNews,
};

export const nonFinanceTools = {
  exaSearch,
  tavilySearch,
  browserTool,
  skillTool,
};

export const allLeafTools = {
  ...financeTools,
  ...nonFinanceTools,
};

export { financialSearch } from './financial-search.js';
export { financialMetrics } from './financial-metrics.js';
export { readFilings } from './read-filings.js';

import { financialSearch } from './financial-search.js';
import { financialMetrics } from './financial-metrics.js';
import { readFilings } from './read-filings.js';

export const allTools = {
  ...allLeafTools,
  financialSearch,
  financialMetrics,
  readFilings,
};
