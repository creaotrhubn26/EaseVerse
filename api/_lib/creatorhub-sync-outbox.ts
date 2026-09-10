import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pushKeeperToCreatorHub, type CreatorHubSyncResult } from "./creatorhub-sync.js";

type KeeperPayload = Parameters<typeof pushKeeperToCreatorHub>[0];
export type QueuedCreatorHubSyncResult = CreatorHubSyncResult & { queued: boolean; eventId: string };

let pool: Pool | null = null;
let ensured = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

async function ensureSchema(db: Pool): Promise<void> {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS creatorhub_sync_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),event_id TEXT NOT NULL UNIQUE,event_type TEXT NOT NULL,
      payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,
      dead_letter_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS creatorhub_sync_outbox_due_idx
      ON creatorhub_sync_outbox(status,next_attempt_at,locked_at,created_at);
  `);
  ensured = true;
}

function reason(result: CreatorHubSyncResult): string {
  return result.reason || (result.status ? `http_${result.status}` : "unknown");
}

async function deliver(db: Pool, row: any): Promise<QueuedCreatorHubSyncResult> {
  const result = await pushKeeperToCreatorHub(row.payload as KeeperPayload);
  const attempt = Number(row.attempt_count || 0) + 1;
  if (result.synced) {
    await db.query(
      `UPDATE creatorhub_sync_outbox SET status='delivered',attempt_count=$2,delivered_at=NOW(),locked_at=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1`,
      [row.id, attempt],
    );
  } else {
    const status = attempt >= 12 ? "dead_letter" : "pending";
    const delay = Math.min(900, Math.max(5, 2 ** Math.min(attempt, 9)));
    await db.query(
      `UPDATE creatorhub_sync_outbox SET status=$2,attempt_count=$3,next_attempt_at=NOW()+($4::text||' seconds')::interval,
         locked_at=NULL,last_error=$5,dead_letter_at=CASE WHEN $2='dead_letter' THEN NOW() ELSE dead_letter_at END,updated_at=NOW()
       WHERE id=$1`,
      [row.id, status, attempt, delay, reason(result).slice(0, 500)],
    );
  }
  return { ...result, queued: !result.synced, eventId: String(row.event_id) };
}

export async function enqueueKeeperToCreatorHub(payload: KeeperPayload): Promise<QueuedCreatorHubSyncResult> {
  const eventId = `keeper:${payload.takeId}`;
  const db = getPool();
  if (!db) return { ...(await pushKeeperToCreatorHub(payload)), queued: false, eventId };
  await ensureSchema(db);
  await db.query(
    `INSERT INTO creatorhub_sync_outbox(event_id,event_type,payload) VALUES ($1,'keeper',$2::jsonb)
     ON CONFLICT(event_id) DO NOTHING`,
    [eventId, JSON.stringify(payload)],
  );
  const claimed = await db.query(
    `UPDATE creatorhub_sync_outbox SET status='processing',locked_at=NOW(),updated_at=NOW()
      WHERE event_id=$1 AND status IN ('pending','processing')
        AND (locked_at IS NULL OR locked_at<NOW()-INTERVAL '5 minutes')
      RETURNING *`,
    [eventId],
  );
  if (claimed.rows[0]) return deliver(db, claimed.rows[0]);
  const existing = await db.query(`SELECT status FROM creatorhub_sync_outbox WHERE event_id=$1`, [eventId]);
  const synced = existing.rows[0]?.status === "delivered";
  return { configured: true, synced, queued: !synced, eventId };
}

export async function processCreatorHubSyncOutbox(limit = 20): Promise<{ attempted: number; delivered: number; pending: number }> {
  const db = getPool();
  if (!db) return { attempted: 0, delivered: 0, pending: 0 };
  await ensureSchema(db);
  const lockId = randomUUID();
  const claimed = await db.query(
    `WITH due AS (
       SELECT id FROM creatorhub_sync_outbox
        WHERE (status='pending' AND next_attempt_at<=NOW()) OR (status='processing' AND locked_at<NOW()-INTERVAL '5 minutes')
        ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE creatorhub_sync_outbox o SET status='processing',locked_at=NOW(),last_error=COALESCE(last_error,$2),updated_at=NOW()
       FROM due WHERE o.id=due.id RETURNING o.*`,
    [Math.max(1, Math.min(100, limit)), `lease:${lockId}`],
  );
  let delivered = 0;
  for (const row of claimed.rows) {
    if ((await deliver(db, row)).synced) delivered += 1;
  }
  const pending = await db.query(`SELECT COUNT(*)::int AS count FROM creatorhub_sync_outbox WHERE status IN ('pending','processing')`);
  return { attempted: claimed.rows.length, delivered, pending: Number(pending.rows[0]?.count || 0) };
}
