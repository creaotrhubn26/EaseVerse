import assert from "node:assert/strict";
import test from "node:test";
import { requireAuthOrPairing } from "../api/_lib/auth";
import pairingHandler from "../api/companion/pairing";
import deviceHandler from "../api/companion/device";

function recorder() {
  let statusCode = 200;
  let body: unknown;
  const headers = new Map<string, string>();
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
    setHeader(key: string, value: string) { headers.set(key, value); return this; },
  };
  return { response, result: () => ({ statusCode, body, headers }) };
}

test("legacy pairing and device endpoints are permanently retired", () => {
  for (const handler of [pairingHandler, deviceHandler]) {
    const capture = recorder();
    handler({ method: "POST" } as never, capture.response as never);
    assert.equal(capture.result().statusCode, 410);
    assert.match(JSON.stringify(capture.result().body), /CreatorHub Pro Tools Companion/);
  }
});

test("previously issued pair tokens cannot authenticate data endpoints", async () => {
  const capture = recorder();
  const userId = await requireAuthOrPairing(
    { headers: { authorization: "Bearer pair_old-token" } } as never,
    capture.response as never,
  );
  assert.equal(userId, null);
  assert.equal(capture.result().statusCode, 401);
});
