import assert from "node:assert/strict";
import test from "node:test";
import { buildLinkedBoothPayload } from "../api/_lib/booth-payload";
import { soundRoomStorage } from "../api/_lib/creatorhub-storage";
import { mergeBoothSnapshot } from "../lib/booth-snapshot";
const id = "22222222-2222-4222-8222-222222222222";
const context = {
  ownerUserId: "producer",
  actorUserId: "artist",
  audioReviewProjectId: "11111111-1111-4111-8111-111111111111",
  externalTrackId: "track-1",
};
const link = {
  owner_user_id: "producer",
  audio_review_project_id: context.audioReviewProjectId,
  creatorhub_project_id: "workspace-1",
  easeverse_project_id: "project-1",
};
const reference = {
  configured: true,
  retrieved: true,
  reference: {
    url: "https://s3.example.test/reference?signature=new",
    versionId: "mix-3",
    fileName: "Mix 3.wav",
    expiresInSeconds: 3600,
    durationSec: 12,
    contentType: "audio/wav",
  },
};
function db(takes: any[] = [], links = [link]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  return {
    calls,
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return {
        rows: sql.includes("SELECT DISTINCT")
          ? []
          : sql.includes("FROM creatorhub_project_links")
            ? links
            : sql.includes("FROM takes t")
              ? takes
              : [
                  {
                    title: "Nordlys",
                    lyrics: "[Verse]\nHold den tonen",
                    bpm: 92,
                  },
                ],
      };
    },
  };
}
test("a project member gets the approved reference and lyrics before the first take exists", async () => {
  const pool = db();
  let referenceCalls = 0;
  const payload = await buildLinkedBoothPayload(
    pool as any,
    "artist",
    "track-1",
    "project-1",
    {
      referencePlayback: async (args) => {
        referenceCalls++;
        assert.deepEqual(args, {
          ownerUserId: "producer",
          audioReviewProjectId: context.audioReviewProjectId,
        });
        return reference;
      },
      storage: async () => {
        return { comments: [] };
      },
      regions: async () => new Map(),
    },
  );
  assert.equal(referenceCalls, 1);
  assert.equal(payload?.referenceTrack?.name, "Mix 3.wav");
  assert.deepEqual(payload?.takes, []);
  assert.match(pool.calls[0].sql, /member.user_id=\$1/);
  assert.deepEqual(pool.calls[0].values, ["artist", "track-1", "project-1"]);
  assert.deepEqual(pool.calls[2].values, ["track-1", "project-1", "artist"]);
});
test("missing or ambiguous membership never causes private reference or feedback requests", async () => {
  for (const links of [
    [],
    [link, { ...link, easeverse_project_id: "another-project" }],
  ]) {
    const pool = db([], links);
    const payload = await buildLinkedBoothPayload(
      pool as any,
      "outsider",
      "track-1",
      undefined,
      {
        referencePlayback: async () => {
          throw new Error("Must not query private reference");
        },
      },
    );
    assert.equal(payload, null);
    assert.equal(pool.calls.length, links.length ? 1 : 2);
  }
});
test("current Sound Room comments arrive on the exact take with real timecodes and loop intervals", async () => {
  const pool = db([{ id, filename: "Vocal.m4a", producer_note: null }]);
  let calls = 0;
  const payload = await buildLinkedBoothPayload(
    pool as any,
    "artist",
    "track-1",
    "project-1",
    {
      referencePlayback: async () => reference,
      regions: async () => new Map(),
      storage: async (operation, verified) => {
        calls++;
        assert.equal(operation, "reviews");
        assert.deepEqual(verified, context);
        return {
          comments: [
            {
              storage_object_id: id,
              id: "comment-1",
              body: "Hold den tonen. Hold pausen før neste linje.",
              timecode_seconds: 8,
              end_time_seconds: 11,
            },
            {
              storage_object_id: "other-take",
              body: "Must not appear",
              timecode_seconds: 20,
            },
          ],
        };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(
    payload?.takes[0].producerNote,
    "@0:08 Hold den tonen. Hold pausen før neste linje.",
  );
  assert.deepEqual(payload?.takes[0].regions[0], {
    id: "sound-room-comment-1",
    startSec: 8,
    endSec: 11,
    label: "Hold den tonen. Hold pausen før neste linje.",
    color: null,
    autoLoop: false,
  });
  assert.match(payload!.takes[0].audioUrl, /\/api\/takes\/.+\/audio$/);
  assert.equal(payload?.takes[0].producerDecision, null);
});
test("caller data cannot override canonical owner/artist/project in the server-to-server request", async () => {
  await soundRoomStorage(
    "initiate",
    context,
    {
      ownerUserId: "attacker",
      actorUserId: "attacker",
      audioReviewProjectId: "wrong-room",
    },
    {
      apiUrl: "https://api.example.test",
      apiKey: "service-key",
      fetchImpl: async (url, init) => {
        assert.equal(
          String(url),
          "https://api.example.test/api/integrations/easeverse/storage/initiate",
        );
        assert.deepEqual(JSON.parse(String(init?.body)), context);
        assert.equal(init?.redirect, "error");
        return Response.json({ objectId: id });
      },
    },
  );
});
test("missing keys, invalid object IDs and insecure destinations never receive a request", async () => {
  for (const [operation, apiUrl, apiKey] of [
    ["not-a-route", "https://api.example.test", "secret"],
    ["../complete", "https://api.example.test", "secret"],
    ["initiate", "http://external.example.test", "secret"],
    ["initiate", "https://api.example.test", ""],
  ]) {
    await assert.rejects(
      soundRoomStorage(
        operation,
        context,
        {},
        {
          apiUrl,
          apiKey,
          fetchImpl: async () => {
            assert.fail("No transmission permitted");
          },
        },
      ),
    );
  }
});
test("silent feedback refresh keeps playing URLs stable, renews expired sources and respects version changes", () => {
  const previous = {
    trackId: "track-1",
    projectId: "project-1",
    referenceTrack: {
      versionId: "mix-3",
      url: "old-signed",
      expiresAt: 200000,
    },
    takes: [{ id, producerNote: "Old" }],
  };
  const next = {
    ...previous,
    referenceTrack: { ...previous.referenceTrack, url: "new-signed" },
    takes: [{ id, producerNote: "Hold den tonen." }],
  };
  const merged = mergeBoothSnapshot(previous, next, 1000);
  assert.equal(merged.referenceTrack.url, "old-signed");
  assert.equal(merged.takes[0].producerNote, "Hold den tonen.");
  assert.equal(
    mergeBoothSnapshot(previous, next, 190000).referenceTrack.url,
    "new-signed",
  );
  assert.equal(
    mergeBoothSnapshot(
      previous,
      {
        ...next,
        referenceTrack: { ...next.referenceTrack, versionId: "mix-4" },
      },
      1000,
    ).referenceTrack.url,
    "new-signed",
  );
});

test("existing unlinked personal takes remain available only through an owner-scoped query", async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      statements.push({ sql, values });
      if (sql.includes("FROM creatorhub_project_links")) return { rows: [] };
      if (sql.includes("SELECT DISTINCT"))
        return { rows: [{ project_id: null }] };
      if (sql.includes("FROM takes t"))
        return {
          rows: [
            {
              id: "legacy-random-id",
              filename: "Old take.wav",
              storage_url:
                "https://easeverse.netlify.app/api/takes/legacy-random-id/audio",
            },
          ],
        };
      return {
        rows: [{ title: "Earlier song", lyrics: "[Verse]\nA saved line" }],
      };
    },
  };
  const payload = await buildLinkedBoothPayload(
    pool as any,
    "artist",
    "legacy-track",
    undefined,
    {
      referencePlayback: async () => {
        assert.fail("No linked reference");
      },
      storage: async () => {
        assert.fail("No new storage requests");
      },
      regions: async () => new Map(),
    },
  );
  assert.equal(payload?.takes[0].filename, "Old take.wav");
  assert.equal(payload?.referenceTrack, null);
  assert.match(statements[1].sql, /t.user_id=\$2/);
  assert.deepEqual(statements[1].values, ["legacy-track", "artist", null]);
  assert.deepEqual(statements[3].values, ["legacy-track", null, "artist"]);
});


test("reference mix feedback is scoped to its approved version even before a vocal take", async () => {
  const pool = db();
  const payload = await buildLinkedBoothPayload(pool as any, "artist", "track-1", "project-1", {
    referencePlayback: async () => reference,
    regions: async () => new Map(),
    storage: async (operation, verified, input) => {
      assert.equal(operation, "reviews"); assert.deepEqual(verified, context);
      assert.deepEqual(input, { referenceVersionId: "mix-3" });
      return { comments: [
        { id: "current", version_id: "mix-3", body: "Hold den tonen.", author: "Producer", timecode_seconds: 10, end_time_seconds: 11 },
        { id: "old", version_id: "mix-2", body: "Old mix comment", timecode_seconds: 2 },
        { id: "take", storage_object_id: id, body: "Take comment", timecode_seconds: 1 },
      ] };
    },
  });
  assert.deepEqual(payload?.referenceTrack?.producerComments, [{ id: "current", body: "Hold den tonen.", seconds: 10, endSeconds: 11, author: "Producer", status: "unresolved" }]);
  assert.deepEqual(payload?.takes, []);
});
