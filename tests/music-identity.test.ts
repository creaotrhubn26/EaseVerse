import assert from "node:assert/strict";
import test from "node:test";
import { createMusicIdentityHandler } from "../api/music-identity.js";
import {
  soundRoomStorage,
  SoundRoomStorageError,
} from "../api/_lib/creatorhub-storage.js";
function response() {
  const r: any = { statusCode: 200, headers: {} };
  r.setHeader = (n: string, v: string) => (r.headers[n] = v);
  r.status = (s: number) => {
    r.statusCode = s;
    return r;
  };
  r.json = (v: any) => {
    r.body = v;
    return r;
  };
  return r;
}
const context = {
  ownerUserId: "owner",
  actorUserId: "artist",
  audioReviewProjectId: "room",
  externalTrackId: "song",
};
test("derives the room and actor from membership, including read-only observers", async () => {
  let args: any;
  const res = response();
  await createMusicIdentityHandler({
    auth: async () => "artist",
    context: async (p, u, readOnly) => {
      assert.equal(p, "project");
      assert.equal(u, "artist");
      assert.equal(readOnly, true);
      return context;
    },
    storage: async (...a) => {
      args = a;
      return { canEdit: false };
    },
  })(
    {
      method: "GET",
      query: { projectId: "project", ownerUserId: "forged" },
    } as any,
    res
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(args, [
    "music-identity",
    context,
    { action: "read", payload: {} },
  ]);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});
test("forwards catalog actions but not caller-supplied identities", async () => {
  let args: any;
  const res = response();
  await createMusicIdentityHandler({
    auth: async () => "artist",
    context: async () => context,
    storage: async (...a) => {
      args = a;
      return {};
    },
  })(
    {
      method: "POST",
      body: {
        projectId: "project",
        action: "link",
        revision: 2,
        reference: "track",
        actorUserId: "forged",
        payload: { ownerUserId: "forged" },
      },
    } as any,
    res
  );
  assert.equal(args[1], context);
  assert.deepEqual(args[2], {
    action: "link",
    payload: {
      revision: 2,
      reference: "track",
      artistIds: undefined,
      visible: undefined,
    },
  });
});
test("rejects missing membership, invalid actions and denied upstream writes", async () => {
  let called = false;
  const deps = {
    auth: async () => "artist",
    context: async () => null,
    storage: async () => {
      called = true;
      return {};
    },
  };
  let res = response();
  await createMusicIdentityHandler(deps)(
    { method: "GET", query: { projectId: "wrong" } } as any,
    res
  );
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
  res = response();
  await createMusicIdentityHandler({ ...deps, context: async () => context })(
    {
      method: "POST",
      body: { projectId: "project", action: "set-owner" },
    } as any,
    res
  );
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
  res = response();
  await createMusicIdentityHandler({
    ...deps,
    context: async () => context,
    storage: async () => {
      throw new SoundRoomStorageError(403);
    },
  })(
    {
      method: "POST",
      body: { projectId: "project", action: "unlink", revision: 0 },
    } as any,
    res
  );
  assert.equal(res.statusCode, 403);
});
test("the private bridge prevents context spoofing and keeps service credentials server-side", async () => {
  const result = await soundRoomStorage(
    "music-identity",
    context,
    { action: "read", ownerUserId: "forged" },
    {
      apiUrl: "https://api.creatorhubn.com",
      apiKey: "test-only-key",
      fetchImpl: async (url, init) => {
        assert.equal(String(url).endsWith("/music-identity"), true);
        const b = JSON.parse(String(init?.body));
        assert.equal(b.ownerUserId, "owner");
        return Response.json({ canEdit: false });
      },
    }
  );
  assert.deepEqual(result, { canEdit: false });
});
