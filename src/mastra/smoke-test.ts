import { mastra } from './index.js';

const agent = mastra.getAgent('alpha-sentry');
console.log(`Agent "${agent.name}" loaded successfully.`);
console.log(`Model: ${process.env.DEXTER_MODEL_PROVIDER || 'openai'}/${process.env.DEXTER_MODEL || 'gpt-5.2'}`);

console.log('\nSending test query...');
const response = await agent.generate('What is a P/E ratio? Answer in one sentence.');
console.log(`\nResponse: ${response.text}`);
console.log('\nSmoke test passed.');
