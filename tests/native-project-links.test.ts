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

test("assigned warmup links preserve one valid project on cold and warm launches", () => {
  for (const initial of [true, false]) {
    for (const path of [
      "easeverse://warmup-session?projectId=prj_123",
      "easeverse:///warmup-session?projectId=prj_123",
      "https://easeverse.netlify.app/warmup-session?projectId=prj_123",
      "/warmup-session?projectId=prj_123&unexpected=discarded",
    ]) {
      assert.equal(resolveNativeIntent(path, initial), "/warmup-session?projectId=prj_123");
    }
    for (const path of [
      "/warmup-session",
      "/warmup-session?projectId=",
      "/warmup-session?projectId=../private",
      "/warmup-session?projectId=prj_123&projectId=prj_456",
      "https://untrusted.example/warmup-session?projectId=prj_123",
    ]) assert.equal(resolveNativeIntent(path, initial), "/");
  }
});

test('invitation links work cold and warm without accepting arbitrary origins or invalid tokens',()=>{
 const token='inv_0123456789abcdef0123456789abcdef';
 for(const initial of [true,false]){
  assert.equal(resolveNativeIntent(`https://easeverse.netlify.app/sound-room/invite/${token}`,initial),`/sound-room/invite/${token}`);
  assert.equal(resolveNativeIntent(`easeverse://sound-room/invite/${token}`,initial),`/sound-room/invite/${token}`);
  assert.equal(resolveNativeIntent(`https://attacker.example/sound-room/invite/${token}`,initial),'/');
  assert.equal(resolveNativeIntent('easeverse://sound-room/invite/short',initial),'/');
  assert.equal(resolveNativeIntent('easeverse://auth/callback?chGoogleTransfer=qa',initial),'/auth/callback?chGoogleTransfer=qa');
 }
});
