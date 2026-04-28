# A Deafening Noise

A personal, searchable concert archive — every past show, every upcoming gig, the full album collection and the Spotify profile, all in one fast static site.

Built with **React 18**, **Vite 5** and **Tailwind CSS 3**. Deployed on **Netlify**.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

---

## Features

- Searchable concert history (artist, venue, festival, city, date) — accent-insensitive
- Upcoming concerts view with ticket-status filter (all / bought / pending)
- Sort by artist, total concerts, or most recent
- Add concerts directly from the UI (admin-only)
- Hidden sidebar with quick links to the album collection (Discogs) and Spotify profile
- Dark, typographic interface tuned for fast scanning
- Static, CDN-friendly build with long-term cache headers and security headers

## Tech stack

| Layer    | Tooling                                |
| -------- | -------------------------------------- |
| UI       | React 18, Tailwind CSS 3               |
| Build    | Vite 5, PostCSS, Autoprefixer          |
| Hosting  | Netlify (SPA redirects, header rules)  |
| Data     | Google Apps Script + Sheets backend    |

## Getting started

### Prerequisites

- Node.js **20 or newer**
- npm 9+

### Local development

```bash
npm install
npm run dev
```

The dev server runs on [http://localhost:5173](http://localhost:5173) with hot module reload.

### Production build

```bash
npm run build
npm run preview
```

The optimized bundle is emitted to `dist/`.

## Deploying to Netlify

The repository ships with a `netlify.toml`, so Netlify auto-detects everything:

| Setting           | Value           |
| ----------------- | --------------- |
| Build command     | `npm run build` |
| Publish directory | `dist`          |
| Node version      | `22`            |

The config also wires up:

- SPA fallback redirect (`/* -> /index.html`)
- Long-term immutable caching for fingerprinted assets
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)

## Project structure

```text
.
├── index.html            # HTML shell with SEO + social meta
├── netlify.toml          # Build, redirects, headers
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js        # Build target, vendor chunking
├── public/               # Static assets served as-is
│   ├── favicon.svg
│   ├── apple-touch-icon.svg
│   ├── robots.txt
│   └── site.webmanifest
├── data/
│   └── concerts.json     # Seed data
└── src/
    ├── App.jsx           # All UI + state
    ├── main.jsx          # React entrypoint
    └── index.css         # Tailwind layers + base styles
```

## Updating content

The site reads concert data from a Google Apps Script endpoint configured in `src/App.jsx` and falls back to embedded sample data if the request fails. New entries can be added directly through the in-app **Add concert** modal (admin password required).

## License

MIT
