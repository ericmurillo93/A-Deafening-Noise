import { expect, test } from "@playwright/test";

async function openMenu(page) {
  await page.locator(".menu-button-desktop:visible, .menu-button-touch:visible").click();
  await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeVisible();
}

test("Stats submenu leaves space below its last item", async ({ page }) => {
  await page.goto("/stats");
  await openMenu(page);

  const group = page.getByTestId("stats-menu-group");
  const lastItem = page.getByRole("button", { name: "Year in review", exact: true });
  const [groupBox, itemBox] = await Promise.all([group.boundingBox(), lastItem.boundingBox()]);

  expect(groupBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  expect(groupBox.y + groupBox.height - (itemBox.y + itemBox.height)).toBeGreaterThanOrEqual(8);
});

test("Add concert keeps its header visible while form content scrolls", async ({ page }) => {
  await page.goto("/history");
  await openMenu(page);
  await page.getByRole("button", { name: "Add concert", exact: true }).click();

  const header = page.getByTestId("add-concert-header");
  const scrollArea = page.getByTestId("add-concert-scroll");
  const before = await header.boundingBox();
  await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const after = await header.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(page.getByRole("heading", { name: "Add concert" })).toBeVisible();
});

test("Add concert derives ticket fields from the date and uppercases catalog labels", async ({ page }) => {
  await page.goto("/history");
  await openMenu(page);
  await page.getByRole("button", { name: "Add concert", exact: true }).click();

  const artist = page.getByPlaceholder("Artist name");
  const venue = page.getByPlaceholder("Venue or festival");
  const date = page.getByPlaceholder("DD/MM/YYYY");
  await artist.fill("Björk");
  await venue.fill("Sala Apolo");
  await expect(artist).toHaveValue("BJÖRK");
  await expect(venue).toHaveValue("SALA APOLO");

  await date.fill("01/01/2020");
  await expect(page.getByText("Ticket bought", { exact: true })).toBeHidden();
  await expect(page.getByPlaceholder("https://…")).toBeHidden();

  await date.fill("01/01/2099");
  await expect(page.getByText("Ticket bought", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("https://…")).toBeVisible();
});

test("Browser Back closes Add concert before leaving the page", async ({ page }) => {
  await page.goto("/history");
  await openMenu(page);
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  await expect(page.getByTestId("add-concert-modal")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("add-concert-modal")).toBeHidden();
  await expect(page).toHaveURL(/\/history$/);
});

test("Year bars open a reload-safe Year in Review route", async ({ page }) => {
  await page.goto("/stats");
  const yearBar = page.locator('button[aria-label^="Open "][aria-label*="year in review"]').first();
  await yearBar.click();

  await expect(page).toHaveURL(/\/year-review\/\d{4}$/);
  await expect(page.getByRole("heading", { name: "Year in Review" })).toBeVisible();
  const selectedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(selectedUrl);
});

test("Archive concert entries communicate that they are interactive", async ({ page }) => {
  await page.goto("/history");
  const concert = page.locator('[role="button"][aria-label^="Open "]').first();
  await expect(concert).toBeVisible();
  await expect(concert).toHaveCSS("cursor", "pointer");
  await concert.focus();
  await expect(concert).toBeFocused();
});

test("Menu closes with Escape and restores page scrolling", async ({ page }) => {
  await page.goto("/history");
  await openMenu(page);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("Open dialogs lock the page behind them and preserve its scroll position", async ({ page }) => {
  await page.goto("/history");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const initialScrollY = await page.evaluate(() => window.scrollY);

  await openMenu(page);
  await page.getByRole("button", { name: "Add concert" }).click();
  await expect(page.getByTestId("add-concert-modal")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    rootOverflow: document.documentElement.style.overflow,
  }))).toEqual({ bodyOverflow: "hidden", bodyPosition: "fixed", rootOverflow: "hidden" });

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("add-concert-modal")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScrollY);
});

test("Calendar opens on the current month on every visit", async ({ page }) => {
  const currentMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date());
  await page.goto("/calendar");
  const monthButton = page.locator('button[aria-label^="Choose month"]');
  await expect(monthButton).toContainText(currentMonth);

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(monthButton).not.toContainText(currentMonth);
  await openMenu(page);
  await page.getByRole("button", { name: "Concert history" }).click();
  await openMenu(page);
  await page.getByRole("button", { name: "Concert calendar" }).click();

  await expect(monthButton).toContainText(currentMonth);
});

test("Core pages do not create viewport-level horizontal overflow", async ({ page }) => {
  for (const route of ["/history", "/calendar", "/timeline", "/stats", "/year-review", "/friends"]) {
    await page.goto(route);
    await expect.poll(() => page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))).toEqual(expect.objectContaining({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} overflows horizontally`).toBeLessThanOrEqual(1);
  }
});

test("Clean routes survive direct loads and reloads", async ({ page }) => {
  const routes = [
    ["/history", "Concert Archive"],
    ["/calendar", "Concert Calendar"],
    ["/timeline", "Timeline"],
    ["/stats", "Archive Overview"],
    ["/year-review", "Year in Review"],
    ["/friends", "Friends"],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
  }
});
