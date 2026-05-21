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
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS push_subs_user_idx ON push_subscriptions (user_id);
  `);
  ensured = true;
}

export type PushSubscriptionRow = {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
  createdAt: string;
};

export async function upsertSubscription(args: {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       last_seen_at = NOW()`,
    [args.endpoint, args.userId, args.p256dh, args.auth],
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function listSubscriptionsForUsers(
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    endpoint: string;
    user_id: string;
    p256dh: string;
    auth: string;
    created_at: string;
  }>(`SELECT endpoint, user_id, p256dh, auth, created_at
      FROM push_subscriptions WHERE user_id = ANY($1::text[])`, [userIds]);
  return rows.map((r) => ({
    endpoint: r.endpoint,
    userId: r.user_id,
    p256dh: r.p256dh,
    auth: r.auth,
    createdAt: r.created_at,
  }));
}
