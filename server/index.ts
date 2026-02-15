import express from "express";
import type { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";

function normalizeEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1);
    return unquoted.replace(/\\n/g, "\n");
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    const value = normalizeEnvValue(normalizedLine.slice(separatorIndex + 1));
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.resolve(cwd, ".env"));
  loadEnvFile(path.resolve(cwd, ".env.local"));
}

loadLocalEnv();

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function configureTrustProxy(app: express.Application) {
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === "true") {
    app.set("trust proxy", true);
    return;
  }
  if (trustProxy === "false") {
    app.set("trust proxy", false);
    return;
  }

  const trustProxyHops = process.env.TRUST_PROXY_HOPS;
  if (trustProxyHops) {
    const parsedHops = Number.parseInt(trustProxyHops, 10);
    if (Number.isFinite(parsedHops) && parsedHops >= 0) {
      app.set("trust proxy", parsedHops);
      return;
    }
  }

  if (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS) {
    app.set("trust proxy", 1);
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();
    const externalOrigins = process.env.CORS_ALLOW_ORIGINS
      ? process.env.CORS_ALLOW_ORIGINS.split(",")
          .map((origin: string) => origin.trim())
          .filter((origin: string) => Boolean(origin))
      : [];
    const allowAllOrigins = process.env.CORS_ALLOW_ALL === "true";

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    externalOrigins.forEach((origin: string) => {
      origins.add(origin);
    });

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (allowAllOrigins || origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", allowAllOrigins ? "*" : origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key",
      );
      if (!allowAllOrigins) {
        res.header("Access-Control-Allow-Credentials", "true");
      }
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  const webBuildPath = path.resolve(process.cwd(), "web-build");
  const webIndexPath = path.join(webBuildPath, "index.html");
  const hasWebBuild = fs.existsSync(webIndexPath);

  if (hasWebBuild) {
    // Serve exported web build assets from the server root. The exported `index.html`
    // references `/_expo/*` and `/assets/*` as absolute paths.
    app.use(express.static(webBuildPath, { index: false }));

    // Legacy compatibility: keep "/app" working by redirecting into the root SPA.
    app.get("/app", (req: Request, res: Response) => {
      const target = req.originalUrl.slice("/app".length) || "/";
      return res.redirect(302, target);
    });
    app.get("/app/*path", (req: Request, res: Response) => {
      const target = req.originalUrl.slice("/app".length) || "/";
      return res.redirect(302, target);
    });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      if (hasWebBuild) {
        return res.sendFile(webIndexPath);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // Keep source assets available (used by native builds and non-exported paths).
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  if (hasWebBuild) {
    app.get("/*path", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      if (path.extname(req.path)) {
        return next();
      }
      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return next();
      }
      return res.sendFile(webIndexPath);
    });

    log('PWA web app available at "/"');
  } else {
    log('PWA web app not built. Run "npm run web:build" to enable web routes.');
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  configureTrustProxy(app);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
