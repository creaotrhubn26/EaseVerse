import test from "node:test";
import assert from "node:assert/strict";
import { createInvitationHandler } from "../api/sound-room/invitation.js";
import {
  InvitationError,
  type InvitationContext,
} from "../api/_lib/sound-room-invitations.js";
function response() {
  const r: any = { statusCode: 200, headers: {} };
  r.setHeader = (k: string, v: string) => (r.headers[k] = v);
  r.status = (s: number) => ((r.statusCode = s), r);
  r.json = (b: unknown) => ((r.body = b), r);
  return r;
}
const token = "inv_0123456789abcdef0123456789abcdef";
const context: InvitationContext = {
  memberId: "m",
  ownerUserId: "producer",
  audioReviewProjectId: "room",
  externalTrackId: "track",
  projectTitle: "Nordlys",
  easeverseAccess: true,
  profile: {
    name: "Alex",
    role: "Vokalist",
    instrument: "",
    email: "alex@example.invalid",
    phone: "",
    bio: "",
    avatarUrl: "",
    links: {},
    contributions: [],
    completed: true,
  },
};
const user = { id: "artist", email: "alex@example.invalid", name: "Alex" };
const req = (action = "lookup") =>
  ({
    method: "POST",
    headers: {},
    body: {
      action,
      inviteToken: token,
      actorUserId: "forged",
      ownerUserId: "forged",
      profile: { name: "Alex" },
    },
  } as any);
test("native lookup derives the actor from authentication and never grants membership", async () => {
  let accepted = 0;
  let input: any;
  const handler = createInvitationHandler({
    auth: async () => user.id,
    user: () => user,
    upstream: async (...args: any[]) => ((input = args), context),
    accept: async () => {
      accepted++;
      return null;
    },
  });
  const r = response();
  await handler(req(), r);
  assert.equal(r.statusCode, 200);
  assert.equal(input[2], "artist");
  assert.equal(accepted, 0);
  assert.equal(r.body.ownerUserId, undefined);
  assert.equal(r.body.profile.email, user.email);
  assert.equal(r.headers["Cache-Control"], "private, no-store");
});
test("completion links only the context returned by CreatorHub, with an idempotent membership operation", async () => {
  let calls = 0;
  const handler = createInvitationHandler({
    auth: async () => user.id,
    user: () => user,
    upstream: async () => context,
    accept: async (c, actor, email) => {
      assert.equal(c, context);
      assert.equal(actor, "artist");
      assert.equal(email, user.email);
      calls++;
      return { projectId: "project", trackId: "track" };
    },
  });
  for (let i = 0; i < 2; i++) {
    const r = response();
    await handler(req("complete"), r);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.linked.projectId, "project");
    assert.equal(r.body.completed, true);
  }
  assert.equal(calls, 2);
});
test("wrong account, expiry or revoked invitation cannot reach membership creation", async () => {
  let accepted = 0;
  const handler = createInvitationHandler({
    auth: async () => user.id,
    user: () => user,
    upstream: async () => {
      throw new InvitationError(404);
    },
    accept: async () => {
      accepted++;
      return null;
    },
  });
  const r = response();
  await handler(req("complete"), r);
  assert.equal(r.statusCode, 404);
  assert.equal(accepted, 0);
  assert.equal(r.body.error, "invitation_unavailable");
});
test("failed membership synchronization is reported as failure so the saved profile can be safely retried", async () => {
  const handler = createInvitationHandler({
    auth: async () => user.id,
    user: () => user,
    upstream: async () => context,
    accept: async () => {
      throw new Error("database unavailable");
    },
  });
  const r = response();
  await handler(req("complete"), r);
  assert.equal(r.statusCode, 503);
  assert.notEqual(r.body.completed, true);
});
test("unsigned requests never resolve a private invitation", async () => {
  let called = 0;
  const handler = createInvitationHandler({
    auth: async (_q, r) => {
      r.status(401).json({ error: "sign_in_required" });
      return null;
    },
    user: () => null,
    upstream: async () => {
      called++;
      return context;
    },
    accept: async () => null,
  });
  const r = response();
  await handler(req(), r);
  assert.equal(r.statusCode, 401);
  assert.equal(called, 0);
});
