import { expect, test } from "@playwright/test";

test("PWA manifest uses root scope and legacy /app routes redirect correctly", async ({
  page,
  request,
}) => {
  const apiBase =
    process.env.E2E_API_BASE ||
    process.env.EXPO_PUBLIC_API_URL ||
    `http://127.0.0.1:${process.env.E2E_PORT || "5051"}`;

  await page.addInitScript((value) => {
    (window as Window & { __E2E_API_BASE__?: string }).__E2E_API_BASE__ = value;
  }, apiBase);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");

  const swResponse = await request.get("/sw.js");
  expect(swResponse.ok()).toBeTruthy();
  const swText = await swResponse.text();
  expect(swText).toContain("easeverse-static-v1");

  await page.goto("/app/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/app/lyrics", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/lyrics$/);
  await expect(page.getByPlaceholder("Song title")).toBeVisible({ timeout: 15_000 });
});
