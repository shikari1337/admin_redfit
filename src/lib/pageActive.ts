/**
 * Only the tab a person is looking at asks the server for anything on a timer
 * (owner, 21 Nov 2026: "make sure the screen and elements which are active on
 * screen are fetching data from backend, not other activities or inactive
 * screens"). That day about ten admin tabs left open in the background were
 * each asking three questions every 30 seconds.
 *
 * Every repeating read in the admin goes through `useVisibleInterval`. A read
 * that has to go on with no tab on screen (the new-order alert) takes one turn
 * per browser through `claimBackgroundTurn`, never one per tab.
 */
import { useEffect, useRef } from 'react';

/** Is this tab the one on screen? A browser that cannot say answers yes. */
export const pageVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Calls `fn` once now and then every `ms`, only while this tab is on screen.
 * A hidden tab asks nothing. When the person comes back, a turn that was missed
 * runs at once, so the screen is never older than `ms` while it is looked at.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let last = 0;
    const run = () => { last = Date.now(); fnRef.current(); };
    const turn = () => { if (pageVisible()) run(); };
    const back = () => { if (pageVisible() && Date.now() - last >= ms) run(); };
    turn();
    const t = setInterval(turn, ms);
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [ms, enabled]);
}

function readStamp(key: string): number {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}

/** Records that a turn was just taken, so the browser's hidden tabs stay quiet. */
export function stampTurn(key: string): void {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* private mode: every tab decides alone */ }
}

/**
 * For a hidden tab: may it take this turn? Yes only when no tab of this browser
 * has taken one for one and a half periods, so a tab on screen always goes
 * first and, with none on screen, one hidden tab asks instead of all of them.
 */
export function claimBackgroundTurn(key: string, ms: number): boolean {
  if (Date.now() - readStamp(key) < ms * 1.5) return false;
  stampTurn(key);
  return true;
}
