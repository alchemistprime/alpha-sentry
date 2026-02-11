import { Agent } from '@mastra/core/agent';
import { DEFAULT_SYSTEM_PROMPT } from '../../agent/prompts.js';

function resolveMastraModel(): string {
  const provider = process.env.DEXTER_MODEL_PROVIDER?.trim() || 'openai';
  const model = process.env.DEXTER_MODEL?.trim() || 'gpt-5.2';

  if (model.includes('/')) return model;

  return `${provider}/${model}`;
}

export const alphaSentryAgent = new Agent({
  id: 'alpha-sentry',
  name: 'AlphaSentry',
  instructions: DEFAULT_SYSTEM_PROMPT,
  model: resolveMastraModel(),
});
