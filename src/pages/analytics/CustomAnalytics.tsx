import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { ChartCard, CategoryBars } from '../../components/panelAnalytics/Kit';
import { fmtRupees } from '../../lib/money';
import { Download } from 'lucide-react';

/**
 * Analytics → Custom. Group any period's orders by a chosen dimension
 * (day/week/month, status, payment method, state, city, coupon, attribution
 * channel, product) — table + chart + CSV export. Dimensions are a backend
 * whitelist; cancelled orders are excluded except when grouping by status.
 */
interface SavedReport { name: string; dimension: string; preset: string; custom: { from?: string; to?: string } | null }
const SAVED_KEY = 'analytics_saved_reports';

const CustomAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const [dimensions, setDimensions] = useState<Array<{ key: string; label: string }>>([]);
  const [dimension, setDimension] = useState('day');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); } catch { return []; }
  });
  const [saveName, setSaveName] = useState('');

  const persistSaved = (list: SavedReport[]) => {
    setSaved(list);
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  };
  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name) return;
    persistSaved([
      ...saved.filter((r) => r.name !== name),
      { name, dimension, preset, custom: preset === 'custom' ? custom : null },
    ]);
    setSaveName('');
  };
  const loadSaved = (r: SavedReport) => {
    setDimension(r.dimension);
    if (r.preset === 'custom' && r.custom) { setCustom(r.custom); setPreset('custom'); }
    else setPreset(r.preset);
  };

  useEffect(() => {
    api.get('/analytics/panels/custom-report/dimensions')
      .then((res) => setDimensions(payload(res) ?? []))
      .catch(() => setDimensions([{ key: 'day', label: 'Day' }]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    api.get('/analytics/panels/custom-report', { params: { dimension, from: range.from, to: range.to } })
      .then((res) => { if (alive) setReport(payload(res)); })
      .catch((e) => { if (alive) setError(e?.response?.data?.message ?? 'Failed to run report'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dimension, range.from, range.to]);

  const rows: any[] = report?.rows ?? [];
  // Item-level dimensions (product/brand/category) report LINE revenue and
  // carry a units column; header-level dims report full order totals.
  const itemLevel = !!report?.item_level;
  const columns: Array<{ key: string; label: string; money?: boolean }> = itemLevel
    ? [
        { key: 'dimension', label: report?.label ?? 'Dimension' },
        { key: 'orders', label: 'Orders' },
        { key: 'units', label: 'Units' },
        { key: 'gross_sales', label: 'Line revenue', money: true },
      ]
    : [
        { key: 'dimension', label: report?.label ?? 'Dimension' },
        { key: 'orders', label: 'Orders' },
        { key: 'gross_sales', label: 'Gross sales', money: true },
        { key: 'collected_revenue', label: 'Collected', money: true },
        { key: 'discount', label: 'Discount', money: true },
        { key: 'aov', label: 'AOV', money: true },
      ];

  const enriched = useMemo(() => rows.map((r) => ({
    ...r,
    aov: r.orders > 0 ? Number(r.gross_sales) / Number(r.orders) : 0,
  })), [rows]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { orders: 0, units: 0, gross_sales: 0, collected_revenue: 0, discount: 0 };
    for (const r of enriched) for (const k of Object.keys(t)) t[k] += Number(r[k] ?? 0);
    return t;
  }, [enriched]);

  const downloadCsv = () => {
    const head = columns.map((c) => c.label).join(',');
    const lines = enriched.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        const s = c.money && c.key !== 'dimension' ? Number(v ?? 0).toFixed(2) : String(v ?? '');
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${dimension}-${range.from ?? 'alltime'}-${range.to ?? 'today'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chartRows = enriched.slice(0, 15).map((r) => ({ label: String(r.dimension).slice(0, 18), value: Number(r.gross_sales) }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Reports</h1>
          <p className="text-sm text-gray-500">Group orders by any dimension over any period. Export as CSV.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Group by</label>
        <select value={dimension} onChange={(e) => setDimension(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm">
          {dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        {report && (
          <span className="text-xs text-gray-500">
            {report.excludes_cancelled ? 'Cancelled orders excluded' : 'All order statuses included'} · {rows.length} row(s)
          </span>
        )}
        <button type="button" onClick={downloadCsv} disabled={enriched.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Saved reports</span>
        {saved.map((r) => (
          <span key={r.name} className="inline-flex items-center overflow-hidden rounded-full border text-xs">
            <button type="button" onClick={() => loadSaved(r)}
              className="px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50" title={`${r.dimension} · ${r.preset}`}>
              {r.name}
            </button>
            <button type="button" onClick={() => persistSaved(saved.filter((x) => x.name !== r.name))}
              className="border-l px-1.5 py-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${r.name}`}>
              ×
            </button>
          </span>
        ))}
        {saved.length === 0 && <span className="text-xs text-gray-400">none yet — configure a report and save it</span>}
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <input value={saveName} onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent(); }}
          placeholder="Report name" className="rounded-md border px-2 py-1 text-xs" />
        <button type="button" onClick={saveCurrent} disabled={!saveName.trim()}
          className="rounded-md border px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Save current
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {chartRows.length > 0 && (
        <ChartCard title={`Gross sales by ${report?.label?.toLowerCase() ?? dimension}`}
          sub={chartRows.length < enriched.length ? `Top ${chartRows.length} of ${enriched.length}` : undefined}>
          <CategoryBars data={chartRows} height={240} money />
        </ChartCard>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 ${c.key !== 'dimension' ? 'text-right' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={columns.length} className="p-6 text-center text-gray-500">Running report…</td></tr>}
            {!loading && enriched.length === 0 && (
              <tr><td colSpan={columns.length} className="p-6 text-center text-gray-500">No data in range.</td></tr>
            )}
            {!loading && enriched.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-1.5 ${c.key !== 'dimension' ? 'text-right font-mono' : ''}`}>
                    {c.key === 'dimension' ? r.dimension
                      : c.money ? fmtRupees(r[c.key])
                      : Number(r[c.key] ?? 0).toLocaleString('en-IN')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {!loading && enriched.length > 1 && (
            <tfoot className="border-t-2 bg-gray-50 font-medium">
              <tr>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 ${c.key !== 'dimension' ? 'text-right font-mono' : ''}`}>
                    {c.key === 'dimension' ? 'Total'
                      : c.key === 'aov' ? (totals.orders > 0 ? fmtRupees(totals.gross_sales / totals.orders) : '—')
                      : c.money ? fmtRupees(totals[c.key])
                      : Number(totals[c.key] ?? 0).toLocaleString('en-IN')}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default CustomAnalytics;
