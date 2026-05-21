// Given the lyrics the vocalist sang against (with optional section
// headers like "[Verse 1]" / "[Chorus]") and a Whisper word-timestamp
// list, return when each section starts and ends in the take.
//
// Matching strategy: for each section, take its first non-stopword
// word and walk through the transcript looking for the next occurrence
// after the previous section. Cheap, robust to slight word swaps.

export type WordStamp = { word: string; start: number; end: number };

export type DetectedSection = {
  label: string;
  type: string;
  startSec: number;
  endSec: number;
  lyricsFirstWord: string;
};

const STOP = new Set([
  "a","an","the","and","or","but","of","to","in","on","at","is","are","was","were",
  "i","you","we","they","he","she","it","my","your","our","their",
  "oh","ooh","ah","ahh","yeah","na","la","da",
]);

function norm(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

const SECTION_RE = /^\s*\[\s*([^\]]+)\s*\]\s*$/i;

function classifySection(rawHeader: string): { type: string; label: string } {
  const lower = rawHeader.toLowerCase();
  if (lower.includes("verse")) return { type: "verse", label: rawHeader };
  if (lower.includes("pre")) return { type: "pre-chorus", label: rawHeader };
  if (lower.includes("chorus") || lower.includes("hook")) return { type: "chorus", label: rawHeader };
  if (lower.includes("bridge")) return { type: "bridge", label: rawHeader };
  if (lower.includes("outro")) return { type: "outro", label: rawHeader };
  if (lower.includes("intro")) return { type: "intro", label: rawHeader };
  return { type: "section", label: rawHeader };
}

function lyricsToSections(lyrics: string): Array<{
  type: string;
  label: string;
  firstContentWord: string;
}> {
  const lines = lyrics.split(/\r?\n/);
  const sections: Array<{ type: string; label: string; firstContentWord: string }> = [];
  let current: { type: string; label: string; firstContentWord: string } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(SECTION_RE);
    if (headerMatch) {
      const c = classifySection(headerMatch[1]);
      if (current && current.firstContentWord) sections.push(current);
      current = { type: c.type, label: c.label, firstContentWord: "" };
      continue;
    }
    if (!current) {
      current = { type: "verse", label: "Verse 1", firstContentWord: "" };
    }
    if (current.firstContentWord) continue;
    for (const raw of line.split(/\s+/)) {
      const n = norm(raw);
      if (n && !STOP.has(n)) {
        current.firstContentWord = n;
        break;
      }
    }
  }
  if (current && current.firstContentWord) sections.push(current);
  return sections;
}

export function detectSections(args: {
  lyrics: string | null | undefined;
  words: WordStamp[];
}): DetectedSection[] {
  if (!args.lyrics || args.words.length === 0) return [];
  const sections = lyricsToSections(args.lyrics);
  if (sections.length === 0) return [];
  const normedWords = args.words.map((w) => ({ norm: norm(w.word), start: w.start, end: w.end }));

  const detected: DetectedSection[] = [];
  let searchFrom = 0;
  for (const sec of sections) {
    const target = sec.firstContentWord;
    let found = -1;
    for (let i = searchFrom; i < normedWords.length; i++) {
      if (normedWords[i].norm === target) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      // Skip this section if first-word didn't match anywhere ahead.
      continue;
    }
    detected.push({
      label: sec.label,
      type: sec.type,
      startSec: normedWords[found].start,
      endSec: normedWords[normedWords.length - 1].end,
      lyricsFirstWord: target,
    });
    searchFrom = found + 1;
  }

  // Tighten endSec to the start of the next detected section.
  for (let i = 0; i < detected.length - 1; i++) {
    detected[i].endSec = detected[i + 1].startSec;
  }

  return detected;
}
