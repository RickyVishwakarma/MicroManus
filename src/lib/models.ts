/**
 * Static model registry. Prices are USD per million tokens, taken from each
 * vendor's published pricing. Cost math on the usage page reads exclusively
 * from this table so it can be hand-verified.
 */
export type Provider = "openai" | "anthropic" | "moonshot";

export interface ModelInfo {
  id: string; // id sent to the API
  label: string;
  provider: Provider;
  pricing: {
    input: number; // non-cached input tokens
    output: number;
    cacheRead: number; // cached/cache-hit input tokens
  };
}

export const PROVIDERS: Record<
  Provider,
  { label: string; baseUrl: string; keyUrl: string; keyPrefix: string }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
  },
  moonshot: {
    label: "Moonshot (Kimi)",
    baseUrl: "https://api.moonshot.ai/v1",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    keyPrefix: "sk-",
  },
};

export const MODELS: ModelInfo[] = [
  // Anthropic — via its OpenAI-compatible /v1/chat/completions endpoint
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    pricing: { input: 3, output: 15, cacheRead: 0.3 },
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    pricing: { input: 1, output: 5, cacheRead: 0.1 },
  },
  {
    id: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    provider: "anthropic",
    pricing: { input: 5, output: 25, cacheRead: 0.5 },
  },
  // OpenAI
  {
    id: "gpt-5.1",
    label: "GPT-5.1",
    provider: "openai",
    pricing: { input: 1.25, output: 10, cacheRead: 0.125 },
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    provider: "openai",
    pricing: { input: 0.25, output: 2, cacheRead: 0.025 },
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "openai",
    pricing: { input: 0.15, output: 0.6, cacheRead: 0.075 },
  },
  // Moonshot (Kimi)
  {
    id: "kimi-k2-0905-preview",
    label: "Kimi K2",
    provider: "moonshot",
    pricing: { input: 0.6, output: 2.5, cacheRead: 0.15 },
  },
  {
    id: "kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    provider: "moonshot",
    pricing: { input: 0.6, output: 2.5, cacheRead: 0.15 },
  },
];

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Cost in USD for a usage row, split by token class. */
export function computeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number
) {
  const m = getModel(modelId);
  const p = m?.pricing ?? { input: 0, output: 0, cacheRead: 0 };
  // `inputTokens` from the APIs includes cached tokens; bill the cached part
  // at the cache-read rate and the remainder at the input rate.
  const freshInput = Math.max(0, inputTokens - cachedTokens);
  return {
    input: (freshInput / 1_000_000) * p.input,
    output: (outputTokens / 1_000_000) * p.output,
    cache: (cachedTokens / 1_000_000) * p.cacheRead,
    total:
      (freshInput / 1_000_000) * p.input +
      (outputTokens / 1_000_000) * p.output +
      (cachedTokens / 1_000_000) * p.cacheRead,
  };
}
