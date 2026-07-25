import { expect, test } from "@playwright/test";

const routes = ["history", "calendar", "stats", "friends"];

for (const route of routes) {
  test(`${route} matches its visual baseline`, async ({ page }) => {
    await page.goto(`/${route}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveScreenshot(`${route}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
}
