/**
 * Pinned pages, recent pages and each area's last tab, per person, in this browser (ADMIN-NAV-1).
 *
 * Only paths are kept. They are never trusted: the shell turns them back into menu entries through
 * `menuAccess.keepOpenable` on every render, which drops a path that is not a menu page or that the person may not
 * open now (a role changed, a module was switched off), and an area's remembered tab is used only while it is one
 * of the tabs the person may open (`areaLanding`). Every storage read and write is wrapped: a private window or
 * blocked storage only means nothing is remembered. Nothing here asks the backend.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

const MAX_PINS = 12;
/** Kept longer than shown (5), because some saved paths may be filtered out when shown. */
const MAX_RECENT_KEPT = 12;

interface Saved {
  pins: string[];
  recent: string[];
  /** Area key to the route of the tab last open in it. */
  last: Record<string, string>;
}

const EMPTY: Saved = { pins: [], recent: [], last: {} };

const storageKey = (person: string) => `gc_admin_nav:${person}`;

const paths = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')) : [];

function read(person: string): Saved {
  try {
    const raw = localStorage.getItem(storageKey(person));
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    const last: Record<string, string> = {};
    if (v && typeof v.last === 'object' && v.last) {
      for (const [k, to] of Object.entries(v.last)) if (typeof to === 'string' && to.startsWith('/')) last[k] = to;
    }
    return { pins: paths(v?.pins).slice(0, MAX_PINS), recent: paths(v?.recent).slice(0, MAX_RECENT_KEPT), last };
  } catch {
    return EMPTY;
  }
}

function write(person: string, s: Saved): void {
  try { localStorage.setItem(storageKey(person), JSON.stringify(s)); } catch { /* storage blocked: nothing is remembered */ }
}

export interface NavMemory {
  pins: string[];
  recent: string[];
  last: Record<string, string>;
  isPinned: (to: string) => boolean;
  togglePin: (to: string) => void;
  unpin: (to: string) => void;
  /** A menu page was opened (or null for any other page), in an area's tab (or not). */
  visit: (to: string | null, area?: { key: string; tab: string }) => void;
}

export function useNavMemory(person: string | null | undefined): NavMemory {
  const id = person || 'signed-in';
  const [saved, setSaved] = useState<Saved>(() => read(id));
  useEffect(() => { setSaved(read(id)); }, [id]);

  const update = useCallback((change: (s: Saved) => Saved) => {
    setSaved((prev) => {
      const next = change(prev);
      if (next !== prev) write(id, next);
      return next;
    });
  }, [id]);

  const togglePin = useCallback((to: string) => update((s) => ({
    ...s,
    pins: s.pins.includes(to) ? s.pins.filter((p) => p !== to) : [...s.pins, to].slice(-MAX_PINS),
  })), [update]);

  const unpin = useCallback((to: string) => update((s) => (s.pins.includes(to) ? { ...s, pins: s.pins.filter((p) => p !== to) } : s)), [update]);

  const visit = useCallback((to: string | null, area?: { key: string; tab: string }) => update((s) => {
    const recentSame = !to || s.recent[0] === to;
    const lastSame = !area || s.last[area.key] === area.tab;
    if (recentSame && lastSame) return s;
    return {
      ...s,
      recent: recentSame ? s.recent : [to!, ...s.recent.filter((p) => p !== to)].slice(0, MAX_RECENT_KEPT),
      last: lastSame ? s.last : { ...s.last, [area!.key]: area!.tab },
    };
  }), [update]);

  return useMemo(() => ({
    pins: saved.pins,
    recent: saved.recent,
    last: saved.last,
    isPinned: (to: string) => saved.pins.includes(to),
    togglePin,
    unpin,
    visit,
  }), [saved, togglePin, unpin, visit]);
}
