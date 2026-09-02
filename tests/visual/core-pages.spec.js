import { expect, test } from "@playwright/test";

const routes = ["history", "calendar", "stats", "friends"];

for (const route of routes) {
  test(`${route} matches its visual baseline`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: new Date("2026-08-17T12:00:00+02:00") });
    await page.goto(`/${route}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveScreenshot(`${route}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      timeout: 20_000,
    });
  });
}
