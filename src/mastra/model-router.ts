import { getProviderById } from '../providers.js';

export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_MODEL = 'gpt-5.2';

const OPENROUTER_FALLBACK_PROVIDERS = new Set(['xai', 'moonshot', 'deepseek']);

export function toMastraModelString(provider: string, model: string): string {
  const normalizedProvider = provider.toLowerCase().trim();

  if (normalizedProvider === 'ollama') {
    const stripped = model.startsWith('ollama:') ? model.slice('ollama:'.length) : model;
    return `ollama/${stripped}`;
  }

  if (normalizedProvider === 'openrouter') {
    const stripped = model.startsWith('openrouter:') ? model.slice('openrouter:'.length) : model;
    return `openrouter/${stripped}`;
  }

  if (model.includes('/')) return model;

  if (OPENROUTER_FALLBACK_PROVIDERS.has(normalizedProvider)) {
    return `openrouter/${model}`;
  }

  if (['openai', 'anthropic', 'google'].includes(normalizedProvider)) {
    return `${normalizedProvider}/${model}`;
  }

  return `openai/${model}`;
}

export function getFastMastraModel(provider: string, fallbackModel: string): string {
  const providerDef = getProviderById(provider);
  const fastModel = providerDef?.fastModel ?? fallbackModel;
  return toMastraModelString(provider, fastModel);
}
