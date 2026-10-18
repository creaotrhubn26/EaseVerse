import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptVercelHandler,
  enforceVerifiedSslMode,
} from "../netlify/vercel-adapter";

delete process.env.NETLIFY;
delete process.env.SITE_ID;

test("makes hosted Postgres certificate verification explicit", () => {
  const hardened = enforceVerifiedSslMode(
    "postgresql://user:pass@db.example.com/easeverse?sslmode=require&channel_binding=require",
  );
  const url = new URL(hardened);
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.get("channel_binding"), "require");

  assert.equal(
    enforceVerifiedSslMode("postgresql://localhost/easeverse"),
    "postgresql://localhost/easeverse",
  );
});

test("adapts query, route params, JSON body and response headers", async () => {
  const handler = adaptVercelHandler((req, res) => {
    res.setHeader("X-Adapter", "ok");
    return res.status(201).json({
      method: req.method,
      query: req.query,
      body: req.body,
      host: req.headers.host,
    });
  });

  const response = await handler(
    new Request("https://easeverse.netlify.app/api/items/track-1?tag=a&tag=b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Demo" }),
    }),
    { params: { id: "track-1" } },
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-adapter"), "ok");
  assert.deepEqual(await response.json(), {
    method: "POST",
    query: { tag: ["a", "b"], id: "track-1" },
    body: { title: "Demo" },
    host: "easeverse.netlify.app",
  });
});

test("preserves streamed writes", async () => {
  const handler = adaptVercelHandler(async (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.write("data: first\n\n");
    await Promise.resolve();
    res.end("data: done\n\n");
  });

  const response = await handler(new Request("https://easeverse.netlify.app/api/chat"));
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(await response.text(), "data: first\n\ndata: done\n\n");
});

test("supports empty 204 responses", async () => {
  const handler = adaptVercelHandler((_req, res) => res.status(204).end());
  const response = await handler(
    new Request("https://easeverse.netlify.app/api/changelog"),
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("retains independent post-response work through the host lifecycle", async () => {
  const retained: Promise<unknown>[] = [];
  let finish!: () => void;
  let completed = false;
  const task = new Promise<void>((resolve) => { finish = resolve; }).then(() => { completed = true; });
  const handler = adaptVercelHandler((req, res) => {
    req.waitUntil(task);
    return res.status(200).json({ accepted: true });
  });
  const response = await handler(new Request("https://easeverse.netlify.app/api/takes/finalize"), {
    waitUntil(promise) { retained.push(promise); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(completed, false, "response must not wait for analysis");
  assert.ok(retained.includes(task), "the analysis task must reach the runtime");
  finish();
  await Promise.all(retained);
  assert.equal(completed, true);
});
