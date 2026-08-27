# Development and operations guide

This guide contains the detailed setup, architecture, production, automation, and troubleshooting information for A Deafening Noise. The repository landing page remains intentionally concise.

## Automated contributor setup

Prerequisites are Git, Node.js/npm, and a browser. GitHub CLI is recommended for contributors who will push changes. The checked-in `.nvmrc` selects Node 24 when using `nvm`.

```bash
git clone https://github.com/ericmurillo93/A-Deafening-Noise.git
cd A-Deafening-Noise
nvm install
nvm use
npm run setup:auth
```

If `nvm` is not used, install Node.js 24 through the platform's normal package manager and confirm `node --version` before continuing.

`npm run setup:auth`:

- verifies the Node version and repository location;
- installs locked dependencies with `npm ci`;
- installs the Playwright Chromium build and, on Linux, its required system libraries;
- creates `.env.local` from `.env.example` without overwriting an existing file;
- authenticates GitHub CLI when it is installed and not already authenticated;
- downloads the official Codex CLI through `npx` and starts login only when required.

Authentication requires confirmation in the user's browser. To prepare only the application, skip GitHub and Codex authentication:

```bash
npm run setup
```

The Chromium installation is cached per operating-system user and can safely be run again. Linux system libraries are installed through the platform package manager and may cause `sudo` to request the computer password. They are persistent; no `/tmp` library workaround or `LD_LIBRARY_PATH` is required after setup.

## Environment variables

The setup script creates `.env.local` from `.env.example`. Local setlist lookup requires:

```text
SETLIST_API_KEY=your_real_setlist_fm_key
```

Authenticated development also requires the public Supabase configuration:

```text
VITE_SUPABASE_URL=https://your-development-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Spotify uses Authorization Code with PKCE. The browser never stores tokens in
local storage. Supabase Vault encrypts each connected user's refresh token so
the daily discovery workflow can update top artists without an open browser.
Spotify refresh tokens expire after six months; the Profile page then asks the
user to reconnect.

The publishable key is designed for browser use and is protected by Supabase Auth and RLS. Never put a Supabase secret or `service_role` key in a `VITE_` variable.

Use a dedicated non-production Supabase project in `.env.local`. The checked-in
example and CLI configuration deliberately contain no production project
reference. Netlify keeps its own production URL and publishable key, so changing
`.env.local` cannot redirect the deployed website.

The application otherwise works without this key; only setlist lookups are unavailable. `.env.local` and all `.env.*` files except `.env.example` are ignored by Git. Never commit real keys, passwords, or tokens.

## Run the website and Codex

Start the website:

```bash
npm run dev
```

Open <http://127.0.0.1:5173>.

Start Codex in another terminal at the repository root:

```bash
npm run codex
```

The project command uses `npx`, so a global Codex installation is unnecessary. Codex automatically reads the repository-level `AGENTS.md`, which holds durable architecture, product decisions, verification commands, and Git safety rules.

A useful first prompt is:

```text
Read AGENTS.md and README.md, inspect the current Git status, and summarize the project state before changing anything.
```

Official references: [Codex CLI](https://developers.openai.com/codex/cli) and [AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md).

## Local development behavior

Local development intentionally differs from production:

- With Supabase variables configured, local development uses the dedicated development/staging Supabase project.
- Add, edit, delete, attendee, ticket-status, and discovered setlist-ID changes write to Supabase.
- Local saves do not call GitHub and do not create commits automatically. Without Supabase configuration, the legacy Vite JSON fallback remains available for isolated development.
- Setlist requests are handled by development-only middleware in `vite.config.js`.
- The middleware is enabled only while Vite serves the app and is not included in the production runtime.

Profile avatars are uploaded directly from the Profile page to the public
`avatars` Supabase Storage bucket. Write policies restrict each authenticated
user to their own folder, accept JPG, PNG, or WebP files, and enforce a 2 MB
limit; the profile stores only the resulting public URL.

### Prepare the hosted development database

Create the non-production project and its Auth users before applying the schema.
Then authenticate the Supabase CLI, link this checkout to that project, and push
the checked-in migrations:

```bash
npx supabase login
npx supabase link --project-ref your_development_project_reference
npx supabase db push
```

The link is stored under the ignored `supabase/.temp/` directory and therefore
remains local to the checkout. Before every remote database command, verify the
linked target:

```bash
npx supabase status
```

Fresh development projects intentionally start without production concerts.
Create disposable test data through the website. Never put a service-role key or
database password in `.env.local`.

### Refresh staging from production

The staging database can be replaced with a snapshot of production application
data. Auth accounts and passwords remain independent; profiles are remapped by
email so UUID-based concert, attendee and friendship relationships stay valid.
Historical activity notifications are deliberately omitted.

Copy the ignored credential template and add a secret/server key from each
project (never a publishable key):

```bash
cp .env.staging-sync.example .env.staging-sync.local
npm run staging:sync
```

The command hard-codes production as a read-only source and the development
project as the only writable destination. It requires typing the staging project
reference before replacing data, verifies that every production user already
has a matching staging Auth user, and checks row counts after the copy. Never
commit `.env.staging-sync.local` or place these server-side keys in `VITE_`
variables.

Changes made through the local UI become ordinary Git working-tree changes:

```bash
git status --short
git diff -- data/concerts.json
```

## Resume development safely

At the beginning of a session:

```bash
git pull --ff-only
git status --short
npm run setup
npm run dev
```

After making changes:

```bash
npm run build
git diff --check
git status --short
git diff
```

Commit only intended files:

```bash
git add path/to/intended-file
git commit -m "Describe the change"
git push origin main
```

Avoid `git add .` in a dirty worktree unless every displayed file intentionally belongs in the same commit.

## Development commands

```bash
# Install dependencies and create .env.local safely
npm run setup

# Include GitHub and Codex authentication checks
npm run setup:auth

# Launch Codex without a global installation
npm run codex

# Authenticate Codex independently
npm run codex:login

# Import a local Spotify Extended Streaming History export
npm run import:spotify -- path/to/my_spotify_data.zip

# Refresh every connected Spotify profile (requires server-only credentials)
npm run spotify:sync

# Localhost-only development server (recommended)
npm run dev

# Test from another device on the same trusted network
npm run dev:network

# Production build
npm run build

# Functional behavior in desktop and phone layouts
npm run test:e2e

# Serious/critical Axe accessibility rules
npm run test:a11y

# Compare representative pages with checked-in visual baselines
npm run test:visual

# Deliberately accept intended visual changes
npm run test:visual:update

# Production-build performance, accessibility, best-practice and SEO thresholds
npm run test:lighthouse

# Run the complete professional baseline when requested
npm run test:quality

# Preview the production build
npm run preview
```

Only use `dev:network` on a trusted network. The legacy JSON fallback save endpoint is localhost-only and intentionally has no password gate.

The quality suites are intentionally local and manual: none run in GitHub Actions. Playwright and Axe start an isolated Vite server with Supabase disabled and use `data/concerts.json`; they never authenticate against or mutate production. Lighthouse creates an isolated production build with the same fallback boundary, audits archive and calendar, and fails below the checked-in category thresholds. Visual snapshots cover representative pages in desktop, phone portrait, and phone landscape and are stored in Git; use `test:visual:update` only after reviewing and intentionally accepting the new images.

Add functional tests selectively for high-risk interactions, reusable behavior, or bugs worth protecting against rather than for every feature. Axe provides broad standards-based coverage without feature-specific tests. Visual baselines should remain representative rather than exhaustive so ordinary concert-data changes do not create unnecessary snapshot churn.

## Production behavior

Netlify builds production with `npm run build` and publishes `dist`.

| Behavior | Local development | Netlify production |
| --- | --- | --- |
| Login gate | Supabase Auth | Supabase Auth |
| Concert writes | Supabase RPC | Supabase RPC |
| Setlist requests | Vite development middleware | Netlify function |
| Secrets | `.env.local` | Netlify environment variables |
| Git commits | Manual | Manual; discovery writes directly to Supabase |

The Netlify site requires:

```text
GITHUB_TOKEN
SETLIST_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SPOTIFY_CLIENT_ID
```

`GITHUB_TOKEN` needs **Contents: read and write** to update the JSON backup, plus **Actions: read and write** to start and monitor the suggestion workflow. The Supabase values are publishable browser configuration; authorization is enforced through user sessions and database policies. Keep GitHub and setlist.fm secrets in Netlify, never in the repository or browser code.

### Password recovery

In **Supabase → Authentication → Providers → Email**, keep public email sign-up enabled and require email confirmation. New accounts are created through the login screen and migration `20260825120000_public_user_signup.sql` automatically provisions a normal active profile; never create client-side profile rows or grant elevated roles from sign-up metadata. Add the production and local roots to **Authentication → URL Configuration → Redirect URLs** so confirmation links can return to the application.

In **Supabase → Authentication → Providers → Email**, enable **Secure password change**. In **Authentication → URL Configuration**, use `https://adeafeningnoise.com` as the Site URL. Allow `https://adeafeningnoise.com/**` and the local development roots (for example `http://localhost:5173/**`) as Redirect URLs.

Authenticated password changes use Supabase reauthentication: an email code is required before the new password is accepted. The login screen's **Forgot password?** action sends Supabase's recovery link back to `?password-recovery=1`; the app consumes the recovery session, asks for a new password, then signs out. The browser enforces a shared 60-second cooldown between authentication emails, including across reloads. Keep Supabase Auth responsible for these security flows; for production delivery, configure Resend as Supabase custom SMTP with a dedicated authentication sender instead of building a parallel password-email system or relying on Supabase's limited shared service.

Keep **Email OTP length** at **6** in both hosted projects and `otp_length = 6` in `supabase/config.toml`. Supabase's password-change reauthentication endpoint validates a six-digit nonce even though other email OTP flows support configurable lengths; using eight digits produces an email that cannot complete the password change.

Authentication email source files live in `supabase/templates/` and are generated from the shared brand template with `npm run emails:build`; `npm run emails:check` verifies that the checked-in HTML is current. Local Supabase reads these files through `supabase/config.toml`. Hosted Supabase projects do not deploy email templates with database migrations: copy each corresponding HTML file and subject into **Authentication → Email Templates**, enable the Password changed and Email changed security notifications, and configure Resend under **Authentication → Email → SMTP Settings**:

```text
Host: smtp.resend.com
Port: 465
Username: resend
Password: a dedicated Resend API key
Sender name: A Deafening Noise
Sender email: auth@adeafeningnoise.com
```

Use a dedicated authentication sender rather than `RESEND_FROM_EMAIL`, which remains the suggestion-digest sender. Configure staging first, test sign-up confirmation, password recovery, reauthentication and both security notifications, then repeat the same dashboard settings in production. Never store the SMTP password or Resend API key in the repository, Netlify browser variables, Supabase tables, or Notion.

The application uses clean History API routes such as `/home`, `/history`, `/calendar`, `/timeline`, `/stats`, `/year-review`, `/artist/:name`, and `/venue/:name`. Authenticated sessions open on the personal `/home` dashboard. Netlify's checked-in SPA fallback serves `index.html` for direct route requests. Legacy hash URLs are converted to their clean equivalent on first load.

The checked-in `netlify.toml` defines:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## Concert suggestion automation

The workflow `.github/workflows/concert-suggestions.yml` runs daily at 04:23 UTC and can also be started from GitHub's Actions UI. It first refreshes every active Spotify connection, rebuilds the privacy-reduced union artist catalog, and then refreshes Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, Montreux Jazz Festival, DICE, Doctor Music, and Ticketmaster listings. Resurrection Route and Live Nation query all available Spanish cities. Ticketmaster uses its official Discovery API for country-wide Spain and Switzerland coverage. DICE queries its supported Spanish and Swiss city locations; venue, festival, and promoter adapters necessarily cover only their own programmes. The non-round cron minute reduces the chance of GitHub scheduling delays.

Configure these GitHub Actions repository secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SPOTIFY_CLIENT_ID
RESEND_API_KEY
RESEND_FROM_EMAIL
TICKETMASTER_API_KEY
```

The service-role, Resend, and Ticketmaster keys are server-only and must never be placed in Netlify `VITE_` variables or repository files. `RESEND_FROM_EMAIL` must use a sender on the domain verified in Resend, for example `A Deafening Noise <concerts@adeafeningnoise.com>`. Without both Resend values, discovery still runs and email delivery is skipped. Without `TICKETMASTER_API_KEY`, the other discovery sources still run but Ticketmaster coverage is skipped until the secret is configured.

GitHub's Actions UI remains a fallback:

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Refresh concert suggestions**.
4. Select **Run workflow**.

To run the complete pipeline locally:

```bash
npm run suggestions:refresh
```

Scraped lineups are matched against the runtime `data/listened-artists.json`, which contains the deduplicated union of artists observed across connected accounts without identifying which user listens to whom. Eric's historical import ignores plays shorter than 30 seconds and requires at least one accumulated listening hour per artist; connected Spotify Top Artists remain eligible directly. Reseeding replaces the previous historical rows so artists below that threshold are removed. Run `node scripts/sync-spotify-accounts.mjs --seed-only` with the normal server-side Supabase variables to repair the historical seed without calling Spotify. Later top-artist refreshes accumulate instead of deleting older affinity. The workflow downloads the current catalog, combines and deduplicates scraper results, resolves exact Spotify artist artwork, sends new-match emails, and atomically publishes the catalog to Supabase. It creates no commit and no Netlify deployment. The checked-in JSON files remain local fallbacks only.

The workflow also records 90 days of operational telemetry in Supabase. The admin-only `/admin` view shows the latest run, source-level scraper status, event and suggestion counts, Spotify reconnections, canonical duplicates, and approximate provider usage. A failed scraper is shown as `preserved` when its previous suggestions were safely retained. The final telemetry step uses `if: always()` and never makes discovery fail if monitoring itself is temporarily unavailable.

For exact delivered, bounced and failed email counts, also configure `RESEND_API_KEY` as a server-only Netlify environment variable. The admin provider function reads Resend's retained sent-email metadata and never returns recipients or message contents to the browser. The existing server-only `GITHUB_TOKEN` supplies current workflow status and duration. Netlify does not expose credit consumption through its public API, so the panel deliberately directs the administrator to **Usage & billing** rather than estimating it from incomplete traffic data.

### Import Spotify listening history

Request the Extended Streaming History export from Spotify, keep the downloaded ZIP outside version control, and run:

```bash
npm run import:spotify -- path/to/my_spotify_data.zip
```

The importer writes `data/listened-artists.json`. It ignores plays shorter than 30 seconds and retains only artist-level aggregates: artist name, number of qualifying plays, total qualifying milliseconds, and first/last timestamps. Raw track names, IP addresses, devices, and other private export fields are not retained. The `.gitignore` protects the expected ZIP filename and a `spotify-data/` import directory; never commit the raw export under another name.

### Spotify account connection

Users connect Spotify from **Profile** using OAuth Authorization Code with PKCE and the single `user-top-read` scope. Configure these exact redirect URIs in the Spotify Developer Dashboard:

```text
https://adeafeningnoise.com/spotify/callback
http://127.0.0.1:5173/spotify/callback
```

Set `VITE_SPOTIFY_CLIENT_ID` locally and in Netlify. The Client ID is public configuration; no Spotify Client Secret is used. The browser fetches up to 50 top artists for short-, medium-, and long-term affinity, sends artist IDs, names, Spotify-hosted image URLs, matching ranges, and the refresh token to an authenticated Supabase RPC, then discards the access token. Artists attached to future concerts but absent from Top Artists are looked up by exact normalized name and stored in a separate per-user artwork catalog, so artwork never expands suggestion affinity. The same image metadata is refreshed by the daily workflow and supplies dashboard, future-concert, and suggestion artwork, with the bundled stage image as fallback. Supabase Vault stores the refresh token encrypted and exposes it only to the service-role workflow. Tracks and raw listening history are never stored. Development Mode users must still be added once to Spotify's allowlist; Spotify does not provide an API for bypassing that platform restriction.

Users control web and email delivery separately for social activity, concert changes, ticket changes, suggestions, and Spotify connection warnings. The daily workflow compares the previous Supabase catalog with the refreshed runtime snapshot, applies each recipient's Spotify artists, archive, and dismissals, and sends only genuinely new matches through Resend. Every recipient receives at most one responsive suggestion digest per day containing all of that day's matches; a per-user/day Resend idempotency key prevents retries or manual reruns from duplicating delivery. Other activity is queued in `notification_email_outbox`, delivered by the same daily workflow with per-notification idempotency, and rechecks the current preference and account status immediately before sending. The email links to the relevant page and exposes Profile preferences.

Select **Interested** to open the normal Add Concert modal with artist, venue, and date prefilled, or **Not interested** to record a dismissal. Each choice is written to Supabase immediately and the suggestion remains visible with its current state. Interested suggestions are ordinary upcoming concerts and therefore appear in the calendar. Changing one to Not Interested requires confirmation and removes only that user's calendar entry. The shared Supabase catalog is never filtered by one user's archive or dismissals.

Run the complete pipeline locally:

```bash
node scripts/scrape-resurrection-route.mjs --output=/tmp/resurrection.json
node scripts/scrape-livenation-events.mjs --output=/tmp/livenation.json
node scripts/scrape-madness-live.mjs --output=/tmp/madness-live.json
node scripts/scrape-doctor-music.mjs --output=/tmp/doctor-music.json
TICKETMASTER_API_KEY=... node scripts/scrape-ticketmaster.mjs --output=/tmp/ticketmaster.json
node scripts/combine-concert-suggestions.mjs \
  /tmp/resurrection.json \
  /tmp/livenation.json \
  /tmp/madness-live.json \
  /tmp/doctor-music.json \
  /tmp/ticketmaster.json \
  --output=/tmp/suggestions.json
```

Review `/tmp/suggestions.json` before publishing it with `node scripts/publish-concert-suggestions.mjs /tmp/suggestions.json` using server-side Supabase credentials.

If GitHub rejects a push that creates or modifies `.github/workflows/*`, authorize the required scope once:

```bash
gh auth refresh -h github.com -s workflow
gh auth setup-git
```

## Data model

Supabase is the production source of truth. The normalized model uses `profiles`, canonical `concerts`, per-user `concert_participants`, mutual `friendships`, durable `notifications`, per-user `user_dismissed_suggestions`, the atomic `concert_suggestion_catalog`, and encrypted Spotify connections. Each authenticated user manages their own archive, calendar, Spotify taste profile, and suggestions; Eric's `admin` role additionally grants user administration. Profiles include a display name, optional avatar URL and location, discoverability, email-notification and theme preferences, role, and account status. The theme is also cached locally so it can be applied before React renders. `data/concerts.json` remains Eric's compatible local fallback and GitHub backup:

```json
{
  "artist": "Artist name",
  "venue": "Venue or festival",
  "date": "DD/MM/YYYY",
  "bought": true,
  "setlistId": "optional-setlist-fm-id",
  "attendees": ["Optional name"]
}
```

Classification rules:

- `bought: true` and a past date → concert history.
- `bought: true` and a future date → upcoming bought concert.
- `bought: false` and a future date → possible/unpurchased concert.
- Add Concert is a global action at the top of the main menu, independent of the current page.
- A past date automatically sets `bought: true` and hides ticket status and ticket link.
- Today's date or a future date exposes ticket-bought status and the optional ticket link.

Concert identity is canonical: artist, venue, and date inputs search the complete event catalog and selecting a suggestion fills the other fields. The unique normalized artist/venue/date key and a transaction-scoped lock make concurrent additions reuse one event. A canonical event can also store typed start/end dates, doors/start times, address and coordinates, promoter, festival, tour, lineup, status, source observations, and metadata freshness. Source observations live in `concert_sources`; billed artists live in `concert_artists`. Ambiguous scraper data remains empty rather than inferred. Reusing an event never means its users attended together and never exposes unrelated attendees. Ticket state and guest attendees remain personal.

Selecting an accepted friend sends an invitation with invited, interested, confirmed, or declined states. Only confirmed attendance enters the friend's archive. Users can leave a shared concert without changing the creator's copy. Sharing full-archive comparison statistics is a separate, revocable consent in `stats_shares`; friendship alone is never sufficient.

Profile supports transactional JSON, CSV and ICS imports plus a bounded setlist.fm attended-history import. Every import is previewed and validated before one `import_my_concerts` RPC; it never loops partial browser writes or silently rewrites another creator's canonical fields. JSON remains the full personal-data export, while the calendar keeps its ICS exports. The setlist.fm API is free only for non-commercial use, so revisit its terms before commercialising the product.

The activity view records friend requests and responses, concert invitations and responses, concert changes, ticket availability/link changes, and Spotify reconnection warnings. A `selling_fast` notification is supported only when a source explicitly publishes that state; the system never guesses scarcity. Admins can change roles and access `admin_data_quality()` for canonical duplicates, label variants, missing location/creator/setlist/artwork, suspicious dates, and links awaiting validation. Blocked accounts are rejected by both application bootstrap and database mutation guards.

Global search runs over the already-authorised session snapshot and groups artists, venues, concerts, cities, friends, and years. It creates no public catalog endpoint and therefore preserves the same visibility boundary as the current page.

The browser has no direct table access: authenticated operations use an explicit
RPC allowlist, every exposed RPC checks the active account where applicable,
and obsolete archive-replacement functions are revoked. Default privileges also
keep future tables, sequences, and functions private until a migration grants
the minimum required access. Apply and lint security migrations in staging
before production with `npx supabase db push` and
`npx supabase db lint --linked --level warning`.

### Client cache and synchronization

Authenticated application data is cached per user in IndexedDB. On repeat visits the cached archive renders first and `get_app_data()` revalidates it silently; returning to a visible tab refreshes data at most once every 30 seconds. Transient refresh failures remain silent while cached data is usable. The interface reports offline state only when the browser confirms that connectivity is unavailable, and exposes a retry action only after three consecutive online refresh failures. Successful mutations refresh both Supabase state and the local cache. Logout clears every cached user snapshot so data is not exposed to the next person using a shared browser. Cache records carry an explicit schema version in `src/lib/app-cache.js`; increment it whenever an incompatible response shape is deployed.

The geographic map is a lazy-loaded chunk and must remain outside the initial archive/calendar bundle. New page-specific heavy dependencies should follow the same pattern.

Artist and venue labels are canonical uppercase values. The UI uppercases them while typing and the database trigger enforces the same rule for every writer.

Setlist lookup first uses a stored `setlistId`. If no ID exists, the proxy searches by artist and date; when an ID is discovered, the application persists it for later lookups.

## Navigation and interaction conventions

- Browser back/forward participates in page navigation through clean History API routes.
- Browser back closes an open modal before leaving the current page.
- A normal concert click opens its details.
- Right-click or long-press opens Edit/Delete actions.
- Delete requires confirmation.
- Edit modals do not duplicate Delete.
- Calendar colors are blue for history, green for bought future concerts, and orange for unpurchased future concerts.

## Project structure

`App.jsx` is the authenticated application shell: it owns session bootstrap,
cached server state, navigation and cross-page modal orchestration. Route-level
screens live in `src/pages` and are loaded with `React.lazy` when they are first
visited; keep page-specific dependencies there so they do not return to the
initial bundle. Reusable presentation belongs in `src/components`, browser
behavior in `src/hooks`, and data or domain helpers in `src/lib`. Prefer moving
a coherent page or shared concern over splitting small components solely to
reduce file length.

```text
.
├── AGENTS.md                         Durable guidance for coding agents
├── docs/DEVELOPMENT.md               Detailed contributor and operations guide
├── data/
│   ├── concerts.json                 Canonical concert dataset
│   ├── listened-artists.json          Local privacy-reduced artist fallback
│   └── suggestions.json              Local suggestion fallback
├── netlify/functions/
│   ├── get-setlist.js                Production setlist.fm proxy
│   └── save-concerts.js              Production GitHub write proxy
├── scripts/
│   ├── combine-concert-suggestions.mjs
│   ├── scrape-livenation-events.mjs
│   ├── scrape-madness-live.mjs
│   ├── scrape-doctor-music.mjs
│   ├── scrape-resurrection-route.mjs
│   ├── scrape-ticketmaster.mjs
│   └── setup-local.mjs
├── src/
│   ├── App.jsx                       Application shell and orchestration
│   ├── components/                   Shared presentation components
│   ├── hooks/                        Shared browser and interaction hooks
│   ├── index.css
│   ├── lib/                          Data access and domain helpers
│   ├── main.jsx
│   └── pages/                        Lazy-loaded route-level screens
├── vite.config.js                    Vite plus local-only function emulation
├── netlify.toml
└── package.json
```

## Troubleshooting

### Local setlists report a missing key

Add `SETLIST_API_KEY` to `.env.local` and restart `npm run dev`.

### Local UI changes are not saved

Open the site through `npm run dev`, not by opening `index.html` directly or using `npm run preview`.

### A phone cannot reach the local site

Run `npm run dev:network`, use the computer's LAN IP and port 5173, and check the firewall. Return to `npm run dev` afterward.

### Production concert writes fail

Check Netlify function logs and verify `GITHUB_TOKEN`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.

### A scraper stops matching events

The external site probably changed its markup or endpoint. Run the relevant scraper directly, inspect its diagnostics, and update only that adapter. Preserve robots.txt compliance and polite request behavior.
