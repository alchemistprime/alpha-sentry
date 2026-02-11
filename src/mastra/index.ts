import { Mastra } from '@mastra/core';
import { alphaSentryAgent } from './agents/alpha-sentry.js';

export const mastra = new Mastra({
  agents: {
    'alpha-sentry': alphaSentryAgent,
  },
});

export { alphaSentryAgent };
