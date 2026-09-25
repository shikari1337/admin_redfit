import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

/**
 * BULK — one panel per sheet, always in the same three numbered steps
 * (1 Export → 2 Fill in → 3 Send back), leading with EXPORT because the export
 * is the template with your own data already in it. That is the #333 shape the
 * batch sheet settled on, applied to the warehouse.
 *
 * Every column's meaning comes from the server (`GET /inventory/sheets`), which
 * derives it from the same declaration the workbook's Instructions tab is built
 * from — so this panel and the file can never say different things.
 *
 * A partial failure is NEVER shown as success: the result names how many rows
 * changed, how many were left exactly as they were, and lists every failure
 * with the LINE NUMBER a person sees in Excel.
 */

interface ColumnHelp {
  header: string; role: string; role_label: string;
  required: string; required_when: string | null;
  accepts: string; format: string; does: string;
}
interface SheetDef {
  key: string; label: string; row_is?: string; dataset: string; template: string;
  importable: boolean; columns: ColumnHelp[];
}

/**
 * The two sheets the owner asked for lead; the path-based pair below them says
 * the same things the long way round and is marked Advanced on the server. The
 * server sends them in this order, so the tabs are simply where the divider
 * falls — nothing here decides what a sheet IS.
 */
const ADVANCED_FROM = 'locations';

const ROLE_STYLE: Record<string, string> = {
  key: 'bg-slate-100 text-slate-600',
  context: 'bg-slate-50 text-slate-400',
  instruct: 'bg-amber-50 text-amber-700',
  edit: 'bg-emerald-50 text-emerald-700',
};

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
    <div className="min-w-0 flex-1">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </div>
  </div>
);

const WarehouseSheets: React.FC<{ canWrite: boolean; warehouseCode?: string | null }> = ({ canWrite, warehouseCode }) => {
  const [sheets, setSheets] = useState<SheetDef[] | null>(null);
  const [active, setActive] = useState('warehouse-layout');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [queued, setQueued] = useState<string>('');
  const [showColumns, setShowColumns] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ⚠️ The admin's axios interceptor collapses a `{success, data}` envelope to
  // `data` alone for SOME shapes and leaves it whole for others, so every read
  // here accepts both rather than assuming one (M-1.5 / #230's family).
  const unwrap = (r: any) => r?.data?.data ?? r?.data ?? r;

  useEffect(() => {
    api.get('/inventory/sheets')
      .then((r) => {
        const list: SheetDef[] = unwrap(r)?.sheets ?? [];
        setSheets(list);
        // A server that predates the Warehouse layout sheet simply opens on
        // whatever it does have, rather than on a tab that is not there.
        setActive((cur) => (list.some((s) => s.key === cur) ? cur : (list[0]?.key ?? cur)));
      })
      .catch(() => setSheets([]));
  }, []);

  const sheet = sheets?.find((s) => s.key === active) ?? null;

  /**
   * Ask for the file. A facility's placement sheet reaches tens of megabytes,
   * so it goes through the download QUEUE — the request returns at once and the
   * file waits in Downloads, surviving navigation (#333). A store whose
   * database has not got the queue yet falls back to a direct download rather
   * than showing a dead button.
   */
  const exportSheet = async () => {
    if (!sheet) return;
    setBusy('export'); setError(''); setQueued(''); setResult(null);
    try {
      const r = await api.post('/exports', { dataset: sheet.dataset, params: { warehouseCode: warehouseCode ?? undefined } });
      const job = unwrap(r);
      setQueued(`Your ${sheet.label.toLowerCase()} file is being built. It will be in Downloads in a moment${job?.id ? ` (job ${String(job.id).slice(0, 8)})` : ''}.`);
    } catch (e: any) {
      if (e?.response?.status === 503) {
        setQueued('The download queue is not switched on for this store yet, so the file is downloading directly.');
        try {
          const d = await api.get(`/inventory/sheets/${sheet.key}/template`, {
            responseType: 'blob', params: warehouseCode ? { warehouseCode } : undefined,
          });
          triggerDownload(d.data, `${sheet.key}-template.xlsx`);
        } catch { setError('Could not build the file.'); }
      } else setError(e?.response?.data?.message ?? 'Could not request the file.');
    } finally { setBusy(''); }
  };

  const downloadTemplate = async () => {
    if (!sheet) return;
    setBusy('template'); setError('');
    try {
      const r = await api.get(`/inventory/sheets/${sheet.key}/template`, {
        responseType: 'blob',
        // So a building whose structure has a level the standard columns do not
        // cover gets its own column for it on the blank template too.
        params: warehouseCode ? { warehouseCode } : undefined,
      });
      triggerDownload(r.data, `${sheet.key}-template.xlsx`);
    } catch { setError('Could not build the template.'); }
    finally { setBusy(''); }
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const upload = async (file: File) => {
    if (!sheet) return;
    setBusy('import'); setError(''); setResult(null); setQueued('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post(`/inventory/sheets/${sheet.key}/import`, fd);
      setResult(unwrap(r));
    } catch (e: any) {
      // A 207 carries a real per-row result, not a failure to report as one.
      const d = e?.response?.data;
      if (d?.data) setResult(d.data);
      else if (d?.total !== undefined) setResult(d);
      else setError(d?.message ?? 'The file could not be read.');
    } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  if (!sheets) return <div className="p-6 text-sm text-slate-500">Loading the sheets…</div>;
  if (!sheets.length) return <div className="p-6 text-sm text-slate-500">This server does not carry the warehouse sheets yet.</div>;

  return (
    <div className="space-y-4">
      {/*
        ONE LIST, not a row of ten unlabelled tabs.
        A tab said only the sheet's name, so choosing between "Locations",
        "Location capacity" and "Warehouse layout" meant clicking each in turn
        to read what a row of it is. Every sheet now states that on the line you
        pick it from, and the pair that says the same thing the long way round
        is marked as the advanced route rather than sitting in the same row.
      */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {sheets.map((s) => (
          <React.Fragment key={s.key}>
            {s.key === ADVANCED_FROM && sheets.some((x) => x.key !== ADVANCED_FROM) && (
              <div className="border-y border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                The same thing, one level at a time
              </div>
            )}
            <button
              onClick={() => { setActive(s.key); setResult(null); setError(''); setQueued(''); }}
              aria-current={active === s.key}
              className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${
                active === s.key ? 'bg-slate-900/[0.04]' : 'hover:bg-slate-50'
              }`}
            >
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${active === s.key ? 'bg-slate-900' : 'bg-slate-300'}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{s.label}</span>
                {s.row_is && <span className="block truncate text-xs text-slate-500">{s.row_is}</span>}
              </span>
              {!s.importable && (
                <span className="mt-0.5 shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  download only
                </span>
              )}
            </button>
          </React.Fragment>
        ))}
      </div>

      {sheet && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <FileSpreadsheet className="h-4 w-4 text-slate-500" />{sheet.label}
              </h3>
              {sheet.row_is && <p className="mt-1 max-w-3xl text-sm text-slate-700">{sheet.row_is}</p>}
              <p className="mt-1 text-xs text-slate-500">
                Downloads are always .xlsx. Uploads take .xlsx or .csv. A blank cell means
                “leave unchanged”, so a file you did not edit changes nothing.
                {warehouseCode && <> This file is for <b>{warehouseCode}</b>, and carries the levels that
                building actually has.</>}
              </p>
            </div>
            <button onClick={() => setShowColumns((v) => !v)}
              className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {showColumns ? 'Hide' : 'What each column means'}
            </button>
          </div>

          <div className="space-y-5">
            <Step n={1} title="Export what is there now">
              <p className="mb-2 text-xs text-slate-600">
                Start here. The export is the template with your own data already in it, so you are
                correcting rather than retyping.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportSheet} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export {sheet.label.toLowerCase()}
                </button>
                <button onClick={downloadTemplate} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Blank template
                </button>
              </div>
              {queued && <p className="mt-2 rounded bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">{queued}</p>}
            </Step>

            <Step n={2} title="Fill it in">
              <p className="text-xs text-slate-600">
                Only the columns marked <span className="rounded bg-emerald-50 px-1 text-emerald-700">Editable</span> and{' '}
                <span className="rounded bg-amber-50 px-1 text-amber-700">What to do</span> are read back. Everything
                else is there so the row makes sense on screen. The workbook’s second tab explains
                every column again, so the file works away from this page.
              </p>
            </Step>

            <Step n={3} title="Send it back">
              {sheet.importable ? (
                <>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={!canWrite || !!busy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload the filled-in sheet
                  </button>
                  {!canWrite && <p className="mt-1.5 text-xs text-slate-500">You can look at these sheets but not send one back.</p>}
                </>
              ) : (
                <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  This sheet cannot be sent back yet, on purpose. Stock can record whose it is, but the
                  available-to-sell figure does not separate owners — loading a client’s stock today
                  would add it to your own sellable pool. The columns are fixed so the format can be
                  reviewed; the import arrives with third-party storage.
                </p>
              )}
            </Step>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}

          {result && (
            <div className={`mt-4 rounded border px-3 py-2.5 ${result.failed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.failed ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
                <span className={result.failed ? 'text-amber-900' : 'text-emerald-900'}>{result.message}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                <span><b>{result.total}</b> rows read</span>
                <span><b>{result.changed}</b> changed</span>
                {!!result.created && <span><b>{result.created}</b> created</span>}
                <span><b>{result.unchanged}</b> left exactly as they were</span>
                {!!result.skipped && <span><b>{result.skipped}</b> skipped</span>}
                {!!result.failed && <span className="text-rose-700"><b>{result.failed}</b> failed</span>}
              </div>
              {!!result.rows?.length && (
                <div className="mt-2 max-h-56 overflow-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                      <tr><th className="px-2 py-1">Line</th><th className="px-2 py-1">Row</th><th className="px-2 py-1">What happened</th></tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1 tabular-nums text-slate-500">{r.row_number}</td>
                          <td className="px-2 py-1 font-mono text-[11px]">{r.ref}</td>
                          <td className={`px-2 py-1 ${r.outcome === 'failed' ? 'text-rose-700' : 'text-slate-600'}`}>{r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.jobId && <p className="mt-1.5 text-[11px] text-slate-500">Recorded in Downloads &amp; imports as job {String(result.jobId).slice(0, 8)}.</p>}
            </div>
          )}

          {showColumns && (
            <div className="mt-4 overflow-auto rounded border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Column</th><th className="px-2 py-1.5">Purpose</th>
                    <th className="px-2 py-1.5">Needed?</th><th className="px-2 py-1.5">Accepts</th>
                    <th className="px-2 py-1.5">Format</th><th className="px-2 py-1.5">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.columns.map((c) => (
                    <tr key={c.header} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{c.header}</td>
                      <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 ${ROLE_STYLE[c.role] ?? ''}`}>{c.role_label}</span></td>
                      <td className="px-2 py-1.5 text-slate-600">{c.required === 'yes' ? 'Yes' : c.required === 'conditional' ? 'Sometimes' : 'No'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{c.accepts}</td>
                      <td className="px-2 py-1.5 text-slate-500">{c.format}</td>
                      <td className="px-2 py-1.5 text-slate-600">{c.does}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Every row that moves stock goes through the same recorded movement a scan on the floor does,
        so the stock ledger always explains where a unit came from and who put it there.
      </p>
    </div>
  );
};

export default WarehouseSheets;
