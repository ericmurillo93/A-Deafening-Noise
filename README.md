# A Deafening Noise

A private, multi-user concert archive built with React, Vite, Tailwind CSS and Supabase.

It provides:

- searchable concert history with direct concert, artist, venue, city, country, and year pages;
- a timeline, lifetime statistics, year reviews, and geographic views;
- an upcoming-concert calendar with bought and unpurchased states;
- concert details, attendees, setlist.fm integration, and calendar export;
- friend discovery, shared concerts, and attendance invitations;
- automated concert suggestions from promoters, venues, and festivals in Spain and Switzerland;
- responsive desktop, phone portrait, and phone landscape layouts.

## Clone and prepare the project

Prerequisites are Git, Node.js/npm, and a browser. GitHub CLI is recommended for contributors who will push changes. The included `.nvmrc` selects Node 24.

```bash
git clone https://github.com/ericmurillo93/A-Deafening-Noise.git
cd A-Deafening-Noise
nvm install
nvm use
npm run setup:auth
```

`setup:auth` installs locked dependencies, Chromium and its Linux system libraries for local UI tests, safely creates `.env.local`, and guides GitHub/Codex authentication. Browser confirmation is still required. On Linux, the Chromium dependency step may request the computer password through `sudo`. To prepare only the website and test browser without authentication, use:

```bash
npm run setup
```

## Work on the project

Start the local website:

```bash
npm run dev
```

Open <http://127.0.0.1:5173>.

Start Codex from another terminal in the repository root:

```bash
npm run codex
```

Codex automatically reads `AGENTS.md`, so the project architecture, established behavior, verification requirements, and Git rules are available in every session.

When Codex handles a change, ask it to verify, commit, and push the intended files. The required validation and Git-safety rules are defined in `AGENTS.md`; the underlying commands remain documented in the full development guide.

## Full documentation

See the [development and operations guide](docs/DEVELOPMENT.md) for:

- authentication and optional environment variables;
- all development commands;
- local-versus-production behavior;
- Netlify configuration;
- GitHub Actions and concert scrapers;
- the concert data model;
- interaction conventions;
- project structure and troubleshooting.

Durable instructions for Codex and other coding agents live in [AGENTS.md](AGENTS.md).
