import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/home", "/history", "/calendar", "/suggestions", "/timeline", "/stats", "/year-review", "/friends", "/profile"];

for (const route of routes) {
  test(`${route} has no serious or critical accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blockingViolations = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    const summaries = blockingViolations.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`);
    expect(summaries, summaries.join("\n")).toEqual([]);
  });
}
