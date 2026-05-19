import { Pool } from "pg";

let pool: Pool | null = null;
let ensured = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_create_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS usage_events_user_ts_idx ON usage_events (user_id, ts DESC);
  `);
  ensured = true;
}

const PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheCreate?: number }> = {
  "claude-opus-4-7": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-opus-4-6": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheCreate: 6.25 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.1, cacheCreate: 1.25 },
};

export function estimateClaudeCostUsd(
  model: string,
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreate = 0,
): number {
  const tier = PRICING[model] ?? PRICING["claude-opus-4-7"];
  return (
    (input * tier.input +
      output * tier.output +
      cacheRead * (tier.cacheRead ?? 0) +
      cacheCreate * (tier.cacheCreate ?? 0)) /
    1_000_000
  );
}

export async function recordClaudeUsage(args: {
  userId: string | null;
  model: string;
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await ensureSchema();
    const inputTokens = args.usage.input_tokens ?? 0;
    const outputTokens = args.usage.output_tokens ?? 0;
    const cacheReadTokens = args.usage.cache_read_input_tokens ?? 0;
    const cacheCreateTokens = args.usage.cache_creation_input_tokens ?? 0;
    const cost = estimateClaudeCostUsd(args.model, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens);
    await p.query(
      `INSERT INTO usage_events
        (user_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, estimated_cost_usd)
       VALUES ($1, 'anthropic', $2, $3, $4, $5, $6, $7)`,
      [args.userId, args.model, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, cost],
    );
  } catch (error) {
    console.warn("Usage record failed:", error);
  }
}

export type UsageSummary = {
  totalCostUsd: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: { model: string; requests: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  daily: { date: string; costUsd: number; requests: number }[];
};

export async function summarizePerUser(windowMs: number): Promise<
  { userId: string | null; requests: number; costUsd: number; inputTokens: number; outputTokens: number }[]
> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSchema();
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const { rows } = await p.query<{
      user_id: string | null;
      requests: string;
      cost: string;
      input_tokens: string;
      output_tokens: string;
    }>(
      `SELECT
        user_id,
        COUNT(*)::text AS requests,
        COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
        COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::text AS output_tokens
      FROM usage_events
      WHERE ts >= $1
      GROUP BY user_id
      ORDER BY cost DESC`,
      [sinceIso],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      requests: parseInt(r.requests, 10),
      costUsd: parseFloat(r.cost),
      inputTokens: parseInt(r.input_tokens, 10),
      outputTokens: parseInt(r.output_tokens, 10),
    }));
  } catch (error) {
    console.warn("Per-user summarize failed:", error);
    return [];
  }
}

export async function summarizeUserUsage(userId: string | null, windowMs: number): Promise<UsageSummary | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await ensureSchema();
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const { rows: totals } = await p.query<{
      total_cost: string;
      total_requests: string;
      total_input: string;
      total_output: string;
    }>(
      `SELECT
        COALESCE(SUM(estimated_cost_usd), 0)::text AS total_cost,
        COUNT(*)::text AS total_requests,
        COALESCE(SUM(input_tokens), 0)::text AS total_input,
        COALESCE(SUM(output_tokens), 0)::text AS total_output
      FROM usage_events
      WHERE ts >= $1 AND ($2::text IS NULL OR user_id = $2)`,
      [sinceIso, userId],
    );

    const { rows: models } = await p.query<{
      model: string;
      requests: string;
      cost: string;
      input_tokens: string;
      output_tokens: string;
    }>(
      `SELECT
        model,
        COUNT(*)::text AS requests,
        COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
        COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::text AS output_tokens
      FROM usage_events
      WHERE ts >= $1 AND ($2::text IS NULL OR user_id = $2)
      GROUP BY model
      ORDER BY cost DESC`,
      [sinceIso, userId],
    );

    const { rows: daily } = await p.query<{ day: string; cost: string; requests: string }>(
      `SELECT
        to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
        COUNT(*)::text AS requests
      FROM usage_events
      WHERE ts >= $1 AND ($2::text IS NULL OR user_id = $2)
      GROUP BY 1
      ORDER BY 1`,
      [sinceIso, userId],
    );

    const t = totals[0] ?? { total_cost: "0", total_requests: "0", total_input: "0", total_output: "0" };

    return {
      totalCostUsd: parseFloat(t.total_cost),
      totalRequests: parseInt(t.total_requests, 10),
      totalInputTokens: parseInt(t.total_input, 10),
      totalOutputTokens: parseInt(t.total_output, 10),
      byModel: models.map((m) => ({
        model: m.model,
        requests: parseInt(m.requests, 10),
        costUsd: parseFloat(m.cost),
        inputTokens: parseInt(m.input_tokens, 10),
        outputTokens: parseInt(m.output_tokens, 10),
      })),
      daily: daily.map((d) => ({
        date: d.day,
        costUsd: parseFloat(d.cost),
        requests: parseInt(d.requests, 10),
      })),
    };
  } catch (error) {
    console.warn("Usage summarize failed:", error);
    return null;
  }
}
