export type ProToolsSectionType =
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "final-chorus"
  | "intro"
  | "outro"
  | "custom";

export type ProToolsTimingConsistency = "low" | "medium" | "high";
export type ProToolsSeverity = "low" | "medium" | "high";

export interface ProToolsMarker {
  id: string;
  label: string;
  positionMs: number;
  endPositionMs?: number;
  timecode?: string;
  sectionType?: ProToolsSectionType;
  color?: string;
}

export interface ProToolsTakeScore {
  id: string;
  takeName?: string;
  durationMs?: number;
  textAccuracy?: number;
  pronunciationClarity?: number;
  timingConsistency?: ProToolsTimingConsistency;
  overallScore?: number;
  recordedAt?: string;
  notes?: string;
}

export interface ProToolsPronunciationFeedback {
  id: string;
  word: string;
  phonetic?: string;
  tip?: string;
  severity?: ProToolsSeverity;
  positionMs?: number;
  takeId?: string;
  createdAt?: string;
}

export interface ProToolsIntegrationContext {
  creatorhubProjectId?: string;
  audioReviewProjectId?: string;
  easeverseProjectId?: string;
  proToolsSessionId?: string;
  returnTo?: string;
}

export interface ProToolsSyncPayload {
  schemaVersion?: 1;
  ownerUserId?: string;
  externalTrackId: string;
  projectId?: string;
  source?: string;
  eventId?: string;
  revision?: number;
  bpm?: number;
  keySignature?: string;
  timeSignature?: string;
  integrationContext?: ProToolsIntegrationContext;
  markers?: ProToolsMarker[];
  takeScores?: ProToolsTakeScore[];
  pronunciationFeedback?: ProToolsPronunciationFeedback[];
  updatedAt?: string;
}

export interface ProToolsSyncRecord extends Required<Pick<ProToolsSyncPayload, "externalTrackId">> {
  schemaVersion: 1;
  ownerUserId: string;
  projectId?: string;
  source: string;
  eventId?: string;
  revision: number;
  bpm?: number;
  keySignature?: string;
  timeSignature?: string;
  integrationContext: ProToolsIntegrationContext;
  markers: ProToolsMarker[];
  takeScores: ProToolsTakeScore[];
  pronunciationFeedback: ProToolsPronunciationFeedback[];
  updatedAt: string;
  receivedAt: string;
}

export function buildProToolsSyncRoute(params?: {
  projectId?: string;
  source?: string;
  externalTrackId?: string;
}): string {
  const search = new URLSearchParams();
  if (params?.projectId?.trim()) search.set("projectId", params.projectId.trim());
  if (params?.source?.trim()) search.set("source", params.source.trim());
  if (params?.externalTrackId?.trim()) search.set("externalTrackId", params.externalTrackId.trim());
  const query = search.toString();
  return query ? `/api/v1/collab/protools?${query}` : "/api/v1/collab/protools";
}

export function buildProToolsTrackSyncRoute(
  externalTrackId: string,
  params?: { projectId?: string },
): string {
  const encodedTrackId = encodeURIComponent(externalTrackId.trim());
  const base = `/api/v1/collab/protools/${encodedTrackId}`;
  if (!params?.projectId?.trim()) return base;
  const search = new URLSearchParams();
  search.set("projectId", params.projectId.trim());
  return `${base}?${search.toString()}`;
}

function text(value: unknown, max = 600): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function marker(value: unknown, index: number): ProToolsMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const legacySeconds = Number(raw.startSeconds);
  const position = Number.isFinite(Number(raw.positionMs))
    ? Number(raw.positionMs)
    : Number.isFinite(legacySeconds) ? legacySeconds * 1000 : NaN;
  if (!Number.isFinite(position) || position < 0) return null;
  const legacyEndSeconds = Number(raw.endSeconds);
  const end = Number.isFinite(Number(raw.endPositionMs))
    ? Number(raw.endPositionMs)
    : Number.isFinite(legacyEndSeconds) ? legacyEndSeconds * 1000 : undefined;
  return {
    id: text(raw.id, 160) ?? `marker-${index + 1}`,
    label: text(raw.label, 200) ?? text(raw.name, 200) ?? `Marker ${index + 1}`,
    positionMs: Math.round(position),
    ...(end !== undefined && end >= position ? { endPositionMs: Math.round(end) } : {}),
    ...(text(raw.timecode, 32) ? { timecode: text(raw.timecode, 32) } : {}),
    ...(text(raw.sectionType, 32) ? { sectionType: text(raw.sectionType, 32) as ProToolsSectionType } : {}),
    ...(text(raw.color, 32) ? { color: text(raw.color, 32) } : {}),
  };
}

export function parseProToolsSyncRecord(input: unknown): ProToolsSyncRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const externalTrackId = text(raw.externalTrackId, 160);
  const source = text(raw.source, 120);
  const updatedAt = text(raw.updatedAt, 80);
  const receivedAt = text(raw.receivedAt, 80);
  if (!externalTrackId || !source || !updatedAt || !receivedAt) return null;
  const rawContext = raw.integrationContext && typeof raw.integrationContext === "object" && !Array.isArray(raw.integrationContext)
    ? raw.integrationContext as Record<string, unknown>
    : {};
  const revision = Number(raw.revision);
  return {
    schemaVersion: 1,
    ownerUserId: text(raw.ownerUserId, 160) ?? "__service__",
    externalTrackId,
    projectId: text(raw.projectId, 160),
    source,
    eventId: text(raw.eventId, 240),
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    bpm: typeof raw.bpm === "number" ? raw.bpm : undefined,
    keySignature: text(raw.keySignature, 32),
    timeSignature: text(raw.timeSignature, 24),
    integrationContext: {
      creatorhubProjectId: text(rawContext.creatorhubProjectId, 160),
      audioReviewProjectId: text(rawContext.audioReviewProjectId, 160),
      easeverseProjectId: text(rawContext.easeverseProjectId, 160),
      proToolsSessionId: text(rawContext.proToolsSessionId, 160),
      returnTo: text(rawContext.returnTo, 600),
    },
    markers: Array.isArray(raw.markers)
      ? raw.markers.map(marker).filter((item): item is ProToolsMarker => item !== null)
      : [],
    takeScores: Array.isArray(raw.takeScores) ? raw.takeScores as ProToolsTakeScore[] : [],
    pronunciationFeedback: Array.isArray(raw.pronunciationFeedback)
      ? raw.pronunciationFeedback as ProToolsPronunciationFeedback[]
      : [],
    updatedAt,
    receivedAt,
  };
}
