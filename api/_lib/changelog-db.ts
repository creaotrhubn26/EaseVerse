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
    CREATE TABLE IF NOT EXISTS changelog_entries (
      id BIGSERIAL PRIMARY KEY,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tag TEXT,
      author_user_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS changelog_entries_published_idx ON changelog_entries (published_at DESC);
  `);
  ensured = true;
}

export type ChangelogEntry = {
  id: number;
  publishedAt: string;
  title: string;
  body: string;
  tag: string | null;
  authorUserId: string;
};

export async function listChangelog(limit = 20): Promise<ChangelogEntry[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSchema();
    const { rows } = await p.query<{
      id: number;
      published_at: string;
      title: string;
      body: string;
      tag: string | null;
      author_user_id: string;
    }>(
      `SELECT id, published_at, title, body, tag, author_user_id
       FROM changelog_entries
       ORDER BY published_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      publishedAt: r.published_at,
      title: r.title,
      body: r.body,
      tag: r.tag,
      authorUserId: r.author_user_id,
    }));
  } catch (error) {
    console.warn("Changelog list failed:", error);
    return [];
  }
}

export async function publishChangelog(args: {
  title: string;
  body: string;
  tag?: string;
  authorUserId: string;
}): Promise<ChangelogEntry | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await ensureSchema();
    const { rows } = await p.query<{ id: number; published_at: string }>(
      `INSERT INTO changelog_entries (title, body, tag, author_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, published_at`,
      [args.title, args.body, args.tag ?? null, args.authorUserId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      publishedAt: row.published_at,
      title: args.title,
      body: args.body,
      tag: args.tag ?? null,
      authorUserId: args.authorUserId,
    };
  } catch (error) {
    console.warn("Changelog publish failed:", error);
    return null;
  }
}

export async function deleteChangelog(id: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await ensureSchema();
    await p.query(`DELETE FROM changelog_entries WHERE id = $1`, [id]);
  } catch (error) {
    console.warn("Changelog delete failed:", error);
  }
}
