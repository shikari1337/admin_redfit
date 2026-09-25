/** @type {import('tailwindcss').Config} */

/*
 * Growcord identity, applied through the PALETTE rather than page by page.
 *
 * Every colour below reads a CSS variable from `src/styles/theme.css` — the one
 * theme, mirrored from `suite/packages/kit/src/theme.json` by
 * `node tools/theme/sync.mjs`. There is not a single colour literal in this file,
 * so recolouring the admin (or one store) means changing a token, never hunting
 * for a shade.
 *
 * Tailwind's palette families are mapped onto the theme's six ramps. The admin
 * had ~11,000 palette classes written over two years in whichever family the
 * author reached for first (`gray` here, `slate` there, `emerald` and `green`
 * for the same "it worked"); mapping the families is what makes them even
 * without touching the pages — the same move that fixed the platform console
 * (COMMON_MISTAKES #281):
 *
 *   gray · slate · zinc · neutral · stone  → --n-*  the one warm neutral
 *   green · emerald · lime · teal          → --g-*  success
 *   red · rose                             → --d-*  failure
 *   amber · yellow · orange                → --w-*  attention
 *   blue · sky · cyan                      → --i-*  notice
 *   indigo · violet · purple · fuchsia · pink → --b-*  Growcord green
 *   white → --surface   black → --n-950
 *
 * Alpha (`bg-brand/10`, `bg-black/50`) works through `color-mix`, not an rgb
 * triplet: a triplet would force every token to be declared twice (once per
 * theme) and that second set of values is exactly what this lane exists to
 * remove. `<alpha-value>` is 1 when no modifier is used, and
 * `color-mix(… 100%, transparent)` is the colour itself.
 */

/** A theme token as a Tailwind colour, with the opacity modifier working. */
const c = (name) => `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
/** The 11 steps of one theme ramp, as a Tailwind colour scale. */
const ramp = (id, extra = {}) =>
  Object.fromEntries([...STEPS.map((s) => [s, c(`--${id}-${s}`)]), ...Object.entries(extra)]);

const neutral = ramp('n');
const brand = ramp('b', { DEFAULT: c('--accent'), hover: c('--accent-hover'), ink: c('--accent-ink'), soft: c('--accent-soft') });
const good = ramp('g', { DEFAULT: c('--good'), bg: c('--good-bg'), ink: c('--good-ink') });
const warn = ramp('w', { DEFAULT: c('--warn'), bg: c('--warn-bg'), ink: c('--warn-ink') });
const bad = ramp('d', { DEFAULT: c('--bad'), bg: c('--bad-bg'), ink: c('--bad-ink') });
const info = ramp('i', { DEFAULT: c('--info'), bg: c('--info-bg'), ink: c('--info-ink') });

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        // ── role names: what new code should use ──────────────────────────
        bg: c('--bg'),
        surface: { DEFAULT: c('--surface'), 2: c('--surface-2'), raised: c('--surface-raised') },
        ink: { DEFAULT: c('--ink'), soft: c('--ink-soft'), mute: c('--ink-mute'), inverse: c('--ink-inverse') },
        line: { DEFAULT: c('--line'), strong: c('--line-strong') },
        focus: c('--focus'),
        scrim: c('--scrim'),
        brand, good, warn, bad, info,
        side: { DEFAULT: c('--side'), ink: c('--side-ink'), 'ink-strong': c('--side-ink-strong'), line: c('--side-line'), active: c('--side-active') },
        viz: Object.fromEntries([
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, c(`--viz-${n}`)]),
          ['grid', c('--viz-grid')], ['axis', c('--viz-axis')],
        ]),

        // ── Tailwind's families, all pointing at the six ramps ────────────
        gray: neutral, slate: neutral, zinc: neutral, neutral, stone: neutral,
        green: good, emerald: good, lime: good, teal: good,
        red: bad, rose: bad,
        amber: warn, yellow: warn, orange: warn,
        blue: info, sky: info, cyan: info,
        indigo: brand, violet: brand, purple: brand, fuchsia: brand, pink: brand,
        white: c('--surface'),
        black: c('--n-950'),

        // ── shadcn's vocabulary, kept so every ui/* class stays valid ─────
        // `primary` is the brand: a primary button is Growcord green, not near-black.
        // `accent` is shadcn's SUBTLE hover surface (menu item, ghost button), which
        // is not the same thing as the theme's --accent — so it reads --accent-soft.
        border: c('--line'),
        input: c('--line-strong'),
        ring: c('--focus'),
        background: c('--bg'),
        foreground: c('--ink'),
        primary: { DEFAULT: c('--accent'), foreground: c('--accent-ink') },
        secondary: { DEFAULT: c('--surface-2'), foreground: c('--ink') },
        destructive: { DEFAULT: c('--bad'), foreground: c('--ink-inverse') },
        muted: { DEFAULT: c('--surface-2'), foreground: c('--ink-soft') },
        accent: { DEFAULT: c('--accent-soft'), foreground: c('--accent-hover') },
        popover: { DEFAULT: c('--surface-raised'), foreground: c('--ink') },
        card: { DEFAULT: c('--surface'), foreground: c('--ink') },
        // The admin's sidebar is LIGHT — the look the store's staff had before
        // the suite's deep-green rail was mapped onto it (owner, 2026-09-25:
        // "keep the earlier theme"). Same theme tokens, paper surface instead of
        // `--side`; the suite panels keep their rail.
        sidebar: {
          DEFAULT: c('--surface'),
          foreground: c('--ink-soft'),
          primary: c('--accent'),
          'primary-foreground': c('--accent-ink'),
          accent: c('--accent-soft'),
          'accent-foreground': c('--ink'),
          border: c('--line'),
          ring: c('--focus'),
        },
      },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)', 4: 'var(--space-4)',
        6: 'var(--space-5)', 8: 'var(--space-6)', 10: 'var(--space-7)', 12: 'var(--space-8)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-lg)',
        full: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-1)',
        DEFAULT: 'var(--shadow-1)',
        md: 'var(--shadow-2)',
        lg: 'var(--shadow-2)',
        xl: 'var(--shadow-3)',
        '2xl': 'var(--shadow-3)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'Noto Sans Mono', 'monospace'],
      },
      transitionTimingFunction: { DEFAULT: 'var(--ease)', theme: 'var(--ease)' },
      transitionDuration: { DEFAULT: 'var(--dur)', theme: 'var(--dur)', slow: 'var(--dur-slow)' },
      zIndex: { drawer: 'var(--z-drawer)', modal: 'var(--z-modal)', toast: 'var(--z-toast)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
