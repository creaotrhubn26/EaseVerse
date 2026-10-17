import assert from "node:assert/strict";
import test from "node:test";
import { getLyrics, requireExternalKey, upsertLyrics } from "../api/_lib/collab-store";

test('production collaboration never acknowledges a non-durable memory write', async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalMode = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(upsertLyrics({ externalTrackId: 'qa-database-check', title: 'QA', lyrics: '', collaborators: [], source: 'test', updatedAt: new Date().toISOString(), receivedAt: new Date().toISOString() }), /database is not configured/);
    await assert.rejects(getLyrics('qa-database-check'), /database is not configured/);
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
    if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else process.env.NODE_ENV = originalMode;
  }
});

function responseRecorder() {
  let statusCode = 200;
  let body: unknown;
  return {
    response: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    },
    result: () => ({ statusCode, body }),
  };
}

test("collaboration API fails closed when the server key is absent", () => {
  const original = process.env.EXTERNAL_API_KEY;
  delete process.env.EXTERNAL_API_KEY;
  try {
    const recorder = responseRecorder();
    const allowed = requireExternalKey(
      { headers: {}, query: {} } as never,
      recorder.response as never,
    );
    assert.equal(allowed, false);
    assert.deepEqual(recorder.result(), {
      statusCode: 503,
      body: { error: "External API authentication is not configured" },
    });
  } finally {
    if (original === undefined) delete process.env.EXTERNAL_API_KEY;
    else process.env.EXTERNAL_API_KEY = original;
  }
});

test("collaboration API accepts only the configured key", () => {
  const original = process.env.EXTERNAL_API_KEY;
  process.env.EXTERNAL_API_KEY = "server-secret";
  try {
    const denied = responseRecorder();
    assert.equal(
      requireExternalKey(
        { headers: { "x-api-key": "wrong-secret" }, query: {} } as never,
        denied.response as never,
      ),
      false,
    );
    assert.equal(denied.result().statusCode, 401);

    const accepted = responseRecorder();
    assert.equal(
      requireExternalKey(
        { headers: { "x-api-key": "server-secret" }, query: {} } as never,
        accepted.response as never,
      ),
      true,
    );
    assert.equal(accepted.result().statusCode, 200);
  } finally {
    if (original === undefined) delete process.env.EXTERNAL_API_KEY;
    else process.env.EXTERNAL_API_KEY = original;
  }
});
