import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import type { PanelRange } from './DateRangeBar';

/**
 * Fetch /analytics/panels/<panel> for a range. from/to omitted = all time.
 * RULE: read via payload(), never res.data.data (interceptor unwraps envelopes).
 */
export function usePanelStats<T = any>(panel: string, range: PanelRange) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/analytics/panels/${panel}`, { params: { from: range.from, to: range.to } })
      .then((res) => { if (alive) { setData(payload<T>(res)); setError(null); } })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load analytics');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [panel, range.from, range.to]);

  return { data, loading, error };
}
