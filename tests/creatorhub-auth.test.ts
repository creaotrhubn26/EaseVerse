import assert from "node:assert/strict";
import test from "node:test";
import { resolveCreatorHubSession } from "../api/_lib/auth.js";
import { creatorHubApiUrl, transferId } from "../api/_lib/auth-upstream.js";

test("CreatorHub auth defaults to the shared Workspace authority", () => {
  const previous = process.env.CREATORHUB_API_URL;
  delete process.env.CREATORHUB_API_URL;
  try {
    assert.equal(creatorHubApiUrl(), "https://www.creatorhubn.com");
  } finally {
    if (previous !== undefined) process.env.CREATORHUB_API_URL = previous;
  }
});

test("CreatorHub session validation accepts only authenticated users with stable identity", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({
    authenticated: true,
    user: { id: "user-42", email: "Music@Example.com", name: "Music Producer", role: "music_producer" },
  });
  const result = await resolveCreatorHubSession("session-42", fakeFetch);
  assert.deepEqual(result, {
    status: "authenticated",
    user: {
      id: "user-42",
      email: "music@example.com",
      name: "Music Producer",
      role: "music_producer",
      profession: undefined,
      userType: undefined,
      displayName: "Music Producer",
      picture: undefined,
      verified_email: false,
      isAdmin: false,
    },
  });
});

test("CreatorHub session validation fails closed when the authority is unavailable", async () => {
  const fakeFetch: typeof fetch = async () => new Response("unavailable", { status: 503 });
  assert.deepEqual(await resolveCreatorHubSession("session-42", fakeFetch), { status: "unavailable" });
});

test("OAuth transfer identifiers must be UUIDs", () => {
  assert.equal(transferId("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(transferId("../../session"), null);
});
