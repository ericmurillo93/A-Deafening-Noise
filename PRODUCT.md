# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Concertgoers maintaining a personal archive and calendar, with a small trusted social circle who can discover one another, confirm shared attendance, and view their own concert history and statistics.

Eric is the administrator. Every user receives concert suggestions based on their own connected Spotify taste profile; only administration is restricted by role.

## Product Purpose

A Deafening Noise preserves a reliable personal record of past and future concerts, enriches it with setlists and statistics, and reduces the effort of discovering relevant upcoming shows. Success means users can understand their concert history at a glance, maintain it without friction, and coordinate future attendance with friends without exposing unrelated attendance data.

## Positioning

The product combines a private concert archive, a personal upcoming calendar, friendship-based attendance invitations, and recommendations derived from the administrator's real listening history. Canonical concert events may be reused without implying that unrelated users attended together.

## Operating Context

- Users browse and edit the archive on desktop and phones in portrait and landscape.
- After login, a personal dashboard summarizes the next concert, the current year, upcoming shows, activity, and discovery matches without blocking on a fresh network request.
- Accounts without concerts see a non-blocking Home activation view: adding the first real concert is primary, while Spotify connection and friend discovery remain optional; the normal dashboard appears automatically after that first save.
- Past concerts are explored as cards, timeline entries, artist and venue pages, maps, lifetime statistics, and year reviews.
- Future concerts are managed in a calendar and can be exported or shared through WhatsApp.
- Friends become mutual after acceptance; selecting a friend on a concert sends an invitation that must be confirmed before it enters their archive.
- Eric periodically runs the concert-discovery workflow and reviews suggestions below the calendar.

## Capabilities and Constraints

- Supabase Auth and row-level security protect per-user profiles, concerts, participants, friendships, notifications, and dismissals.
- Artist and venue names are normalized to uppercase; dates use `DD/MM/YYYY` with existing date-range support.
- Past concerts are always bought. Future concerts distinguish bought and unpurchased states.
- Concert details support optional setlists, friend attendees, guest attendees, and ticket links.
- Browser history and direct URLs must work for pages and modal dismissal.
- The initial authenticated experience uses a per-user IndexedDB snapshot and silent revalidation; logout removes it completely.
- The geographic map remains lazy-loaded and must not return to the initial bundle.
- Production deploys automatically from GitHub through Netlify. Supabase is canonical; checked-in JSON remains fallback and backup data.
- Suggestions are restricted to Spain and Switzerland sources, refreshed daily from connected Spotify profiles, and filtered to each user's own artists. Personal Interested and Not Interested states persist immediately without removing entries from the shared discovery catalog.
- Connected Spotify artist images provide dashboard and suggestion artwork and enrich future-concert details, with the bundled concert-stage image as a fallback where appropriate.
- Eric's administration panel summarizes account health and recent usage, supports user search and status filtering, and manages roles, blocking, and restoration through protected admin RPCs. Its operational view retains 90 days of discovery-run telemetry, reports source-level scraper health, suggestion volume, email delivery, Spotify reconnections, canonical duplicates, and the measurable Supabase/GitHub/Resend footprint; Netlify credit consumption remains in the provider dashboard because Netlify does not expose that meter through its public API.

## Brand Commitments

- Product name: **A Deafening Noise**.
- Preserve the established dark, compact, high-contrast visual identity and mobile-first behavior.
- The interface is direct and functional, with uppercase artist and venue labels and restrained use of semantic color.

## Evidence on Hand

- Canonical application behavior and content: `src/App.jsx`.
- Global visual foundation: `src/index.css` and Tailwind utility usage.
- Local fallback datasets: `data/concerts.json`, `data/listened-artists.json`, and generated `data/suggestions.json`.
- Functional, accessibility, visual-regression, and Lighthouse suites are checked into the repository.
- No public testimonials, commercial claims, or audience metrics are available and none should be fabricated.

## Product Principles

1. Personal by default: never infer shared attendance from a shared canonical event.
2. Immediate and dependable: repeat visits should render useful personal data without a blocking load.
3. One clear interaction model: concert actions, dialogs, navigation, and Back behavior stay consistent across views.
4. Dense but calm: surface substantial concert history without sacrificing scanability or phone usability.
5. Preserve user ownership: destructive actions are confirmed, shared attendees can leave independently, and private data stays isolated.

## Accessibility & Inclusion

Maintain keyboard access, visible focus, semantic controls, readable dark-theme contrast, reduced-motion support, and usable touch targets across desktop, phone portrait, and phone landscape layouts.
