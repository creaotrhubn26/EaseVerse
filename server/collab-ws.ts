import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer } from "ws";

type CollabLyricsSubscription = {
  source?: string;
  projectId?: string;
  externalTrackId?: string;
};

export type CollabLyricsRealtimePayload = {
  externalTrackId: string;
  title: string;
  projectId?: string;
  source?: string;
  artist?: string;
  bpm?: number;
  updatedAt: string;
  collaborators: string[];
};

type CollabLyricsRealtimeMessage = {
  type: "collab_lyrics_updated";
  sentAt: string;
  item: CollabLyricsRealtimePayload;
};

type CreateCollabLyricsRealtimeHubOptions = {
  server: HttpServer;
  path?: string;
  expectedApiKey?: string;
  allowAllOrigins?: boolean;
  allowedOrigins?: string[];
};

export type CollabLyricsRealtimeHub = {
  publish(item: CollabLyricsRealtimePayload): void;
  close(): void;
  getClientCount(): number;
};

type LiveSocket = WebSocket & { isAlive?: boolean };

function parseRequestUrl(req: IncomingMessage): URL | null {
  const host = req.headers.host || "localhost";
  const rawUrl = req.url || "/";
  try {
    return new URL(rawUrl, `http://${host}`);
  } catch {
    return null;
  }
}

function normalizeOptional(value: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractApiKeyFromRequest(req: IncomingMessage, parsedUrl: URL): string | undefined {
  const xApiKeyHeader = req.headers["x-api-key"];
  if (typeof xApiKeyHeader === "string" && xApiKeyHeader.trim().length > 0) {
    return xApiKeyHeader.trim();
  }
  if (Array.isArray(xApiKeyHeader) && xApiKeyHeader.length > 0) {
    const first = xApiKeyHeader[0]?.trim();
    if (first) {
      return first;
    }
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const queryApiKey = normalizeOptional(parsedUrl.searchParams.get("apiKey"));
  if (queryApiKey) {
    return queryApiKey;
  }

  const queryToken = normalizeOptional(parsedUrl.searchParams.get("token"));
  if (queryToken) {
    return queryToken;
  }

  return undefined;
}

function rejectUpgrade(socket: Socket, statusLine: string) {
  socket.write(`${statusLine}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function parseAllowedOrigins(
  allowedOrigins: string[] | undefined,
  allowAllOrigins: boolean | undefined
): { allowAllOrigins: boolean; allowedOrigins: Set<string> } {
  const normalized = new Set<string>();
  for (const origin of allowedOrigins || []) {
    const trimmed = origin.trim();
    if (!trimmed) {
      continue;
    }
    normalized.add(trimmed);
  }

  return {
    allowAllOrigins: Boolean(allowAllOrigins),
    allowedOrigins: normalized,
  };
}

function isOriginAllowed(
  request: IncomingMessage,
  options: { allowAllOrigins: boolean; allowedOrigins: Set<string> }
): boolean {
  if (options.allowAllOrigins) {
    return true;
  }

  const originHeader = request.headers.origin;
  if (!originHeader) {
    return true;
  }

  const isLocalhost =
    originHeader.startsWith("http://localhost:") ||
    originHeader.startsWith("http://127.0.0.1:");
  if (isLocalhost) {
    return true;
  }

  return options.allowedOrigins.has(originHeader);
}

function matchesSubscription(
  subscription: CollabLyricsSubscription,
  payload: CollabLyricsRealtimePayload
): boolean {
  if (subscription.externalTrackId && subscription.externalTrackId !== payload.externalTrackId) {
    return false;
  }
  if (subscription.projectId && subscription.projectId !== payload.projectId) {
    return false;
  }
  if (subscription.source && subscription.source !== payload.source) {
    return false;
  }
  return true;
}

function safeSend(socket: WebSocket, text: string) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    socket.send(text);
  } catch {
    socket.close();
  }
}

export function createCollabLyricsRealtimeHub(
  options: CreateCollabLyricsRealtimeHubOptions
): CollabLyricsRealtimeHub {
  const path = options.path || "/api/v1/ws";
  const expectedApiKey = options.expectedApiKey?.trim() || "";
  const originOptions = parseAllowedOrigins(options.allowedOrigins, options.allowAllOrigins);
  const subscriptions = new Map<WebSocket, CollabLyricsSubscription>();
  const websocketServer = new WebSocketServer({ noServer: true });

  websocketServer.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const parsedUrl = parseRequestUrl(request);
    const subscription: CollabLyricsSubscription = {
      source: normalizeOptional(parsedUrl?.searchParams.get("source") || null),
      projectId: normalizeOptional(parsedUrl?.searchParams.get("projectId") || null),
      externalTrackId: normalizeOptional(
        parsedUrl?.searchParams.get("externalTrackId") || null
      ),
    };
    subscriptions.set(socket, subscription);

    const liveSocket = socket as LiveSocket;
    liveSocket.isAlive = true;
    socket.on("pong", () => {
      liveSocket.isAlive = true;
    });

    socket.on("close", () => {
      subscriptions.delete(socket);
    });

    safeSend(
      socket,
      JSON.stringify({
        type: "ready",
        channel: "collab_lyrics",
        filters: subscription,
        serverTime: new Date().toISOString(),
      })
    );
  });

  const heartbeatInterval = setInterval(() => {
    for (const socket of websocketServer.clients) {
      const liveSocket = socket as LiveSocket;
      if (liveSocket.isAlive === false) {
        socket.terminate();
        continue;
      }
      liveSocket.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, 30_000);

  const handleUpgrade = (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer
  ) => {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl || parsedUrl.pathname !== path) {
      return;
    }

    if (!isOriginAllowed(request, originOptions)) {
      rejectUpgrade(socket, "HTTP/1.1 403 Forbidden");
      return;
    }

    if (expectedApiKey) {
      const providedApiKey = extractApiKeyFromRequest(request, parsedUrl);
      if (providedApiKey !== expectedApiKey) {
        rejectUpgrade(socket, "HTTP/1.1 401 Unauthorized");
        return;
      }
    }

    websocketServer.handleUpgrade(request, socket, head, (clientSocket: WebSocket) => {
      websocketServer.emit("connection", clientSocket, request);
    });
  };

  options.server.on("upgrade", handleUpgrade);

  return {
    publish(item: CollabLyricsRealtimePayload) {
      const message: CollabLyricsRealtimeMessage = {
        type: "collab_lyrics_updated",
        sentAt: new Date().toISOString(),
        item,
      };
      const text = JSON.stringify(message);
      for (const [socket, subscription] of subscriptions.entries()) {
        if (!matchesSubscription(subscription, item)) {
          continue;
        }
        safeSend(socket, text);
      }
    },
    close() {
      clearInterval(heartbeatInterval);
      options.server.off("upgrade", handleUpgrade);
      for (const socket of subscriptions.keys()) {
        try {
          socket.close();
        } catch {
          // Ignore close errors.
        }
      }
      subscriptions.clear();
      websocketServer.close();
    },
    getClientCount() {
      return subscriptions.size;
    },
  };
}
