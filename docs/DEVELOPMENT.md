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
```

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

# Localhost-only development server (recommended)
npm run dev

# Explicit alias for the same localhost-only server
npm run dev:local

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
| Git commits | Manual | Discovery creates a JSON backup commit before scraping |

The Netlify site requires:

```text
GITHUB_TOKEN
SETLIST_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`GITHUB_TOKEN` needs **Contents: read and write** to update the JSON backup, plus **Actions: read and write** to start and monitor the suggestion workflow. The Supabase values are publishable browser configuration; authorization is enforced through user sessions and database policies. Keep GitHub and setlist.fm secrets in Netlify, never in the repository or browser code.

### Password recovery

In **Supabase → Authentication → Providers → Email**, enable **Secure password change**. In **Authentication → URL Configuration**, use `https://adeafeningnoise.com` as the Site URL. Allow `https://adeafeningnoise.com/**` and the local development roots (for example `http://localhost:5173/**`) as Redirect URLs.

Authenticated password changes use Supabase reauthentication: an email code is required before the new password is accepted. The login screen's **Forgot password?** action sends Supabase's recovery link back to `?password-recovery=1`; the app consumes the recovery session, asks for a new password, then signs out. The browser enforces a shared 60-second cooldown between authentication emails, including across reloads. For a larger public user base, configure custom SMTP instead of relying on Supabase's limited shared email service.

The application uses clean History API routes such as `/history`, `/calendar`, `/timeline`, `/stats`, `/year-review`, `/artist/:name`, and `/venue/:name`. Netlify's checked-in SPA fallback serves `index.html` for direct route requests. Legacy hash URLs are converted to their clean equivalent on first load.

The checked-in `netlify.toml` defines:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## Concert suggestion automation

The workflow `.github/workflows/concert-suggestions.yml` runs only on demand. Open **Concert suggestions** below the calendar and select **Find concerts**. The browser sends Eric's Supabase session token to a Netlify function; the function backs the current Supabase archive up to `data/concerts.json`, keeps `GITHUB_TOKEN` server-side, and dispatches GitHub Actions. The UI then polls a second authenticated function for progress. GitHub Actions refreshes Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, Montreux Jazz Festival, and DICE listings in Spain and Switzerland.

GitHub's Actions UI remains a fallback:

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Refresh concert suggestions**.
4. Select **Run workflow**.

To run the complete pipeline locally:

```bash
npm run suggestions:refresh
```

Scraped lineups are matched against `data/listened-artists.json`, which contains artists heard at least once in the imported Spotify Extended Streaming History. Existing artist/date pairs in `data/concerts.json` and previously dismissed artist/date pairs are excluded. The workflow combines and deduplicates results into `data/suggestions.json`. Suggestions never appear directly as calendar events; the expandable **Concert suggestions** panel below the calendar presents them for review.

### Import Spotify listening history

Request the Extended Streaming History export from Spotify, keep the downloaded ZIP outside version control, and run:

```bash
npm run import:spotify -- path/to/my_spotify_data.zip
```

The importer writes `data/listened-artists.json`. It retains only artist-level aggregates: artist name, number of listening records, total milliseconds, and first/last timestamps. Raw track names, IP addresses, devices, and other private export fields are not retained. The `.gitignore` protects the expected ZIP filename and a `spotify-data/` import directory; never commit the raw export under another name.

Select **Interested** to open the normal Add Concert modal with artist, venue, and date prefilled, or **Not interested** to dismiss a suggestion. These choices are staged in browser storage, so you can review the complete list without creating a write per concert. Use **Save decisions** once at the end: interested concerts and dismissed artist/date keys are written together to Supabase. Persisted dismissals are excluded from later scraper runs.

Run the complete pipeline locally:

```bash
node scripts/scrape-resurrection-route.mjs --output=/tmp/resurrection.json
node scripts/scrape-livenation-events.mjs --output=/tmp/livenation.json
node scripts/scrape-madness-live.mjs --output=/tmp/madness-live.json
node scripts/combine-concert-suggestions.mjs \
  /tmp/resurrection.json \
  /tmp/livenation.json \
  /tmp/madness-live.json \
  --output=/tmp/suggestions.json
```

Review `/tmp/suggestions.json` before manually replacing the checked-in suggestions file.

If GitHub rejects a push that creates or modifies `.github/workflows/*`, authorize the required scope once:

```bash
gh auth refresh -h github.com -s workflow
gh auth setup-git
```

## Data model

Supabase is the production source of truth. The normalized model uses `profiles`, canonical `concerts`, per-user `concert_participants`, mutual `friendships`, durable `notifications`, and `dismissed_suggestions`. Each authenticated user manages their own archive and calendar; Eric's `admin` role additionally grants suggestion access and user administration. Profiles include a display name, optional avatar URL and location, discoverability, role, and account status. `data/concerts.json` remains Eric's compatible local fallback and GitHub backup:

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

Concert identity is canonical: artist, venue, and date inputs search the complete event catalog and selecting a suggestion fills the other fields. An exact normalized match reuses that event record, but does not mean that its users attended together and never exposes unrelated attendees. Ticket state and guest attendees remain personal. Selecting an accepted friend while adding or editing sends a pending invitation; only after acceptance does the concert enter that friend's archive and both users appear as companions. Accepted attendance cannot be removed by another user.

Users can leave a shared concert without changing the creator's copy, export their personal data as JSON, or delete their account. The activity view records friend requests, concert invitations, and accepted invitations. Admins can change roles and block or restore access; blocked accounts are rejected by both application bootstrap and database mutation guards. Stats can be scoped to the complete personal archive or concerts explicitly attended with one accepted friend.

### Client cache and synchronization

Authenticated application data is cached per user in IndexedDB. On repeat visits the cached archive renders first and `get_app_data()` revalidates it silently; returning to a visible tab refreshes data at most once every 30 seconds. Successful mutations refresh both Supabase state and the local cache. Logout clears every cached user snapshot so data is not exposed to the next person using a shared browser. Cache records carry an explicit schema version in `src/lib/app-cache.js`; increment it whenever an incompatible response shape is deployed.

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

```text
.
├── AGENTS.md                         Durable guidance for coding agents
├── docs/DEVELOPMENT.md               Detailed contributor and operations guide
├── data/
│   ├── concerts.json                 Canonical concert dataset
│   ├── listened-artists.json          Privacy-reduced Spotify artist catalog
│   └── suggestions.json              Generated, reviewable suggestions
├── netlify/functions/
│   ├── get-setlist.js                Production setlist.fm proxy
│   └── save-concerts.js              Production GitHub write proxy
├── scripts/
│   ├── combine-concert-suggestions.mjs
│   ├── scrape-livenation-events.mjs
│   ├── scrape-madness-live.mjs
│   ├── scrape-resurrection-route.mjs
│   └── setup-local.mjs
├── src/
│   ├── App.jsx                       Main application and UI
│   ├── index.css
│   └── main.jsx
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
