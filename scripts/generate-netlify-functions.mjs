import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(projectRoot, "api");
const outputRoot = path.join(projectRoot, "netlify-functions");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(absolute);
  }
  return files;
}

function sourceParts(sourceFile) {
  return path
    .relative(projectRoot, sourceFile)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "")
    .split("/");
}

function routeFor(parts) {
  const routeParts = parts.at(-1) === "index" ? parts.slice(0, -1) : parts;
  return `/${routeParts
    .map((part) =>
      part.replace(/^\[\.\.\.(.+)\]$/, "*$1").replace(/^\[(.+)\]$/, ":$1"),
    )
    .join("/")}`;
}

function kebab(value) {
  return value
    .replace(/^\[(.+)\]$/, "by-$1")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function functionNameFor(parts) {
  return parts.map(kebab).join("-");
}

function wrapperSource({ sourceFile, route }) {
  const sourceImport = `../${path
    .relative(projectRoot, sourceFile)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, ".js")}`;
  return (
    `import sourceHandler from ${JSON.stringify(sourceImport)};\n` +
    `import { adaptVercelHandler } from "../netlify/vercel-adapter.js";\n\n` +
    `export default adaptVercelHandler(sourceHandler);\n\n` +
    `export const config = { path: ${JSON.stringify(route)} };\n`
  );
}

const sourceFiles = (await walk(apiRoot)).sort();
const seenRoutes = new Set();
const seenNames = new Set();

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const sourceFile of sourceFiles) {
  const parts = sourceParts(sourceFile);
  const route = routeFor(parts);
  const functionName = functionNameFor(parts);
  if (seenRoutes.has(route)) throw new Error(`Duplicate Netlify route: ${route}`);
  if (seenNames.has(functionName)) throw new Error(`Duplicate Netlify function: ${functionName}`);
  seenRoutes.add(route);
  seenNames.add(functionName);
  await fs.writeFile(
    path.join(outputRoot, `${functionName}.mts`),
    wrapperSource({ sourceFile, route }),
    "utf8",
  );
}

const cronSource =
  `import sourceHandler from "../api/cron/process-queued-takes.js";\n` +
  `import { adaptVercelHandler } from "../netlify/vercel-adapter.js";\n\n` +
  `const handler = adaptVercelHandler(sourceHandler);\n\n` +
  `export default function scheduled(request, context) {\n` +
  `  const secret = process.env.CRON_SECRET;\n` +
  `  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });\n` +
  `  const headers = new Headers(request.headers);\n` +
  `  headers.set("Authorization", \`Bearer \${secret}\`);\n` +
  `  return handler(new Request(request, { headers }), context);\n` +
  `}\n\n` +
  `export const config = { schedule: "*/5 * * * *" };\n`;
await fs.writeFile(
  path.join(outputRoot, "process-queued-takes-scheduled.mts"),
  cronSource,
  "utf8",
);

console.log(`Generated ${sourceFiles.length} HTTP functions and 1 scheduled function.`);
