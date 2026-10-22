import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export type DeletionRequest = { id: string; requestedAt: string; userId: string; email: string };
let pool: Pool | undefined;
let ready: Promise<unknown> | undefined;
async function database() {
  if (!process.env.DATABASE_URL) throw new Error('Deletion storage unavailable');
  pool ??= new Pool({connectionString: process.env.DATABASE_URL, max: 2});
  ready ??= pool.query(`CREATE TABLE IF NOT EXISTS easeverse_account_deletion_requests (
    id UUID PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => {ready = undefined; throw error;});
  await ready;
  return pool;
}
function map(row: {id: string; user_id: string; email: string; requested_at: Date}): DeletionRequest {
  return {id: row.id, userId: row.user_id, email: row.email, requestedAt: new Date(row.requested_at).toISOString()};
}
export async function requestAccountDeletion(userId: string, email: string): Promise<DeletionRequest> {
  const db = await database();
  const {rows} = await db.query(`INSERT INTO easeverse_account_deletion_requests(id, user_id, email)
    VALUES ($1, $2, $3) ON CONFLICT(user_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, user_id, email, requested_at`, [randomUUID(), userId, email]);
  return map(rows[0]);
}
export async function listAccountDeletionRequests(): Promise<DeletionRequest[]> {
  const db = await database();
  const {rows} = await db.query('SELECT id, user_id, email, requested_at FROM easeverse_account_deletion_requests ORDER BY requested_at ASC');
  return rows.map(map);
}
