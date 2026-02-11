import { describe, expect, test } from 'bun:test';
import { toMastraModelString, DEFAULT_PROVIDER, DEFAULT_MODEL } from './model-router.js';

describe('toMastraModelString', () => {
  test('openai + gpt-5.2', () => {
    expect(toMastraModelString('openai', 'gpt-5.2')).toBe('openai/gpt-5.2');
  });

  test('anthropic + claude-sonnet-4-20250514', () => {
    expect(toMastraModelString('anthropic', 'claude-sonnet-4-20250514')).toBe('anthropic/claude-sonnet-4-20250514');
  });

  test('google + gemini-3-flash-preview', () => {
    expect(toMastraModelString('google', 'gemini-3-flash-preview')).toBe('google/gemini-3-flash-preview');
  });

  test('ollama strips ollama: prefix', () => {
    expect(toMastraModelString('ollama', 'ollama:llama3')).toBe('ollama/llama3');
  });

  test('ollama without prefix', () => {
    expect(toMastraModelString('ollama', 'llama3')).toBe('ollama/llama3');
  });

  test('xai falls back to openrouter', () => {
    expect(toMastraModelString('xai', 'grok-4-1')).toBe('openrouter/grok-4-1');
  });

  test('openrouter strips openrouter: prefix', () => {
    expect(toMastraModelString('openrouter', 'openrouter:anthropic/claude-3.5-sonnet')).toBe('openrouter/anthropic/claude-3.5-sonnet');
  });

  test('model already has / is returned as-is', () => {
    expect(toMastraModelString('anthropic', 'openai/gpt-5.2')).toBe('openai/gpt-5.2');
  });

  test('unknown provider falls back to openai', () => {
    expect(toMastraModelString('unknown', 'some-model')).toBe('openai/some-model');
  });

  test('moonshot falls back to openrouter', () => {
    expect(toMastraModelString('moonshot', 'kimi-k2-5')).toBe('openrouter/kimi-k2-5');
  });

  test('deepseek falls back to openrouter', () => {
    expect(toMastraModelString('deepseek', 'deepseek-chat')).toBe('openrouter/deepseek-chat');
  });
});

describe('defaults', () => {
  test('DEFAULT_PROVIDER is openai', () => {
    expect(DEFAULT_PROVIDER).toBe('openai');
  });

  test('DEFAULT_MODEL is gpt-5.2', () => {
    expect(DEFAULT_MODEL).toBe('gpt-5.2');
  });
});
