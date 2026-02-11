import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';

const MEMORY_DB_URL = 'file:.dexter/memory.db';

export const storage = new LibSQLStore({
  id: 'alpha-sentry-storage',
  url: MEMORY_DB_URL,
});

const vector = new LibSQLVector({
  id: 'alpha-sentry-vector',
  url: MEMORY_DB_URL,
});

const WORKING_MEMORY_TEMPLATE = `# Research Context

## User Profile
- Name:
- Preferred Tickers:
- Analysis Style: [e.g., Fundamental, Technical, Both]

## Current Research
- Active Tickers:
- Key Findings:
- Open Questions:

## Session State
- Last Query Topic:
- Data Sources Used:
`;

export const memory = new Memory({
  storage,
  vector,
  embedder: 'openai/text-embedding-3-small',
  options: {
    lastMessages: 20,
    workingMemory: {
      enabled: true,
      template: WORKING_MEMORY_TEMPLATE,
    },
    semanticRecall: {
      topK: 5,
      messageRange: 2,
    },
  },
});
