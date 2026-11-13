import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { analyticsAPI, SavedReport, SavedReportConfig } from '../../services/analyticsService';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { ChartCard, CategoryBars } from '../../components/panelAnalytics/Kit';
import { fmtRupees } from '../../lib/money';
import { Download, Upload, X } from 'lucide-react';

/**
 * Analytics > Custom. Group a period's orders by one dimension of the closed set the server lists
 * (day, week, month, status, payment method, state, city, coupon, channel, campaign, product, brand,
 * category ...), as a chart, a table with totals and a CSV. Cancelled orders are left out except when
 * grouping by status.
 *
 * Saved reports are the team's: `GET|POST /api/v2/insights/reports`, `DELETE /reports/{id}` (tenant
 * 510). A store whose database has no saved reports yet (`ready: false`) keeps the old list in this
 * browser; once the team list is there, reports still in the browser can be moved over in one click.
 */

/** The browser's own list (before the team list existed). */
interface LocalReport { name: string; dimension: string; preset: string; custom: { from?: string; to?: string } | null }
const LOCAL_KEY = 'analytics_saved_reports';
const readLocal = (): LocalReport[] => {
  try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeLocal = (list: LocalReport[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* private window */ } };
const errText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/** One row of the saved list, whichever store it is in. */
interface Saved { id?: string; name: string; config: SavedReportConfig; savedBy?: string | null }

const CustomAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const [dimensions, setDimensions] = useState<Array<{ key: string; label: string }>>([]);
  const [dimension, setDimension] = useState('day');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamReady, setTeamReady] = useState<boolean | null>(null);
  const [team, setTeam] = useState<SavedReport[]>([]);
  const [local, setLocal] = useState<LocalReport[]>(readLocal);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/analytics/panels/custom-report/dimensions')
      .then((res) => setDimensions(payload(res) ?? []))
      .catch(() => setDimensions([{ key: 'day', label: 'Day' }]));
    analyticsAPI.listSavedReports()
      .then((r) => { setTeamReady(r.ready); setTeam(r.reports); })
      .catch(() => setTeamReady(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    api.get('/analytics/panels/custom-report', { params: { dimension, from: range.from, to: range.to } })
      .then((res) => { if (alive) setReport(payload(res)); })
      .catch((e) => { if (alive) setError(errText(e, 'Could not run the report.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dimension, range.from, range.to]);

  const configNow = (): SavedReportConfig => ({
    dimension, preset,
    ...(preset === 'custom' && custom?.from ? { from: custom.from } : {}),
    ...(preset === 'custom' && custom?.to ? { to: custom.to } : {}),
  });

  const saved: Saved[] = teamReady
    ? team.map((r) => ({ id: r.id, name: r.name, config: r.config, savedBy: r.saved_by }))
    : local.map((r) => ({ name: r.name, config: { dimension: r.dimension, preset: r.preset, from: r.custom?.from, to: r.custom?.to } }));
  const notMoved = teamReady ? local.filter((l) => !team.some((t) => t.name.trim().toLowerCase() === l.name.trim().toLowerCase())) : [];

  const saveCurrent = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSavedError(null);
    if (!teamReady) {
      const list = [...local.filter((r) => r.name !== name), { name, dimension, preset, custom: preset === 'custom' ? custom : null }];
      setLocal(list); writeLocal(list); setSaveName('');
      return;
    }
    try {
      setSaving(true);
      const r = await analyticsAPI.saveReport(name, configNow());
      setTeam(r.reports); setSaveName('');
    } catch (e) {
      setSavedError(errText(e, 'Could not save the report.'));
    } finally { setSaving(false); }
  };

  const remove = async (s: Saved) => {
    setSavedError(null);
    if (!teamReady || !s.id) {
      const list = local.filter((x) => x.name !== s.name);
      setLocal(list); writeLocal(list);
      return;
    }
    if (!window.confirm(`Delete the saved report "${s.name}" for everyone in the team?`)) return;
    try {
      const r = await analyticsAPI.deleteSavedReport(s.id);
      setTeam(r.reports);
    } catch (e) {
      setSavedError(errText(e, 'Could not delete the report.'));
    }
  };

  /** The browser's reports, saved to the team list one by one; the browser keeps only what failed. */
  const moveLocal = async () => {
    setSavedError(null);
    setSaving(true);
    const failed: LocalReport[] = [];
    let latest: SavedReport[] | null = null;
    for (const l of notMoved) {
      try {
        const r = await analyticsAPI.saveReport(l.name, {
          dimension: l.dimension, preset: l.preset,
          ...(l.preset === 'custom' && l.custom?.from ? { from: l.custom.from } : {}),
          ...(l.preset === 'custom' && l.custom?.to ? { to: l.custom.to } : {}),
        });
        latest = r.reports;
      } catch { failed.push(l); }
    }
    if (latest) setTeam(latest);
    setLocal(failed); writeLocal(failed);
    if (failed.length) setSavedError(`${failed.length} could not be moved and stay on this computer.`);
    setSaving(false);
  };

  const open = useCallback((s: Saved) => {
    setDimension(s.config.dimension);
    const p = s.config.preset || '30d';
    if (p === 'custom' && (s.config.from || s.config.to)) { setCustom({ from: s.config.from, to: s.config.to }); setPreset('custom'); }
    else setPreset(p);
  }, [setCustom, setPreset]);

  const rows: any[] = report?.rows ?? [];
  // Item-level dimensions (product, brand, category) report LINE revenue and carry units; the others
  // report whole order totals.
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
        { key: 'aov', label: 'Average order', money: true },
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
  const dimLabel = (key: string) => dimensions.find((d) => d.key === key)?.label ?? key;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom reports</h1>
          <p className="text-sm text-gray-500">Group orders by any dimension over any period, save it for the team, export it as CSV.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="custom-dimension" className="text-sm font-medium text-gray-700">Group by</label>
        <select id="custom-dimension" value={dimension} onChange={(e) => setDimension(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm">
          {dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        {report && (
          <span className="text-xs text-gray-500">
            {report.excludes_cancelled ? 'Cancelled orders left out' : 'Every order status included'}, {rows.length.toLocaleString('en-IN')} {rows.length === 1 ? 'row' : 'rows'}
          </span>
        )}
        <button type="button" onClick={downloadCsv} disabled={enriched.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Download className="size-4" aria-hidden /> CSV
        </button>
      </div>

      <section className="space-y-2 rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {teamReady ? 'Saved for the team' : 'Saved on this computer'}
          </span>
          {saved.map((s) => (
            <span key={s.id ?? s.name} className="inline-flex items-center overflow-hidden rounded-full border text-xs">
              <button type="button" onClick={() => open(s)}
                className="px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50"
                title={`${dimLabel(s.config.dimension)}, ${s.config.preset ?? 'period'}${s.savedBy ? `, saved by ${s.savedBy}` : ''}`}>
                {s.name}
              </button>
              <button type="button" onClick={() => remove(s)}
                className="border-l px-1.5 py-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${s.name}`}>
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          {saved.length === 0 && <span className="text-xs text-gray-400">None yet. Set up a report and save it.</span>}
          <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:inline-block" />
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={80}
            onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent(); }}
            placeholder="Report name" aria-label="Report name" className="min-w-0 rounded-md border px-2 py-1 text-xs" />
          <button type="button" onClick={saveCurrent} disabled={!saveName.trim() || saving}
            className="rounded-md border px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {teamReady === false && (
          <p className="text-xs text-gray-500">The team list is not set up on this store yet, so reports stay in this browser.</p>
        )}
        {notMoved.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>{notMoved.length} {notMoved.length === 1 ? 'report is' : 'reports are'} still only on this computer.</span>
            <button type="button" onClick={moveLocal} disabled={saving}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Upload className="size-3" aria-hidden /> Move to the team list
            </button>
          </div>
        )}
        {savedError && <p className="text-xs text-red-700">{savedError}</p>}
      </section>

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
            {loading && <tr><td colSpan={columns.length} className="p-6 text-center text-gray-500">Running the report...</td></tr>}
            {!loading && enriched.length === 0 && (
              <tr><td colSpan={columns.length} className="p-6 text-center text-gray-500">No orders in this period.</td></tr>
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
                      : c.key === 'aov' ? (totals.orders > 0 ? fmtRupees(totals.gross_sales / totals.orders) : '')
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
