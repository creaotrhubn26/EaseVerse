import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeIntent } from "../lib/native-intent";

test("a stopped mobile app preserves the Sound Room song and project context", () => {
  assert.equal(
    resolveNativeIntent("easeverse://booth/track-123", true),
    "/booth/track-123",
  );
  assert.equal(
    resolveNativeIntent("easeverse://projects/project-123", true),
    "/projects/project-123",
  );
  assert.equal(
    resolveNativeIntent(
      "https://easeverse.netlify.app/integrations/creatorhub?creatorhubProjectId=p1&externalTrackId=t1",
      true,
    ),
    "/integrations/creatorhub?creatorhubProjectId=p1&externalTrackId=t1",
  );
  assert.equal(
    resolveNativeIntent("/booth/track-123", true),
    "/booth/track-123",
  );
});
test("unexpected origins and malformed links do not become app destinations", () => {
  assert.equal(
    resolveNativeIntent("https://untrusted.example/booth/track-123", true),
    "/",
  );
  assert.equal(resolveNativeIntent("javascript:alert(1)", true), "/");
  assert.equal(
    resolveNativeIntent("//untrusted.example/booth/track-123", true),
    "/",
  );
  assert.equal(resolveNativeIntent("not a URL", true), "/");
});
