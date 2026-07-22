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
- creates `.env.local` from `.env.example` without overwriting an existing file;
- authenticates GitHub CLI when it is installed and not already authenticated;
- downloads the official Codex CLI through `npx` and starts login only when required.

Authentication requires confirmation in the user's browser. To prepare only the application, skip GitHub and Codex authentication:

```bash
npm run setup
```

## Environment variables

The setup script creates `.env.local` from `.env.example`. Local setlist lookup requires:

```text
SETLIST_API_KEY=your_real_setlist_fm_key
```

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

- The password screen is skipped because `import.meta.env.DEV` is true.
- Add, edit, delete, attendee, ticket-status, and discovered setlist-ID changes write directly to `data/concerts.json`.
- Local saves do not call GitHub and do not create commits automatically.
- Setlist requests are handled by development-only middleware in `vite.config.js`.
- The middleware is enabled only while Vite serves the app and is not included in the production runtime.

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

# Preview the production build
npm run preview
```

Only use `dev:network` on a trusted network. The development save endpoint intentionally has no password gate.

## Production behavior

Netlify builds production with `npm run build` and publishes `dist`.

| Behavior | Local development | Netlify production |
| --- | --- | --- |
| Login gate | Skipped | Required |
| Concert writes | Directly updates local JSON | Netlify function commits JSON through GitHub API |
| Setlist requests | Vite development middleware | Netlify function |
| Secrets | `.env.local` | Netlify environment variables |
| Git commits | Manual | Concert edits create data commits through the production function |

The Netlify site requires:

```text
APP_PASSWORD
VITE_APP_PASSWORD
GITHUB_TOKEN
SETLIST_API_KEY
```

`APP_PASSWORD` and `VITE_APP_PASSWORD` must contain the same value. `GITHUB_TOKEN` needs permission to update `data/concerts.json`. Keep all values in Netlify, never in the repository.

The checked-in `netlify.toml` defines:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## Concert suggestion automation

The workflow `.github/workflows/concert-suggestions.yml` runs every Monday and can also be started manually. It refreshes Resurrection Fest Route, Live Nation Spain, Madness Live, Sala Razzmatazz, Sala Apolo, Sala Bikini, Paral·lel 62, Palau de la Música Catalana, Les Docks, and Montreux Jazz Festival:

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Refresh concert suggestions**.

To run the complete pipeline locally:

```bash
npm run suggestions:refresh
```
4. Select **Run workflow**.

The workflow runs:

- Resurrection Fest Route;
- Live Nation Spain;
- Madness Live.

Scraped lineups are matched against `data/listened-artists.json`, which contains artists heard at least once in the imported Spotify Extended Streaming History. Existing artist/date pairs in `data/concerts.json` and previously dismissed artist/date pairs are excluded. The workflow combines and deduplicates results into `data/suggestions.json`. Suggestions never appear directly as calendar events; the expandable **Concert suggestions** panel below the calendar presents them for review.

### Import Spotify listening history

Request the Extended Streaming History export from Spotify, keep the downloaded ZIP outside version control, and run:

```bash
npm run import:spotify -- path/to/my_spotify_data.zip
```

The importer writes `data/listened-artists.json`. It retains only artist-level aggregates: artist name, number of listening records, total milliseconds, and first/last timestamps. Raw track names, IP addresses, devices, and other private export fields are not retained. The `.gitignore` protects the expected ZIP filename and a `spotify-data/` import directory; never commit the raw export under another name.

Select **Interested** to open the normal Add Concert modal with artist, venue, and date prefilled, or **Not interested** to dismiss a suggestion. These choices are staged in browser storage, so you can review the complete list without creating a commit per concert. Use **Save decisions** once at the end: interested concerts and dismissed artist/date keys are written together to `data/concerts.json` in one commit. Persisted dismissals are excluded from later scraper runs.

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

The canonical dataset is `data/concerts.json`. Its `concerts` array stores the archive and its optional `dismissedSuggestions` array stores normalized `artist|DD/MM/YYYY` keys from the suggestion review flow:

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
- Adding from Concert Archive automatically sets `bought: true`.
- Adding from Concert Calendar exposes the ticket-bought checkbox.

Setlist lookup first uses a stored `setlistId`. If no ID exists, the proxy searches by artist and date; when an ID is discovered, the application persists it for later lookups.

## Navigation and interaction conventions

- Browser back/forward participates in page navigation through URL hashes.
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

Check Netlify function logs and verify `APP_PASSWORD`, `VITE_APP_PASSWORD`, and `GITHUB_TOKEN`.

### A scraper stops matching events

The external site probably changed its markup or endpoint. Run the relevant scraper directly, inspect its diagnostics, and update only that adapter. Preserve robots.txt compliance and polite request behavior.
