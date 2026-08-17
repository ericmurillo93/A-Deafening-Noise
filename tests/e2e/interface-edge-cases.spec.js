import { expect, test } from "@playwright/test";

async function openMenu(page) {
  const trigger = page.locator(".menu-button-desktop:visible, .menu-button-touch:visible");
  if (await trigger.count()) {
    await trigger.click();
    await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeVisible();
    return true;
  }
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  return false;
}

test("Add concert keeps its header visible while form content scrolls", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();

  const header = page.getByTestId("add-concert-header");
  const scrollArea = page.getByTestId("add-concert-scroll");
  const before = await header.boundingBox();
  await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const after = await header.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  await expect(page.getByRole("heading", { name: "Add concert" })).toBeVisible();
});

test("Add concert derives ticket fields from the date and uppercases catalog labels", async ({ page }) => {
  await page.goto("/home");
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
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  await expect(page.getByTestId("add-concert-modal")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("add-concert-modal")).toBeHidden();
  await expect(page).toHaveURL(/\/home$/);
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
  const concert = page.locator('article button[aria-label^="Open "]').first();
  await expect(concert).toBeVisible();
  await expect(concert).toHaveCSS("cursor", "pointer");
  await concert.focus();
  await expect(concert).toBeFocused();
});

test("Menu closes with Escape and restores page scrolling", async ({ page }) => {
  await page.goto("/history");
  const openedDrawer = await openMenu(page);
  if (!openedDrawer) {
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    return;
  }
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("Open dialogs lock the page behind them and preserve its scroll position", async ({ page }) => {
  await page.goto("/history");
  const concert = page.locator('article button[aria-label^="Open "]').nth(20);
  await concert.scrollIntoViewIfNeeded();
  const initialScrollY = await page.evaluate(() => window.scrollY);

  await concert.click();
  const modal = page.getByTestId("concert-details-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("dialog")).toBeVisible();
  await expect.poll(() => modal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    rootOverflow: document.documentElement.style.overflow,
  }))).toEqual({ bodyOverflow: "hidden", rootOverflow: "hidden" });

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("concert-details-modal")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScrollY);
});

test("Calendar opens on the current month on every visit", async ({ page }) => {
  const currentMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date());
  await page.goto("/calendar");
  const monthButton = page.locator('button[aria-label^="Choose month"]');
  await expect(monthButton).toContainText(currentMonth);
  await expect(page.locator('[aria-current="date"]')).toBeVisible();

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(monthButton).not.toContainText(currentMonth);
  const openedDrawer = await openMenu(page);
  await page.getByRole("button", { name: "Concert archive", exact: true }).click();
  await openMenu(page);
  await page.getByRole("button", { name: "Concert calendar" }).click();

  await expect(monthButton).toContainText(currentMonth);
});

test("Mobile calendar events highlight their matching monthly-list entry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop" || page.viewportSize().width >= 768);
  await page.goto("/calendar");
  const event = page.locator('button[aria-label^="Highlight "]');
  for (let month = 0; month < 24 && await event.count() === 0; month += 1) await page.getByRole("button", { name: "Previous month" }).click();
  await expect(event.first()).toBeVisible();
  await event.first().click();
  await expect(event.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-calendar-highlighted="true"]').first()).toBeVisible();
});

test("Core pages do not create viewport-level horizontal overflow", async ({ page }) => {
  for (const route of ["/home", "/history", "/calendar", "/timeline", "/stats", "/year-review", "/friends"]) {
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
  test.setTimeout(45_000);
  const routes = [
    ["/home", /^Good (morning|afternoon|evening),/],
    ["/history", "Concert Archive"],
    ["/calendar", "Concert Calendar"],
    ["/suggestions", "Concert Suggestions"],
    ["/timeline", "Timeline"],
    ["/stats", "Archive Overview"],
    ["/year-review", "Year in Review"],
    ["/friends", "Friends"],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
  }
});

test("Home dashboard opens its primary concert and add flows", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: /Next concert/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.locator("header").getByRole("button", { name: "Add concert", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add concert" })).toBeVisible();
});

test("Home dashboard reviews concert suggestions without leaving the page", async ({ page }) => {
  let savedData;
  await page.route("**/.netlify/functions/save-concerts", (route) => { savedData = route.request().postDataJSON().data; return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
  await page.goto("/home");
  const notInterested = page.getByRole("button", { name: "Not interested", exact: true });
  await expect(notInterested.first()).toBeVisible();
  const dismissedRow = notInterested.first().locator("xpath=ancestor::*[@data-suggestion-id]");
  const dismissedId = await dismissedRow.getAttribute("data-suggestion-id");
  await dismissedRow.getByRole("button", { name: "Not interested", exact: true }).click();
  await expect(page.locator(`[data-suggestion-id="${dismissedId}"]`)).toBeHidden();
  const interested = page.getByRole("button", { name: "Interested", exact: true });
  const interestedRow = interested.first().locator("xpath=ancestor::*[@data-suggestion-id]");
  const interestedId = await interestedRow.getAttribute("data-suggestion-id");
  await interestedRow.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(page.getByText("Concert added to your calendar.", { exact: true })).toBeVisible();
  await expect(page.locator(`[data-suggestion-id="${interestedId}"]`)).toBeHidden();
  const savedConcert = savedData.concerts.at(-1);
  expect(savedConcert.bought).toBe(false);
  expect(savedConcert.city).toBeTruthy();
  expect(savedConcert.country).toMatch(/^[A-Z]{2}$/);

  await page.getByRole("button", { name: "View all", exact: true }).last().click();
  await expect(page.getByText(/Past suggestions/)).toBeVisible();
});

test("Profile offers Spotify connection through the UI", async ({ page }) => {
  let authorizationUrl = "";
  await page.route("https://accounts.spotify.com/authorize**", async (route) => {
    authorizationUrl = route.request().url();
    await route.abort();
  });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Spotify", exact: true })).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect Spotify" });
  await expect(connect).toBeVisible();
  await expect(connect.locator("img")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Email me when new concert suggestions are found" })).not.toBeChecked();
  await connect.click();
  await expect.poll(() => new URL(authorizationUrl).searchParams.get("show_dialog")).toBe("true");
});

test("Profile chooses an avatar without exposing its local filename", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Choose profile photo").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("avatar") });
  await expect(page.getByText("avatar.png", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Avatar image", { exact: true })).toHaveCount(0);
});

test("Profile theme choice persists after reload", async ({ page }, testInfo) => {
  await page.goto("/profile");
  await page.getByRole("radio", { name: /Concert poster/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "poster");
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".adn-desktop-navigation")).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "poster");
});

test("Concert suggestions rely on automatic discovery without manual refresh controls", async ({ page }) => {
  await page.goto("/suggestions");
  await expect(page.getByRole("heading", { name: "Concert Suggestions" })).toBeVisible();
  await expect(page.getByText(/Updated daily · Last update/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find concerts" })).toHaveCount(0);
});

test("Spotify callback is consumed once under React Strict Mode", async ({ page }) => {
  let tokenRequests = 0;
  await page.route("https://accounts.spotify.com/api/token", async (route) => {
    tokenRequests += 1;
    await route.fulfill({ json: { access_token: "test-token", refresh_token: "test-refresh-token" } });
  });
  await page.route("https://api.spotify.com/v1/**", async (route) => {
    await route.fulfill({ json: route.request().url().endsWith("/me") ? { id: "eric", display_name: "Eric" } : { items: [] } });
  });
  await page.goto("/profile");
  await page.evaluate(() => {
    sessionStorage.setItem("adn_spotify_code_verifier", "verifier");
    sessionStorage.setItem("adn_spotify_oauth_state", "state");
  });
  await page.goto("/spotify/callback?code=code&state=state");
  await expect.poll(() => tokenRequests).toBe(1);
  await expect(page.getByText("Spotify could not verify this connection. Please try again.")).toHaveCount(0);
});
