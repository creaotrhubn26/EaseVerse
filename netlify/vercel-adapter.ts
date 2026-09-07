import { getConnectionString } from "@netlify/database";

type VercelStyleHandler = (request: any, response: any) => unknown;

type NetlifyContext = {
  params?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export function enforceVerifiedSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
      return connectionString;
    }
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    // Preserve non-URL connection strings exactly as provided by the SDK.
  }
  return connectionString;
}

function configureDatabaseConnection() {
  if (process.env.DATABASE_URL) return;
  if (!process.env.NETLIFY && !process.env.SITE_ID) return;
  try {
    const connectionString = getConnectionString();
    if (connectionString) {
      process.env.DATABASE_URL = enforceVerifiedSslMode(connectionString);
    }
  } catch (error) {
    console.warn("Netlify Database is not available for this invocation:", error);
  }
}

function queryFromUrl(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  }
  return query;
}

function headersFromRequest(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const url = new URL(request.url);
  headers.host ??= url.host;
  headers["x-forwarded-host"] ??= url.host;
  headers["x-forwarded-proto"] ??= url.protocol.replace(":", "");
  return headers;
}

function cookiesFromHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

async function bodyFromRequest(request: Request): Promise<{ body: unknown; rawBody: Buffer }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { body: undefined, rawBody: Buffer.alloc(0) };
  }
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length === 0) return { body: undefined, rawBody };

  const text = rawBody.toString("utf8");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return { body: JSON.parse(text), rawBody };
    } catch {
      return { body: text, rawBody };
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { body: Object.fromEntries(new URLSearchParams(text)), rawBody };
  }
  return { body: text, rawBody };
}

class VercelResponseAdapter {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  finished = false;
  writableEnded = false;

  private readonly headers = new Headers();
  private readonly stream: ReadableStream<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private response?: Response;
  private wroteBody = false;
  private resolveResponse!: (response: Response) => void;
  readonly responsePromise: Promise<Response>;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    this.responsePromise = new Promise<Response>((resolve) => {
      this.resolveResponse = resolve;
    });
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | number | readonly string[]) {
    this.assertHeadersMutable();
    this.headers.delete(name);
    if (Array.isArray(value)) {
      for (const item of value) this.headers.append(name, String(item));
    } else {
      this.headers.set(name, String(value));
    }
    return this;
  }

  getHeader(name: string) {
    return this.headers.get(name) ?? undefined;
  }

  getHeaders() {
    return Object.fromEntries(this.headers.entries());
  }

  removeHeader(name: string) {
    this.assertHeadersMutable();
    this.headers.delete(name);
  }

  json(value: unknown) {
    if (!this.headers.has("content-type")) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    return this.end(JSON.stringify(value));
  }

  send(value?: unknown) {
    if (value === undefined || value === null) return this.end();
    if (
      typeof value === "object" &&
      !Buffer.isBuffer(value) &&
      !(value instanceof Uint8Array) &&
      !(value instanceof ArrayBuffer)
    ) {
      return this.json(value);
    }
    return this.end(value);
  }

  sendStatus(code: number) {
    this.status(code);
    if (!this.headers.has("content-type")) {
      this.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    return this.end(String(code));
  }

  redirect(statusOrUrl: number | string, maybeUrl?: string) {
    const status = typeof statusOrUrl === "number" ? statusOrUrl : 302;
    const location = typeof statusOrUrl === "string" ? statusOrUrl : maybeUrl;
    if (!location) throw new TypeError("redirect requires a URL");
    this.status(status);
    this.setHeader("Location", location);
    return this.end();
  }

  write(value: unknown) {
    if (this.finished) return false;
    this.startResponse();
    this.wroteBody = true;
    this.controller.enqueue(this.toBytes(value));
    return true;
  }

  end(value?: unknown) {
    if (this.finished) return this;
    if (value !== undefined && value !== null) {
      this.write(value);
    } else {
      const bodyForbidden = [204, 205, 304].includes(this.statusCode);
      this.startResponse(bodyForbidden ? null : this.stream);
    }
    this.finished = true;
    this.writableEnded = true;
    if (this.wroteBody || ![204, 205, 304].includes(this.statusCode)) {
      this.controller.close();
    }
    return this;
  }

  fail(error: unknown) {
    if (!this.headersSent) {
      this.status(500).json({ error: "Internal Server Error" });
      return;
    }
    if (!this.finished) {
      this.finished = true;
      this.writableEnded = true;
      this.controller.error(error);
    }
  }

  private assertHeadersMutable() {
    if (this.headersSent) {
      throw new Error("Cannot modify headers after the response has started");
    }
  }

  private startResponse(body: BodyInit | null = this.stream) {
    if (this.response) return;
    this.headersSent = true;
    this.response = new Response(body, {
      status: this.statusCode,
      statusText: this.statusMessage || undefined,
      headers: this.headers,
    });
    this.resolveResponse(this.response);
  }

  private toBytes(value: unknown): Uint8Array {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return this.encoder.encode(String(value));
  }
}

export function adaptVercelHandler(handler: VercelStyleHandler) {
  return async (request: Request, context: NetlifyContext = {}): Promise<Response> => {
    configureDatabaseConnection();
    const url = new URL(request.url);
    const { body, rawBody } = await bodyFromRequest(request);
    const headers = headersFromRequest(request);
    const closeListeners = new Set<() => void>();
    const notifyClose = () => {
      for (const listener of closeListeners) listener();
      closeListeners.clear();
    };
    request.signal.addEventListener("abort", notifyClose, { once: true });

    const query = queryFromUrl(url);
    Object.assign(query, context.params ?? {});
    const nodeRequest = {
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers,
      query,
      body,
      rawBody,
      cookies: cookiesFromHeader(headers.cookie),
      on(event: string, listener: () => void) {
        if (event === "close") closeListeners.add(listener);
        return this;
      },
      once(event: string, listener: () => void) {
        if (event === "close") closeListeners.add(listener);
        return this;
      },
    };

    const response = new VercelResponseAdapter();
    const handlerPromise = Promise.resolve()
      .then(() => handler(nodeRequest, response))
      .then(() => {
        if (!response.finished) response.end();
      })
      .catch((error) => {
        console.error("Netlify Vercel adapter handler error:", error);
        response.fail(error);
      })
      .finally(notifyClose);

    context.waitUntil?.(handlerPromise);
    return response.responsePromise;
  };
}
