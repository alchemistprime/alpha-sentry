import 'dotenv/config';
import { getPriceSnapshot, getPrices } from '../tools/finance/prices.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements } from '../tools/finance/fundamentals.js';
import { getKeyRatiosSnapshot, getKeyRatios } from '../tools/finance/key-ratios.js';
import { getFilings } from '../tools/finance/filings.js';
import { getAnalystEstimates } from '../tools/finance/estimates.js';
import { getSegmentedRevenues } from '../tools/finance/segments.js';
import { getInsiderTrades } from '../tools/finance/insider_trades.js';
import { getCompanyFacts } from '../tools/finance/company_facts.js';
import { getCryptoPriceSnapshot } from '../tools/finance/crypto.js';
import { getNews } from '../tools/finance/news.js';

interface TestResult {
  tool: string;
  passed: boolean;
  summary: string;
  raw?: unknown;
}

async function runTool(name: string, fn: () => Promise<unknown>): Promise<TestResult> {
  try {
    const raw = await fn();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (parsed?.data && Object.keys(parsed.data).length > 0) {
      return { tool: name, passed: true, summary: `✅ Got data with ${Object.keys(parsed.data).length} fields`, raw: parsed };
    }
    if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
      return { tool: name, passed: true, summary: `✅ Got ${parsed.data.length} results`, raw: parsed };
    }
    return { tool: name, passed: false, summary: `⚠️  Returned but data is empty`, raw: parsed };
  } catch (err) {
    return { tool: name, passed: false, summary: `❌ ${err instanceof Error ? err.message : String(err)}` };
  }
}

console.log('🔬 Live API Integration Test — Ported Mastra Tools\n');
console.log('Ticker: AAPL\n');

const results = await Promise.all([
  runTool('get_price_snapshot', () => getPriceSnapshot.execute({ ticker: 'AAPL' })),
  runTool('get_prices', () => getPrices.execute({ ticker: 'AAPL', interval: 'day', interval_multiplier: 1, start_date: '2026-02-03', end_date: '2026-02-07' })),
  runTool('get_income_statements', () => getIncomeStatements.execute({ ticker: 'AAPL', period: 'annual', limit: 2 })),
  runTool('get_balance_sheets', () => getBalanceSheets.execute({ ticker: 'AAPL', period: 'annual', limit: 2 })),
  runTool('get_cash_flow_statements', () => getCashFlowStatements.execute({ ticker: 'AAPL', period: 'annual', limit: 2 })),
  runTool('get_key_ratios_snapshot', () => getKeyRatiosSnapshot.execute({ ticker: 'AAPL' })),
  runTool('get_key_ratios', () => getKeyRatios.execute({ ticker: 'AAPL', period: 'ttm', limit: 2 })),
  runTool('get_filings', () => getFilings.execute({ ticker: 'AAPL', filing_type: '10-K', limit: 2 })),
  runTool('get_analyst_estimates', () => getAnalystEstimates.execute({ ticker: 'AAPL', period: 'annual' })),
  runTool('get_segmented_revenues', () => getSegmentedRevenues.execute({ ticker: 'AAPL', period: 'annual', limit: 2 })),
  runTool('get_insider_trades', () => getInsiderTrades.execute({ ticker: 'AAPL', limit: 3 })),
  runTool('get_company_facts', () => getCompanyFacts.execute({ ticker: 'AAPL' })),
  runTool('get_crypto_price_snapshot', () => getCryptoPriceSnapshot.execute({ ticker: 'BTC-USD' })),
  runTool('get_news', () => getNews.execute({ ticker: 'AAPL', limit: 3 })),
]);

for (const r of results) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${r.summary}  →  ${r.tool}`);
  console.log('─'.repeat(60));
  if (r.raw) {
    console.log(JSON.stringify(r.raw, null, 2));
  }
}

const passed = results.filter(r => r.passed).length;
const total = results.length;
console.log(`\n${'═'.repeat(60)}`);
console.log(`${passed}/${total} tools returned live data.`);

if (passed < total) {
  process.exit(1);
}
