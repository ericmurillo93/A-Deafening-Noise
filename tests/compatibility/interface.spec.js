import { expect, test } from "@playwright/test";

async function fitsViewport(page, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height - 8);
}

for (const theme of ["archive", "poster"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: new Date("2026-08-17T12:00:00") });
      await page.addInitScript(value => localStorage.setItem("adn-theme", value), theme);
    });

    test("pages, typography and controls remain usable", async ({ page }, testInfo) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const route of ["home", "history", "timeline", "calendar", "stats", "year-review", "friends", "profile", "suggestions"]) {
        await page.goto(`/${route}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          fields: [...document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select')]
            .filter(el => el.getClientRects().length > 0)
            .map(el => ({ name: el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.tagName, size: parseFloat(getComputedStyle(el).fontSize) })),
          coarse: matchMedia("(pointer: coarse)").matches,
        }));
        expect.soft(layout.overflow, `${route}: horizontal overflow`).toBeLessThanOrEqual(1);
        if (layout.coarse) for (const field of layout.fields) expect.soft(field.size, `${route}: ${field.name} can trigger iOS focus zoom`).toBeGreaterThanOrEqual(16);
        if (testInfo.project.name.startsWith("webkit") && ["home", "calendar", "stats", "profile"].includes(route)) {
          await page.screenshot({ path: testInfo.outputPath(`${theme}-${route}.png`), fullPage: true, animations: "disabled" });
        }
      }
      expect(errors).toEqual([]);
    });

    test("modal geometry, scrolling, focus and keyboard navigation", async ({ page }, testInfo) => {
      await page.goto("/home");
      await page.getByRole("button", { name: "Add concert", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Add concert" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Can’t find it? Add manually", exact: true }).click();
      await fitsViewport(page, dialog);
      const style = await dialog.evaluate(el => ({ border: getComputedStyle(el).borderTopWidth, radius: getComputedStyle(el).borderTopLeftRadius }));
      expect(parseFloat(style.border)).toBeGreaterThanOrEqual(1);
      expect(parseFloat(style.radius)).toBeGreaterThan(0);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
      const header = page.getByTestId("add-concert-header");
      const before = await header.boundingBox();
      await page.getByTestId("add-concert-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(Math.abs((await header.boundingBox()).y - before.y)).toBeLessThan(2);
      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
      if (testInfo.project.name.startsWith("webkit")) await page.screenshot({ path: testInfo.outputPath(`${theme}-add-modal.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Add concert", exact: true }).click();
      await dialog.getByRole("button", { name: "Can’t find it? Add manually", exact: true }).click();
      await dialog.getByRole("combobox", { name: "Artist", exact: true }).fill("UNSAVED EXAMPLE");
      await page.keyboard.press("Escape");
      const discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
      await expect(discard).toBeVisible();
      await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.keyboard.press("Control+k");
      const search = page.getByRole("dialog", { name: "Search my archive" });
      await expect(search).toBeVisible();
      await fitsViewport(page, search);
      await search.getByRole("combobox").fill("Riverside");
      await page.keyboard.press("ArrowDown");
      await expect(search.getByRole("option", { selected: true })).toContainText("RIVERSIDE");
      await page.keyboard.press("Escape");
      await expect(search).toBeHidden();
    });
  });
}
