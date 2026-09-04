import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaFileExcel } from 'react-icons/fa';
import Modal from './Modal';
import {
  ordersAPI, type ErpExportConfig, type ErpExportPreview, type ErpExportStatus,
} from '../../services/api';

interface ErpExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** orders.manage — shows "Forget" on recorded runs (re-opens that span for the next incremental export). */
  canManage?: boolean;
}

type Mode = 'since_last' | 'range';

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';
/** `YYYY-MM-DD` of an instant in the browser's local calendar (the admin runs in IST like the store). */
const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Exports orders as the ERP's "Order Items Export" workbook — one row per
 * order line, the 58-column layout the legacy platform produced and the
 * store's ERP still imports (backend services/erpOrderExport.ts,
 * docs/ERP_ORDER_EXPORT.md).
 *
 * "Since last export" resumes from the watermark the previous run recorded,
 * so each order reaches the ERP exactly once; "Custom range" re-exports any
 * store-calendar date span (the watermark only ever moves forward, so an old
 * month's re-export never causes the next incremental run to repeat orders).
 */
const ErpExportModal: React.FC<ErpExportModalProps> = ({ isOpen, onClose, canManage = false }) => {
  const [status, setStatus] = useState<ErpExportStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [mode, setMode] = useState<Mode>('since_last');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [excludeCancelled, setExcludeCancelled] = useState(true);
  const [config, setConfig] = useState<ErpExportConfig>({ website_channel_code: '', admin_channel_code: 'admin', default_salesperson: '' });
  const [showConfig, setShowConfig] = useState(false);

  const [preview, setPreview] = useState<ErpExportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const previewSeq = useRef(0);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true); setStatusError(null);
    try {
      const s = await ordersAPI.erpExportStatus();
      setStatus(s);
      setConfig(s.config);
      // Sensible custom-range defaults: the last 30 days, never before the
      // store's first own order.
      const today = new Date();
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const first = s.first_order_at ? new Date(s.first_order_at) : null;
      const start = first && first.getTime() > monthAgo.getTime() ? first : monthAgo;
      setFrom((prev) => prev || toDateInput(start));
      setTo((prev) => prev || toDateInput(today));
    } catch (e: any) {
      setStatusError(e?.response?.data?.message || e?.message || 'Could not load export status');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null); setResult(null); setPreview(null); setPreviewError(null);
    loadStatus();
  }, [isOpen, loadStatus]);

  // Live preview of the resolved window — debounced, latest-wins.
  useEffect(() => {
    if (!isOpen || !status) return;
    const firstRun = !status.watermark;
    if (mode === 'range' && (!from || !to)) { setPreview(null); return; }
    const seq = ++previewSeq.current;
    setPreviewing(true); setPreviewError(null);
    const t = setTimeout(async () => {
      try {
        const p = await ordersAPI.erpExportPreview({
          mode,
          from: mode === 'range' || firstRun ? from || undefined : undefined,
          to: mode === 'range' ? to : undefined,
          excludeCancelled,
        });
        if (seq === previewSeq.current) setPreview(p);
      } catch (e: any) {
        if (seq === previewSeq.current) { setPreview(null); setPreviewError(e?.response?.data?.message || e?.message || 'Preview failed'); }
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [isOpen, status, mode, from, to, excludeCancelled]);

  const handleClose = () => { if (!exporting) onClose(); };

  const handleExport = async () => {
    setExporting(true); setError(null); setResult(null);
    try {
      const firstRun = !status?.watermark;
      const { blob, filename, run } = await ordersAPI.erpExport({
        mode,
        from: mode === 'range' || firstRun ? from || undefined : undefined,
        to: mode === 'range' ? to : undefined,
        excludeCancelled,
        config,
      });
      downloadBlob(blob, filename);
      const n = run?.order_count ?? preview?.order_count ?? 0;
      const lines = run?.item_count ?? preview?.item_count ?? 0;
      const span = run?.first_order && run?.last_order ? ` (${run.first_order} → ${run.last_order})` : '';
      setResult(`Exported ${n} order${n === 1 ? '' : 's'} / ${lines} line${lines === 1 ? '' : 's'}${span} as ${filename}.`
        + (run?.truncated ? ' This run hit the per-export cap — run "Since last export" again for the rest.' : ''));
      await loadStatus();
      // The incremental window is now empty; a fresh preview reflects that.
      setPreview(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const [forgetting, setForgetting] = useState<string | null>(null);
  const handleForget = async (runId: string, label: string) => {
    if (!window.confirm(`Forget the export ${label}?\n\nThe orders it covered will be included again by the next "Since last export" run. Use this only if that file never made it into the ERP.`)) return;
    setForgetting(runId); setError(null); setResult(null);
    try {
      await ordersAPI.erpExportForgetRun(runId);
      await loadStatus();
      setPreview(null);
      setResult('Export run forgotten — the next "Since last export" will cover that span again.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not forget that run');
    } finally {
      setForgetting(null);
    }
  };

  const firstRun = !!status && !status.watermark;
  const canExport = !exporting && !loadingStatus && !!status && !previewing && !!preview && preview.order_count > 0
    && (mode !== 'range' || (!!from && !!to));

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={exporting}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
        Close
      </button>
      <button type="button" onClick={handleExport} disabled={!canExport}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        <FaFileExcel size={14} />
        {exporting ? 'Preparing workbook…' : 'Download Excel'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Export orders for ERP" footer={footer} maxWidth="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Builds the <span className="font-medium">Order Items Export</span> workbook your ERP imports — one row per
          order line, the same columns as the previous website's export. Orders imported from the old site are
          never included (the ERP already has them).
        </p>

        {/* Last export / watermark */}
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          {loadingStatus && !status ? (
            <span className="text-gray-500">Loading export history…</span>
          ) : statusError ? (
            <span className="text-red-600">{statusError}</span>
          ) : status?.last_run ? (
            <div className="space-y-1">
              <div>
                <span className="text-gray-500">Last export:</span>{' '}
                <span className="font-medium text-gray-900">{fmtDateTime(status.last_run.at)}</span>
                <span className="text-gray-500"> by {status.last_run.by} · {status.last_run.order_count} orders / {status.last_run.item_count} lines</span>
                {status.last_run.first_order && (
                  <span className="text-gray-500"> · {status.last_run.first_order} → {status.last_run.last_order}</span>
                )}
              </div>
              <div>
                <span className="text-gray-500">Exported up to:</span>{' '}
                <span className="font-medium text-gray-900">{fmtDateTime(status.watermark)}</span>
                <span className="text-gray-500"> · {status.pending.order_count} new order{status.pending.order_count === 1 ? '' : 's'} since then</span>
              </div>
            </div>
          ) : (
            <div>
              <span className="font-medium text-gray-900">No ERP export has been run yet.</span>{' '}
              <span className="text-gray-500">
                Your own order history starts {fmtDate(status?.first_order_at)}; {status?.pending.order_count ?? 0} orders are waiting.
              </span>
            </div>
          )}
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="erp-mode" className="mt-1" checked={mode === 'since_last'} onChange={() => setMode('since_last')} />
            <span>
              <span className="block text-sm font-medium text-gray-800">Since last export</span>
              <span className="block text-xs text-gray-500">
                Everything created after the last export, up to now. The marker moves forward with each run, so no order reaches the ERP twice.
              </span>
            </span>
          </label>
          {mode === 'since_last' && firstRun && (
            <div className="ml-6">
              <label className="block text-xs font-medium text-gray-700 mb-1">Start from (first export only — leave blank for everything)</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-48`} />
            </div>
          )}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="erp-mode" className="mt-1" checked={mode === 'range'} onChange={() => setMode('range')} />
            <span>
              <span className="block text-sm font-medium text-gray-800">Custom date range</span>
              <span className="block text-xs text-gray-500">Re-export any span of order dates (store calendar). Useful for reconciliation.</span>
            </span>
          </label>
          {mode === 'range' && (
            <div className="ml-6 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-44`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-44`} />
              </div>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={excludeCancelled} onChange={(e) => setExcludeCancelled(e.target.checked)} />
          Skip cancelled orders
        </label>

        {/* Preview */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          {previewing ? (
            <span className="text-emerald-800">Counting orders…</span>
          ) : previewError ? (
            <span className="text-red-600">{previewError}</span>
          ) : preview ? (
            preview.order_count > 0 ? (
              <div className="text-emerald-900">
                <span className="font-semibold">{preview.order_count} order{preview.order_count === 1 ? '' : 's'}</span>
                {' · '}<span className="font-semibold">{preview.item_count} line{preview.item_count === 1 ? '' : 's'}</span>
                <span className="text-emerald-800"> · {fmtDateTime(preview.first_order_at)} → {fmtDateTime(preview.last_order_at)}</span>
                {preview.capped && (
                  <div className="text-xs text-amber-700 mt-1">
                    More than {preview.max_orders} orders — this run exports the first {preview.max_orders}; run again for the rest.
                  </div>
                )}
              </div>
            ) : (
              <span className="text-emerald-900">No orders in this window — nothing to export.</span>
            )
          ) : (
            <span className="text-gray-500">{mode === 'range' ? 'Pick both dates to preview.' : '—'}</span>
          )}
        </div>

        {/* ERP mapping settings */}
        <div>
          <button type="button" onClick={() => setShowConfig((v) => !v)} className="text-xs font-medium text-gray-600 hover:text-gray-900">
            {showConfig ? '▾' : '▸'} ERP mapping settings
          </button>
          {showConfig && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sales channel — website orders</label>
                <input type="text" value={config.website_channel_code}
                  onChange={(e) => setConfig((c) => ({ ...c, website_channel_code: e.target.value }))} className={inputCls} />
                <p className="text-[11px] text-gray-500 mt-1">"Order Sales Channel" for storefront &amp; Bulk Order Platform orders (the ERP's own code).</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sales channel — admin-created orders</label>
                <input type="text" value={config.admin_channel_code}
                  onChange={(e) => setConfig((c) => ({ ...c, admin_channel_code: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Default sales person</label>
                <input type="text" value={config.default_salesperson}
                  onChange={(e) => setConfig((c) => ({ ...c, default_salesperson: e.target.value }))} className={inputCls} placeholder="Used when the order has none" />
              </div>
              <p className="sm:col-span-3 text-[11px] text-gray-500">Saved with the next export.</p>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
        {result && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{result}</div>}

        {/* Recent runs */}
        {status && status.runs.length > 0 && (
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">Recent exports ({status.runs.length})</summary>
            <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
              {status.runs.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-2">
                  <span className="text-gray-900">{fmtDateTime(r.at)}</span>
                  <span>· {r.mode === 'range' ? 'custom range' : 'since last'}</span>
                  <span>· {r.order_count} orders / {r.item_count} lines</span>
                  {r.first_order && <span>· {r.first_order} → {r.last_order}</span>}
                  <span>· {r.by}</span>
                  <span className="text-gray-400">· {r.file_name}</span>
                  {canManage && (
                    <button type="button" onClick={() => handleForget(r.id, `of ${fmtDateTime(r.at)} (${r.order_count} orders)`)}
                      disabled={!!forgetting || exporting}
                      className="text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                      title="The file never reached the ERP — include these orders again next time">
                      {forgetting === r.id ? 'Forgetting…' : 'Forget'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
};

export default ErpExportModal;
