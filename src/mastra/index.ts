import { Mastra } from '@mastra/core';
import { alphaSentryAgent } from './agents/alpha-sentry.js';
import { storage } from './memory.js';

export const mastra = new Mastra({
  agents: {
    'alpha-sentry': alphaSentryAgent,
  },
  storage,
});

export { alphaSentryAgent, createAlphaSentryAgent } from './agents/alpha-sentry.js';
