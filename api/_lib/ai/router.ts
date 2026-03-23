import type { AgentManifest, PlanId, RoutedModel } from './types.js';

const ESSENCIAL_MODEL_OVERRIDES: Partial<Record<'gemini' | 'openai' | 'anthropic', string>> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

export function routeAgent(manifest: AgentManifest, userPlan: PlanId): RoutedModel {
  if (userPlan === 'essencial') {
    const basicModel = ESSENCIAL_MODEL_OVERRIDES[manifest.modelPolicy.provider];
    if (basicModel) {
      return {
        provider: manifest.modelPolicy.provider,
        model: basicModel,
      };
    }
  }

  return {
    provider: manifest.modelPolicy.provider,
    model: manifest.modelPolicy.model,
  };
}

export function getFallbackRoutes(manifest: AgentManifest): RoutedModel[] {
  return (manifest.modelPolicy.fallback ?? []).map(item => ({
    provider: item.provider,
    model: item.model,
  }));
}
