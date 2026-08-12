---
name: A Deafening Noise
description: A dense, high-contrast concert archive with the authority of a live-music poster.
colors:
  stage-black: "#09090b"
  raised-black: "#18181b"
  concert-white: "#f4f4f5"
  secondary-copy: "#a1a1aa"
  history-blue: "#172554"
  bought-green: "#064e3b"
  possibility-amber: "#451a03"
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
  control: "12px"
  panel: "16px"
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

## Typography

**Display Font:** system UI sans serif
**Body Font:** system UI sans serif

Heavy uppercase type gives titles and artist names authority while keeping the entire interface familiar and highly legible.

## Layout

Content sits inside a centered `max-w-7xl` shell. Mobile is a single-column operating surface; cards expand to two columns at medium widths and three at wide widths. Tight groups use 8px, component interiors 16–24px, and page sections 32–48px. Mobile headers reserve a clear zone for the independent Menu control.

## Elevation & Depth

Depth is primarily tonal and structural. Borders separate adjacent black surfaces; wide shadows are reserved for floating menus, dialogs and sticky controls rather than every card.

## Shapes

Panels use 16px corners. Compact controls and nested items use 12px. Pills are reserved for status, counts, filters and short actions. Borders remain one pixel.

## Components

- **Page titles:** system sans 900, uppercase, tight leading, fluid mobile scale.
- **Primary actions:** near-white fill on stage black, clear disabled state and visible keyboard focus.
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

- **Don't** add decorative gradients, glass effects, generic dashboard ornaments or invented music imagery.
- **Don't** infer shared attendance from users referencing the same canonical concert.
- **Don't** rely on hover, right-click, long-press or color as the only way to understand an action or state.
- **Don't** trade scanability for poster styling inside dense data surfaces.
