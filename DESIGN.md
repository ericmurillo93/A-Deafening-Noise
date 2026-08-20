---
name: A Deafening Noise
description: A dense, high-contrast concert archive with the authority of a live-music poster.
colors:
  stage-black: "#09090b"
  poster-black: "#050506"
  poster-border: "#27272a"
  raised-black: "#15191e"
  nested-black: "#111418"
  concert-white: "#f4f4f5"
  secondary-copy: "#a1a1aa"
  history-blue: "#172554"
  bought-green: "#064e3b"
  possibility-amber: "#451a03"
  stage-blue: "#2563eb"
  panel-border: "#30343a"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  compact: "8px"
  control: "12px"
  panel: "6px"
  poster-control: "16px"
  poster-panel: "24px"
spacing:
  tight: "8px"
  standard: "16px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.concert-white}"
    textColor: "{colors.stage-black}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  panel:
    backgroundColor: "{colors.raised-black}"
    textColor: "{colors.concert-white}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: A Deafening Noise

## Overview

**Creative North Star: "The Venue Poster Archive"**

A Deafening Noise combines bold uppercase hierarchy with the restraint of a private archival tool. Page and artist titles carry the personality; functional surfaces stay quiet, compact and predictable so years of concert data remain scannable.

The design is dark because the product is commonly used around live music and personal browsing, not because dark dashboards are fashionable. Semantic color is rare and factual: blue means history, green means bought, amber means possible.

## Colors

Near-black tonal layers establish hierarchy. Concert white carries primary information, while readable cool gray supports metadata. Colored surfaces must use foregrounds from the same hue family or near-white, never washed-out gray.

The interface offers two complete dark themes without changing information architecture or behavior. **Default** uses compact corners, blue primary actions, cool layered panels and a persistent desktop sidebar. **Concert Poster** restores the earlier visual character with a deeper black canvas, zinc surfaces, generous rounded panels, concert-white primary actions, a centered composition and an on-demand navigation drawer at every viewport. Its content remains 1280px wide at a 1920px viewport, then preserves that two-thirds proportion on larger displays instead of becoming visually undersized. Semantic history, bought and possibility colors remain unchanged in both themes. The selected theme is an account preference synchronized through Supabase and cached on the device so it applies before React renders without a flash of the other theme.

## Typography

**Display Font:** system UI sans serif
**Body Font:** system UI sans serif

Heavy uppercase type gives titles and artist names authority while keeping the entire interface familiar and highly legible.

## Layout

Content fills the space beside the fixed desktop sidebar. Mobile is a single-column operating surface; cards expand to two columns at medium widths and three at wide widths. Tight groups use 8px, component interiors 16–24px, and compact page gaps use 16–24px. Mobile headers reserve a clear zone for the independent Menu control.

Authenticated desktop views use a fixed compact sidebar and fill the remaining viewport with a dense operational grid. Page headers align left and stay compact; mobile returns to the menu control and a single-column stack. The personal dashboard's next-concert panel may use darkened, anonymous live-performance photography.

## Elevation & Depth

Depth is primarily tonal and structural. Borders separate adjacent black surfaces; wide shadows are reserved for floating menus, dialogs and sticky controls rather than every card.

## Shapes

Panels use 6px corners, matching the approved dashboard reference. Controls and nested items use 8px. Pills are reserved for status and counts, never standard actions. Borders remain one pixel.

## Components

- **Page titles:** system sans 900, uppercase, tight leading, fluid mobile scale.
- **Primary actions:** restrained stage blue fill with white text, clear disabled state and visible keyboard focus.
- **Cards:** raised black with a single border; hover changes border/surface only when the card is interactive.
- **Dialogs:** centered, labelled, modal to assistive technology, internally scrollable, with focus trapped and restored.
- **Navigation:** quiet zinc by default, near-white on active/hover, with semantic notification badges.
- **Concert status:** history blue, bought green, possibility amber across cards, calendar, legend and details.

## Do's and Don'ts

### Do:

- **Do** let real concert data, chronology and setlists provide the personality.
- **Do** keep meaningful phone text at 12px or larger whenever space permits.
- **Do** preserve 44px touch targets and visible focus for primary interactive controls.
- **Do** maintain useful desktop, phone portrait and phone landscape compositions.

### Don't:

- **Don't** add decorative gradients, glass effects, generic dashboard ornaments or invented artist likenesses. The dashboard's anonymous concert-stage image is the approved atmospheric exception.
- **Don't** infer shared attendance from users referencing the same canonical concert.
- **Don't** rely on hover, right-click, long-press or color as the only way to understand an action or state.
- **Don't** trade scanability for poster styling inside dense data surfaces.
