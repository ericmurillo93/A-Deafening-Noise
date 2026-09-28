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

for (const theme of ["archive", "poster"]) {
  test(`Home preserves ${theme} appearance`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-17T12:00:00+02:00") });
    await page.addInitScript((value) => localStorage.setItem("adn-theme", value), theme);
    await page.goto("/home");
    await expect(page.getByRole("button", { name: /Next concert/i })).toBeVisible();
    await expect(page).toHaveScreenshot(`home-${theme}.png`, { animations: "disabled", fullPage: true });
  });
}
