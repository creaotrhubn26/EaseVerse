// iOS may relocate the app sandbox during an update. Rebase only known app-local
// document/cache paths; never reinterpret remote URLs, content URIs or traversal.
export function recordingCandidates(uri: string, documents: string, cache: string): string[] {
  if (!uri.startsWith('file://')) return [uri];
  const match = uri.match(/\/Containers\/Data\/Application\/[^/]+\/(Documents|Library\/Caches)\/(.+)$/)
    ?? uri.match(/^file:\/\/\/data\/(?:user\/\d+|data)\/com\.easeverse\.app\/(files|cache)\/(.+)$/);
  if (!match) return [uri];
  let path: string;
  try { path = decodeURIComponent(match[2]); } catch { return [uri]; }
  if (path.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) return [uri];
  const root = ['Documents', 'files'].includes(match[1]) ? documents : cache;
  return [...new Set([uri, `${root}${path}`])];
}

type FileInfo = { exists: boolean; isDirectory?: boolean };
export type RecordingFiles = {
  documents: string;
  cache: string;
  info: (uri: string) => Promise<FileInfo>;
  mkdir: (uri: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
};
export async function preserveRecording(uri: string, files: RecordingFiles, takeId?:string): Promise<string> {
  if (!uri.startsWith('file://') || !files.documents) return uri;
  let resolved = uri;
  try {
    for (const candidate of recordingCandidates(uri, files.documents, files.cache)) {
      const info = await files.info(candidate);
      if (info.exists && !info.isDirectory) { resolved = candidate; break; }
    }
    const source = await files.info(resolved);
    if (!source.exists || source.isDirectory) return uri; // Missing audio stays visibly unavailable.
    const name = resolved.slice(resolved.lastIndexOf('/') + 1);
    if (!/^[a-zA-Z0-9_.-]+\.(?:m4a|wav|aac|mp3|caf|webm)$/i.test(name)) return resolved;
    const directory = `${files.documents}easeverse-recordings/`;
    // Migration reuses an existing durable copy. A NEW take must never select
    // that copy: native recorders can reuse the same cache filename each time.
    if(takeId&&!/^[a-zA-Z0-9_-]+$/.test(takeId))return resolved;
    const destination = `${directory}${takeId?`take-${takeId}.${name.split('.').pop()}`:name}`;
    if (resolved === destination) return destination;
    await files.mkdir(directory);
    if (!(await files.info(destination)).exists) await files.copy(resolved, destination);
    else if(takeId)return resolved; // Never substitute old audio on an identity collision.
    return destination;
  } catch {
    // Keep the original available take on a full disk; retry migration next load.
    // Never delete cache/source audio until a durable copy is known to exist.
    return resolved;
  }
}
