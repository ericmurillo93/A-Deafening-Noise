# A Deafening Noise

Standalone static website for a concert archive.

## Files
- `index.html`: site structure
- `styles.css`: visual design
- `data.js`: concert data
- `app.js`: search, sorting and rendering logic

## Deploy options
Recommended: Netlify Drop or GitHub Pages.

## Google Calendar automation direction
A static website cannot securely connect directly to a private Google Calendar from the browser without exposing credentials. Use one of these patterns:

1. Easiest: publish a dedicated Google Calendar as public, export its iCal URL, and use a scheduled GitHub Action or Netlify Function to transform upcoming events into `data.js`.
2. More private: use Google Apps Script to read calendar events and publish sanitized JSON. The website reads that JSON.
3. Fully controlled: GitHub Actions with a Google service account, but this requires Google Cloud setup and secrets management.

Recommended for simplicity: Google Apps Script publishing sanitized JSON.
