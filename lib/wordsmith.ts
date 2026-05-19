const DATAMUSE_BASE = 'https://api.datamuse.com';

type DatamuseWord = { word: string; score?: number };

async function fetchDatamuse(relation: string, word: string, limit = 12): Promise<string[]> {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) return [];
  const url = `${DATAMUSE_BASE}/words?${relation}=${encodeURIComponent(trimmed)}&max=${limit}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as DatamuseWord[];
    return data.map((item) => item.word).filter(Boolean);
  } catch {
    return [];
  }
}

export function fetchRhymes(word: string, limit = 12): Promise<string[]> {
  return fetchDatamuse('rel_rhy', word, limit);
}

export function fetchNearRhymes(word: string, limit = 12): Promise<string[]> {
  return fetchDatamuse('rel_nry', word, limit);
}

export function fetchSynonyms(word: string, limit = 12): Promise<string[]> {
  return fetchDatamuse('rel_syn', word, limit);
}

export function fetchMeansLike(word: string, limit = 12): Promise<string[]> {
  return fetchDatamuse('ml', word, limit);
}
