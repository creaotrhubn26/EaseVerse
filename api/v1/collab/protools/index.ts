import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../../_lib/auth.js";
import {
  isExternalKeyAuthorized,
  normalizeProToolsMarkers,
  parseBody,
  requireExternalKey,
  upsertProTools,
  listProTools,
  type ProToolsIntegrationContext,
  type ProToolsRecord,
} from "../../../_lib/collab-store.js";

type RouteActor = { kind: "service"; ownerUserId?: string } | { kind: "user"; ownerUserId: string };

async function authorize(req: VercelRequest, res: VercelResponse): Promise<RouteActor | null> {
  if (req.headers["x-api-key"] !== undefined) {
    if (!requireExternalKey(req, res)) return null;
    return { kind: "service" };
  }
  const userId = await requireAuth(req, res);
  return userId ? { kind: "user", ownerUserId: userId } : null;
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function integrationContext(value: unknown): ProToolsIntegrationContext {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    creatorhubProjectId: boundedString(raw.creatorhubProjectId, 160),
    audioReviewProjectId: boundedString(raw.audioReviewProjectId, 160),
    easeverseProjectId: boundedString(raw.easeverseProjectId, 160),
    proToolsSessionId: boundedString(raw.proToolsSessionId, 160),
    returnTo: boundedString(raw.returnTo, 600),
  };
}

function validIso(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const actor = await authorize(req, res);
  if (!actor) return;

  if (req.method === "GET") {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : undefined;
      const source = typeof req.query.source === "string" ? req.query.source.trim() : undefined;
      const externalTrackId = typeof req.query.externalTrackId === "string" ? req.query.externalTrackId.trim() : undefined;
      const { records, storage } = await listProTools({
        projectId,
        source,
        externalTrackId,
        ownerUserId: actor.kind === "user" ? actor.ownerUserId : undefined,
      });
      return res.status(200).json({ ok: true, schemaVersion: 1, storage, count: records.length, items: records });
    } catch (error) {
      console.error("collab protools list error:", error);
      return res.status(500).json({ error: "Failed to list Pro Tools sync payloads" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = parseBody(req);
      const externalTrackId = boundedString(body?.externalTrackId, 160);
      if (!externalTrackId) return res.status(400).json({ error: "externalTrackId is required" });
      const markers = normalizeProToolsMarkers(body?.markers);
      if (Array.isArray(body?.markers) && body.markers.length > 0 && markers.length === 0) {
        return res.status(400).json({ error: "markers did not contain valid positions" });
      }
      const now = new Date().toISOString();
      const updatedAt = validIso(body?.updatedAt, now);
      const requestedRevision = Number(body?.revision);
      const revision = Number.isSafeInteger(requestedRevision) && requestedRevision >= 0
        ? requestedRevision
        : Date.parse(updatedAt);
      const requestedOwner = boundedString(body?.ownerUserId, 160);
      const ownerUserId = actor.kind === "user" ? actor.ownerUserId : requestedOwner ?? "__service__";
      const bpmValue = Number(body?.bpm);
      const bpm = Number.isFinite(bpmValue) && bpmValue >= 20 && bpmValue <= 400
        ? Math.round(bpmValue)
        : undefined;
      const context = integrationContext(body?.integrationContext);
      const rec: ProToolsRecord = {
        schemaVersion: 1,
        ownerUserId,
        externalTrackId,
        projectId: (boundedString(body?.projectId, 160) ?? context.audioReviewProjectId ?? "__default__"),
        source: boundedString(body?.source, 120) ?? (actor.kind === "user" ? "easeverse-easy-import" : "protools-companion"),
        eventId: boundedString(body?.eventId, 240),
        revision,
        bpm,
        keySignature: boundedString(body?.keySignature, 32),
        timeSignature: boundedString(body?.timeSignature, 24),
        integrationContext: context,
        markers,
        takeScores: Array.isArray(body?.takeScores) ? body.takeScores.slice(0, 1000) : [],
        pronunciationFeedback: Array.isArray(body?.pronunciationFeedback)
          ? body.pronunciationFeedback.slice(0, 1000)
          : [],
        updatedAt,
        receivedAt: now,
      };
      const { record, storage } = await upsertProTools(rec);
      return res.status(200).json({ ok: true, schemaVersion: 1, storage, item: record });
    } catch (error) {
      console.error("collab protools upsert error:", error);
      return res.status(500).json({ error: "Failed to upsert Pro Tools sync payload" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export { isExternalKeyAuthorized };
