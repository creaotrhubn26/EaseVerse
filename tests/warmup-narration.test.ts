import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { warmUpExercises } from "../constants/warmup.ts";
import { warmupNarration, warmupVoice } from "../constants/warmup-narration.ts";
test("each selectable warmup has its own recorded Norwegian instructions", () => {
  assert.equal(warmupVoice.voice, "Algenib");
  assert.equal(warmupVoice.language, "nb-NO");
  for (const exercise of warmUpExercises) {
    assert.ok(
      warmupNarration[exercise.id]?.transcript.length > 50,
      exercise.id
    );
    const file = new URL(
      `../assets/audio/warmups/${exercise.id}.mp3`,
      import.meta.url
    );
    assert.ok(existsSync(file));
    assert.ok(readFileSync(file).byteLength > 10000);
  }
});
test("the voice catalogue does not promise that completing a routine certifies readiness", () => {
  const source = readFileSync(
    new URL("../app/warmup.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!source.includes("good to sing for the next 1-2 hours"));
  assert.ok(!source.includes("Your voice is ready to perform!"));
});
