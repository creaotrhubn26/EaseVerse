import { expect, test } from "@playwright/test";

async function skipIntroIfVisible(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: "Skip intro" });
  if (await skip.isVisible()) await skip.click();
}

test("publishes the Play privacy policy and deletion pathway", async ({ page }) => {
  await page.goto("/privacy");
  await skipIntroIfVisible(page);

  await expect(page.getByText("Privacy Policy", { exact: true })).toBeVisible();
  await expect(page.getByText(/CREATORHUB AS/)).toBeVisible();
  await expect(page.getByText(/organisation number 937 518 684/)).toBeVisible();
  await expect(page.getByText("Open the account deletion page")).toBeVisible();

  await page.getByRole("link", { name: "Open account deletion page" }).click();
  await expect(page).toHaveURL(/\/account-deletion$/);
  await expect(page.getByText("Delete account and data", { exact: true })).toBeVisible();

  const deletionAction = page.getByRole("button", {
    name: "Email account deletion request",
  });
  await expect(deletionAction).toBeVisible();
});

