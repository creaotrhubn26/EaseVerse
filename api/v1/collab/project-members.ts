import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { requireExternalKey } from "../../_lib/collab-store.js";
import { ensureCreatorHubProjectLinksSchema } from "../../_lib/creatorhub-project-links.js";
let pool: Pool | null = null;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.DATABASE_URL)
    return res.status(503).json({ error: "Database unavailable" });
  const { ownerUserId, externalTrackId, audioReviewProjectId } = req.body || {};
  if (
    typeof ownerUserId !== "string" ||
    typeof externalTrackId !== "string" ||
    typeof audioReviewProjectId !== "string"
  )
    return res.status(400).json({ error: "Linked project required" });
  try {
    await ensureCreatorHubProjectLinksSchema();
    pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const r = await pool.query(
      `SELECT member.user_id,member.email,member.role FROM creatorhub_project_links link
    JOIN project_members member ON member.project_id=link.easeverse_project_id
    WHERE link.owner_user_id=$1 AND link.external_track_id=$2 AND link.audio_review_project_id=$3 AND member.role<>'observer'`,
      [ownerUserId, externalTrackId, audioReviewProjectId]
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      members: r.rows.map((m) => ({
        userId: m.user_id,
        name: m.email || m.user_id,
        role: m.role,
      })),
    });
  } catch {
    return res.status(503).json({ error: "Members unavailable" });
  }
}
