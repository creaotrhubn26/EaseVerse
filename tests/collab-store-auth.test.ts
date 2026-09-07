import assert from "node:assert/strict";
import test from "node:test";
import { requireExternalKey } from "../api/_lib/collab-store";

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
