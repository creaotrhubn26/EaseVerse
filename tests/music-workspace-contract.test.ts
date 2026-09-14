import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProToolsMarkers } from "../api/_lib/collab-store";
import { safeCreatorHubReturnTo } from "../api/_lib/creatorhub-project-links";
import { pushKeeperToCreatorHub } from "../api/_lib/creatorhub-sync";
import { fetchCreatorHubReferencePlayback } from "../api/_lib/creatorhub-reference-playback";

test("Pro Tools schema v1 normalizes canonical and legacy marker payloads", () => {
  assert.deepEqual(normalizeProToolsMarkers([
    { id: "chorus", label: "Chorus", positionMs: 32_000, endPositionMs: 48_000, sectionType: "chorus" },
    { name: "Outro", startSeconds: 90, endSeconds: 105 },
  ]), [
    { id: "chorus", label: "Chorus", positionMs: 32_000, endPositionMs: 48_000, sectionType: "chorus" },
    { id: "marker-2", label: "Outro", positionMs: 90_000, endPositionMs: 105_000 },
  ]);
});

test("Workspace return links are restricted to CreatorHub origins", () => {
  assert.equal(
    safeCreatorHubReturnTo("https://www.creatorhubn.com/workspace/project-1/sound-room#marker"),
    "https://www.creatorhubn.com/workspace/project-1/sound-room",
  );
  assert.equal(safeCreatorHubReturnTo("https://attacker.example/workspace/project-1"), null);
  assert.equal(safeCreatorHubReturnTo("javascript:alert(1)"), null);
});

test("keeper sync uses service auth and the idempotent take identity", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await pushKeeperToCreatorHub({
    ownerUserId: "producer-1",
    externalTrackId: "track-1",
    takeId: "take-9",
    url: "https://audio.example.test/take-9.wav",
    filename: "take-9.wav",
    durationSec: 12.4,
  }, {
    apiUrl: "https://www.creatorhubn.com",
    apiKey: "service-key",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ created: true }, { status: 201 });
    },
  });
  assert.equal(result.synced, true);
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "https://www.creatorhubn.com/api/audio-showcases/easeverse/keeper");
  assert.deepEqual(request.init?.headers, { "content-type": "application/json", "x-api-key": "service-key" });
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    schemaVersion: 1,
    ownerUserId: "producer-1",
    externalTrackId: "track-1",
    takeId: "take-9",
    url: "https://audio.example.test/take-9.wav",
    filename: "take-9.wav",
    durationSec: 12.4,
  });
});

test("private Sound Room references are resolved server-to-server with service auth", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await fetchCreatorHubReferencePlayback({
    ownerUserId: "producer-1",
    audioReviewProjectId: "00000000-0000-4000-8000-000000000001",
  }, {
    apiUrl: "https://www.creatorhubn.com",
    apiKey: "service-key",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        url: "https://private-audio.example.test/reference.wav?signature=fresh",
        expiresInSeconds: 900,
        versionId: "00000000-0000-4000-8000-000000000002",
        fileName: "Mix V7.wav",
        contentType: "audio/wav",
        durationSec: 12,
      });
    },
  });

  assert.equal(result.retrieved, true);
  assert.equal(result.reference?.durationSec, 12);
  assert.equal(requests[0]?.url, "https://www.creatorhubn.com/api/integrations/easeverse/reference-playback");
  assert.deepEqual(requests[0]?.init?.headers, {
    "content-type": "application/json",
    "x-api-key": "service-key",
  });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    ownerUserId: "producer-1",
    audioReviewProjectId: "00000000-0000-4000-8000-000000000001",
  });
});

test("private reference resolver rejects non-HTTPS signed URLs", async () => {
  const result = await fetchCreatorHubReferencePlayback({
    ownerUserId: "producer-1",
    audioReviewProjectId: "00000000-0000-4000-8000-000000000001",
  }, {
    apiUrl: "https://www.creatorhubn.com",
    apiKey: "service-key",
    fetchImpl: async () => Response.json({
      url: "http://private-audio.example.test/reference.wav",
      expiresInSeconds: 900,
      versionId: "00000000-0000-4000-8000-000000000002",
    }),
  });

  assert.equal(result.retrieved, false);
  assert.equal(result.reason, "invalid_response");
});
