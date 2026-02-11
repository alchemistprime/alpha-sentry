/**
 * Evaluation Runner for AlphaSentry
 * 
 * TODO: Port to Mastra evals (@mastra/evals) — see task 11.
 * The previous implementation used LangSmith + @langchain/openai which have been removed.
 * 
 * Usage (once ported):
 *   bun run src/evals/run.ts              # Run on all questions
 *   bun run src/evals/run.ts --sample 10  # Run on random sample of 10 questions
 */

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EvalApp, type EvalProgressEvent } from './components/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Example {
  inputs: { question: string };
  outputs: { answer: string };
}

function parseCSV(csvContent: string): Example[] {
  const examples: Example[] = [];
  const lines = csvContent.split('\n');
  
  let i = 1;
  
  while (i < lines.length) {
    const result = parseRow(lines, i);
    if (result) {
      const { row, nextIndex } = result;
      if (row.length >= 2 && row[0].trim()) {
        examples.push({
          inputs: { question: row[0] },
          outputs: { answer: row[1] }
        });
      }
      i = nextIndex;
    } else {
      i++;
    }
  }
  
  return examples;
}

function parseRow(lines: string[], startIndex: number): { row: string[]; nextIndex: number } | null {
  if (startIndex >= lines.length || !lines[startIndex].trim()) {
    return null;
  }
  
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let lineIndex = startIndex;
  let charIndex = 0;
  
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    
    while (charIndex < line.length) {
      const char = line[charIndex];
      const nextChar = line[charIndex + 1];
      
      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          charIndex += 2;
        } else if (char === '"') {
          inQuotes = false;
          charIndex++;
        } else {
          currentField += char;
          charIndex++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          charIndex++;
        } else if (char === ',') {
          fields.push(currentField);
          currentField = '';
          charIndex++;
        } else {
          currentField += char;
          charIndex++;
        }
      }
    }
    
    if (inQuotes) {
      currentField += '\n';
      lineIndex++;
      charIndex = 0;
    } else {
      fields.push(currentField);
      return { row: fields, nextIndex: lineIndex + 1 };
    }
  }
  
  if (currentField) {
    fields.push(currentField);
  }
  return { row: fields, nextIndex: lineIndex };
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// TODO: Port to Mastra agent (task 11)
async function target(inputs: { question: string }): Promise<{ answer: string }> {
  throw new Error('Evals target not yet ported to Mastra agent. See task 11.');
}

const _EvaluatorOutputSchema = z.object({
  score: z.number().min(0).max(1),
  comment: z.string(),
});

// TODO: Port evaluator to Mastra evals (task 11)
async function correctnessEvaluator({
  outputs,
  referenceOutputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<{ key: string; score: number; comment: string }> {
  throw new Error('Evaluator not yet ported to Mastra. See task 11.');
}

function createEvaluationRunner(sampleSize?: number) {
  return async function* runEvaluation(): AsyncGenerator<EvalProgressEvent, void, unknown> {
    const csvPath = path.join(__dirname, 'dataset', 'finance_agent.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    let examples = parseCSV(csvContent);
    const totalCount = examples.length;

    if (sampleSize && sampleSize < examples.length) {
      examples = shuffleArray(examples).slice(0, sampleSize);
    }

    yield {
      type: 'init',
      total: examples.length,
      datasetName: sampleSize ? `finance_agent (sample ${sampleSize}/${totalCount})` : 'finance_agent',
    };

    const experimentName = `alpha-sentry-eval-${Date.now().toString(36)}`;

    for (const example of examples) {
      const question = example.inputs.question;

      yield {
        type: 'question_start',
        question,
      };

      const outputs = await target(example.inputs);

      const evalResult = await correctnessEvaluator({
        inputs: example.inputs,
        outputs,
        referenceOutputs: example.outputs,
      });

      yield {
        type: 'question_end',
        question,
        score: typeof evalResult.score === 'number' ? evalResult.score : 0,
        comment: evalResult.comment || '',
      };
    }

    yield {
      type: 'complete',
      experimentName,
    };
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sampleIndex = args.indexOf('--sample');
  const sampleSize = sampleIndex !== -1 ? parseInt(args[sampleIndex + 1]) : undefined;

  const runEvaluation = createEvaluationRunner(sampleSize);

  const { waitUntilExit } = render(
    React.createElement(EvalApp, { runEvaluation })
  );
  
  await waitUntilExit();
}

main().catch(console.error);
