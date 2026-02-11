import 'dotenv/config';
import { financialSearch } from './tools/financial-search.js';
import { financialMetrics } from './tools/financial-metrics.js';
import { readFilings } from './tools/read-filings.js';

interface TestResult {
  name: string;
  query: string;
  passed: boolean;
  summary: string;
  routedTo: string[];
  sourceUrls: string[];
  duration: number;
  raw?: unknown;
}

async function runMetaTool(
  name: string,
  query: string,
  tool: { execute: (input: { query: string }, ctx: unknown) => Promise<unknown> },
): Promise<TestResult> {
  const start = Date.now();
  try {
    const raw = await tool.execute({ query }, {});
    const duration = Date.now() - start;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const data = parsed?.data;
    const sourceUrls: string[] = parsed?.sourceUrls || [];

    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return {
        name,
        query,
        passed: false,
        summary: '⚠️  Returned but data is empty',
        routedTo: [],
        sourceUrls,
        duration,
        raw: parsed,
      };
    }

    if (data?.error) {
      return {
        name,
        query,
        passed: false,
        summary: `❌ Error: ${data.error}`,
        routedTo: [],
        sourceUrls,
        duration,
        raw: parsed,
      };
    }

    const routedTo = Object.keys(data).filter(k => k !== '_errors');
    const fieldCounts = routedTo.map(k => {
      const val = data[k];
      if (Array.isArray(val)) return `${k}: ${val.length} items`;
      if (val && typeof val === 'object') return `${k}: ${Object.keys(val).length} fields`;
      return k;
    });

    return {
      name,
      query,
      passed: true,
      summary: `✅ Routed → [${routedTo.join(', ')}]  (${fieldCounts.join('; ')})`,
      routedTo,
      sourceUrls,
      duration,
      raw: parsed,
    };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      name,
      query,
      passed: false,
      summary: `❌ ${err instanceof Error ? err.message : String(err)}`,
      routedTo: [],
      sourceUrls: [],
      duration,
    };
  }
}

console.log('🔬 Live Meta-Tool Integration Test — Mastra Sub-Agent Routing\n');
console.log('Tests LLM routing + real API calls through financial_search, financial_metrics, and read_filings.\n');

const results: TestResult[] = [];

console.log('━'.repeat(70));
console.log('  financial_search — broad financial data routing');
console.log('━'.repeat(70));

const searchTests = [
  { query: "What is Apple's current stock price?", expect: 'price snapshot' },
  { query: "Show me TSLA insider trades", expect: 'insider trades' },
  { query: "Get Bitcoin price", expect: 'crypto price' },
  { query: "Latest news about NVDA", expect: 'news' },
];

for (const t of searchTests) {
  process.stdout.write(`  ⏳ "${t.query}" (expects ${t.expect})...`);
  const r = await runMetaTool('financial_search', t.query, financialSearch);
  results.push(r);
  console.log(`\r  ${r.passed ? '✅' : '❌'} "${t.query}" → ${r.routedTo.join(', ') || 'none'} (${(r.duration / 1000).toFixed(1)}s)`);
}

console.log('\n' + '━'.repeat(70));
console.log('  financial_metrics — fundamental analysis routing');
console.log('━'.repeat(70));

const metricsTests = [
  { query: "What is AAPL's current P/E ratio?", expect: 'key ratios snapshot' },
  { query: "Show me Microsoft's revenue for the last 3 years", expect: 'income statements' },
];

for (const t of metricsTests) {
  process.stdout.write(`  ⏳ "${t.query}" (expects ${t.expect})...`);
  const r = await runMetaTool('financial_metrics', t.query, financialMetrics);
  results.push(r);
  console.log(`\r  ${r.passed ? '✅' : '❌'} "${t.query}" → ${r.routedTo.join(', ') || 'none'} (${(r.duration / 1000).toFixed(1)}s)`);
}

console.log('\n' + '━'.repeat(70));
console.log('  read_filings — two-step SEC filing retrieval');
console.log('━'.repeat(70));

const filingsTests = [
  { query: "Read the risk factors from Apple's latest 10-K filing", expect: '10-K items' },
];

for (const t of filingsTests) {
  process.stdout.write(`  ⏳ "${t.query}" (expects ${t.expect})...`);
  const r = await runMetaTool('read_filings', t.query, readFilings);
  results.push(r);
  console.log(`\r  ${r.passed ? '✅' : '❌'} "${t.query}" → ${r.routedTo.join(', ') || 'none'} (${(r.duration / 1000).toFixed(1)}s)`);
}

console.log('\n' + '═'.repeat(70));
console.log('  RESULTS');
console.log('═'.repeat(70));

for (const r of results) {
  console.log(`\n  ${r.summary}`);
  console.log(`  Tool: ${r.name} | Query: "${r.query}" | ${(r.duration / 1000).toFixed(1)}s`);
  if (r.sourceUrls.length > 0) {
    console.log(`  Sources: ${r.sourceUrls.slice(0, 3).join(', ')}${r.sourceUrls.length > 3 ? ` (+${r.sourceUrls.length - 3} more)` : ''}`);
  }
}

const passed = results.filter(r => r.passed).length;
const total = results.length;
const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

console.log(`\n${'═'.repeat(70)}`);
console.log(`  ${passed}/${total} meta-tool queries returned live data. Total: ${(totalTime / 1000).toFixed(1)}s`);

if (passed < total) {
  console.log('\n  Failed queries:');
  for (const r of results.filter(r => !r.passed)) {
    console.log(`    - ${r.name}: "${r.query}" → ${r.summary}`);
  }
  process.exit(1);
}
