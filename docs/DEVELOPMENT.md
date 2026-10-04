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
- installs the Playwright Chromium, Firefox and WebKit builds and, on Linux, its required system libraries;
- creates `.env.local` from `.env.example` without overwriting an existing file;
- authenticates GitHub CLI when it is installed and not already authenticated;
- downloads the official Codex CLI through `npx` and starts login only when required.

Authentication requires confirmation in the user's browser. To prepare only the application, skip GitHub and Codex authentication:

```bash
npm run setup
```

The browser installation is cached per operating-system user and can safely be run again. Linux system libraries are installed through the platform package manager and may cause `sudo` to request the computer password. They are persistent; no `/tmp` library workaround or `LD_LIBRARY_PATH` is required after setup.

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

`VITE_SENTRY_DSN` is optional. When configured in a hosted build, unexpected
client errors are sent to Sentry without cookies or profile details. Leave it
empty locally and in environments where error reporting is not required.

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

Archive synchronization is owned by `useArchiveSync`. The essential snapshot
(profile, attendance, friends, activity and decisions) renders before optional
discovery finishes. Background refresh runs only on a visible page, at most
every five minutes; discovery refreshes every fifteen minutes. Explicit writes
and Retry refresh immediately. Snapshots are keyed by Supabase URL and user ID,
versioned, expire after seven days, and are cleared on logout. Superseded requests
are aborted and cannot apply data after an account switch. A discovery outage
does not block the archive or discard its last successful suggestions.

Local development intentionally differs from production:

- With Supabase variables configured, local development uses the dedicated development/staging Supabase project.
- Add, edit, delete, attendee, ticket-status, and discovered setlist-ID changes write to Supabase.
- Local saves do not call GitHub and do not create commits automatically. Without Supabase configuration, Vite uses synthetic demo fixtures and saves only to ignored `data/demo-concerts.json`.
- Setlist requests are handled by development-only middleware in `vite.config.js`.
- The middleware is enabled only while Vite serves the app and is not included in the production runtime.

Profile avatars are uploaded directly from the Profile page to the public
`avatars` Supabase Storage bucket. Write policies restrict each authenticated
user to their own folder, accept JPG, PNG, or WebP files, and enforce a 2 MB
limit; the profile stores only the resulting public URL.

### Prepare the hosted development database

Create the non-production project and apply the schema before registering test Auth users.
Then authenticate the Supabase CLI, link this checkout to that project, and push
the checked-in migrations:

```bash
npx supabase login
npx supabase link --project-ref your_development_project_reference
npx supabase db push
```

Profile preferences, including appearance, language, notifications and
discovery countries, live in Supabase so they follow the account across
devices. English is the fallback language for new accounts.

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

Authenticate the Supabase CLI (`npx supabase login`) or provide a server-only
`SUPABASE_ACCESS_TOKEN`. The command uses the Management API and no longer needs
the legacy `.env.staging-sync.local` service keys:

```bash
npm run staging:sync -- --rehearse
npm run staging:sync
```

The command hard-codes production as a read-only source and the development
project as the only writable destination. It requires typing the staging project
reference before replacing data, verifies every production user has a matching
staging Auth user, creates a mode-0600 pre-change snapshot outside the checkout in `~/adn-backups`,
and checks row counts inside one transaction. A rehearsal executes the same SQL
but rolls back. Application triggers are temporarily disabled, foreign keys are
not. Auth passwords, Spotify connections/Vault tokens, Storage binaries,
historical notifications and delivery receipts are intentionally not cloned.
Metadata, locations, lineup, sources, preferences, consents, bucket lists,
listening affinity, per-user dismissals and artwork are copied.
Never use this operation as an Auth/Storage backup. Never put Management API
tokens in a `VITE_` variable.

### Security and recovery checks

#### Personal archive for private storage

Use Profile → Export personal data, or ask Codex to run:

```bash
npm run archive:export -- --project=staging --user=your-username
# After the versioned-export migration is deployed:
npm run archive:export -- --project=production --user=your-username
```

The CLI uses a private Supabase Management token, an explicitly read-only SQL
transaction and the selected user's export RPC. It creates `archive.json` and
`manifest.json` under `~/adn-backups`, with restrictive permissions. `BACKUP_DIR`
may choose another location outside this checkout; symlinks into the repository
are rejected. Transfer the whole folder to a private Drive folder yourself, or
explicitly authorize an upload. No scheduled backup, commit or cloud upload is
performed. Verify the JSON checksum against the manifest before a restore.

This is a personal portable export, not a complete platform backup: concert
imports do not recreate account credentials, friendships, consent, Spotify
tokens or avatar files. The database dump below covers a different scope and
still does not replace provider-level Auth/Vault/Storage recovery.

The migration audit verifies that every checked-in public table enables row
level security and that security-definer functions pin an empty search path:

```bash
npm run audit:security
```

Create a verified schema-and-data backup before a migration or bulk repair. Use
a percent-encoded direct Postgres connection string and keep the output outside
version control:

```bash
SUPABASE_DB_URL='postgresql://...' npm run db:backup
```

The command writes `schema.sql`, `data.sql` and a SHA-256 manifest below
`~/adn-backups/` (or `BACKUP_DIR` outside the repository), with private file permissions. Rehearse recovery only in an empty disposable project: apply the
schema, then the data, and verify row counts and login flows. Supabase Auth
identities and Vault secrets require the provider's project recovery process
and are not part of this application-data dump.

The privacy and terms drafts are served at `/privacy.html` and `/terms.html`.
They describe the implemented data flows, but require legal review before the
service is opened beyond the private test group.

Personal JSON exports use `schemaVersion: 2`. `concerts` contains confirmed,
visible personal attendance with locations, ticket/setlist links, guests and
event metadata. Other attendance states, preferences, bucket list and consent
are exported separately for portability, but concert import does not recreate
friendships, invitations or consents. These require the other person's approval.
ICS exported here contains `X-ADN-CITY` / `X-ADN-COUNTRY` for lossless location
roundtrips; third-party ICS without structured location remains editable in the
preview rather than guessing a city or country.

Real local UI changes go to the staging database, never Git. Without Supabase, demo edits go to ignored `data/demo-concerts.json`.

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

The quality suites are intentionally local and manual: none run in GitHub Actions. Playwright and Axe start an isolated Vite server with Supabase disabled and use synthetic `tests/fixtures/archive.mjs` data; they never authenticate against or mutate production. They refuse to reuse an existing development server. Local function calls are disabled in quality mode unless a test explicitly mocks them. Lighthouse creates an isolated production build with the same fallback boundary, audits archive and calendar, and fails below the checked-in category thresholds. Visual snapshots cover representative pages in desktop, phone portrait, and phone landscape, including Home in both themes, and are stored in Git; use `test:visual:update` only after reviewing and intentionally accepting the new images. After Lighthouse, run a normal `npm run build` before inspecting or deploying `dist`.

Additional manually invoked checks:

```bash
npx playwright install --with-deps webkit # Linux libraries require sudo
npm run test:webkit                      # WebKit, not a physical Safari device
npm run test:firefox                     # Gecko engine
npm run test:unit
npm run audit:security
npm run test:db:staging                  # Supabase management token required
```

The staging database test uses disposable identities inside a rolled-back
transaction and cannot accept a production target. It checks cross-user
visibility, admin access, consent revocation, invitation acceptance and leaving,
export/import rollback, API quotas and durable digest leases/retries. It sends
no email. It is separate from the browser suite and is never automatic.
Static `audit:security` complements these checks; it is not proof of every RLS
policy or every runtime permission.

Add functional tests selectively for high-risk interactions, reusable behavior, or bugs worth protecting against rather than for every feature. Axe provides broad standards-based coverage without feature-specific tests. Visual baselines should remain representative rather than exhaustive so ordinary concert-data changes do not create unnecessary snapshot churn.

## Production behavior

Hosted builds never include the private JSON fallback. After `npm run build`,
run `node scripts/check-production-bundle.mjs`. Local quality builds must
explicitly use `VITE_QUALITY_AUDIT=true` and must never be deployed.
The Netlify CSP permits only same-origin scripts; the pre-render theme script
is served as `/theme-init.js`. Provider proxies use shared database quotas
(per authenticated user and action: 60 setlist / 30 catalog requests per minute,
300 daily) rather than per-instance token counters. Apply the provider-quota
migration before deploying these functions. No new server secret is required.

Keep hosted Auth's minimum password length at least 8, matching the client and
local configuration. Before broad public promotion, configure a CAPTCHA provider
and its public widget/secret together; do not enable CAPTCHA server-side without
the matching UI, or registration will stop working. Provider account setup and
production settings require explicit release approval.

The 28 September staging hardening pass verified email confirmation enabled and
set the staging Auth password minimum to 8 through the
[Supabase Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
No SMTP credentials or production Auth settings were changed. CAPTCHA is deferred by Eric. Revisit coordinated provider/widget/CSP setup
before unrestricted public registration.

Removing fallback data from the hosted bundle does **not** remove personal JSON
already committed to a public Git repository or its history. Eric explicitly chose to retain old Git history. Personal seed payloads and
real JSON are removed from the current tree, but old commits remain public.
Do not rewrite that history or replay edited historical migrations.

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
TICKETMASTER_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SPOTIFY_CLIENT_ID
RESEND_API_KEY                  # optional: admin email-delivery metrics
VITE_SENTRY_DSN                 # optional: browser error reporting
```

`GITHUB_TOKEN` no longer needs Contents write access for data backups. It needs **Actions: read and write** to start and monitor the suggestion workflow. `SETLIST_API_KEY` and `TICKETMASTER_API_KEY` power the authenticated on-demand concert search; `RESEND_API_KEY` lets the admin panel read delivery totals but is not required for email sending, which runs in GitHub Actions. The Supabase values are publishable browser configuration; authorization is enforced through user sessions and database policies. Keep GitHub, setlist.fm, Ticketmaster and Resend secrets in Netlify, never in the repository or browser code.

### Credential ownership

Store values only in the provider named below. Identical variable names in different providers are separate credentials and should use the minimum access required for that workload.

| Provider | Name or setting | Purpose | Secret? |
| --- | --- | --- | --- |
| Netlify | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SPOTIFY_CLIENT_ID` | Public browser configuration injected at build time | No |
| Netlify | `SETLIST_API_KEY`, `TICKETMASTER_API_KEY` | Server-side concert and setlist searches | Yes |
| Netlify | `GITHUB_TOKEN` | Admin workflow status and dispatch (no archive writes) | Yes |
| Netlify | `RESEND_API_KEY` | Admin delivery/bounce metrics; use a dedicated Full-access Resend key | Yes |
| Netlify | `VITE_SENTRY_DSN` | Optional browser error reporting | No |
| GitHub Actions | `SUPABASE_URL`, `SPOTIFY_CLIENT_ID`, `RESEND_FROM_EMAIL` | Workflow configuration and verified digest sender | No, although repository Secrets may still hold them |
| GitHub Actions | `SUPABASE_SERVICE_ROLE_KEY`, `TICKETMASTER_API_KEY` | Daily catalog refresh and publication | Yes |
| GitHub Actions | `RESEND_API_KEY` | Daily suggestion digest; use a dedicated Sending-access Resend key | Yes |
| Supabase Auth | Custom SMTP password | Authentication and security emails; use a third dedicated Sending-access Resend key | Yes |

The intended Resend isolation is therefore: **GitHub Actions** sends suggestion digests, **Netlify** reads delivery telemetry for the admin panel, and **Supabase Auth** sends account emails through SMTP. Rotating one key must not require changing either of the other two. `RESEND_FROM_EMAIL` is a verified sender identity, not an API key. The built-in workflow `GITHUB_TOKEN` is created automatically by GitHub and is unrelated to the custom Netlify `GITHUB_TOKEN`.

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

The application uses clean History API routes such as `/home`, `/history`, `/calendar`, `/timeline`, `/stats`, `/year-review/:year`, `/concert/:id`, `/artist/:name`, `/venue/:name`, `/city/:country/:name`, and `/country/:code`. Authenticated sessions open on the personal `/home` dashboard. Netlify's checked-in SPA fallback serves `index.html` for direct route requests. Legacy hash URLs are converted to their clean equivalent on first load.

The checked-in `netlify.toml` defines:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## Concert suggestion automation

The workflow `.github/workflows/concert-suggestions.yml` runs daily at 04:23 UTC and can also be started from GitHub's Actions UI. It first refreshes every active Spotify connection, rebuilds the privacy-reduced union artist catalog, and then refreshes Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, Montreux Jazz Festival, DICE, Doctor Music, and Ticketmaster listings. Ticketmaster uses its official Discovery API for the union of countries selected by active profiles; each profile can choose up to five ISO country codes under **Profile → Concert discovery**. The other adapters retain the geographic reach of their own source. The non-round cron minute reduces the chance of GitHub scheduling delays.

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

Scraped lineups are matched against the runtime `data/listened-artists.json`, which contains the deduplicated union of artists observed across connected accounts without identifying which user listens to whom. Eric's historical import ignores plays shorter than 30 seconds and requires at least one accumulated listening hour per artist; connected Spotify Top Artists remain eligible directly. Daily sync never reseeds historical rows from local files; `--seed-only` is retired. Existing historical affinity stays in Supabase. Future ZIP imports are explicit private operations for the selected user. Later top-artist refreshes accumulate instead of deleting older affinity. The workflow downloads and preserves the current catalog, combines and deduplicates scraper results, resolves exact Spotify artist artwork, atomically publishes the refreshed catalog to Supabase, and only then emails new matches. It creates no commit and no Netlify deployment. Runtime JSON files are ignored and reconstructed from Supabase; no real data is checked in.

The workflow also records 90 days of operational telemetry in Supabase. The admin-only `/admin` view shows the latest run, source-level scraper status, event and suggestion counts, Spotify reconnections, canonical duplicates, and approximate provider usage. A failed scraper is shown as `preserved` when its previous suggestions were safely retained. The final telemetry step uses `if: always()` and never makes discovery fail if monitoring itself is temporarily unavailable.

Madness Live occasionally returns an empty HTTP 200 response to Node clients. Shared scraper fetching retries misleading empty responses and falls back to `curl` for that host; the Madness adapter can also recover recent announcement URLs from the site's public sitemap when its homepage is empty. A genuinely empty source still fails the adapter so the workflow preserves its previous suggestions instead of publishing a false empty result.

For exact delivered, bounced and failed email counts, also configure `RESEND_API_KEY` as a server-only Netlify environment variable. The admin provider function reads Resend's retained sent-email metadata and never returns recipients or message contents to the browser. The existing server-only `GITHUB_TOKEN` supplies current workflow status and duration. Netlify does not expose credit consumption through its public API, so the panel deliberately directs the administrator to **Usage & billing** rather than estimating it from incomplete traffic data.

### Import Spotify listening history

Request the Extended Streaming History export from Spotify, keep the downloaded ZIP outside version control, and run:

```bash
npm run import:spotify -- path/to/my_spotify_data.zip
```

The importer writes `data/listened-artists.json`. It ignores plays shorter than 30 seconds and retains only artist-level aggregates: artist name, number of qualifying plays, total qualifying milliseconds, and first/last timestamps. Raw track names, IP addresses, devices, and other private export fields are not retained. The `.gitignore` protects the expected ZIP filename and a `spotify-data/` import directory; never commit the raw export under another name.

### Spotify account connection

Spotify is optional. Suggestion affinity also comes from each user's confirmed archive and bucket list, so accounts without Spotify still receive relevant discovery. Users who want current listening taste can connect Spotify from **Profile** using OAuth Authorization Code with PKCE and the single `user-top-read` scope. Configure these exact redirect URIs in the Spotify Developer Dashboard:

```text
https://adeafeningnoise.com/spotify/callback
http://127.0.0.1:5173/spotify/callback
```

Set `VITE_SPOTIFY_CLIENT_ID` locally and in Netlify. The Client ID is public configuration; no Spotify Client Secret is used. The browser fetches up to 50 top artists for short-, medium-, and long-term affinity, sends artist IDs, names, Spotify-hosted image URLs, matching ranges, and the refresh token to an authenticated Supabase RPC, then discards the access token. Artists attached to future concerts but absent from Top Artists are looked up by exact normalized name and stored in a separate per-user artwork catalog, so artwork never expands suggestion affinity. The same image metadata is refreshed by the daily workflow and supplies dashboard, future-concert, and suggestion artwork, with the bundled stage image as fallback. Supabase Vault stores the refresh token encrypted and exposes it only to the service-role workflow. Tracks and raw listening history are never stored. Spotify Development Mode currently allows only five explicitly allowlisted users and requires the app owner to have Premium; this is a Spotify platform limit, not an application limit. Do not make Spotify a registration dependency.

Users control web and email delivery separately for social activity, concert changes, ticket changes, suggestions, and Spotify connection warnings. Shared scraping uses `get_discovery_artist_catalog`: the union of active users' qualified listening artists, confirmed archives and bucket lists, without personal exclusions. The web RPC scopes candidates to the caller. Daily digest delivery records recipient/event receipts and a frozen message in `suggestion_email_outbox`, rather than inferring delivery from yesterday's global catalog. Newly eligible existing events can therefore be notified too. The first run after this migration may notify current matches once.

Digest claims are serialized per user, leased, and limited to one successful delivery per Europe/Berlin calendar day. Definite failures retry on a later run; ambiguous sends older than 23 hours enter `review` and require checking Resend before any manual resend. Never blindly reset those rows: [Resend idempotency keys expire after 24 hours](https://resend.com/changelog/idempotency-keys). The persisted message must not change between retries. Other activity uses `notification_email_outbox`. Both mechanisms honor account status and opt-in preferences. No email job should be run against staging with real delivery credentials during tests.

Select **Interested** to add an unpurchased concert immediately, or **Not interested** to record a dismissal. Home removes reviewed entries; the Suggestions page keeps them in its reviewed section. Expired suggestions are not actionable. Changing an interested concert to Not Interested requires confirmation and removes only that user's calendar entry. New decision keys include artist/date/venue/city/country; old artist/date dismissals remain supported.

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

Supabase is the production source of truth. The normalized model uses `profiles`, canonical `concerts`, per-user `concert_participants`, mutual `friendships`, durable `notifications`, per-user `bucket_list_artists` and `user_dismissed_suggestions`, the atomic `concert_suggestion_catalog`, and encrypted Spotify connections. Each authenticated user manages their own archive, calendar, Spotify taste profile, suggestions, and bucket list; Eric's `admin` role additionally grants user administration. Profiles include a display name, optional avatar URL and location, discoverability, section-level friend-profile visibility, email-notification and theme preferences, role, and account status. The theme is also cached locally so it can be applied before React renders. No real dataset or backup is stored in Git. Portable concert records use this shape:

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

Add Concert uses federated, on-demand catalog discovery. The user enters an artist, chooses a country from the local ISO autocomplete, and explicitly starts the search; typing never calls an external provider. The authenticated `search-concert-catalog` Netlify function then searches Supabase plus setlist.fm historical matches and Ticketmaster future matches while keeping provider keys server-only. Country-backed setlist.fm pagination runs sequentially and is bounded to ten pages (200 concerts), avoiding burst rejection and protecting the shared free quota. City and year are bidirectional local facets over that stable result set: either filter constrains the other's options without another provider call. Artist, venue and city are presented consistently in uppercase. External results are never bulk-copied: selecting and saving one result creates or reuses the canonical concert and records its source. Searching never writes repository data or creates GitHub commits. This keeps the shared catalog relevant, bounded and user-centred. setlist.fm-derived data must retain its attribution URL and remains subject to setlist.fm's non-commercial API terms.

Selecting an accepted friend sends an invitation with invited, interested, confirmed, or declined states. Only confirmed attendance enters the friend's archive. Users can leave a shared concert without changing the creator's copy. Sharing full-archive comparison statistics is a separate, revocable consent in `stats_shares`; friendship alone is never sufficient.

Accepted friends have direct `/people/:username` profiles. `get_friend_profile()` checks the friendship server-side and applies the owner's independent visibility choices for summary statistics, latest concert, next concert, and bucket list. Bucket-list completion is computed from confirmed, bought past attendance, including billed support artists, instead of storing a manually editable completion flag.

Profile supports transactional JSON, CSV and ICS imports plus a bounded setlist.fm attended-history import. Every import is previewed and validated before one `import_my_concerts` RPC; it never loops partial browser writes or silently rewrites another creator's canonical fields. JSON remains the full personal-data export, while the calendar keeps its ICS exports. The setlist.fm API is free only for non-commercial use, so revisit its terms before commercialising the product.

The activity view records friend requests and responses, concert invitations and responses, concert changes, ticket availability/link changes, and Spotify reconnection warnings. A `selling_fast` notification is supported only when a source explicitly publishes that state; the system never guesses scarcity. Admins can change roles and access `admin_data_quality()` for canonical duplicates, label variants, missing location/creator/setlist/artwork, suspicious dates, and links awaiting validation. Blocked accounts are rejected by both application bootstrap and database mutation guards.

Global search runs over the already-authorised session snapshot and groups artists, venues, concerts, cities, countries, friends, and years. Concert, friend, city, and country results open reload-safe direct pages. Entity histories share one contextual card: year retains artist, venue, city and country; country omits country; city omits city; venue and artist omit their own identity. It creates no public user or catalog endpoint and therefore preserves the same visibility boundary as the current page.

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
- Calendar month selection survives navigation and reloads within the current browser-tab session, scoped to the signed-in user. Logout clears it; a new tab/session or Today returns to the current month. This is temporary navigation state, not a Supabase profile preference.

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
│   └── README.md                     Runtime JSON here is ignored, not backed up
├── netlify/functions/
│   └── get-setlist.js                Production setlist.fm proxy
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

Check the Supabase RPC response, applied migrations, session permissions, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Concert writes do not pass through GitHub or its token.

### A scraper stops matching events

The external site probably changed its markup or endpoint. Run the relevant scraper directly, inspect its diagnostics, and update only that adapter. Preserve robots.txt compliance and polite request behavior.

## Stats filters

`ArchiveFilters` and `src/lib/archive-filters.js` define the shared interaction:

- Stats and Year in Review share country, city and companion filters. Archive and Timeline retain their original controls.
- Values within a category use OR; categories use AND. Companions default to all selected friends, with an explicit any-friend mode. Only confirmed attendance in the user's own archive qualifies; this never grants access to someone else's archive.
- Options are derived from the authorised session snapshot and narrowed by the other categories. Cities include their country in the internal key. Active selections remain removable even when no results match.
- Repeated `filter_*` URL parameters preserve selection through reload and browser Back; `with=any` selects the optional companion mode. UI changes replace the current URL rather than filling browser history. Account changes reset in-memory filters.
- No database schema change or new provider call is required. Archive, Timeline, Calendar and Suggestions retain their existing controls.

## Review ordering and legal language

Venue identity treats RAZZMATAZZ without a number as RAZZMATAZZ 1, preserves
RAZZMATAZZ 2 and 3 as separate rooms, and maps SALA RAZZMATAZZ variants to the
same numbered name. APOLO and SALA APOLO use SALA APOLO. Suggestion comparison,
daily combination and UI writes reuse these aliases; old dismissal and email
keys remain readable. Eric approved consolidation of five production calendar
duplicates on 3 October 2026; bought state, guests, friends and source records
were preserved after a private affected-row backup and rolled-back rehearsal.
The matching code remains local pending publication.

Discovery records `firstSeenAt` on each suggestion and preserves it across daily
refreshes using its source ID or normalized event key. Suggestions display the
localized detection date. Existing entries without an original timestamp are
labelled “Tracked since”, never assigned an invented original discovery date.
Dates are global catalog detection dates, not per-user email or review dates.
If an event disappears entirely from the catalog and later returns, its date
starts again; this is not a permanent historical discovery ledger.

Reviewed suggestions sort newest decision first, not by concert date. Archive
snapshots expose per-user dismissal dates and attendance creation dates;
`save_dismissed_suggestions` preserves dates for unchanged decisions. Future
attendance is removed on reversal, so selecting Interested again receives a new
attendance date. Older dismissal dates overwritten by the previous implementation
cannot be reconstructed; equal or unavailable dates retain catalog order.
Migration `20260928170000_suggestion_review_order.sql` was verified in staging
and applied to production on 28 September 2026. No new table or provider call is required.

Terms and Privacy show the full English or Spanish text, never both at once.
Profile/login links pass the current language; direct links fall back to the
saved interface language and then the browser language. This does not change the
substance of the existing legal text or introduce new legal claims.

### Collection tools — local/staging review, 4 October 2026

Calendar now has a shared filter for all concerts, history, bought future concerts
and unpurchased future concerts. Export still exports the selected ICS category,
not the visual filter. Filters do not change attendance data.

Concert dialogs share `ConcertDialog`: a fixed header, keyboard-accessible tabs
and a separately scrolling body. Archive opens Setlist; Calendar opens Details.
My memories and Activity are separate tabs when an authenticated concert is
available. Notes and ongoing photo uploads survive tab changes. Outside clicks
do not dismiss the concert; Close, Escape and browser Back do. Full event pages
and suggestion cards expose a quiet, labelled Activity disclosure rather than
an isolated information icon. The disclosure hides tracking
dates and change history until opened; suggestion cards use the same control
for creation and the latest Interested/Not Interested decision timestamp.
Missing legacy dates remain unavailable rather than invented. `concert_changes`
records date, venue, city, country, status,
ticket-link and festival updates starting when its trigger is installed: it does
not reconstruct earlier changes. The history RPC requires the caller's visible,
confirmed participation and exposes no other participant identities. Source
observations and attendance creation provide the first-recorded/added dates.

`concert_memories` stores each participant's private note (5,000 characters),
optional 1–5 rating and an ordered array of private photo paths. The gallery
accepts multiple JPG/PNG/WebP inputs without a browser byte-size cap and prepares
them sequentially to avoid excessive phone memory usage. Images are resized to
at most 2,400 pixels and JPEG-compressed before upload; originals are not retained.
The private `concert-memories` Storage bucket retains its 2 MB per-object security
limit, and provider storage quotas still apply. Owner-folder RLS and signed URLs
protect photos. `set_my_concert_photo` atomically appends/removes one owner photo
without overwriting notes, ratings or another tab's gallery. Existing single-photo
paths are migrated and preserved. Photos save immediately; deletion requires
inline confirmation. Database unlink precedes Storage removal; failed cleanup
offers Retry, while failed additions retain previously saved photos.
Account deletion removes this bucket's owner files through the Storage API
before deleting the identity. Failed cleanup stops deletion for retry. Storage
and database writes are not one transaction: an interrupted upload can leave an
owner-private orphan until account cleanup. Archive JSON exports include notes,
ratings and photo paths, not photo binaries; private backups need separate Storage
recovery. Removing attendance does not automatically delete its private photo.

Festival pages (`/festivals` and `/festival/:edition`) are lazy-loaded and group
only the current user's concerts by explicit festival name and year. A small,
anchored fallback recognises known festival venue labels in existing archives;
it does not infer missing artist-to-day mappings. Add/Edit's existing Festival
field controls grouping; the pages are not a downloaded public festival catalog.

Administration provides candidate duplicate groups and manual confirmed merges.
The server requires admin access, matching artist/date/city/country and ordered
row locks. Attendance, guests, sources, lineup, history, notifications and private
memories move to the retained event. Conflicting attendance or memories block
the merge. The selected event wins conflicting metadata; missing optional fields
are filled from the removed event. `concert_merge_audit` stores actor, IDs and
time. A merge is not automatically reversible: review and back up first.

The eight `20261004` migrations are applied and verified in **staging and production**.
Production received them atomically on 4 October 2026 before publishing this UI;
no new Netlify/GitHub secrets or paid services are required. Regression tests use
synthetic browser fixtures and rolled-back staging SQL (`tests/database/collection-tools.sql`).

### Reliability and lightweight scaling — staging review, 4 October 2026

Checkpoint `1203420` preserves the approved concert-modal work before this
hardening pass; `df94c17` contains the reliability changes and `774940d` the
viewport dropdown correction and reviewed visual baselines. Production schema
was upgraded on 4 October 2026 after the complete local test pass. No additional
secrets, dependencies or paid services are needed.

The release used the existing Supabase Management API access, not a new database
password. A private pre-release snapshot under `~/adn-backups/production-before-20261004-*`
contains all public application tables, function definitions and schema introspection,
with verified SHA-256 checksums and restrictive permissions. It is **not** a
standalone `pg_dump` or complete Auth/Vault/Storage recovery package. All eight
migrations and their version records were committed in a single transaction;
post-release checks confirmed unchanged row counts for every pre-existing public
table. A direct Postgres URL is still required for `npm run db:backup`, but not
for authorised Management API migration operations.

- `save_my_concert` writes and returns the authorised archive snapshot in one
  request. Omitted optional event metadata is preserved; explicit empty values
  clear it. Date ranges are validated and past attendance is always bought.
- `review_my_suggestion` updates attendance and the user's dismissal in one
  transaction. Reversals also clear matching legacy venue aliases, never another
  user's choices. The browser accepts the returned snapshot and updates its
  isolated cache without re-fetching discovery. Other successful writes use a
  best-effort archive refresh; a later read failure is not reported as a failed save.
- Complete event objects reach Archive details and Edit; catalog lookup returns
  optional event metadata without attendance identities. Selected setlist IDs
  survive Add. Fallback setlist lookup requires an unambiguous venue match.
- Calendar and Add/Edit load on demand. Page error boundaries preserve the shell
  and offer recovery; configured Sentry also receives caught rendering failures.
  Request caches have size/TTL bounds and clear on account changes/logout.
- Unsaved concert forms and memories require a shared discard confirmation on
  Close or browser Back. Saving/uploading blocks dismissal. Outside clicks do not
  dismiss these dialogs on desktop or phone. Photos save independently and
  unsaved notes remain private to the current open dialog until saved.
- Notifications are limited to the newest 50 rows before aggregation, backed by
  a user/time index. Admin storage telemetry reports uploaded bytes and private
  photos unreferenced for over 24 hours. These are review candidates, not proof
  of safe deletion: inspect references before authorised Storage API cleanup;
  never delete Storage metadata directly in SQL.
- Worldwide map identifiers come from Unicode CLDR. Unknown locations are not
  assigned to Spain. Non-European archives start with a world view. Search
  responses disclose partial provider coverage: bounded setlist pagination keeps
  API costs predictable, Ticketmaster returns up to 200 events in one request,
  and city/year facets describe only the returned results. The whole setlist
  query has a 35-second budget; browser searches time out after 45 seconds.
- Default and Poster retain their visual language. Country fields share the
  profile selector; Home uses semantic layout classes, more readable labels,
  wrapped upcoming artist names and shorter empty mobile panels. Archive inline
  links have larger touch targets without changing desktop typography.

Run focused checks when requested; do not launch the complete quality suite for
every edit:

```bash
node scripts/staging-db.mjs --test tests/database/transactional-archive.sql
node scripts/benchmark-archive.mjs
node scripts/verify-backup.mjs /absolute/path/to/private/database-backup
```

The synthetic benchmark measures local filtering, date parsing and serialization,
not server concurrency or a guaranteed service capacity. At 10,000 concerts the
measured medians on the development machine were approximately 6 ms for Stats
filters, 3 ms for archive search, 21 ms for calendar date parsing and 5 ms for JSON
serialization. Re-measure on representative phones before adding virtualisation.
The initial app chunk is approximately 263 kB minified / 81 kB gzip; the map and
editors remain separate. The existing 119 kB icon font is retained to avoid an
unnecessary icon-system rewrite; subset it only if measured load budgets require it.

#### Recovery rehearsal and free-tier boundaries

1. Verify a private database backup's checksums with `verify-backup.mjs`.
2. Restore schema and data only into a disposable project, never overwrite
   production for a rehearsal. Reconcile migration records with the backed-up schema.
3. Recreate Auth identities through supported Supabase recovery/export procedures,
   restore private/public Storage binaries through Storage APIs, and reconfigure
   provider secrets separately. Database dumps and personal exports are not full
   Auth/Vault/Storage backups; do not promise recovery without these parts.
4. Verify login, a private archive/export, friendship consent, photos and a
   rollback-only import. `security-and-recovery.sql` rehearses synthetic export,
   import and authorisation; it does not certify an actual platform restore.
5. Record restore time and missing components before declaring a backup recoverable.

Existing provider limits still apply. Spotify development access is controlled
by Spotify and cannot be expanded by a UI change; archive and bucket-list
affinity remain usable without a connection. Review actual Supabase database
and Storage usage, Netlify function/deploy consumption, Actions minutes and
Resend delivery limits before widening registration. Optimisation does not
guarantee permanently free operation at arbitrary traffic levels.
