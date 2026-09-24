/**
 * The theme, for code that cannot use a CSS variable.
 *
 * A stylesheet, a class or an inline `style` can all say `var(--good)` and the
 * browser resolves it. A <canvas> cannot: `ctx.fillStyle = 'var(--good)'` is
 * silently ignored and the shape is painted black. Chart libraries that measure
 * or interpolate colours have the same problem. Those callers ask here instead,
 * and get the value the theme is actually showing right now.
 *
 * Values still live in exactly one place — `src/styles/theme.css`, mirrored from
 * `suite/packages/kit/src/theme.json`. This module reads them off the document;
 * it never carries a copy. Changing a token changes what this returns.
 */

/** Every token this app draws with. Add one here only after adding it to theme.json. */
export const TOKEN = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  surfaceRaised: '--surface-raised',
  scrim: '--scrim',

  ink: '--ink',
  inkSoft: '--ink-soft',
  inkMute: '--ink-mute',
  inkInverse: '--ink-inverse',

  line: '--line',
  lineStrong: '--line-strong',
  focus: '--focus',

  accent: '--accent',
  accentHover: '--accent-hover',
  accentInk: '--accent-ink',
  accentSoft: '--accent-soft',

  good: '--good', goodBg: '--good-bg', goodInk: '--good-ink',
  warn: '--warn', warnBg: '--warn-bg', warnInk: '--warn-ink',
  bad: '--bad', badBg: '--bad-bg', badInk: '--bad-ink',
  info: '--info', infoBg: '--info-bg', infoInk: '--info-ink',

  side: '--side', sideInk: '--side-ink', sideInkStrong: '--side-ink-strong',
  sideLine: '--side-line', sideActive: '--side-active',

  vizGrid: '--viz-grid',
  vizAxis: '--viz-axis',
} as const;

export type TokenName = keyof typeof TOKEN;

/** The four states anything in this app can be in. Use these, not a colour. */
export const SEMANTIC = ['good', 'warn', 'bad', 'info'] as const;
export type Semantic = (typeof SEMANTIC)[number];

/**
 * Resolving a custom property means a style recalculation, so the answers are
 * cached. The cache is dropped when the theme changes — the only two ways it can
 * (the `data-theme` attribute, or the operating system switching).
 */
const cache = new Map<string, string>();
let watching = false;

function watch(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  new MutationObserver(() => cache.clear())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => cache.clear());
}

/**
 * The value a CSS variable currently has, as a string a canvas or a chart can use.
 *
 * `fallback` is returned only when there is no document at all (a test, or a
 * render on the server) — never to paper over a token that does not exist, which
 * would hide the typo. Call it at draw time, not at module scope: at module scope
 * the stylesheet may not have been applied yet.
 */
export function token(name: TokenName, fallback = 'transparent'): string {
  if (typeof document === 'undefined') return fallback;
  watch();
  const prop = TOKEN[name];
  const hit = cache.get(prop);
  if (hit !== undefined) return hit;
  const value = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  const resolved = value || fallback;
  cache.set(prop, resolved);
  return resolved;
}

/**
 * Any custom property by its raw name — for a ramp step (`--w-400`) that has no
 * role name of its own. Prefer `token()`: a role says what the colour is FOR.
 */
export function cssVar(prop: string, fallback = 'transparent'): string {
  if (typeof document === 'undefined') return fallback;
  watch();
  const hit = cache.get(prop);
  if (hit !== undefined) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || fallback;
  cache.set(prop, v);
  return v;
}

/** The same token at partial strength — for a fill under a stroke, a hover wash. */
export function tokenAlpha(name: TokenName, alpha: number): string {
  return `color-mix(in srgb, ${token(name)} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * The eight categorical series, in order.
 *
 * The ORDER is the colour-vision-deficiency safety mechanism: assign a colour to
 * a series by its position here — by entity — never cycled and never re-ranked by
 * value, or the same thing changes colour between two charts.
 */
export function vizSeries(): string[] {
  if (typeof document === 'undefined') return [];
  watch();
  const out: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const prop = `--viz-${i}`;
    let v = cache.get(prop);
    if (v === undefined) {
      v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
      cache.set(prop, v);
    }
    out.push(v);
  }
  return out;
}

/** The colour for one of the four states — used for a dot, a stroke, a fill. */
export function semantic(state: Semantic): string {
  return token(state);
}

/** That state's soft background and the ink that is legible on it. */
export function semanticPair(state: Semantic): { bg: string; ink: string } {
  return { bg: token(`${state}Bg` as TokenName), ink: token(`${state}Ink` as TokenName) };
}
