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

export interface ProToolsSyncRecord {
  externalTrackId: string;
  projectId?: string;
  source: string;
  bpm?: number;
  markers: ProToolsMarker[];
  takeScores: ProToolsTakeScore[];
  pronunciationFeedback: ProToolsPronunciationFeedback[];
  updatedAt: string;
  receivedAt: string;
}
