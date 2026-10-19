const EASEVERSE_INTERNAL_ORIGIN = "https://easeverse.invalid";

/** Only known integration and invitation routes may resume after authentication. */
export function safeCreatorHubAuthNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > 2_000 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//")
  ) {
    return null;
  }
  try {
    const parsed = new URL(candidate, EASEVERSE_INTERNAL_ORIGIN);
    if (
      parsed.origin !== EASEVERSE_INTERNAL_ORIGIN ||
      (parsed.pathname !== "/integrations/creatorhub" &&
        !/^\/sound-room\/invite\/inv_[A-Za-z0-9_-]{16,76}\/?$/.test(
          parsed.pathname
        ))
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
