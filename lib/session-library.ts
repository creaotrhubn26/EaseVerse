import type { Session } from './types';

export type SessionLibraryFilter = 'latest' | 'match' | 'favorites';

/** Lyric matching is not a rating of the performance or voice. */
export function sessionLyricMatch(session: Session): number | null {
  if (session.insights?.analysisAvailable === false) return null;
  const score = session.insights?.textAccuracy;
  return session.lyrics?.trim() && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
    ? score : null;
}

export function selectLibrarySessions(sessions: Session[], filter: SessionLibraryFilter, query: string): Session[] {
  const needle = query.trim().toLocaleLowerCase();
  return sessions.filter(session => {
    if (filter === 'favorites' && !session.favorite) return false;
    return !needle || [session.title, session.genre ?? '', ...(session.tags ?? [])]
      .some(value => value.toLocaleLowerCase().includes(needle));
  }).sort((a, b) => {
    if (filter === 'match') {
      const difference = (sessionLyricMatch(b) ?? -1) - (sessionLyricMatch(a) ?? -1);
      if (difference) return difference;
    }
    return b.date - a.date;
  });
}
