# A Deafening Noise — repository guidance

## Purpose and working style

This is Eric's private concert archive. Preserve the existing dark, compact visual language and mobile-first behavior. Inspect the dirty worktree before editing: unrelated local changes belong to the user. Commit and push only when explicitly requested, and stage only the intended files.

Read `README.md` for the quick start and `docs/DEVELOPMENT.md` for production configuration and operational commands.

## Architecture

- React/Vite single-page application; most UI and state live in `src/App.jsx`.
- Supabase is the production source of truth for profiles, concerts, participants, and dismissed suggestions.
- `data/concerts.json` is the local fallback and GitHub backup dataset.
- `data/listened-artists.json` is the privacy-reduced Spotify artist catalog used for suggestion affinity.
- `data/suggestions.json` is generated discovery output, never canonical concert data.
- Supabase Auth and security-definer RPCs provide per-user visibility and writes. Eric is the admin; suggestions remain admin-only.
- `netlify/functions/save-concerts.js` is retained as a protected legacy/backup writer.
- `netlify/functions/get-setlist.js` proxies setlist.fm in production.
- `vite.config.js` emulates those functions locally and writes concert edits directly to the working tree.
- Clean History API routes provide direct URLs and browser history for archive, calendar, timeline, stats, year review, artist, and venue views; Netlify's SPA fallback serves direct requests.

## Local versus production boundaries

- Supabase-enabled local and production builds use the same authenticated login.
- Production must retain Supabase Auth and must never restore a shared client-side password gate.
- Local function emulation must remain `apply: "serve"`; it must never become production runtime code.
- Never commit `.env.local`, passwords, GitHub tokens, Supabase secret/service-role keys, or setlist.fm keys.
- Supabase-enabled local UI edits write to Supabase and do not update or commit the JSON fallback automatically.

## Concert rules

- Past + `bought: true` is history.
- Future + `bought: true` is an upcoming bought concert.
- Future + `bought: false` is an unpurchased possibility.
- Add Concert is a single global action in the main menu. Past dates are automatically bought and hide ticket fields; today/future dates expose bought status and ticket link.
- Date format is `DD/MM/YYYY`; preserve existing date-range support.
- Artist and venue labels are stored and displayed in uppercase; normalize them on every write regardless of user input.
- Optional fields: `setlistId`, friend attendees, guest attendees, and `ticketUrl`.
- Every user manages their own archive and calendar. Eric alone has the `admin` role and suggestion access.
- A concert is a canonical catalog event that several users may independently reference; this never implies that they attended together. `bought`, guest attendees, and invitation status belong to each participant.
- Friends are mutual after acceptance. Selecting a friend on a concert sends an invitation; only accepted attendance appears in that person's archive.
- Artist, venue, and date fields suggest canonical catalog events and fill the remaining fields when selected. Adding the same normalized artist, venue, and date reuses the event without exposing unrelated users to one another.
- If attendees are empty, do not render the attendee section in concert details.
- Setlist lookup prefers stored ID, falls back to artist/date, then persists a discovered ID.

## Interaction rules

- Clicking a concert opens details.
- Right-click/long-press exposes Edit and Delete.
- Delete always needs confirmation and is not duplicated inside Edit.
- Browser/phone Back closes the active modal before navigating away.
- Artist and venue detail navigation must preserve meaningful Back behavior across archive, timeline, stats, and nested detail pages.
- Calendar colors are blue history, green bought future, orange unpurchased future.
- Keep phone layouts usable in portrait and landscape; do not overlap the top Menu button with sticky controls.

## Suggestion pipeline

- Scrapers: Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, and Montreux Jazz Festival.
- Match only billed artists that exist in `data/listened-artists.json`.
- Exclude an artist/date already present in `data/concerts.json`.
- Generate the listened catalog with `npm run import:spotify`; never commit raw Spotify exports.
- Prefer missing a structurally ambiguous festival over inventing an artist-to-day mapping.
- Respect robots.txt and keep requests polite.
- `scripts/combine-concert-suggestions.mjs` flattens/deduplicates results into `data/suggestions.json`.
- Suggestions stay below the calendar in the expandable review panel; never draw them as calendar events.
- Interested opens the normal prefilled calendar Add modal; Not Interested stages a persistent artist/date dismissal.
- Suggestion decisions remain in browser storage until Save writes all interested concerts and dismissals together to Supabase.
- Preserve `dismissedSuggestions` on every archive replacement. Discovery first backs Supabase up to `data/concerts.json`; the combiner excludes those keys from later scraper runs.
- `.github/workflows/concert-suggestions.yml` runs only on demand from the website or Actions UI, committing only changed suggestions.

## Verification

For application changes:

```bash
npm run build
git diff --check
```

Run `npm run test:quality` only when Eric explicitly requests the complete local quality suite. It combines functional Playwright checks, Axe accessibility rules, visual baselines in desktop/phone layouts, and Lighthouse thresholds. The suites use isolated fallback data and must never authenticate against or write to production Supabase. Individual commands are documented in `docs/DEVELOPMENT.md`. Do not add a test for every feature: extend functional coverage only for important, reusable, difficult-to-verify, or previously regressed behavior; extend visual baselines only for representative layouts.

For scraper changes, also run:

```bash
node --check scripts/import-spotify-history.mjs
node --check scripts/scrape-resurrection-route.mjs
node --check scripts/scrape-livenation-events.mjs
node --check scripts/scrape-madness-live.mjs
node --check scripts/combine-concert-suggestions.mjs
node --check scripts/scrape-razzmatazz.mjs
node --check scripts/scrape-parallel62.mjs
node --check scripts/scrape-palau-musica.mjs
node --check scripts/scrape-docks.mjs
node --check scripts/scrape-montreux-jazz-festival.mjs
node --check scripts/scrape-sala-apolo.mjs
node --check scripts/scrape-bikini-barcelona.mjs
```

Validate JSON files with `JSON.parse` before committing. Test high-risk calendar/modal changes on both desktop and phone-sized layouts when possible.

## Git hygiene

- Start with `git status --branch --short` and review relevant diffs.
- Do not discard, overwrite, or include unrelated local changes.
- Avoid `git add .`; stage explicit paths or hunks.
- Before committing, inspect `git diff --cached --check` and `git diff --cached --stat`.
- A workflow-file push requires the GitHub OAuth `workflow` scope.
