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

test("exchanges a one-time CreatorHub transfer and stores the shared session", async ({ page }) => {
  let exchangePayload: unknown = null;
  await page.route("**/api/auth/exchange", async (route) => {
    exchangePayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        token: "creatorhub-session-e2e",
        user: {
          id: "workspace-user-42",
          email: "producer@example.com",
          name: "Music Producer",
          role: "music_producer",
        },
      }),
    });
  });
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        userId: "workspace-user-42",
        email: "producer@example.com",
        status: "approved",
        createdAt: "2026-09-07T00:00:00.000Z",
        approvedAt: "2026-09-07T00:00:00.000Z",
        approvedBy: "e2e",
        pilotExpiresAt: null,
      }),
    }),
  );

  await page.goto(
    `/auth/callback?chGoogleStatus=success&chGoogleTransfer=${transferId}`,
  );

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("creatorhub_auth_token")),
    )
    .toBe("creatorhub-session-e2e");
  const storedUser = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("creatorhub_auth_user") ?? "null"),
  );
  expect(storedUser).toMatchObject({
    id: "workspace-user-42",
    email: "producer@example.com",
  });
  expect(exchangePayload).toEqual({ transferId });
});
