/**
 * THE one way the admin starts and follows a "set store stock from the ERP" run — the
 * Inventory page's "Fetch from ERP" and the ERP section's "Update stock now" both use it.
 *
 * A full stock pull (Siddharth Medicare: ~59 MiB, ~100k rows) takes minutes, so the server
 * answers `POST …/stock/apply` at once with `{apply, already_running}` and keeps working;
 * this hook then reads `GET …/stock/status` every 2 s while the phase is `downloading`,
 * `saving` or `applying`, and stops on `done` / `failed` / `interrupted` / unmount.
 * `interrupted` = the server restarted mid-run (its heartbeat went silent for 2 minutes):
 * nothing more will happen to that run, and starting again closes it and begins anew.
 * `stop()` asks the server to stop the run (`POST …/stock/applies/{id}/cancel`); `restart()` is
 * stop, then start. A stopped run ends in phase `stopped`.
 *
 * On mount it reads the status once and RESUMES the live view when a run is already going,
 * so a page refresh (or a second tab) shows the same progress.
 *
 * Older servers answered the POST only when everything was finished, with the
 * StockApplyView itself: that answer is shown as done. When such a server keeps the admin
 * waiting past its 2-minute limit, the screen says plainly that it does not know the
 * outcome yet and points at the history — it never pretends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  erpApi, errorCode, errorText, isNotServed, isTimeout,
  type ErpRunOutcome, type ErpRunStart, type ErpStockPhase, type ErpStockStatus, type StockApplyView,
} from '../lib/v2/erp';
import { toDate } from '../utils/date';

const POLL_MS = 2000;
/** After a start, a status of `idle` is tolerated this long (the job may not have registered yet). */
const IDLE_GRACE_MS = 8000;
/** A status that stays `idle` this long while the history shows the run unfinished = lost. */
const LOST_AFTER_MS = 60_000;

/** The phases during which the server is working. */
export const RUNNING_PHASES: readonly ErpStockPhase[] = ['downloading', 'saving', 'applying'];

/**
 * `starting` = the POST is on its way; `unknown` = the outcome is not known (an older server
 * timed out, or the server stopped reporting the run) — the history is the place to look.
 */
export type ErpStockRunPhase = ErpStockPhase | 'starting' | 'unknown';

export interface ErpStockRunState {
  phase: ErpStockRunPhase;
  /** The last working phase seen — which step a failure happened in. */
  lastWorking: 'downloading' | 'saving' | 'applying' | null;
  apply: StockApplyView | null;
  fetch: ErpRunOutcome | null;
  /** False when the run sets stock from the ERP copy already held (no download / save). */
  fetchFirst: boolean;
  startedAt: Date | null;
  /** Seconds the server said had passed, as of `readAt`. */
  elapsedSecs: number | null;
  /** `Date.now()` when the state was last read. */
  readAt: number;
  /** `started` here · `already_running` (the server said so) · `resumed` (found running on load). */
  how: 'started' | 'already_running' | 'resumed';
  /** Answered by an older server that only replies when everything is finished. */
  legacy: boolean;
  /** Why it did not start / did not finish, in the server's words. */
  error: string | null;
  errorKind: 'already_running' | 'not_served' | 'timeout' | 'lost' | 'other' | null;
  /** Polling trouble (the run itself may be fine): shown small, polling continues. */
  pollTrouble: string | null;
  /** This screen stopped it ("Stopped by you"); false when someone else did. */
  stoppedByYou: boolean;
}

export const isWorking = (p: ErpStockRunPhase): boolean => p === 'starting' || RUNNING_PHASES.includes(p as ErpStockPhase);

/** Seconds since the run started, as of `now` (ms). */
export function elapsedOf(s: ErpStockRunState, now: number): number | null {
  if (!isWorking(s.phase)) {
    if (s.apply && typeof s.apply.finished_us === 'number' && s.apply.started_us) {
      return Math.max(0, (s.apply.finished_us - s.apply.started_us) / 1_000_000);
    }
    return s.elapsedSecs;
  }
  if (s.elapsedSecs !== null) return s.elapsedSecs + Math.max(0, now - s.readAt) / 1000;
  return s.startedAt ? Math.max(0, (now - s.startedAt.getTime()) / 1000) : null;
}

const microsToDate = (us: number | null | undefined): Date | null =>
  typeof us === 'number' && us > 0 ? toDate(us / 1000) : null;

const workingOf = (p: ErpStockRunPhase): ErpStockRunState['lastWorking'] =>
  p === 'downloading' || p === 'saving' || p === 'applying' ? p : null;

/** The phase a finished StockApplyView stands for. */
const finishedPhase = (a: StockApplyView): ErpStockPhase => (a.stopped ? 'stopped' : a.status === 'failed' ? 'failed' : 'done');

export interface UseErpStockRun {
  /** What to show; null = nothing started here and nothing running. */
  state: ErpStockRunState | null;
  /** True while a run is starting or working (disable the start buttons). */
  running: boolean;
  /** A clock (ms) that ticks every second while running, for "3 min so far". */
  now: number;
  /** The status as read on load, even when nothing is running (null = not read / not served). */
  initial: ErpStockStatus | null;
  start: (fetchFirst?: boolean) => Promise<void>;
  /** Stop the run shown (staff only). Resolves to null when stopped, else the reason it could not be. */
  stop: () => Promise<string | null>;
  /** Stop the run shown, then start a new one the same way. Resolves like `stop`. */
  restart: () => Promise<string | null>;
  /** Forget a finished result (the panel's "Close"). */
  dismiss: () => void;
}

/**
 * @param connectionId the stock connection, or null while it is being found
 * @param onFinished called once when a run followed here ends (done or failed), with its apply
 */
export function useErpStockRun(
  connectionId: string | null,
  onFinished?: (apply: StockApplyView | null, phase: ErpStockRunPhase) => void,
): UseErpStockRun {
  const [state, setState] = useState<ErpStockRunState | null>(null);
  const [initial, setInitial] = useState<ErpStockStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const statusServed = useRef<boolean | null>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  const stateRef = useRef<ErpStockRunState | null>(null);
  stateRef.current = state;
  const startedLocally = useRef(0);

  const running = !!state && isWorking(state.phase);

  /** Merge a status read into the state. Returns true while there is more to follow. */
  const absorb = useCallback((s: ErpStockStatus, how?: ErpStockRunState['how']): boolean => {
    const prev = stateRef.current;
    const working = RUNNING_PHASES.includes(s.phase);
    // `done` whose apply itself failed is a failure, whatever the phase word says.
    const phase: ErpStockPhase = s.phase === 'done' && s.apply?.status === 'failed' ? 'failed' : s.phase;
    const next: ErpStockRunState = {
      phase,
      lastWorking: workingOf(s.phase) ?? prev?.lastWorking ?? null,
      apply: s.apply ?? prev?.apply ?? null,
      fetch: s.fetch ?? prev?.fetch ?? null,
      fetchFirst: prev?.fetchFirst ?? true,
      startedAt: toDate(s.started_at) ?? microsToDate(s.apply?.started_us) ?? prev?.startedAt ?? null,
      elapsedSecs: s.elapsed_secs,
      readAt: Date.now(),
      how: how ?? prev?.how ?? 'resumed',
      legacy: false,
      error: phase === 'failed' ? (s.apply?.message ?? s.fetch?.message ?? prev?.error ?? null) : null,
      errorKind: phase === 'failed' ? 'other' : null,
      pollTrouble: null,
      stoppedByYou: phase === 'stopped' ? (prev?.stoppedByYou ?? false) : false,
    };
    // A resumed run that was started without a fetch reports no fetch at all.
    if (how === 'resumed' && !s.fetch && s.phase === 'applying') next.fetchFirst = false;
    stateRef.current = next;
    setState(next);
    if (!working && prev && isWorking(prev.phase)) finishedRef.current?.(next.apply, next.phase);
    return working;
  }, []);

  /** The status route is not on this server: follow the apply through the history instead. */
  const followByHistory = useCallback(async (id: string): Promise<boolean> => {
    const prev = stateRef.current;
    const page = await erpApi.stockApplies(id, 5, 0);
    const mine = prev?.apply?.id ? page.items.find((a) => a.id === prev.apply?.id) : page.items[0];
    if (!mine || mine.finished_us == null) {
      if (prev) setState({ ...prev, phase: prev.phase === 'starting' ? 'applying' : prev.phase, lastWorking: prev.lastWorking ?? 'applying', readAt: Date.now() });
      return true;
    }
    const phase = finishedPhase(mine);
    const next: ErpStockRunState = {
      ...(prev ?? baseState(true, 'resumed')),
      phase, apply: mine, fetch: mine.fetch ?? prev?.fetch ?? null, readAt: Date.now(),
      error: phase === 'failed' ? mine.message : null, errorKind: phase === 'failed' ? 'other' : null, pollTrouble: null,
    };
    stateRef.current = next;
    setState(next);
    finishedRef.current?.(mine, phase);
    return false;
  }, []);

  // On load: is a run already going? Resume it if so.
  useEffect(() => {
    if (!connectionId) return;
    let live = true;
    (async () => {
      try {
        const s = await erpApi.stockStatus(connectionId);
        if (!live) return;
        statusServed.current = true;
        setInitial(s);
        // A run that is going is followed; one the server restarted under is shown (with Retry).
        if ((RUNNING_PHASES.includes(s.phase) || s.phase === 'interrupted') && !stateRef.current) absorb(s, 'resumed');
      } catch (e) {
        if (live && isNotServed(e)) statusServed.current = false;
      }
    })();
    return () => { live = false; };
  }, [connectionId, absorb]);

  // Follow a working run: status every 2 s until done / failed / unmount.
  useEffect(() => {
    if (!connectionId || !running || state?.phase === 'starting') return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    let idleSince = 0;
    const tick = async () => {
      let more = true;
      try {
        if (statusServed.current === false) {
          more = await followByHistory(connectionId);
        } else {
          const s = await erpApi.stockStatus(connectionId);
          if (!live) return;
          statusServed.current = true;
          fails = 0;
          if (s.phase === 'idle') {
            // Not registered yet right after a start — or the server no longer knows the run
            // (restarted): look for it in the history, and after a minute say we lost it.
            if (!idleSince) idleSince = Date.now();
            if (Date.now() - startedLocally.current > IDLE_GRACE_MS) {
              more = await followByHistory(connectionId).catch(() => true);
              if (!live) return;
              if (more && Date.now() - idleSince > LOST_AFTER_MS) {
                const prev = stateRef.current;
                if (prev) {
                  const lost: ErpStockRunState = {
                    ...prev, phase: 'unknown', errorKind: 'lost', readAt: Date.now(),
                    error: 'The server stopped reporting this update (it may have restarted), and the history does not show it finished.',
                  };
                  stateRef.current = lost;
                  setState(lost);
                  finishedRef.current?.(prev.apply, 'unknown');
                }
                more = false;
              }
            }
          } else {
            idleSince = 0;
            more = absorb(s);
          }
        }
      } catch (e) {
        if (!live) return;
        if (isNotServed(e)) {
          statusServed.current = false;
        } else {
          fails += 1;
          const prev = stateRef.current;
          if (prev) setState({ ...prev, pollTrouble: `Could not read its progress (${fails} ${fails === 1 ? 'try' : 'tries'}): ${errorText(e)} Still trying.` });
        }
      }
      if (live && more) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { live = false; if (timer) clearTimeout(timer); };
    // `running` flipping is what starts / stops the loop; the phase within it does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, running, state?.phase === 'starting', absorb, followByHistory]);

  // A clock for "3 min so far".
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = useCallback(async (fetchFirst = true) => {
    if (!connectionId || (stateRef.current && isWorking(stateRef.current.phase))) return;
    startedLocally.current = Date.now();
    const begun = baseState(fetchFirst, 'started');
    stateRef.current = begun;
    setState(begun);
    try {
      const out = await erpApi.startStockApply(connectionId, fetchFirst);
      const a = out.apply;
      if (out.legacy || (a && a.finished_us !== null && !out.already_running)) {
        // An older server (or a run that was over before it answered): the finished apply.
        const phase = a ? finishedPhase(a) : 'unknown';
        const done: ErpStockRunState = {
          ...begun, phase, apply: a, fetch: a?.fetch ?? null, legacy: out.legacy, readAt: Date.now(),
          startedAt: microsToDate(a?.started_us) ?? begun.startedAt,
          lastWorking: phase === 'failed' ? (a?.fetch?.status === 'failed' ? 'downloading' : 'applying') : null,
          error: phase === 'failed' ? (a?.message ?? null) : null, errorKind: phase === 'failed' ? 'other' : null,
        };
        stateRef.current = done;
        setState(done);
        finishedRef.current?.(a, phase);
        return;
      }
      const working: ErpStockRunState = {
        ...begun,
        phase: fetchFirst && !out.already_running ? 'downloading' : 'applying',
        lastWorking: fetchFirst && !out.already_running ? 'downloading' : 'applying',
        apply: a,
        fetch: a?.fetch ?? null,
        startedAt: microsToDate(a?.started_us) ?? begun.startedAt,
        elapsedSecs: null,
        readAt: Date.now(),
        how: out.already_running ? 'already_running' : 'started',
      };
      // The first status read (≤ 2 s) puts the real phase in.
      stateRef.current = working;
      setState(working);
    } catch (e) {
      if (errorCode(e) === 'erp.already_running') {
        // An older server refuses a second run outright; follow the one going if it can be read.
        try {
          const s = await erpApi.stockStatus(connectionId);
          statusServed.current = true;
          if (RUNNING_PHASES.includes(s.phase)) { absorb(s, 'already_running'); return; }
        } catch { /* fall through to the plain refusal */ }
        setState({ ...begun, phase: 'failed', how: 'already_running', error: errorText(e), errorKind: 'already_running', readAt: Date.now() });
        return;
      }
      if (isTimeout(e)) {
        const unknown: ErpStockRunState = {
          ...begun, phase: 'unknown', readAt: Date.now(), errorKind: 'timeout',
          error: 'The server did not answer within 2 minutes. The update may still be running on the server.',
        };
        stateRef.current = unknown;
        setState(unknown);
        finishedRef.current?.(null, 'unknown');
        return;
      }
      setState({
        ...begun, phase: 'failed', readAt: Date.now(),
        error: isNotServed(e) ? 'Setting store stock from the ERP is not available on this server yet. Nothing was changed.' : errorText(e),
        errorKind: isNotServed(e) ? 'not_served' : 'other',
      });
    }
  }, [connectionId, absorb]);

  const stop = useCallback(async (): Promise<string | null> => {
    const cur = stateRef.current;
    const applyId = cur?.apply?.id;
    if (!connectionId || !cur || !applyId) return 'There is no update here to stop.';
    try {
      const out = await erpApi.cancelStockApply(connectionId, applyId);
      const a = out.apply ?? cur.apply;
      const phase: ErpStockRunPhase = out.already_finished ? (a ? finishedPhase(a) : cur.phase) : 'stopped';
      const next: ErpStockRunState = {
        ...cur, phase, apply: a, fetch: a?.fetch ?? cur.fetch, readAt: Date.now(),
        stoppedByYou: !out.already_finished,
        error: phase === 'failed' ? (a?.message ?? null) : null,
        errorKind: phase === 'failed' ? 'other' : null,
        pollTrouble: null,
      };
      stateRef.current = next;
      setState(next);
      if (isWorking(cur.phase)) finishedRef.current?.(a, phase);
      return null;
    } catch (e) {
      return `It could not be stopped: ${errorText(e)}`;
    }
  }, [connectionId]);

  const restart = useCallback(async (): Promise<string | null> => {
    const fetchFirst = stateRef.current?.fetchFirst ?? true;
    const why = await stop();
    if (why) return why;
    await start(fetchFirst);
    return null;
  }, [stop, start]);

  const dismiss = useCallback(() => {
    if (stateRef.current && isWorking(stateRef.current.phase)) return;
    stateRef.current = null;
    setState(null);
  }, []);

  return { state, running, now, initial, start, stop, restart, dismiss };
}

function baseState(fetchFirst: boolean, how: ErpStockRunState['how']): ErpStockRunState {
  return {
    phase: 'starting', lastWorking: null, apply: null, fetch: null, fetchFirst,
    startedAt: new Date(), elapsedSecs: 0, readAt: Date.now(), how, legacy: false,
    error: null, errorKind: null, pollTrouble: null, stoppedByYou: false,
  };
}

/* ── a single feed's fetch / backfill / remap ────────────────────────────── */

export interface ErpFeedRunState {
  run: ErpRunOutcome | null;
  alreadyRunning: boolean;
  /** True while the server reports it `running` (and the run can be followed by id). */
  following: boolean;
  error: string | null;
}

/**
 * Start a feed run and follow it: `{run, already_running}` back at once; while the run says
 * `running` and carries an `id`, `GET …/runs/{id}` every 2 s until it ends. A run without an
 * id (an older server) is shown as the server answered it.
 */
export function useErpFeedRun(connectionId: string, onEnded?: (run: ErpRunOutcome) => void) {
  const [st, setSt] = useState<ErpFeedRunState>({ run: null, alreadyRunning: false, following: false, error: null });
  const [busy, setBusy] = useState(false);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const runId = st.following ? st.run?.id ?? null : null;

  useEffect(() => {
    if (!runId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await erpApi.run(connectionId, runId);
        if (!live) return;
        const still = r.status === 'running';
        setSt((p) => ({ ...p, run: r, following: still, error: null }));
        if (!still) { endedRef.current?.(r); return; }
      } catch (e) {
        if (!live) return;
        if (isNotServed(e)) { setSt((p) => ({ ...p, following: false })); return; }
        setSt((p) => ({ ...p, error: `Could not read its progress: ${errorText(e)} Still trying.` }));
      }
      if (live) timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [connectionId, runId]);

  const start = useCallback(async (fn: () => Promise<ErpRunStart>) => {
    setBusy(true);
    setSt({ run: null, alreadyRunning: false, following: false, error: null });
    try {
      const out = await fn();
      const following = out.run.status === 'running' && !!out.run.id;
      setSt({ run: out.run, alreadyRunning: out.already_running, following, error: null });
      if (out.run.status !== 'running') endedRef.current?.(out.run);
    } catch (e) {
      setSt({ run: null, alreadyRunning: errorCode(e) === 'erp.already_running', following: false, error: errorText(e) });
    } finally {
      setBusy(false);
    }
  }, []);

  return { ...st, busy, start, working: busy || st.following };
}
