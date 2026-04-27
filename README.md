# A Deafening Noise

React/Vite site configured for Netlify and GitHub.

## Netlify settings

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

## Google Sheet tabs

The site expects an Apps Script Web App returning two tabs:

- `history`: artist | venue | date
- `next`: artist | date | bought

The Add Concert form writes to the same Apps Script endpoint using the admin password/token checked server-side.
