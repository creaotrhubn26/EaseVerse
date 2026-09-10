import { expect, test } from "@playwright/test";

const transferId = "550e8400-e29b-41d4-a716-446655440000";

test("starts sign-in with the shared CreatorHub Workspace OAuth flow", async ({ page }) => {
  let startPayload: unknown = null;
  await page.route("**/api/auth/start", async (route) => {
    startPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authorizationUrl:
          "https://accounts.google.com/o/oauth2/v2/auth?client_id=creatorhub-e2e",
      }),
    });
  });
  await page.route("https://accounts.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>CreatorHub Google OAuth</title>",
    }),
  );

  await page.goto("/sign-in");
  const skip = page.getByRole("button", { name: "Skip intro" });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole("button", { name: "Continue with CreatorHub" }).click();

  await expect(page).toHaveURL(/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  expect(startPayload).toEqual({ platform: "web" });
});

test("shows CreatorHub OAuth start failures during a Workspace song handoff", async ({ page }) => {
  await page.route("**/api/auth/start", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Workspace access denied" }),
    }),
  );

  await page.goto("/integrations/creatorhub?creatorhubProjectId=workspace-7");
  await page.getByRole("button", { name: "Continue with CreatorHub" }).click();

  await expect(page.getByText("Workspace access denied")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with CreatorHub" })).toBeEnabled();
});

test("exchanges a one-time CreatorHub transfer and stores the shared session", async ({ page }) => {
  let exchangePayload: unknown = null;
  await page.route("**/api/auth/exchange", async (route) => {
    exchangePayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      headers: {
        "set-cookie": "easeverse_session=e2e-http-only; HttpOnly; Path=/; SameSite=Lax",
      },
      body: JSON.stringify({
        user: {
          id: "workspace-user-42",
          email: "producer@example.com",
          name: "Music Producer",
          role: "music_producer",
        },
      }),
    });
  });

  await page.goto(
    `/auth/callback?chGoogleStatus=success&chGoogleTransfer=${transferId}`,
  );

  await expect.poll(() =>
    page.evaluate(() => localStorage.getItem("creatorhub_auth_token")),
  ).toBeNull();
  await expect.poll(async () => {
    const cookies = await page.context().cookies();
    return cookies.find((cookie) => cookie.name === "easeverse_session")?.httpOnly;
  }).toBe(true);
  const storedUser = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("creatorhub_auth_user") ?? "null"),
  );
  expect(storedUser).toMatchObject({
    id: "workspace-user-42",
    email: "producer@example.com",
    role: "music_producer",
  });
  expect(exchangePayload).toEqual({ transferId, platform: "web" });
});

test("resumes the exact Workspace project after a one-time SSO handoff", async ({ page }) => {
  let contextPayload: unknown = null;
  await page.route("**/api/auth/exchange", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: {
        "set-cookie": "easeverse_session=e2e-http-only; HttpOnly; Path=/; SameSite=Lax",
      },
      body: JSON.stringify({
        user: {
          id: "workspace-user-42",
          email: "producer@example.com",
          name: "Music Producer",
          role: "music_producer",
        },
      }),
    }),
  );
  await page.route("**/api/integrations/creatorhub/context", async (route) => {
    contextPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        linked: true,
        project: { id: "ease-project-sso", name: "CreatorHub Sound Room E2E" },
      }),
    });
  });
  await page.route("**/api/projects/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: "ease-project-sso", name: "CreatorHub Sound Room E2E" },
        members: [],
      }),
    }),
  );

  const next = `/integrations/creatorhub?${new URLSearchParams({
    creatorhubProjectId: "workspace-7",
    audioReviewProjectId: "550e8400-e29b-41d4-a716-446655440001",
    projectName: "CreatorHub Sound Room E2E",
  })}`;
  await page.goto(`/auth/callback?${new URLSearchParams({
    chGoogleStatus: "success",
    chGoogleTransfer: transferId,
    next,
  })}`);

  await expect(page).toHaveURL(/\/projects\/ease-project-sso/, { timeout: 15_000 });
  expect(contextPayload).toEqual({
    creatorhubProjectId: "workspace-7",
    audioReviewProjectId: "550e8400-e29b-41d4-a716-446655440001",
    projectName: "CreatorHub Sound Room E2E",
  });
});

test("opens the exact Workspace song as an authenticated EaseVerse project", async ({ page }) => {
  let contextPayload: unknown = null;
  let authorizationHeader: string | undefined;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "workspace-user-42",
          email: "producer@example.com",
          name: "Music Producer",
        },
      }),
    }),
  );
  await page.route("**/api/integrations/creatorhub/context", async (route) => {
    contextPayload = route.request().postDataJSON();
    authorizationHeader = route.request().headers().authorization;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        linked: true,
        project: { id: "ease-project-1", name: "Running Home" },
        link: {
          creatorhubProjectId: "workspace-7",
          audioReviewProjectId: "550e8400-e29b-41d4-a716-446655440001",
          externalTrackId: "550e8400-e29b-41d4-a716-446655440002",
        },
      }),
    });
  });
  await page.route("**/api/projects/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: "ease-project-1", name: "Running Home" },
        members: [],
      }),
    }),
  );

  const returnTo = "https://www.creatorhubn.com/workspace/workspace-7/sound-room";
  await page.goto(`/integrations/creatorhub?${new URLSearchParams({
    creatorhubProjectId: "workspace-7",
    audioReviewProjectId: "550e8400-e29b-41d4-a716-446655440001",
    externalTrackId: "550e8400-e29b-41d4-a716-446655440002",
    projectName: "Running Home",
    returnTo,
  })}`);

  await expect(page).toHaveURL(/\/projects\/ease-project-1/, { timeout: 15_000 });
  expect(contextPayload).toEqual({
    creatorhubProjectId: "workspace-7",
    audioReviewProjectId: "550e8400-e29b-41d4-a716-446655440001",
    externalTrackId: "550e8400-e29b-41d4-a716-446655440002",
    projectName: "Running Home",
    returnTo,
  });
  expect(authorizationHeader).toBeUndefined();
});
