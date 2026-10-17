/** Keep unexpired audio sources stable while lyrics and feedback refresh. */
export function mergeBoothSnapshot<
  T extends {
    projectId?: string;
    trackId: string;
    referenceTrack: any;
    takes: any[];
  },
>(previous: T | null, next: T, now = Date.now()): T {
  if (
    !previous ||
    previous.trackId !== next.trackId ||
    previous.projectId !== next.projectId
  )
    return next;
  const reference = previous.referenceTrack;
  return {
    ...next,
    referenceTrack:
      reference &&
      next.referenceTrack &&
      reference.versionId === next.referenceTrack.versionId &&
      reference.expiresAt > now + 60_000
        ? {
            ...next.referenceTrack,
            url: reference.url,
            expiresAt: reference.expiresAt,
          }
        : next.referenceTrack,
    takes: next.takes.map((take) => {
      const old = previous.takes.find((item) => item.id === take.id);
      return old?.audioExpiresAt > now + 60_000
        ? {
            ...take,
            audioUrl: old.audioUrl,
            audioExpiresAt: old.audioExpiresAt,
          }
        : take;
    }),
  };
}
