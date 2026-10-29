import test from "node:test";
import assert from "node:assert/strict";
import { createSpotifyArtistHandler } from "../api/sound-room/spotify-artist.js";
const token = "inv_0123456789abcdef0123456789abcdef";
function response() {
  const r: any = { statusCode: 200, headers: {} };
  r.setHeader = (k: string, v: string) => (r.headers[k] = v);
  r.status = (s: number) => ((r.statusCode = s), r);
  r.json = (b: any) => ((r.body = b), r);
  return r;
}
const req = (
  body: any = { inviteToken: token, query: "Blue Wolf", actorUserId: "forged" },
) => ({ method: "POST", headers: {}, body }) as any;
test("native Spotify search uses authenticated actor and only returns catalog fields", async () => {
  process.env.EXTERNAL_API_KEY = "test";
  let sent: any;
  const fetcher = async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        artists: [{ id: "4fSe46SZrdIUXSdYabhDpW" }],
        resolved: false,
        ownerUserId: "secret",
      }),
    );
  };
  const handler = createSpotifyArtistHandler(
      async () => "artist",
      fetcher as any,
    ),
    r = response();
  await handler(req(), r);
  assert.equal(r.statusCode, 200);
  assert.equal(sent.actorUserId, "artist");
  assert.equal(sent.inviteToken, token);
  assert.equal(r.body.ownerUserId, undefined);
});
test("unauthenticated requests never reach Spotify", async () => {
  let called = false;
  const r = response();
  await createSpotifyArtistHandler(
    async (_req, res) => {
      res.status(401).json({ error: "unauthorized" });
      return null;
    },
    async () => {
      called = true;
      throw Error();
    },
  )(req(), r);
  assert.equal(called, false);
  assert.equal(r.statusCode, 401);
});
test("invalid invitation and excessive query rejected before upstream", async () => {
  const handler = createSpotifyArtistHandler(
    async () => "artist",
    async () => {
      throw Error("should not call");
    },
  );
  for (const body of [
    { inviteToken: "bad", query: "Blue Wolf" },
    { inviteToken: token, query: "a".repeat(121) },
  ]) {
    const r = response();
    await handler(req(body), r);
    assert.equal(r.statusCode, 400);
  }
});
test("provider throttle is forwarded with retry delay", async () => {
  const handler = createSpotifyArtistHandler(
    async () => "artist",
    async () =>
      new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
  );
  const r = response();
  await handler(req(), r);
  assert.equal(r.statusCode, 429);
  assert.equal(r.headers["Retry-After"], "90");
});
