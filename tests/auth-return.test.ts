import assert from "node:assert/strict";
import test from "node:test";
import { safeCreatorHubAuthNextPath } from "../lib/auth-return";

test("auth callback resumes only a local CreatorHub integration path", () => {
  const valid = "/integrations/creatorhub?creatorhubProjectId=project-1&returnTo=https%3A%2F%2Fwww.creatorhubn.com%2Fworkspace%2Fproject-1%2Fsound-room";
  assert.equal(safeCreatorHubAuthNextPath(valid), valid);
  assert.equal(safeCreatorHubAuthNextPath("https://attacker.example/integrations/creatorhub"), null);
  assert.equal(safeCreatorHubAuthNextPath("//attacker.example/integrations/creatorhub"), null);
  assert.equal(safeCreatorHubAuthNextPath("/projects/private-project"), null);
  assert.equal(safeCreatorHubAuthNextPath("javascript:alert(1)"), null);
});
