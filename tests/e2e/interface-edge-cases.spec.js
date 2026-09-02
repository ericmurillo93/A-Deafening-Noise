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

test("Language preference localizes navigation and follows reloads", async ({ page }) => {
  const openSpanishNavigation = async () => {
    const trigger = page.locator(".menu-button-desktop:visible, .menu-button-touch:visible");
    if (await trigger.count()) await trigger.click();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
  };
  await page.addInitScript(() => localStorage.setItem("adn-language", "es"));
  await page.goto("/home");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await openSpanishNavigation();
  await expect(page.getByRole("button", { name: "Inicio", exact: true })).toBeVisible();
  await page.reload();
  await openSpanishNavigation();
  await expect(page.getByRole("button", { name: "Archivo", exact: true })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("España", { exact: true }).first()).toBeVisible();
});

test("Spanish preference localizes the add concert dialog", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("adn-language", "es"));
  await page.goto("/home");
  await expect(page.getByText("View details", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ver detalles", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Añadir concierto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Añadir concierto" })).toBeVisible();
  await expect(page.getByText("Busca por artista y país y filtra los resultados por ciudad o año.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar" })).toBeVisible();
  const country = page.getByPlaceholder("Elige un país");
  await country.fill("esp");
  await expect(page.getByRole("option", { name: "España", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "¿No lo encuentras? Añádelo manualmente", exact: true }).click();
  await expect(page.getByPlaceholder("Nombre del artista")).toBeVisible();
  await expect(page.getByPlaceholder("Ciudad")).toBeVisible();
  await expect(page.getByPlaceholder("Sala o festival")).toBeVisible();
  await expect(page.getByPlaceholder("Otros asistentes (separados por comas)")).toBeVisible();
});

test("Add concert keeps its header visible while form content scrolls", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  await page.getByRole("button", { name: "Can’t find it? Add manually", exact: true }).click();

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
  const dialog = page.getByRole("dialog", { name: "Add concert" });
  await dialog.getByRole("button", { name: "Can’t find it? Add manually", exact: true }).click();

  const artist = dialog.getByPlaceholder("ARTIST NAME");
  const venue = dialog.getByPlaceholder("Venue or festival");
  const date = dialog.getByPlaceholder("DD/MM/YYYY");
  await artist.fill("Björk");
  await venue.fill("Sala Apolo");
  await expect(artist).toHaveValue("BJÖRK");
  await expect(venue).toHaveValue("SALA APOLO");

  await date.fill("01/01/2020");
  await expect(dialog.getByText("Ticket bought", { exact: true })).toBeHidden();
  await expect(dialog.getByPlaceholder("https://…")).toBeHidden();

  await date.fill("01/01/2099");
  await expect(dialog.getByText("Ticket bought", { exact: true })).toBeVisible();
  await expect(dialog.getByPlaceholder("https://…")).toBeVisible();
});

test("Add concert starts with concert discovery and keeps manual entry available", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add concert" });
  const artist = dialog.getByPlaceholder("ARTIST NAME");
  await expect(artist).toBeVisible();
  await expect(dialog.getByPlaceholder("Choose a country")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Search concerts" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Can’t find it? Add manually", exact: true }).click();
  await expect(dialog.getByPlaceholder("Artist name")).toBeVisible();
});

test("Add concert can search a provider artist absent from the local catalog", async ({ page }) => {
  await page.route("**/.netlify/functions/search-concert-catalog", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ concerts: [
    { artist: "Shakira", venue: "Palau Sant Jordi", city: "Barcelona", country: "ES", date: "06/07/2018", source: "setlist.fm", sourceEventId: "one" },
    { artist: "Shakira", venue: "Wizink Center", city: "Madrid", country: "ES", date: "03/11/2019", source: "setlist.fm", sourceEventId: "two" },
    { artist: "Shakira", venue: "Estadi Olímpic", city: "Barcelona", country: "ES", date: "05/09/2020", source: "setlist.fm", sourceEventId: "three" },
    { artist: "Shakira", venue: "Accor Arena", city: "Paris", country: "FR", date: "14/06/2017", source: "setlist.fm", sourceEventId: "four" },
  ] }) }));
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add concert" });
  const artist = dialog.getByPlaceholder("Artist name");
  await artist.fill("SHAKIRA");
  const country = dialog.getByPlaceholder("Choose a country");
  await country.click();
  await expect(dialog.getByRole("option")).toHaveCount(249);
  await country.fill("spa");
  await expect(country).toHaveValue("SPA");
  await dialog.getByRole("option", { name: "Spain", exact: true }).click();
  await dialog.getByRole("button", { name: "Search concerts" }).click();
  await expect(dialog.getByText("3 concerts found")).toBeVisible();
  const city = dialog.getByPlaceholder("All cities");
  await expect(city).toBeVisible();
  await expect(dialog.getByText(/Palau Sant Jordi/i)).toBeVisible();
  await city.click();
  await expect(dialog.getByRole("option", { name: "Barcelona", exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "Madrid", exact: true })).toBeVisible();
  const year = dialog.getByPlaceholder("All years");
  await year.fill("2018");
  await dialog.getByRole("option", { name: "2018", exact: true }).click();
  await city.click();
  await expect(dialog.getByRole("option", { name: "Barcelona", exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "Madrid", exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "Clear filters" }).click();
  await city.fill("bar");
  await dialog.getByRole("option", { name: "Barcelona", exact: true }).click();
  await year.click();
  await expect(dialog.getByRole("option", { name: "2018", exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "2020", exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "2019", exact: true })).toBeHidden();
});

test("Browser Back closes Add concert before leaving the page", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Add concert", exact: true }).click();
  await expect(page.getByTestId("add-concert-modal")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("add-concert-modal")).toBeHidden();
  await expect(page).toHaveURL(/\/home$/);
});

test("Search my archive opens a reload-safe city profile", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search my archive" });
  await search.getByRole("combobox", { name: "Search my archive" }).fill("Barcelona");
  const cities = search.getByRole("heading", { name: "Cities" }).locator("..");
  await cities.getByRole("option", { name: /Barcelona/i }).click();
  await expect(page).toHaveURL(/\/city\/ES\/Barcelona$/);
  await expect(page.getByRole("heading", { name: "Concert history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/city\/ES\/Barcelona$/);
  await expect(page.getByRole("heading", { name: "Artists" })).toBeVisible();
  await page.goto(`/city/${encodeURIComponent("L’Hospitalet de Llobregat")}`);
  await expect(page.getByRole("button", { name: "RIVERSIDE", exact: true }).first()).toBeVisible();
  await expect(page.getByText("3 total", { exact: true })).toBeVisible();
});

test("Search my archive supports keyboard navigation", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search my archive" });
  await search.fill("Riverside");
  await search.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText("RIVERSIDE");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/artist\/RIVERSIDE$/);
});

test("Search my archive opens a reload-safe concert page", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search my archive" });
  await search.getByRole("combobox", { name: "Search my archive" }).fill("Riverside");
  const concerts = search.getByRole("heading", { name: "Concerts" }).locator("..");
  await concerts.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/concert\//);
  await expect(page.getByRole("button", { name: "Setlist", exact: true })).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: "Setlist", exact: true })).toBeVisible();
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

  await concert.click({ position: { x: 4, y: 4 } });
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
  test.setTimeout(45_000);
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
    ["/history", "Concert archive"],
    ["/calendar", "Concert calendar"],
    ["/suggestions", "Concert Suggestions"],
    ["/timeline", "Concert Timeline"],
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

test("Home keeps today's concert until midnight, then advances", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-17T12:00:00") });
  await page.goto("/home");
  const nextConcert = page.getByRole("button", { name: /Next concert/i });
  await expect(nextConcert).toContainText("Mon, 17 Aug 2026");
  await expect(page.getByText("Today", { exact: true })).toBeVisible();

  await page.clock.fastForward("12:00:01");
  await expect(nextConcert).toContainText("Tue, 18 Aug 2026");
});

test("Home countdown fits inside the next-concert card in phone landscape", async ({ page }) => {
  await page.setViewportSize({ width: 1017, height: 505 });
  await page.clock.install({ time: new Date("2026-08-16T12:00:00") });
  await page.goto("/home");
  const card = page.getByRole("button", { name: /Next concert/i });
  const seconds = card.getByText("Secs", { exact: true });
  const [cardBox, secondsBox] = await Promise.all([card.boundingBox(), seconds.boundingBox()]);
  expect(cardBox && secondsBox && secondsBox.y + secondsBox.height <= cardBox.y + cardBox.height).toBe(true);
});

test("Concert Poster scales proportionally beyond a 1920px viewport", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("adn-theme", "poster"));
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/home");
  expect((await page.locator(".adn-content").boundingBox())?.width).toBeCloseTo(1280, 0);
  await page.setViewportSize({ width: 2560, height: 1080 });
  expect((await page.locator(".adn-content").boundingBox())?.width).toBeCloseTo(2560 * 2 / 3, 0);
});

test("Stats year dropdown stays inside the phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto("/year-review");
  await page.locator("summary[aria-label='Choose review year']").click();
  const box = await page.locator("details:has([aria-label='Choose review year']) .adn-popover").boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 851).toBe(true);
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
  await expect(page.getByText(/Reviewed suggestions/)).toBeVisible();
});

test("Profile offers Spotify connection through the UI", async ({ page }) => {
  let authorizationUrl = "";
  await page.route("https://accounts.spotify.com/authorize**", async (route) => {
    authorizationUrl = route.request().url();
    await route.abort();
  });
  await page.goto("/profile");
  const profileCountry = page.getByRole("combobox", { name: "Country", exact: true });
  await profileCountry.fill("");
  await expect(page.getByRole("option")).toHaveCount(249);
  await profileCountry.fill("Spa");
  await page.getByRole("option", { name: "Spain", exact: true }).click();
  await expect(profileCountry).toHaveValue("Spain");
  await expect(page.getByRole("button", { name: "Remove Spain" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spotify", exact: true })).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect Spotify" });
  await expect(connect).toBeVisible();
  await expect(connect.locator("img")).toBeVisible();
  const countrySearch = page.getByRole("combobox", { name: "Search countries" });
  await countrySearch.fill("Spa");
  await page.getByRole("option", { name: "Spain ES" }).click();
  await countrySearch.fill("Swi");
  await page.getByRole("option", { name: "Switzerland CH" }).click();
  await expect(page.getByText("2 of 5 countries selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Concert suggestions by email" })).toBeChecked();
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
  const displayName = page.getByLabel("Display name");
  const discoverable = page.getByRole("checkbox", { name: "Allow other users to find me" });
  await displayName.fill("Unsaved profile name");
  await discoverable.uncheck();
  const defaultNavigation = page.locator(".adn-desktop-navigation");
  const defaultNavigationWidth = testInfo.project.name === "desktop" ? (await defaultNavigation.boundingBox())?.width : null;
  await page.getByRole("radio", { name: /Concert poster/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "archive");
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "poster");
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".adn-desktop-navigation")).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const posterNavigation = page.getByRole("complementary", { name: "Main navigation" });
    await expect(posterNavigation).toBeVisible();
    expect((await posterNavigation.boundingBox())?.width).toBeCloseTo(defaultNavigationWidth, 4);
  }
  await expect(displayName).toHaveValue("Unsaved profile name");
  await expect(discoverable).not.toBeChecked();
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
