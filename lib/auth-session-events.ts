type InvalidSessionListener = (reason: string) => void | Promise<void>;

const listeners = new Set<InvalidSessionListener>();
let notificationInFlight: Promise<void> | null = null;

export function onInvalidCreatorHubSession(listener: InvalidSessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyInvalidCreatorHubSession(reason: string): Promise<void> {
  if (notificationInFlight) return notificationInFlight;
  notificationInFlight = Promise.allSettled(
    [...listeners].map((listener) => listener(reason)),
  ).then(() => undefined).finally(() => {
    notificationInFlight = null;
  });
  return notificationInFlight;
}

export function responseIndicatesInvalidSession(status: number, body: unknown): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;
  const text = typeof body === "string"
    ? body
    : body && typeof body === "object"
      ? JSON.stringify(body)
      : "";
  return /auth|session|token|sign[ -]?in|login|expired|revoked/i.test(text);
}

export async function inspectCreatorHubAuthResponse(response: Response): Promise<void> {
  if (response.status !== 401 && response.status !== 403) return;
  const body = await response.clone().text().catch(() => "");
  if (responseIndicatesInvalidSession(response.status, body)) {
    await notifyInvalidCreatorHubSession(`http_${response.status}`);
  }
}
