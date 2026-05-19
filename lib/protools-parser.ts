// Pure web-friendly parser for Pro Tools "Export Session Info as Text…" output.
// Duplicates the text-parsing logic from companion/src/adapters/protools-session-info-parser.ts
// so the Expo web bundle does not need to depend on the Node-only companion package.

export type ProToolsSectionType =
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "final-chorus"
  | "intro"
  | "outro";

export interface ProToolsMarker {
  id: string;
  label: string;
  positionMs: number;
  sectionType?: ProToolsSectionType;
}

export interface ParsedSessionInfo {
  sessionName?: string;
  bpm?: number;
  markers: ProToolsMarker[];
}

function inferSectionType(label: string): ProToolsSectionType | undefined {
  const n = label.trim().toLowerCase();
  if (n.includes("pre-chorus") || n.includes("pre chorus")) return "pre-chorus";
  if (n.includes("final chorus")) return "final-chorus";
  if (n.includes("chorus")) return "chorus";
  if (n.includes("verse")) return "verse";
  if (n.includes("bridge")) return "bridge";
  if (n.includes("intro")) return "intro";
  if (n.includes("outro")) return "outro";
  return undefined;
}

function parseTimeToMs(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric * 1000));
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;
  if (parts.length === 4) {
    const [hh, mm, ss, ff] = parts.map(Number);
    if ([hh, mm, ss, ff].some((v) => !Number.isFinite(v))) return null;
    const fps = 30;
    return Math.max(0, Math.round((hh * 3600 + mm * 60 + ss + ff / fps) * 1000));
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts.map(Number);
    if ([hh, mm, ss].some((v) => !Number.isFinite(v))) return null;
    return Math.max(0, Math.round((hh * 3600 + mm * 60 + ss) * 1000));
  }
  if (parts.length === 2) {
    const [mm, ss] = parts.map(Number);
    if ([mm, ss].some((v) => !Number.isFinite(v))) return null;
    return Math.max(0, Math.round((mm * 60 + ss) * 1000));
  }
  return null;
}

function parseSessionName(text: string): string | undefined {
  const patterns = [
    /session\s*name\s*[:\t]\s*(.+)$/im,
    /^\s*session\s*[:\t]\s*(.+)$/im,
    /^\s*session\s+name\s*[-:]\s*(.+)$/im,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function parseBpm(lines: string[]): number | undefined {
  const candidates: number[] = [];
  let inTempoSection = false;
  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) {
      inTempoSection = false;
      continue;
    }
    if (
      normalized.includes("tempo map") ||
      normalized.includes("tempo events") ||
      normalized.includes("meter/tempo")
    ) inTempoSection = true;
    const bpmTagged = line.match(/\b([4-9]\d|[1-2]\d{2})(?:\.\d+)?\s*bpm\b/gi);
    if (bpmTagged) {
      for (const token of bpmTagged) {
        const numeric = Number(token.toLowerCase().replace("bpm", "").trim());
        if (Number.isFinite(numeric) && numeric >= 40 && numeric <= 300) {
          candidates.push(Math.round(numeric));
        }
      }
    }
    if (inTempoSection || normalized.includes("tempo")) {
      for (const t of line.split(/[\s\t|,;]+/)) {
        if (!t || !/^\d+(?:\.\d+)?$/.test(t)) continue;
        const n = Number(t);
        if (n >= 40 && n <= 300) candidates.push(Math.round(n));
      }
    }
  }
  return candidates.find((v) => Number.isFinite(v));
}

function parseMarkerLine(line: string, indexHint: number): ProToolsMarker | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (
    lowered.includes("marker id") ||
    lowered === "markers" ||
    lowered.includes("memory locations") ||
    lowered.includes("location name")
  ) return null;

  const a = line.match(/marker\s*#?\s*(\d+)?\s*[:\-\t ]+(.+?)\s+[\-\t ]+([0-9:.]+)\s*$/i);
  if (a) {
    const id = a[1] || `${indexHint}`;
    const label = (a[2] || "").trim();
    const ms = parseTimeToMs(a[3] || "");
    if (label && ms !== null)
      return { id: `m-${id}`, label: label.slice(0, 160), positionMs: ms, sectionType: inferSectionType(label) };
  }

  const b = line.match(/^\s*(\d+)\s+[\t ]+([^\t]+?)\s+[\t ]+([0-9:.]+)\s*$/);
  if (b) {
    const label = (b[2] || "").trim();
    const ms = parseTimeToMs(b[3] || "");
    if (label && ms !== null)
      return { id: `m-${b[1]}`, label: label.slice(0, 160), positionMs: ms, sectionType: inferSectionType(label) };
  }

  const timeToken = line.match(/\b(\d{1,2}:\d{2}:\d{2}(?::\d{2})?)\b|\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (timeToken) {
    const timeRaw = (timeToken[1] || timeToken[2] || "").trim();
    const ms = parseTimeToMs(timeRaw);
    if (ms !== null) {
      const label = line.replace(timeRaw, "").replace(/[\t|\-]+/g, " ").replace(/\s+/g, " ").trim();
      if (label && /[A-Za-z]/.test(label))
        return { id: `m-${indexHint}`, label: label.slice(0, 160), positionMs: ms, sectionType: inferSectionType(label) };
    }
  }
  return null;
}

function parseMarkers(lines: string[]): ProToolsMarker[] {
  const markers: ProToolsMarker[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = parseMarkerLine(lines[i] || "", i + 1);
    if (m) markers.push(m);
  }
  const seen = new Map<string, ProToolsMarker>();
  for (const m of markers) {
    const key = `${m.label.toLowerCase()}::${m.positionMs}`;
    if (!seen.has(key)) seen.set(key, m);
  }
  return Array.from(seen.values())
    .sort((a, b) => a.positionMs - b.positionMs)
    .slice(0, 500);
}

export function parseProToolsSessionInfoText(text: string): ParsedSessionInfo {
  const lines = text.split(/\r?\n/);
  return {
    sessionName: parseSessionName(text),
    bpm: parseBpm(lines),
    markers: parseMarkers(lines),
  };
}

export function normalizeTrackId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
