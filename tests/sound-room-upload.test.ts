import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { uploadSoundRoomTake } from "../lib/sound-room-upload";
const ID = "22222222-2222-4222-8222-222222222222";
const checksum = async (blob: Blob) =>
  createHash("sha256")
    .update(new Uint8Array(await blob.arrayBuffer()))
    .digest("hex");
const args = {
  blob: new Blob(["real-audio-bytes"]),
  filename: "Vocal.wav",
  contentType: "audio/wav",
  token: "session-not-for-s3",
  projectId: "project-1",
};
test("single upload sends the checksum headers to S3, then finalizes the same project/take", async () => {
  const order: string[] = [];
  const result = await uploadSoundRoomTake(args, {
    checksum,
    request: async (path, init) => {
      order.push(path);
      const body = JSON.parse(String(init.body));
      assert.equal(body.projectId, "project-1");
      if (path.endsWith("/upload")) {
        assert.equal(body.checksumSha256, await checksum(args.blob));
        return Response.json({
          takeId: ID,
          key: ID,
          strategy: "single",
          uploadUrl: "https://s3.example.test/file",
          requiredHeaders: {
            "content-type": "audio/wav",
            "x-amz-checksum-sha256": "signed-checksum",
          },
        });
      }
      assert.equal(body.takeId, ID);
      return Response.json({
        take: {
          storageUrl: `https://easeverse.netlify.app/api/takes/${ID}/audio`,
        },
      });
    },
    put: async (url, init) => {
      order.push("s3");
      assert.equal(url, "https://s3.example.test/file");
      assert.equal(
        new Headers(init.headers).get("x-amz-checksum-sha256"),
        "signed-checksum",
      );
      assert.equal(new Headers(init.headers).get("content-type"), "audio/wav");
      assert.equal(new Headers(init.headers).get("authorization"), null);
      assert.equal(await (init.body as Blob).text(), "real-audio-bytes");
      return new Response(null, { status: 200 });
    },
  });
  assert.deepEqual(order, ["/api/takes/upload", "s3", "/api/takes/finalize"]);
  assert.equal(result.pathname, ID);
});
test("multipart uploads verify each part and only finalize with returned ETags", async () => {
  const uploaded: string[] = [];
  let final: any;
  await uploadSoundRoomTake(args, {
    checksum,
    request: async (path, init) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/upload"))
        return Response.json({
          takeId: ID,
          key: ID,
          strategy: "multipart",
          partSize: 8,
          partCount: 2,
        });
      if (path.endsWith("/upload-parts"))
        return Response.json({
          parts: [
            {
              uploadUrl: `https://s3.example.test/part/${body.parts[0].partNumber}`,
              requiredHeaders: { checksum: body.parts[0].checksumSha256 },
            },
          ],
        });
      final = body;
      return Response.json({
        take: { storageUrl: "https://easeverse.netlify.app/take" },
      });
    },
    put: async (_url, init) => {
      uploaded.push(await (init.body as Blob).text());
      assert.equal(
        (init.headers as any).checksum,
        await checksum(init.body as Blob),
      );
      return new Response(null, {
        headers: { etag: `part-${uploaded.length}` },
      });
    },
  });
  assert.equal(uploaded.join(""), "real-audio-bytes");
  assert.deepEqual(
    final.parts.map((p: any) => [p.partNumber, p.etag]),
    [
      [1, "part-1"],
      [2, "part-2"],
    ],
  );
});
test("an interrupted upload never publishes an incomplete review take", async () => {
  let finalized = false;
  await assert.rejects(
    uploadSoundRoomTake(args, {
      checksum,
      request: async (path) => {
        if (path.endsWith("/finalize")) finalized = true;
        return Response.json({
          takeId: ID,
          key: ID,
          strategy: "single",
          uploadUrl: "https://s3.example.test/file",
        });
      },
      put: async () => new Response(null, { status: 503 }),
    }),
    /Upload interrupted/,
  );
  assert.equal(finalized, false);
});
test("unlinked projects and insecure tickets fail before transmitting audio", async () => {
  await assert.rejects(
    uploadSoundRoomTake(
      { ...args, projectId: undefined },
      {
        checksum,
        request: async () => {
          assert.fail("No project request");
        },
        put: async () => {
          assert.fail("No audio");
        },
      },
    ),
    /Choose a Sound Room project/,
  );
  await assert.rejects(
    uploadSoundRoomTake(args, {
      checksum,
      request: async () =>
        Response.json({
          takeId: ID,
          key: ID,
          strategy: "single",
          uploadUrl: "http://untrusted.example.test/file",
        }),
      put: async () => {
        assert.fail("No audio");
      },
    }),
    /Invalid upload destination/,
  );
});

test("native m4a and browser codec parameters use storage-compatible audio types", async () => {
  for (const [supplied, expected] of [
    ["audio/m4a", "audio/mp4"],
    ["audio/webm;codecs=opus", "audio/webm"],
  ]) {
    await uploadSoundRoomTake(
      { ...args, contentType: supplied },
      {
        checksum,
        request: async (path, init) => {
          if (path.endsWith("/upload")) {
            assert.equal(JSON.parse(String(init.body)).contentType, expected);
            return Response.json({
              takeId: ID,
              key: ID,
              strategy: "single",
              uploadUrl: "https://s3.example.test/file",
              requiredHeaders: { "content-type": expected },
            });
          }
          return Response.json({
            take: { storageUrl: "https://easeverse.netlify.app/take" },
          });
        },
        put: async (_url, init) => {
          assert.equal(new Headers(init.headers).get("content-type"), expected);
          return new Response(null);
        },
      },
    );
  }
});

test("producer memos and comp exports use the S3 asset endpoint and retain their canonical parent", async () => {
  for (const target of [
    { purpose: "memo" as const, parentTakeId: "vocal-3", durationSec: 8 },
    { purpose: "comp" as const, compId: "comp-1" },
  ]) {
    let final: any;
    const result = await uploadSoundRoomTake(
      { ...args, projectId: undefined, target },
      {
        checksum,
        request: async (path, init) => {
          assert.equal(path, "/api/takes/asset-upload");
          const body = JSON.parse(String(init.body));
          assert.equal(body.purpose, target.purpose);
          if (body.action !== "finalize")
            return Response.json({
              takeId: ID,
              key: ID,
              projectId: "server-project",
              strategy: "single",
              uploadUrl: "https://s3.example.test/asset",
            });
          final = body;
          return Response.json({
            take: {
              storageUrl:
                "https://easeverse.netlify.app/api/takes/asset-audio?objectId=" +
                ID,
            },
          });
        },
        put: async () => new Response(null),
      },
    );
    assert.equal(final.takeId, ID);
    assert.equal(final.parentTakeId, (target as any).parentTakeId);
    assert.equal(final.compId, (target as any).compId);
    assert.match(result.url, /asset-audio/);
  }
});
