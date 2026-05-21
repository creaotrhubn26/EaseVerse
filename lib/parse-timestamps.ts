// Parse "@M:SS" or "@MM:SS" or "@H:MM:SS" timestamps from producer notes.
// Returns a list of segments — either plain text or a clickable timestamp.

export type NoteSegment =
  | { kind: "text"; text: string }
  | { kind: "timestamp"; raw: string; seconds: number };

const TIMESTAMP_RE = /@(\d{1,2}:\d{2}(?::\d{2})?)/g;

export function parseProducerNote(note: string | null | undefined): NoteSegment[] {
  if (!note) return [];
  const segments: NoteSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  TIMESTAMP_RE.lastIndex = 0;
  while ((match = TIMESTAMP_RE.exec(note)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: note.slice(cursor, match.index) });
    }
    const seconds = parseTimestamp(match[1]);
    if (seconds !== null) {
      segments.push({ kind: "timestamp", raw: match[0], seconds });
    } else {
      segments.push({ kind: "text", text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < note.length) {
    segments.push({ kind: "text", text: note.slice(cursor) });
  }
  return segments;
}

function parseTimestamp(value: string): number | null {
  const parts = value.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s >= 60) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
