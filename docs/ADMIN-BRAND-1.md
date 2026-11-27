# ADMIN-BRAND-1: the store admin in the Growcord look (owner, 27 Nov 2026)

Owner: "build admin ui in beautiful theme growcord branding and growcord theme and elements".

## What is there already (looked first)
- Colours, radii, shadows, type and motion are the ONE Growcord theme (`theme.json`, `src/styles/theme.css`),
  byte-identical to `ecom/suite/packages/kit/src/theme.json` and `theme.css` (checked 27 Nov). Brand = Growcord
  orange (ramp b), neutral = warm stone, sidebar = warm near-black (`--side`).
- Every Tailwind palette family already maps onto those ramps (`tailwind.config.js`), tables have one voice
  (`src/index.css`), buttons have one height.
- Missing: the Growcord logo (the sidebar shows a letter "G" tile, the browser tab points at `/vite.svg`, which
  does not exist), and the Growcord elements the suite kit draws (`ecom/suite/packages/kit/src/styles.css`):
  the orange-filled active nav row, the stat tile with the orange edge, pill badges with a status tint, the login
  card with the orange top edge, the toast with a status edge.

## Brand files (from growcord.in, `growcordweb/public`, never redrawn)
- `public/brand/growcord-logo.png` (wordmark for light grounds), `growcord-logo-white.png` (for the dark sidebar
  and dark mode), `growcord-mark.png` (the orange W with its rising arrow, cut from the same wordmark),
  `growcord-icon.svg` (that mark on the sidebar colour, for the browser tab and the home screen).

## Phase 1: brand and frame (every page at once, no page edited)
1. Browser tab and app icon: `index.html`, `manifest.webmanifest`.
2. Sidebar: wordmark (mark when collapsed), store name under it; section heads and the active row in the kit's
   look (orange fill, white text); nothing in the menu added, moved or removed.
3. Top bar: a visible "Search or jump" button that opens the existing command palette (Ctrl K still works);
   everything that is there stays.
4. Sign-in: the kit's card (orange top edge), the wordmark, the store name.
5. Elements in `src/components/ui`: card, badge, tabs, toast, dialog and sheet corners and shadows to the kit's;
   `StatsCard` to the kit's stat tile. Variants and props unchanged, so no page changes.

## Phase 2: page chrome (after phase 1 is live and seen)
Page heads, empty states, the dashboard's tiles and the most used lists (orders, products), one page at a time.

## Rules
- Never remove or narrow a working control: before release, diff every changed file for removed elements.
- No screenshots: checked by code, type check and build.
- Corners proportional and concentric (memory `corners-own-theme`); no Apple copy.
- No dashes or arrows in visible text.
