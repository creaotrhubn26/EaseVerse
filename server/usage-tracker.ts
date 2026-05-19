type ProviderName = "anthropic" | "elevenlabs" | "openai" | "gemini";

export type UsageEntry = {
  ts: number;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreateTokens?: number;
  estimatedCostUsd: number;
};

const MAX_ENTRIES = 5000;
const entries: UsageEntry[] = [];

// Per-million-token pricing. Snapshot from the claude-api skill; update when models change.
const PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheCreate?: number }> = {
  "claude-opus-4-7": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-opus-4-6": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.1, cacheCreate: 1.25 },
};

function estimateCostUsd(
  model: string,
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreate = 0,
): number {
  const tier = PRICING[model] ?? PRICING["claude-opus-4-7"];
  return (
    (input * tier.input + output * tier.output + cacheRead * (tier.cacheRead ?? 0) + cacheCreate * (tier.cacheCreate ?? 0)) /
    1_000_000
  );
}

export function recordClaudeUsage(args: {
  model: string;
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}): void {
  const inputTokens = args.usage.input_tokens ?? 0;
  const outputTokens = args.usage.output_tokens ?? 0;
  const cacheReadTokens = args.usage.cache_read_input_tokens ?? 0;
  const cacheCreateTokens = args.usage.cache_creation_input_tokens ?? 0;
  const entry: UsageEntry = {
    ts: Date.now(),
    provider: "anthropic",
    model: args.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreateTokens,
    estimatedCostUsd: estimateCostUsd(args.model, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export function recordSimpleUsage(provider: ProviderName, model: string, estimatedCostUsd: number): void {
  entries.push({
    ts: Date.now(),
    provider,
    model,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd,
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export type UsageSummary = {
  windowMs: number;
  totalCostUsd: number;
  totalRequests: number;
  byProvider: Record<string, { requests: number; costUsd: number }>;
  byModel: Record<string, { requests: number; costUsd: number }>;
  daily: { date: string; costUsd: number; requests: number }[];
};

export function summarize(windowMs: number): UsageSummary {
  const cutoff = Date.now() - windowMs;
  const window = entries.filter((e) => e.ts >= cutoff);
  const byProvider: UsageSummary["byProvider"] = {};
  const byModel: UsageSummary["byModel"] = {};
  const dailyMap = new Map<string, { costUsd: number; requests: number }>();

  for (const e of window) {
    const pkey = e.provider;
    byProvider[pkey] ||= { requests: 0, costUsd: 0 };
    byProvider[pkey].requests += 1;
    byProvider[pkey].costUsd += e.estimatedCostUsd;

    byModel[e.model] ||= { requests: 0, costUsd: 0 };
    byModel[e.model].requests += 1;
    byModel[e.model].costUsd += e.estimatedCostUsd;

    const day = new Date(e.ts).toISOString().slice(0, 10);
    const slot = dailyMap.get(day) ?? { costUsd: 0, requests: 0 };
    slot.costUsd += e.estimatedCostUsd;
    slot.requests += 1;
    dailyMap.set(day, slot);
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return {
    windowMs,
    totalCostUsd: window.reduce((s, e) => s + e.estimatedCostUsd, 0),
    totalRequests: window.length,
    byProvider,
    byModel,
    daily,
  };
}

export function getRecentEntries(limit = 50): UsageEntry[] {
  return entries.slice(-limit).reverse();
}
