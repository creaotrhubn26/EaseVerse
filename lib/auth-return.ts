const EASEVERSE_INTERNAL_ORIGIN = "https://easeverse.invalid";

/** Resume only explicitly supported local screens after authentication. */
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
    if (parsed.origin !== EASEVERSE_INTERNAL_ORIGIN) {
      return null;
    }
    if (parsed.pathname === "/integrations/creatorhub")
      return `${parsed.pathname}${parsed.search}`;
    if (/^\/sound-room\/invite\/inv_[A-Za-z0-9_-]{16,76}\/?$/.test(parsed.pathname))
      return parsed.pathname;
    if (parsed.pathname === "/warmup-session") {
      const projectId = parsed.searchParams.get("projectId");
      if (!projectId || !/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) return null;
      return `/warmup-session?projectId=${encodeURIComponent(projectId)}`;
    }
    return null;
  } catch {
    return null;
  }
}
