/** Fast, reliable OpenRouter chat models (embedding models excluded). */
export const OPENROUTER_CHAT_MODELS = [
  "inclusionai/ling-3.0-flash-fin:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const;

/** Large reasoning models — slow first token; prefer Ling Flash for chat. */
export const SLOW_REASONING_MODELS = new Set<string>([
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
]);

export const DEFAULT_CHAT_PROVIDER = "openrouter";
export const DEFAULT_CHAT_MODEL = OPENROUTER_CHAT_MODELS[0];

export function isChatPanelModel(name: string): boolean {
  return (OPENROUTER_CHAT_MODELS as readonly string[]).includes(name);
}
