import { Pool } from "pg";
import crypto from "node:crypto";

const TTL_SECONDS = 15 * 60;

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
    CREATE TABLE IF NOT EXISTS pairing_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS pairing_tokens_user_idx ON pairing_tokens (user_id);
  `);
  ensured = true;
}

export type PairingRecord = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
};

const memory = new Map<string, PairingRecord>();

function cleanupMemory() {
  const now = Date.now();
  for (const [token, entry] of memory.entries()) {
    if (Date.parse(entry.expiresAt) <= now) memory.delete(token);
  }
}

export async function createPairingToken(userId: string): Promise<PairingRecord> {
  const token = `pair_${crypto.randomBytes(18).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  const createdAt = new Date().toISOString();

  const p = getPool();
  if (p) {
    await ensureSchema();
    await p.query(
      `INSERT INTO pairing_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [token, userId, expiresAt],
    );
  } else {
    cleanupMemory();
    memory.set(token, { token, userId, createdAt, expiresAt, lastUsedAt: null });
  }

  return { token, userId, createdAt, expiresAt, lastUsedAt: null };
}

export async function resolvePairingToken(token: string | undefined): Promise<PairingRecord | null> {
  if (!token) return null;
  const p = getPool();
  if (p) {
    await ensureSchema();
    const { rows } = await p.query<{
      token: string;
      user_id: string;
      created_at: string;
      expires_at: string;
      last_used_at: string | null;
    }>(
      `SELECT token, user_id, created_at, expires_at, last_used_at
       FROM pairing_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [token],
    );
    const row = rows[0];
    if (!row) return null;
    await p.query(`UPDATE pairing_tokens SET last_used_at = NOW() WHERE token = $1`, [token]);
    return {
      token: row.token,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
    };
  }

  cleanupMemory();
  const entry = memory.get(token);
  if (!entry) return null;
  entry.lastUsedAt = new Date().toISOString();
  return entry;
}

export async function revokePairingToken(token: string): Promise<void> {
  const p = getPool();
  if (p) {
    await ensureSchema();
    await p.query(`DELETE FROM pairing_tokens WHERE token = $1`, [token]);
  } else {
    memory.delete(token);
  }
}
