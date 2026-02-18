const DEFAULT_POLL_MS = 2000;

export interface CompanionConfig {
  apiBaseUrl: string;
  apiKey?: string;
  projectId?: string;
  source: string;
  pollMs: number;
  exportFilePath?: string;
  sessionInfoFilePath?: string;
  trackId?: string;
  importFilePath?: string;
  pullEnabled: boolean;
  pullTrackId?: string;
  logVerbose: boolean;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function loadCompanionConfig(): CompanionConfig {
  const apiBaseUrl = normalizeBaseUrl(
    process.env.EASEVERSE_API_BASE_URL?.trim() || 'http://127.0.0.1:5000'
  );

  return {
    apiBaseUrl,
    apiKey: process.env.EASEVERSE_API_KEY?.trim() || undefined,
    projectId: process.env.PROTOOLS_PROJECT_ID?.trim() || undefined,
    source: process.env.PROTOOLS_SOURCE?.trim() || 'protools-companion',
    pollMs: readPositiveInt(process.env.PROTOOLS_POLL_MS, DEFAULT_POLL_MS),
    exportFilePath: process.env.PROTOOLS_EXPORT_FILE?.trim() || undefined,
    sessionInfoFilePath: process.env.PROTOOLS_SESSION_INFO_FILE?.trim() || undefined,
    trackId: process.env.PROTOOLS_TRACK_ID?.trim() || undefined,
    importFilePath: process.env.PROTOOLS_IMPORT_FILE?.trim() || undefined,
    pullEnabled:
      process.env.PROTOOLS_PULL_ENABLED === 'true' ||
      Boolean(process.env.PROTOOLS_IMPORT_FILE?.trim()),
    pullTrackId: process.env.PROTOOLS_PULL_TRACK_ID?.trim() || undefined,
    logVerbose: process.env.PROTOOLS_VERBOSE === 'true',
  };
}
