import 'dotenv/config';
import { mastra } from './index.js';

const agent = mastra.getAgent('alpha-sentry');
console.log(`Agent "${agent.name}" loaded successfully.`);
console.log(`Model: ${process.env.DEXTER_MODEL_PROVIDER || 'openai'}/${process.env.DEXTER_MODEL || 'gpt-5.2'}`);

const query = process.argv[2] || "What is Apple's current stock price?";
console.log(`\nQuery: "${query}"`);
console.log('Streaming...\n');

const stream = await agent.stream(query, { maxSteps: 10 });

for await (const chunk of stream.fullStream) {
  if (chunk.type === 'tool-call') {
    const p = chunk.payload as { toolName?: string; args?: unknown };
    console.log(`🔧 Tool call: ${p.toolName} ${JSON.stringify(p.args)}`);
  } else if (chunk.type === 'tool-result') {
    const p = chunk.payload as { toolName?: string; result?: unknown };
    const resultStr = typeof p.result === 'string' ? p.result : JSON.stringify(p.result);
    console.log(`✅ Tool result: ${p.toolName} (${resultStr.length} chars)`);
  } else if (chunk.type === 'text-delta') {
    const p = chunk.payload as { text?: string; textDelta?: string };
    process.stdout.write(p.text ?? p.textDelta ?? '');
  }
}

const text = await stream.text;
const usage = await stream.usage;
const steps = await stream.steps;

console.log('\n');
console.log(`Steps: ${steps.length}`);
console.log(`Tokens: ${usage?.inputTokens ?? '?'} in / ${usage?.outputTokens ?? '?'} out`);
console.log('Smoke test passed.');
