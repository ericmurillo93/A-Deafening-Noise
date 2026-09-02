# A Deafening Noise — repository guidance

## Purpose and working style

This is Eric's private concert archive. Preserve the existing dark, compact visual language and mobile-first behavior. Inspect the dirty worktree before editing: unrelated local changes belong to the user. Commit and push only when explicitly requested, and stage only the intended files.

Read `README.md` for the quick start and `docs/DEVELOPMENT.md` for production configuration and operational commands.

Keep the project's existing **A Deafening Noise** Notion page current when a change introduces a durable product decision, architecture or data-model change, setup or deployment requirement, operational workflow, security boundary, or other information future contributors need. Do not document routine fixes, transient investigation, or implementation detail already clear from the repository. Preserve existing Notion content, never copy secrets there, and treat the checked-in repository documentation as the technical source of truth.

## Architecture

- React/Vite single-page application; most UI and state live in `src/App.jsx`.
- Supabase is the production source of truth for profiles, concerts, participants, friendships, notifications, and dismissed suggestions.
- `data/concerts.json` is the local fallback and GitHub backup dataset.
- `data/listened-artists.json` and `data/suggestions.json` are local workflow inputs/fallback snapshots; Supabase is canonical in production.
- Supabase Auth and security-definer RPCs provide per-user visibility and writes. Eric is the admin; only administration remains admin-only.
- `netlify/functions/save-concerts.js` is retained as a protected legacy/backup writer.
- `netlify/functions/get-setlist.js` proxies setlist.fm in production.
- `vite.config.js` emulates those functions locally and writes concert edits directly to the working tree.
- Clean History API routes provide direct URLs and browser history for archive, calendar, timeline, stats, year review, artist, venue, friends, friend profiles, activity, profile, and admin views; Netlify's SPA fallback serves direct requests.

## Local versus production boundaries

- Supabase-enabled local and production builds use the same authenticated login.
- Production must retain Supabase Auth and must never restore a shared client-side password gate.
- Local function emulation must remain `apply: "serve"`; it must never become production runtime code.
- Never commit `.env.local`, passwords, GitHub tokens, Supabase secret/service-role keys, or setlist.fm keys.
- Supabase-enabled local UI edits write to Supabase and do not update or commit the JSON fallback automatically.
- Repeat visits render a per-user IndexedDB snapshot and revalidate silently. Preserve cache isolation, schema versioning, background refresh, and complete cache removal on logout.
- Keep page-specific heavy features lazy-loaded; the geographic map must not return to the initial application bundle.

## Concert rules

- Past + `bought: true` is history.
- Future + `bought: true` is an upcoming bought concert.
- Future + `bought: false` is an unpurchased possibility.
- Add Concert is a single global action in the main menu. Past dates are automatically bought and hide ticket fields; today/future dates expose bought status and ticket link.
- Date format is `DD/MM/YYYY`; preserve existing date-range support.
- Artist and venue labels are stored and displayed in uppercase; normalize them on every write regardless of user input.
- Optional fields: `setlistId`, friend attendees, guest attendees, and `ticketUrl`.
- Every user manages their own archive, calendar, optional Spotify taste profile, discovery countries, and suggestion decisions. Eric alone has the `admin` role and administration access.
- A concert is a canonical catalog event that several users may independently reference; this never implies that they attended together. `bought`, guest attendees, and invitation status belong to each participant.
- Canonical events may include typed start/end dates, doors/start times, address/coordinates, promoter, festival/tour, lineup, status, source observations, and metadata freshness. Preserve `concert_artists` and `concert_sources`; never invent ambiguous scraper metadata.
- Friends are mutual after acceptance. Selecting a friend on a concert sends an invitation; only accepted attendance appears in that person's archive.
- Accepted friends can open each other's `/people/:username` profiles. Profile owners independently control visibility of statistics, latest concert, next concert, and bucket list; enforce this boundary in security-definer RPCs, never only in React.
- Bucket-list artists are private by default and may be shared through the profile setting. “Seen live” is derived from a confirmed, bought past concert and is never a manually editable claim.
- Invitation states are invited (`pending` internally), interested, confirmed, and declined. Full-archive comparison requires separate, revocable `stats_shares` consent; friendship alone is insufficient.
- A non-creator can leave a shared concert without deleting it for its creator. Concert details identify the creator and confirmed friends.
- Profile/account controls include editable public metadata, password recovery, personal-data export, and confirmed account deletion. Eric's admin panel manages roles and blocked access.
- Artist autocomplete uses the authenticated, identity-free union of billed and listened artist names and remains stable for every typed prefix from the first character. City, venue, and date suggestions come from canonical or external concert results and fill related fields when selected. Adding the same normalized artist, venue, and date reuses the event without exposing unrelated users to one another.
- Add Concert searches the local canonical catalog first, then authenticated server-side providers on demand: setlist.fm for historical events and Ticketmaster for future events. Never expose provider keys or bulk-copy provider catalogs; persist only a result the user selects and saves, together with its source identifier and attribution URL.
- If attendees are empty, do not render the attendee section in concert details.
- Setlist lookup prefers stored ID, falls back to artist/date, then persists a discovered ID.
- JSON/CSV/ICS and bounded setlist.fm imports must be previewed and written through the single transactional import RPC, never a browser loop of partial saves.

## Interaction rules

- Treat recurring visual and interaction patterns as shared product contracts. Before changing one, find every occurrence and update the shared component or style so equivalent controls keep the same labels, icons, states, accessibility, motion, and responsive behavior across all pages.
- Clicking a concert opens details.
- Right-click/long-press exposes Edit and Delete.
- Delete always needs confirmation and is not duplicated inside Edit.
- Browser/phone Back closes the active modal before navigating away.
- Global search groups only the already-authorised session snapshot; preserve its artist, venue, concert, city, friend, and year navigation and Cmd/Ctrl+K access.
- Artist and venue detail navigation must preserve meaningful Back behavior across archive, timeline, stats, and nested detail pages.
- Calendar colors are blue history, green bought future, orange unpurchased future.
- Keep phone layouts usable in portrait and landscape; do not overlap the top Menu button with sticky controls.

## Suggestion pipeline

- Scrapers: Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, Montreux Jazz Festival, DICE, Doctor Music, and the official Ticketmaster Discovery API.
- Ticketmaster queries the union of active users' selected discovery countries; each profile can select up to five ISO country codes. Venue, festival, and promoter sources cover only their own published programmes. Ticketmaster web pages must never be scraped; use `TICKETMASTER_API_KEY` with the official API.
- Match only billed artists in the user's affinity: confirmed archive artists, bucket-list artists, and optional Spotify/listening-history artists. Historical imports ignore plays shorter than 30 seconds and require at least one accumulated listening hour per artist; connected Spotify Top Artists remain eligible directly.
- Exclude an artist/date already present in `data/concerts.json`.
- Generate the listened catalog with `npm run import:spotify`; never commit raw Spotify exports.
- Prefer missing a structurally ambiguous festival over inventing an artist-to-day mapping.
- Respect robots.txt and keep requests polite.
- `scripts/combine-concert-suggestions.mjs` flattens/deduplicates results into `data/suggestions.json`.
- Suggestions stay below the calendar in the expandable review panel; never draw them as calendar events.
- Interested opens the normal prefilled calendar Add modal; Not Interested persists an artist/date dismissal immediately.
- Home shows only untreated suggestions. Interested adds the concert immediately as not bought and removes it from Home; Not Interested also removes it from Home. The Suggestions page keeps treated entries under the collapsed Past suggestions section, where decisions can still be changed.
- Supabase stores suggestion decisions immediately. Preserve `dismissedSuggestions` on every archive replacement; the shared discovery catalog must not be filtered by one user's concerts or dismissals.
- `.github/workflows/concert-suggestions.yml` runs daily or on demand, refreshes connected Spotify profiles, resolves suggestion artwork, publishes the catalog to Supabase, and emails opted-in users. It must not commit generated data or trigger a Netlify deploy.

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
node --check scripts/scrape-dice.mjs
node --check scripts/scrape-doctor-music.mjs
node --check scripts/scrape-ticketmaster.mjs
```

Validate JSON files with `JSON.parse` before committing. Test high-risk calendar/modal changes on both desktop and phone-sized layouts when possible.

## Git hygiene

- Start with `git status --branch --short` and review relevant diffs.
- Do not discard, overwrite, or include unrelated local changes.
- Avoid `git add .`; stage explicit paths or hunks.
- Before committing, inspect `git diff --cached --check` and `git diff --cached --stat`.
- A workflow-file push requires the GitHub OAuth `workflow` scope.
