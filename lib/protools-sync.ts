export type ProToolsSectionType =
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'final-chorus'
  | 'intro'
  | 'outro'
  | 'custom';

export type ProToolsTimingConsistency = 'low' | 'medium' | 'high';
export type ProToolsSeverity = 'low' | 'medium' | 'high';

export interface ProToolsMarker {
  id: string;
  label: string;
  positionMs: number;
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

export interface ProToolsSyncPayload {
  externalTrackId: string;
  projectId?: string;
  source?: string;
  bpm?: number;
  markers?: ProToolsMarker[];
  takeScores?: ProToolsTakeScore[];
  pronunciationFeedback?: ProToolsPronunciationFeedback[];
  updatedAt?: string;
}

export interface ProToolsSyncRecord extends Required<Pick<ProToolsSyncPayload, 'externalTrackId'>> {
  projectId?: string;
  source: string;
  bpm?: number;
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
  if (params?.projectId?.trim()) {
    search.set('projectId', params.projectId.trim());
  }
  if (params?.source?.trim()) {
    search.set('source', params.source.trim());
  }
  if (params?.externalTrackId?.trim()) {
    search.set('externalTrackId', params.externalTrackId.trim());
  }

  const query = search.toString();
  return query ? `/api/v1/collab/protools?${query}` : '/api/v1/collab/protools';
}

export function buildProToolsTrackSyncRoute(
  externalTrackId: string,
  params?: { projectId?: string }
): string {
  const encodedTrackId = encodeURIComponent(externalTrackId.trim());
  const base = `/api/v1/collab/protools/${encodedTrackId}`;

  if (!params?.projectId?.trim()) {
    return base;
  }

  const search = new URLSearchParams();
  search.set('projectId', params.projectId.trim());
  return `${base}?${search.toString()}`;
}

export function parseProToolsSyncRecord(input: unknown): ProToolsSyncRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const raw = input as Record<string, unknown>;
  if (typeof raw.externalTrackId !== 'string' || typeof raw.source !== 'string') {
    return null;
  }
  if (typeof raw.updatedAt !== 'string' || typeof raw.receivedAt !== 'string') {
    return null;
  }

  return {
    externalTrackId: raw.externalTrackId,
    projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
    source: raw.source,
    bpm: typeof raw.bpm === 'number' ? raw.bpm : undefined,
    markers: Array.isArray(raw.markers) ? (raw.markers as ProToolsMarker[]) : [],
    takeScores: Array.isArray(raw.takeScores) ? (raw.takeScores as ProToolsTakeScore[]) : [],
    pronunciationFeedback: Array.isArray(raw.pronunciationFeedback)
      ? (raw.pronunciationFeedback as ProToolsPronunciationFeedback[])
      : [],
    updatedAt: raw.updatedAt,
    receivedAt: raw.receivedAt,
  };
}
