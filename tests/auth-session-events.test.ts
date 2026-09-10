import assert from "node:assert/strict";
import test from "node:test";
import {
  notifyInvalidCreatorHubSession,
  onInvalidCreatorHubSession,
  responseIndicatesInvalidSession,
} from "../lib/auth-session-events";

test("invalidates every 401 and authentication-related 403 responses", () => {
  assert.equal(responseIndicatesInvalidSession(401, "anything"), true);
  assert.equal(responseIndicatesInvalidSession(403, { error: "Authentication failed" }), true);
  assert.equal(responseIndicatesInvalidSession(403, { error: "workspace_owner_required" }), false);
  assert.equal(responseIndicatesInvalidSession(500, { error: "token expired" }), false);
});

test("notifies the active auth provider", async () => {
  const reasons: string[] = [];
  const unsubscribe = onInvalidCreatorHubSession((reason) => { reasons.push(reason); });
  await notifyInvalidCreatorHubSession("http_403");
  unsubscribe();
  await notifyInvalidCreatorHubSession("http_401");
  assert.deepEqual(reasons, ["http_403"]);
});
