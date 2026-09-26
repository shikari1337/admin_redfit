/**
 * Lazy routes that survive a deploy.
 *
 * Every push rebuilds the admin with new content hashes. A tab that was opened
 * BEFORE the deploy still holds the old `index.html`, so its next navigation
 * asks for `assets/Dashboard-<old hash>.js`, which no longer exists — the
 * browser reports "Failed to fetch dynamically imported module" and the error
 * boundary showed a red panel (owner-reported, "so many times", 2026-09-27).
 *
 * The right answer is a reload: the fresh `index.html` names the fresh chunks.
 * ONE reload per minute, remembered in sessionStorage, so a genuinely missing
 * file cannot loop the page for ever.
 */
import React from 'react';

const RELOAD_KEY = 'gc_admin_chunk_reload_at';
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|error loading dynamically imported module|Unable to preload CSS/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return CHUNK_ERROR.test(msg);
}

/** Reload for a new build, at most once a minute. Returns false when it declined. */
export function reloadForNewBuild(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* private mode */ }
  if (Date.now() - last < RELOAD_WINDOW_MS) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* private mode */ }
  window.location.reload();
  return true;
}

/**
 * `React.lazy` with the reload built in. On a chunk-load failure it reloads
 * the page (the import promise is left pending, so nothing renders an error
 * in the half-second before the reload lands); any other failure is re-thrown
 * to the error boundary as before.
 */
export function lazyRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadForNewBuild()) {
        return new Promise<{ default: T }>(() => { /* the reload takes over */ });
      }
      throw err;
    }),
  );
}
