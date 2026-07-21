# A Deafening Noise — repository guidance

## Purpose and working style

This is Eric's private concert archive. Preserve the existing dark, compact visual language and mobile-first behavior. Inspect the dirty worktree before editing: unrelated local changes belong to the user. Commit and push only when explicitly requested, and stage only the intended files.

Read `README.md` for the quick start and `docs/DEVELOPMENT.md` for production configuration and operational commands.

## Architecture

- React/Vite single-page application; most UI and state live in `src/App.jsx`.
- `data/concerts.json` is the canonical concert dataset.
- `data/suggestions.json` is generated discovery output, never canonical concert data.
- `netlify/functions/save-concerts.js` writes production edits to GitHub.
- `netlify/functions/get-setlist.js` proxies setlist.fm in production.
- `vite.config.js` emulates those functions locally and writes concert edits directly to the working tree.
- Hash routes provide browser history for archive, calendar, timeline, stats, year review, artist, and venue views.

## Local versus production boundaries

- Local Vite development skips login through `import.meta.env.DEV`.
- Production must retain the login gate.
- Local function emulation must remain `apply: "serve"`; it must never become production runtime code.
- Never commit `.env.local`, passwords, GitHub tokens, or setlist.fm keys.
- Local UI edits to `data/concerts.json` are not automatically committed.

## Concert rules

- Past + `bought: true` is history.
- Future + `bought: true` is an upcoming bought concert.
- Future + `bought: false` is an unpurchased possibility.
- Archive additions are automatically bought; calendar additions expose the bought checkbox.
- Date format is `DD/MM/YYYY`; preserve existing date-range support.
- Optional fields: `setlistId` and `attendees`.
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

- Scrapers: Resurrection Fest Route, Live Nation Spain, and Madness Live.
- Match only billed artists that already exist in the archive.
- Exclude an artist/date already present in `data/concerts.json`.
- Prefer missing a structurally ambiguous festival over inventing an artist-to-day mapping.
- Respect robots.txt and keep requests polite.
- `scripts/combine-concert-suggestions.mjs` flattens/deduplicates results into `data/suggestions.json`.
- Suggestions stay below the calendar in the expandable review panel; never draw them as calendar events.
- Add opens the normal prefilled calendar Add modal. A successful save makes the suggestion disappear through concert-data filtering.
- `.github/workflows/concert-suggestions.yml` runs weekly and manually, committing only changed suggestions.

## Verification

For application changes:

```bash
npm run build
git diff --check
```

For scraper changes, also run:

```bash
node --check scripts/scrape-resurrection-route.mjs
node --check scripts/scrape-livenation-events.mjs
node --check scripts/scrape-madness-live.mjs
node --check scripts/combine-concert-suggestions.mjs
```

Validate JSON files with `JSON.parse` before committing. Test high-risk calendar/modal changes on both desktop and phone-sized layouts when possible.

## Git hygiene

- Start with `git status --branch --short` and review relevant diffs.
- Do not discard, overwrite, or include unrelated local changes.
- Avoid `git add .`; stage explicit paths or hunks.
- Before committing, inspect `git diff --cached --check` and `git diff --cached --stat`.
- A workflow-file push requires the GitHub OAuth `workflow` scope.
