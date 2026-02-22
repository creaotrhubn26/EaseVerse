import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLyricsRealtimeSocketUrl,
  buildLyricsSyncRoute,
  resolveLyricsSyncConfig,
} from "../lib/collab-lyrics";

const ORIGINAL_ENV = {
  source: process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE,
  projectId: process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID,
  apiKey: process.env.EXPO_PUBLIC_API_KEY,
};

function clearRuntimeOverrides() {
  const runtime = globalThis as Record<string, unknown>;
  delete runtime.__E2E_LYRICS_SYNC_SOURCE__;
  delete runtime.__E2E_LYRICS_SYNC_PROJECT_ID__;
}

function resetEnv() {
  if (ORIGINAL_ENV.source === undefined) {
    delete process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE;
  } else {
    process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE = ORIGINAL_ENV.source;
  }

  if (ORIGINAL_ENV.projectId === undefined) {
    delete process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID;
  } else {
    process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID = ORIGINAL_ENV.projectId;
  }

  if (ORIGINAL_ENV.apiKey === undefined) {
    delete process.env.EXPO_PUBLIC_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_API_KEY = ORIGINAL_ENV.apiKey;
  }
}

function resetState() {
  clearRuntimeOverrides();
  resetEnv();
}

test.afterEach(() => {
  resetState();
});

test("resolveLyricsSyncConfig uses environment values when runtime overrides are absent", () => {
  process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE = "env-source";
  process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID = "env-project";
  process.env.EXPO_PUBLIC_API_KEY = "env-key";

  const resolved = resolveLyricsSyncConfig();

  assert.deepEqual(resolved, {
    source: "env-source",
    projectId: "env-project",
    apiKey: "env-key",
  });
});

test("runtime overrides take precedence over environment values", () => {
  process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE = "env-source";
  process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID = "env-project";

  const runtime = globalThis as Record<string, unknown>;
  runtime.__E2E_LYRICS_SYNC_SOURCE__ = "runtime-source";
  runtime.__E2E_LYRICS_SYNC_PROJECT_ID__ = "runtime-project";

  const resolved = resolveLyricsSyncConfig();

  assert.equal(resolved.source, "runtime-source");
  assert.equal(resolved.projectId, "runtime-project");
});

test("runtime override can intentionally clear environment filters with an empty string", () => {
  process.env.EXPO_PUBLIC_LYRICS_SYNC_SOURCE = "env-source";
  process.env.EXPO_PUBLIC_LYRICS_SYNC_PROJECT_ID = "env-project";

  const runtime = globalThis as Record<string, unknown>;
  runtime.__E2E_LYRICS_SYNC_SOURCE__ = "";
  runtime.__E2E_LYRICS_SYNC_PROJECT_ID__ = "";

  const resolved = resolveLyricsSyncConfig();

  assert.equal(resolved.source, undefined);
  assert.equal(resolved.projectId, undefined);
  assert.equal(buildLyricsSyncRoute(), "/api/v1/collab/lyrics");
});

test("explicit config is applied to sync route and websocket URL", () => {
  process.env.EXPO_PUBLIC_API_KEY = "env-key";

  const route = buildLyricsSyncRoute({
    source: "explicit-source",
    projectId: "explicit-project",
  });
  assert.equal(
    route,
    "/api/v1/collab/lyrics?source=explicit-source&projectId=explicit-project"
  );

  const socketUrl = buildLyricsRealtimeSocketUrl("https://easeverse.test", {
    source: "explicit-source",
    projectId: "explicit-project",
    apiKey: "explicit-key",
  });
  assert.equal(
    socketUrl,
    "wss://easeverse.test/api/v1/ws?source=explicit-source&projectId=explicit-project&apiKey=explicit-key"
  );
});
