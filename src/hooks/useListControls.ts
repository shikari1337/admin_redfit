import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * useListControls — the ONE way every Books/list screen wires up
 * search + status + date-range + pagination.
 *
 * Pure UI state (no fetching): it holds `{ search, status, from, to, page,
 * pageSize }`, debounces `search` (300ms), and exposes a `params` object of only
 * the non-empty keys — ready to spread straight into an axios `params`. Changing
 * any filter resets `page` to 1 (so you never land on an empty page); `reset()`
 * returns everything to its initial values.
 *
 *   const lc = useListControls({ pageSize: 25 });
 *   const { data } = useQuery(['bills', lc.params], () =>
 *     api.get('/accounting/bills', { params: lc.params }).then(payload));
 */

export type ListControlsState = {
  search: string;
  status: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

export type UseListControlsOptions = Partial<ListControlsState> & {
  /** Debounce for `search` before it reaches `params` (ms). Default 300. */
  debounceMs?: number;
};

/** Only the keys that carry a value — safe to spread into axios `params`. */
export type ListParams = Record<string, string | number>;

export type UseListControls = ListControlsState & {
  /** Debounced search — this is what `params` uses; `search` is the raw input value. */
  debouncedSearch: string;
  setSearch: (v: string) => void;
  setStatus: (v: string) => void;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  setRange: (from: string, to: string) => void;
  setPage: (v: number) => void;
  setPageSize: (v: number) => void;
  /** Non-empty filters (debounced search) + page/pageSize, for axios `params`. */
  params: ListParams;
  reset: () => void;
};

export function useListControls(options: UseListControlsOptions = {}): UseListControls {
  const { debounceMs = 300 } = options;

  // Capture the initial values ONCE so `reset()` is stable even if options is inline.
  const defaults = useRef<ListControlsState>({
    search: options.search ?? '',
    status: options.status ?? '',
    from: options.from ?? '',
    to: options.to ?? '',
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
  }).current;

  const [search, setSearchRaw] = useState(defaults.search);
  const [status, setStatusRaw] = useState(defaults.status);
  const [from, setFromRaw] = useState(defaults.from);
  const [to, setToRaw] = useState(defaults.to);
  const [page, setPageState] = useState(defaults.page);
  const [pageSize, setPageSizeRaw] = useState(defaults.pageSize);
  const [debouncedSearch, setDebouncedSearch] = useState(defaults.search);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(id);
  }, [search, debounceMs]);

  const setPage = useCallback((v: number) => setPageState(Math.max(1, Math.floor(v) || 1)), []);
  // Any filter change returns to page 1.
  const setSearch = useCallback((v: string) => { setSearchRaw(v); setPageState(1); }, []);
  const setStatus = useCallback((v: string) => { setStatusRaw(v); setPageState(1); }, []);
  const setFrom = useCallback((v: string) => { setFromRaw(v); setPageState(1); }, []);
  const setTo = useCallback((v: string) => { setToRaw(v); setPageState(1); }, []);
  const setRange = useCallback((f: string, t: string) => { setFromRaw(f); setToRaw(t); setPageState(1); }, []);
  const setPageSize = useCallback((v: number) => { setPageSizeRaw(v); setPageState(1); }, []);

  const reset = useCallback(() => {
    setSearchRaw(defaults.search);
    setStatusRaw(defaults.status);
    setFromRaw(defaults.from);
    setToRaw(defaults.to);
    setPageState(defaults.page);
    setPageSizeRaw(defaults.pageSize);
  }, [defaults]);

  const params = useMemo<ListParams>(() => {
    const p: ListParams = {};
    const s = debouncedSearch.trim();
    if (s) p.search = s;
    if (status) p.status = status;
    if (from) p.from = from;
    if (to) p.to = to;
    p.page = page;
    p.pageSize = pageSize;
    return p;
  }, [debouncedSearch, status, from, to, page, pageSize]);

  return {
    search, status, from, to, page, pageSize,
    debouncedSearch,
    setSearch, setStatus, setFrom, setTo, setRange, setPage, setPageSize,
    params, reset,
  };
}

export default useListControls;
