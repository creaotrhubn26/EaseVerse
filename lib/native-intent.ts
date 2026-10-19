/** Preserve supported project/song links when iOS opens a stopped app. */
export function resolveNativeIntent(path: string, initial: boolean): string {
  if (!path) return "/";
  try {
    let destination: URL;
    if (path.startsWith("/") && !path.startsWith("//")) {
      destination = new URL(path, "https://easeverse.netlify.app");
    } else {
      const external = new URL(path);
      if (external.protocol === "easeverse:") {
        destination = new URL(
          `/${external.hostname}${external.pathname}${external.search}`,
          "https://easeverse.netlify.app"
        );
      } else if (
        external.protocol === "https:" &&
        [
          "easeverse.netlify.app",
          "easeverse.app",
          "www.easeverse.app",
        ].includes(external.hostname)
      ) {
        destination = external;
      } else return "/";
    }
    const route = destination.pathname;
    if (
      /^\/(booth|projects)\/[A-Za-z0-9._-]{1,160}\/?$/.test(route) ||
      route === "/integrations/creatorhub" ||
      route === "/auth/callback" ||
      /^\/sound-room\/invite\/inv_[A-Za-z0-9_-]{16,76}\/?$/.test(route)
    ) {
      return `${route}${destination.search}`;
    }
  } catch {
    return "/";
  }
  return "/";
}
