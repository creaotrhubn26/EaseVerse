import assert from "node:assert/strict";
import test from "node:test";
import { createStudioBookingsHandler } from "../api/studio-bookings.js";
import {
  soundRoomStorage,
  SoundRoomStorageError,
} from "../api/_lib/creatorhub-storage.js";
function response() {
  const r: any = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (n: string, v: string) => {
    r.headers[n] = v;
  };
  r.status = (n: number) => {
    r.statusCode = n;
    return r;
  };
  r.json = (v: any) => {
    r.body = v;
    return r;
  };
  return r;
}
const context = {
  ownerUserId: "producer",
  actorUserId: "artist",
  audioReviewProjectId: "room",
  externalTrackId: "song",
};
test("studio overview derives its room and actor from authenticated project membership", async () => {
  let received: any;
  const handler = createStudioBookingsHandler({
    auth: async () => "artist",
    context: async (project, user) => {
      assert.equal(project, "project");
      assert.equal(user, "artist");
      return context;
    },
    storage: async (...args: any[]) => {
      received = args;
      return { packages: [{ remainingSessions: 3 }], sessions: [] };
    },
  });
  const res = response();
  await handler(
    {
      method: "GET",
      headers: {},
      query: {
        projectId: "project",
        ownerUserId: "forged",
        actorUserId: "forged",
      },
    } as any,
    res
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, ["studio-overview", context, {}]);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});
test("only the authenticated actor can send a studio upgrade request", async () => {
  let received: any;
  const handler = createStudioBookingsHandler({
    auth: async () => "artist",
    context: async () => context,
    storage: async (...args: any[]) => {
      received = args;
      return { request: { id: "task" } };
    },
  });
  const res = response();
  await handler(
    {
      method: "POST",
      headers: {},
      query: {},
      body: {
        projectId: "project",
        ownerUserId: "forged",
        actorUserId: "forged",
        language: "no",
        body: "untrusted text",
      },
    } as any,
    res
  );
  assert.equal(res.statusCode, 201);
  assert.deepEqual(received, [
    "studio-upgrade-request",
    context,
    { language: "no" },
  ]);
});
test("missing membership stops the service call, while upstream access errors stay access errors", async () => {
  let calls = 0;
  const deps = {
    auth: async () => "artist",
    context: async () => null,
    storage: async () => {
      calls++;
      return {};
    },
  };
  let res = response();
  await createStudioBookingsHandler(deps)(
    { method: "GET", headers: {}, query: { projectId: "other" } } as any,
    res
  );
  assert.equal(res.statusCode, 403);
  assert.equal(calls, 0);
  res = response();
  await createStudioBookingsHandler({
    ...deps,
    context: async () => context,
    storage: async () => {
      throw new SoundRoomStorageError(403);
    },
  })(
    { method: "GET", headers: {}, query: { projectId: "project" } } as any,
    res
  );
  assert.equal(res.statusCode, 403);
});
test("studio operations use the existing private bridge; its key never goes to the app", async () => {
  let body: any;
  const result = await soundRoomStorage(
    "studio-overview",
    context,
    {},
    {
      apiUrl: "https://api.creatorhubn.com",
      apiKey: "server-only-key",
      fetchImpl: async (url, init) => {
        assert.equal(
          url,
          "https://api.creatorhubn.com/api/integrations/easeverse/storage/studio-overview"
        );
        assert.equal((init?.headers as any)["x-api-key"], "server-only-key");
        assert.equal(init?.redirect, "error");
        body = JSON.parse(String(init?.body));
        return Response.json({ packages: [], sessions: [] });
      },
    }
  );
  assert.deepEqual(body, context);
  assert.equal(JSON.stringify(result).includes("server-only-key"), false);
});
