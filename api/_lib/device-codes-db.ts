// Device-kode-paring for companion (à la Apple TV / CLI device-auth):
// companion ber om en kode → bruker godkjenner i /admin → companion poller
// og får en VARIG pair-token. Ingen copy-paste, ingen 15-min-stress.
import { Pool } from "pg";
import crypto from "node:crypto";

const CODE_TTL_SECONDS = 15 * 60; // hvor lenge en uautorisert kode er gyldig
let pool: Pool | null = null;
let ensured = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS companion_device_codes (
      device_code TEXT PRIMARY KEY,
      user_code   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      pair_token  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS companion_device_codes_user_code_idx ON companion_device_codes (user_code);
  `);
  ensured = true;
}

type Row = { device_code: string; user_code: string; status: string; pair_token: string | null; expires_at: string };
const mem = new Map<string, Row>();
const cleanMem = () => { const n = Date.now(); for (const [k, v] of mem) if (Date.parse(v.expires_at) <= n) mem.delete(k); };

// Unngå forvekslbare tegn (0/O/1/I). 6 tegn.
function genUserCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => a[crypto.randomInt(a.length)]).join("");
}

export async function createDeviceCode(): Promise<{ deviceCode: string; userCode: string; expiresIn: number }> {
  const deviceCode = crypto.randomBytes(24).toString("base64url");
  const userCode = genUserCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();
  const p = getPool();
  if (p) {
    await ensureSchema();
    await p.query(
      `INSERT INTO companion_device_codes (device_code, user_code, status, expires_at) VALUES ($1,$2,'pending',$3)`,
      [deviceCode, userCode, expiresAt],
    );
  } else {
    cleanMem();
    mem.set(deviceCode, { device_code: deviceCode, user_code: userCode, status: "pending", pair_token: null, expires_at: expiresAt });
  }
  return { deviceCode, userCode, expiresIn: CODE_TTL_SECONDS };
}

// /admin: godkjenn en bruker-kode → bind en (varig) pair-token til den.
export async function approveDeviceCode(userCode: string, pairToken: string): Promise<boolean> {
  const code = userCode.trim().toUpperCase();
  const p = getPool();
  if (p) {
    await ensureSchema();
    const r = await p.query(
      `UPDATE companion_device_codes SET status='approved', pair_token=$2
       WHERE user_code=$1 AND status='pending' AND expires_at > NOW() RETURNING device_code`,
      [code, pairToken],
    );
    return (r.rowCount ?? 0) > 0;
  }
  cleanMem();
  for (const v of mem.values()) {
    if (v.user_code === code && v.status === "pending") { v.status = "approved"; v.pair_token = pairToken; return true; }
  }
  return false;
}

// Companion poller: returnerer pair-token når godkjent.
export async function pollDeviceCode(deviceCode: string): Promise<{ status: "pending" | "approved" | "expired"; pairToken?: string }> {
  const p = getPool();
  if (p) {
    await ensureSchema();
    const { rows } = await p.query<Row>(`SELECT * FROM companion_device_codes WHERE device_code=$1`, [deviceCode]);
    const row = rows[0];
    if (!row) return { status: "expired" };
    if (Date.parse(row.expires_at) <= Date.now()) return { status: "expired" };
    if (row.status === "approved" && row.pair_token) {
      await p.query(`DELETE FROM companion_device_codes WHERE device_code=$1`, [deviceCode]).catch(() => {});
      return { status: "approved", pairToken: row.pair_token };
    }
    return { status: "pending" };
  }
  cleanMem();
  const v = mem.get(deviceCode);
  if (!v) return { status: "expired" };
  if (v.status === "approved" && v.pair_token) { mem.delete(deviceCode); return { status: "approved", pairToken: v.pair_token }; }
  return { status: "pending" };
}
