import assert from "node:assert/strict";
import test from "node:test";
import { safeCreatorHubAuthNextPath } from "../lib/auth-return";

test("auth callback resumes only a local CreatorHub integration path", () => {
  const valid =
    "/integrations/creatorhub?creatorhubProjectId=project-1&returnTo=https%3A%2F%2Fwww.creatorhubn.com%2Fworkspace%2Fproject-1%2Fsound-room";
  assert.equal(safeCreatorHubAuthNextPath(valid), valid);
  assert.equal(
    safeCreatorHubAuthNextPath(
      "https://attacker.example/integrations/creatorhub"
    ),
    null
  );
  assert.equal(
    safeCreatorHubAuthNextPath("//attacker.example/integrations/creatorhub"),
    null
  );
  assert.equal(safeCreatorHubAuthNextPath("/projects/private-project"), null);
  assert.equal(safeCreatorHubAuthNextPath("javascript:alert(1)"), null);
});

test("auth callback resumes an assigned warmup without accepting other destinations", () => {
  const path = "/warmup-session?projectId=prj_qa-1";
  assert.equal(safeCreatorHubAuthNextPath(path), path);
  assert.equal(
    safeCreatorHubAuthNextPath(path + "&returnTo=https://attacker.example"),
    path
  );
  assert.equal(safeCreatorHubAuthNextPath("/warmup-session"), null);
  assert.equal(
    safeCreatorHubAuthNextPath("/warmup-session?projectId=%2Fprivate"),
    null
  );
  assert.equal(
    safeCreatorHubAuthNextPath(
      "//attacker.example/warmup-session?projectId=qa"
    ),
    null
  );
});

test('authentication resumes the same invitation without allowing another return destination',()=>{
 const path='/sound-room/invite/inv_0123456789abcdef0123456789abcdef';
 assert.equal(safeCreatorHubAuthNextPath(path),path);
 assert.equal(safeCreatorHubAuthNextPath('/sound-room/invite/short'),null);
 assert.equal(safeCreatorHubAuthNextPath('https://attacker.example'+path),null);
});
