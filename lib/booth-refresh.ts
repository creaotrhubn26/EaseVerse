/** One request at a time; late responses never reach a closed/backgrounded room. */
export function createBoothRefresh<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  onSnapshot: (snapshot: T) => void;
  onError: (error: unknown) => void;
  onSettled?: () => void;
  intervalMs?: number;
  timeoutMs?: number;
  initiallyActive?: boolean;
}) {
  let active = options.initiallyActive ?? true;
  let disposed = false;
  let pending: { controller: AbortController; promise: Promise<void> } | null = null;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(poll);
    clearTimeout(deadline);
    pending?.controller.abort();
    pending = null;
  }

  function refresh(): Promise<void> {
    if (disposed || !active) return Promise.resolve();
    if (pending) return pending.promise;
    clearTimeout(poll);
    const controller = new AbortController();
    const request = { controller, promise: Promise.resolve() };
    pending = request;
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new Error("Song updates timed out. Check your connection and try again."));
      }, options.timeoutMs ?? 15_000);
    });
    request.promise = Promise.race([
      Promise.resolve().then(() => options.read(controller.signal)),
      timeout,
    ]).then(snapshot => {
      if (!disposed && active && pending === request) options.onSnapshot(snapshot);
    }).catch(error => {
      if (!disposed && active && pending === request) options.onError(error);
    }).finally(() => {
      if (pending !== request) return;
      clearTimeout(deadline);
      pending = null;
      if (!disposed && active) {
        options.onSettled?.();
        poll = setTimeout(() => void refresh(), options.intervalMs ?? 5_000);
      }
    });
    return request.promise;
  }

  return {
    refresh,
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (active) void refresh();
      else cancel();
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
