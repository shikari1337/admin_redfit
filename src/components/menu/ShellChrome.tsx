/**
 * The admin's shell chrome, at parity with the suite kit (PANEL_FEATURES §0.1,
 * ADMIN_MODIFICATION_PLAN §2.2, rows R-P9-05…09):
 *
 *  · ThemeToggle      — light / dark / follow the system (R-P9-05)
 *  · CommandPalette   — ⌘K or `/`: pages, "New …" actions, record search (R-P9-06)
 *  · useShellHotkeys  — `/` `⌘K` `n` `?` `Esc`, bound ONCE here (R-P9-07)
 *  · Banners          — offline · rate-limited with its retry-after (R-P9-08)
 *  · useDocumentTitle — `Growcord Commerce · Orders` (R-P9-09)
 *
 * The admin cannot import `@growcord/suite-kit` (a separate repository), so these
 * follow the kit's SEMANTICS and its storage keys exactly — `gc_theme` and
 * `gc_theme_defaulted`, the same values, the same first-visit-is-light rule — so a
 * person's theme choice is one choice across every Growcord panel on a host.
 * Lane T5 replaces this file with the byte-identical kit mirror
 * (`admin/src/kit-mirror/`, plan §7); nothing else imports these internals.
 *
 * Record search goes through the unified search service (`searchAPI`, CLAUDE.md
 * rule 7) — never an ad-hoc query.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Monitor, Search, WifiOff, Clock, ArrowRight, ExternalLink, Plus, CornerDownLeft } from 'lucide-react';
import { api, searchAPI, type SearchResult } from '../../services/api';
import { SETTINGS_AREA_LIST } from '../../lib/menu';
import type { VisibleGroup } from './menuAccess';

/* ── theme ───────────────────────────────────────────────────────────────── */

export type ThemePref = 'system' | 'light' | 'dark';
const THEME_KEY = 'gc_theme';
const THEME_DEFAULTED_KEY = 'gc_theme_defaulted';

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* private mode — the choice lasts this page */ }
}

/**
 * The admin is LIGHT, always (owner, 2026-09-25). "Follow the system" is the
 * theme's default when no attribute is set, and on a dark OS that rendered the
 * whole admin dark. `index.html` carries `data-theme="light"` on the markup;
 * this keeps it there whatever an earlier visit stored, and clears that
 * stored choice so nothing else can flip it back.
 */
(function bootTheme() {
  if (typeof document === 'undefined') return;
  try { localStorage.setItem(THEME_DEFAULTED_KEY, '1'); } catch { /* private mode */ }
  applyTheme('light');
})();

export const ThemeToggle: React.FC = () => {
  const [pref, setPref] = useState<ThemePref>(() => readTheme());
  useEffect(() => applyTheme(pref), [pref]);
  const next: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };
  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;
  const name = pref === 'system' ? 'follows your system' : pref;
  return (
    <button
      type="button"
      onClick={() => setPref(next[pref])}
      className="rounded-md p-2 text-ink-mute hover:bg-surface-2 hover:text-ink"
      title={`Theme: ${name} — click to change`}
      aria-label={`Theme: ${name}`}
      data-theme-toggle={pref}
    >
      <Icon className="size-4" />
    </button>
  );
};

/* ── banners ─────────────────────────────────────────────────────────────── */

/**
 * The two states every page shares and no page should have to detect itself:
 * the browser is offline, and the server said "too many requests" (429) with a
 * `retry-after`. The 429 is observed with a response interceptor registered for
 * the life of the shell — it only WATCHES; the rejection still reaches the page
 * that made the call, exactly as before.
 */
export const Banners: React.FC = () => {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const id = api.interceptors.response.use(undefined, (error) => {
      if (error?.response?.status === 429) {
        const header = Number(error.response.headers?.['retry-after']);
        const seconds = Number.isFinite(header) && header > 0 ? header : 60;
        setLimitedUntil(Date.now() + seconds * 1000);
      }
      return Promise.reject(error);
    });
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      api.interceptors.response.eject(id);
    };
  }, []);

  // Count the wait down, then clear the banner by itself.
  useEffect(() => {
    if (!limitedUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= limitedUntil) { setLimitedUntil(null); clearInterval(t); }
      else tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [limitedUntil]);

  if (!offline && !limitedUntil) return null;
  const left = limitedUntil ? Math.max(0, Math.ceil((limitedUntil - Date.now()) / 1000)) : 0;
  return (
    <div role="status" className="border-b border-warn/30 bg-warn-bg px-4 py-2 text-sm text-warn-ink md:px-6">
      {offline ? (
        <span className="inline-flex items-center gap-2"><WifiOff className="size-4" />You are offline. Changes will not save until the connection is back.</span>
      ) : (
        <span className="inline-flex items-center gap-2"><Clock className="size-4" />The server asked us to slow down. Try again in {left}s.</span>
      )}
    </div>
  );
};

/* ── document title ──────────────────────────────────────────────────────── */

export function useDocumentTitle(product: string, trail: Array<{ label: string }>): void {
  const last = trail[trail.length - 1]?.label;
  useEffect(() => {
    const page = last ? last.charAt(0).toUpperCase() + last.slice(1) : 'Home';
    document.title = `${product} · ${page}`;
  }, [product, last]);
}

/* ── command palette ─────────────────────────────────────────────────────── */

interface Hit {
  key: string;
  kind: 'page' | 'action' | 'record' | 'link';
  label: string;
  hint?: string;
  to: string;
  external?: boolean;
}

interface Action { label: string; to: string; perm: string }

/** "New …" actions — each opens the page that creates the thing; nothing is written from here. */
const ACTIONS: Action[] = [
  { label: 'New order', to: '/orders/new', perm: 'orders.manage' },
  { label: 'New product', to: '/products/new', perm: 'products.manage' },
  { label: 'New coupon', to: '/coupons/new', perm: 'marketing.manage' },
  { label: 'New vendor', to: '/vendors/new', perm: 'purchasing.manage' },
  { label: 'New page', to: '/pages/new', perm: 'content.manage' },
];

/** The record types the unified search serves that have an admin page to open. */
const RECORD_ROUTES: Record<string, (id: string) => string> = {
  product: (id) => `/products/${id}/edit`,
  category: () => '/products/categories',
  brand: () => '/products/brands',
};

export const CommandPalette: React.FC<{
  open: boolean;
  onClose: () => void;
  groups: VisibleGroup[];
  hasPerm: (p: string) => boolean;
}> = ({ open, onClose, groups, hasPerm }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [records, setRecords] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setSel(0); setRecords([]); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // Records: debounced, ≥ 3 characters (the service's own minimum), one request.
  useEffect(() => {
    if (!open || q.trim().length < searchAPI.MIN_LENGTH) { setRecords([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchAPI.queryMany(Object.keys(RECORD_ROUTES), q, 5).then((byType) => {
        if (!live) return;
        setRecords(Object.values(byType).flat());
      });
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const out: Hit[] = [];
    for (const g of groups) for (const s of g.subs) for (const i of s.items) {
      if (match(i.label) || match(i.tip) || match(s.label) || match(g.label)) {
        out.push({ key: `p:${i.to}`, kind: i.external ? 'link' : 'page', label: i.label, hint: `${g.label} · ${s.label}`, to: i.to, external: i.external });
      }
    }
    if (hasPerm('settings.read')) {
      for (const a of SETTINGS_AREA_LIST) {
        const label = `Settings ${a.no}. ${a.label}`;
        if (term && match(label)) out.push({ key: `s:${a.id}`, kind: 'page', label, hint: 'Settings', to: `/settings?group=${a.id}` });
      }
    }
    for (const a of ACTIONS) if (hasPerm(a.perm) && match(a.label)) out.push({ key: `a:${a.to}`, kind: 'action', label: a.label, to: a.to });
    // Orders are deliberately NOT offered as "find orders matching …": the Orders
    // list does not read a search term from its URL yet (plan R-P9-32, lane T5),
    // so the jump would land on an unfiltered list and say it had searched.
    for (const r of records) {
      const route = RECORD_ROUTES[r.type];
      if (route) out.push({ key: `r:${r.type}:${r.id}`, kind: 'record', label: r.label, hint: `${r.type}${r.sublabel ? ` · ${r.sublabel}` : ''}`, to: route(r.id) });
    }
    return term ? out.slice(0, 40) : out.filter((h) => h.kind !== 'page' || !h.external).slice(0, 12);
  }, [q, groups, records, hasPerm]);

  useEffect(() => { if (sel >= hits.length) setSel(0); }, [hits.length, sel]);

  const go = (h: Hit) => {
    onClose();
    if (h.external) window.location.assign(h.to);
    else navigate(h.to);
  };

  if (!open) return null;
  const Icon = (h: Hit) => h.kind === 'action' ? Plus : h.kind === 'link' ? ExternalLink : h.kind === 'record' ? Search : ArrowRight;

  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center bg-scrim p-4 pt-[12vh]" onMouseDown={onClose} data-command-palette>
      <div
        role="dialog"
        aria-label="Search or jump"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface-raised shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-ink-mute" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((n) => Math.min(n + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((n) => Math.max(n - 1, 0)); }
              else if (e.key === 'Enter' && hits[sel]) go(hits[sel]);
            }}
            placeholder="Search pages, products, brands, categories…"
            aria-label="Search pages and records"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-mute"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-ink-mute">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {hits.map((h, i) => {
            const I = Icon(h);
            return (
              <li key={h.key} role="option" aria-selected={i === sel} data-hit-kind={h.kind}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === sel ? 'bg-brand-soft text-ink' : 'text-ink-soft'}`}
                >
                  <I className="size-4 shrink-0 text-ink-mute" />
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  {h.hint && <span className="shrink-0 truncate text-xs text-ink-mute">{h.hint}</span>}
                  {i === sel && <CornerDownLeft className="size-3.5 shrink-0 text-ink-mute" />}
                </button>
              </li>
            );
          })}
          {!hits.length && <li className="px-3 py-6 text-center text-sm text-ink-mute">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
};

/* ── hotkeys ─────────────────────────────────────────────────────────────── */

export const HOTKEYS: Array<{ keys: string; does: string }> = [
  { keys: '⌘K  or  /', does: 'Search or jump to a page' },
  { keys: 'n', does: 'New order' },
  { keys: '?', does: 'This list' },
  { keys: 'Esc', does: 'Close a dialog or the palette' },
  { keys: 'Ctrl+S', does: 'Save — on forms that have a Save button' },
];

/** Is the person typing? Then a single-letter key is a letter, not a command. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Bound once, by the shell. Pages keep their own Ctrl+S (the forms own the save). */
export function useShellHotkeys(opts: { openPalette: () => void; openHelp: () => void; newOrder: (() => void) | null }): void {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current.openPalette(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.key === '/') { e.preventDefault(); ref.current.openPalette(); }
      else if (e.key === '?') { e.preventDefault(); ref.current.openHelp(); }
      else if (e.key === 'n' && ref.current.newOrder) { e.preventDefault(); ref.current.newOrder(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export const HotkeySheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim p-4" onMouseDown={onClose} data-hotkey-sheet>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-full max-w-sm rounded-xl border border-line bg-surface-raised p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Keyboard shortcuts</h2>
        <dl className="space-y-2 text-sm">
          {HOTKEYS.map((h) => (
            <div key={h.keys} className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">{h.does}</dt>
              <dd><kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{h.keys}</kbd></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};
