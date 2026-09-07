import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProToolsMarkers } from "../api/_lib/collab-store";
import { safeCreatorHubReturnTo } from "../api/_lib/creatorhub-project-links";
import { pushKeeperToCreatorHub } from "../api/_lib/creatorhub-sync";

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
