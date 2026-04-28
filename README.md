# A Deafening Noise

A personal concert archive built with React, Vite and Tailwind CSS.

## Features

- Searchable concert history
- Upcoming concerts view
- Ticket status filter for upcoming concerts
- Add concert modal
- Hidden sidebar menu
- External links to Discogs and Spotify
- Netlify-ready deployment configuration

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production output is generated in:

```text
dist
```

## Netlify setup

Use these settings in Netlify:

```text
Build command: npm run build
Publish directory: dist
```

The repository includes `netlify.toml`, so Netlify should detect the correct settings automatically.

## Project structure

```text
.
├── index.html
├── netlify.toml
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
└── src
    ├── App.jsx
    ├── index.css
    └── main.jsx
```

## Updating content

Most site logic and UI lives in:

```text
src/App.jsx
```

The site currently reads remote concert data through the configured API URL in `App.jsx` and keeps fallback data in the same file.
