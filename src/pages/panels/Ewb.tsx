import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader } from '../../components/erp';
import { FileText } from 'lucide-react';

/**
 * e-Way Bills — the dispatcher's screen (GST Rule 138).
 *
 * Two ways to raise one, one register:
 *  - OFFLINE / NIC-bulk (works today, no GSP): pick an order that's leaving,
 *    check the pre-filled details, Download JSON, upload it on ewaybillgst.gov.in,
 *    type the number the portal gives back.
 *  - API: when the store has entered NIC API credentials, Generate directly.
 *
 * Kept dispatcher-simple: a "Needs an e-way bill" worklist on top, a pre-filled
 * form, and clear 3-step portal instructions.
 */

type Validation = { level: 'error' | 'warning' | 'info'; code: string; message: string };
type PendingOrder = {
  id: string; order_number: string; total: number; created_at: string;
  ship_city: string | null; ship_state: string | null; invoice_number: string | null;
};
type EwbDoc = {
  id: string; order_number?: string; doc_number: string; doc_date: string;
  status: string; ewb_number: string | null; total_value_minor: string;
  to_address: any; vehicle_no: string | null; transporter_id: string | null;
  valid_until: string | null; created_at: string; json_payload: any;
};
type ConnStatus = {
  configured: boolean; source: string | null; missing: string[];
  gstin: string; username: string; baseUrl: string; pathPrefix: string;
  environment: string; provider: string;
  passwordSet: boolean; clientSecretSet: boolean; publicKeySet: boolean; enabled: boolean;
};

const money = (minor: string) => `₹${(Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const chip = (s: string) => {
  const m: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', generated: 'bg-blue-50 text-blue-700',
    entered: 'bg-emerald-50 text-emerald-700', api_generated: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-50 text-red-700',
  };
  return m[s] ?? 'bg-gray-100 text-gray-700';
};
const label: Record<string, string> = {
  draft: 'Draft', generated: 'JSON downloaded', entered: 'e-Way bill #',
  api_generated: 'Generated (API)', cancelled: 'Cancelled',
};

const Ewb: React.FC = () => {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [thresholdInr, setThresholdInr] = useState(50000);
  const [docs, setDocs] = useState<EwbDoc[]>([]);
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Build form (selected order).
  const [sel, setSel] = useState<PendingOrder | null>(null);
  const [preview, setPreview] = useState<{ meta: any; validations: Validation[] } | null>(null);
  const [form, setForm] = useState({ transporterId: '', transporterName: '', vehicleNo: '', distanceKm: '', transMode: '1' });
  const [busy, setBusy] = useState(false);
  const [builtDoc, setBuiltDoc] = useState<EwbDoc | null>(null);
  const [builtValidations, setBuiltValidations] = useState<Validation[]>([]);

  const loadAll = async () => {
    setError('');
    try {
      const [p, l, c] = await Promise.all([
        api.get('/ewb/pending-orders'),
        api.get('/ewb'),
        api.get('/ewb/settings/connection'),
      ]);
      setPending(p.data.rows ?? []);
      setThresholdInr(p.data.thresholdInr ?? 50000);
      setDocs(l.data.rows ?? []);
      setConn(payload<ConnStatus>(c));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { loadAll(); }, []);

  const openBuild = async (o: PendingOrder) => {
    setSel(o); setBuiltDoc(null); setBuiltValidations([]); setPreview(null);
    setForm({ transporterId: '', transporterName: '', vehicleNo: '', distanceKm: '', transMode: '1' });
    try {
      const res = await api.post('/ewb/preview', { orderId: o.order_number });
      setPreview(payload(res));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const generate = async () => {
    if (!sel) return;
    setBusy(true); setError('');
    try {
      const res = await api.post('/ewb/build', {
        orderId: sel.order_number,
        transporterId: form.transporterId || null,
        transporterName: form.transporterName || null,
        vehicleNo: form.vehicleNo || null,
        transMode: form.transMode,
        distanceKm: form.distanceKm ? Number(form.distanceKm) : 0,
      });
      const p = payload<{ doc: EwbDoc; validations: Validation[] }>(res);
      setBuiltDoc(p.doc); setBuiltValidations(p.validations ?? []);
      await loadAll();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const downloadJson = async (doc: EwbDoc) => {
    try {
      const res = await api.get(`/ewb/${doc.id}/json`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ewb-bulk-${doc.doc_number}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      loadAll();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <Page>
      <PageHeader
        icon={FileText}
        title="e-Way Bills"
        description={<>An e-way bill is required for consignments of {money(String(thresholdInr * 100))} or more (GST Rule 138).
          Pick an order that's leaving, check the details, then either download the JSON for the NIC portal
          or generate it directly if your API is connected.</>}
        actions={
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50">
            <span className={`inline-block h-2 w-2 rounded-full ${conn?.configured ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            API {conn?.configured ? 'connected' : 'not set up'} · Settings
          </button>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ── Needs an e-way bill (worklist) ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Needs an e-way bill</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Order</th><th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2">Destination</th><th className="px-4 py-2">Date</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pending.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No orders above {money(String(thresholdInr * 100))} are waiting for an e-way bill.
                </td></tr>
              )}
              {pending.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{o.order_number}
                    {o.invoice_number && <span className="ml-2 text-xs text-gray-400">{o.invoice_number}</span>}</td>
                  <td className="px-4 py-2 text-right font-mono">₹{Number(o.total).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2">{[o.ship_city, o.ship_state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{o.created_at}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openBuild(o)}
                      className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                      e-Way Bill →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Build form (selected order) ── */}
      {sel && (
        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">e-Way Bill for {sel.order_number}</h2>
            <button onClick={() => { setSel(null); setBuiltDoc(null); }} className="text-sm text-gray-500 hover:text-gray-800">Close ✕</button>
          </div>

          {preview && (
            <div className="mb-4 grid gap-3 rounded border bg-white p-3 text-sm sm:grid-cols-2">
              <div><span className="text-gray-500">From (you):</span> {preview.meta.fromGstin || '—'} · {preview.meta.fromAddress?.place} · {preview.meta.fromStateCode}</div>
              <div><span className="text-gray-500">To:</span> {preview.meta.toGstin} · {preview.meta.toAddress?.place} · {preview.meta.toAddress?.pincode}</div>
              <div><span className="text-gray-500">Document:</span> {preview.meta.docNumber} ({preview.meta.docDate})</div>
              <div><span className="text-gray-500">Value:</span> ₹{Number(preview.meta.totInvValue).toLocaleString('en-IN')} · {preview.meta.hsnLines?.length} item(s)</div>
            </div>
          )}

          {preview && preview.validations.length > 0 && (
            <ul className="mb-4 space-y-1 text-sm">
              {preview.validations.map((v, i) => (
                <li key={i} className={v.level === 'error' ? 'text-red-700' : v.level === 'warning' ? 'text-amber-700' : 'text-gray-500'}>
                  {v.level === 'error' ? '⛔' : v.level === 'warning' ? '⚠️' : 'ℹ️'} {v.message}
                </li>
              ))}
            </ul>
          )}

          {!builtDoc && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">
                  <span className="text-gray-600">Transporter ID</span>
                  <input value={form.transporterId} onChange={(e) => setForm({ ...form, transporterId: e.target.value })}
                    placeholder="15-digit transporter ID" className="mt-1 w-full rounded border px-2 py-1.5" />
                  <span className="text-xs text-gray-400">Ask your transporter for their 15-digit ID — leave blank if sending by your own vehicle.</span>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Vehicle number</span>
                  <input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value.toUpperCase() })}
                    placeholder="KA01AB1234" className="mt-1 w-full rounded border px-2 py-1.5" />
                  <span className="text-xs text-gray-400">Your own vehicle, or the one the transporter gives you.</span>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Distance (km)</span>
                  <input type="number" min={0} value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                    placeholder="0" className="mt-1 w-full rounded border px-2 py-1.5" />
                  <span className="text-xs text-gray-400">Approx road distance to the delivery PIN.</span>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Mode</span>
                  <select value={form.transMode} onChange={(e) => setForm({ ...form, transMode: e.target.value })}
                    className="mt-1 w-full rounded border px-2 py-1.5">
                    <option value="1">Road</option><option value="2">Rail</option>
                    <option value="3">Air</option><option value="4">Ship</option>
                  </select>
                </label>
              </div>
              <button disabled={busy} onClick={generate}
                className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {busy ? 'Generating…' : 'Generate e-way bill'}
              </button>
            </>
          )}

          {builtDoc && <GeneratedCard doc={builtDoc} validations={builtValidations} conn={conn}
            onDownload={() => downloadJson(builtDoc)} onDone={() => { setSel(null); setBuiltDoc(null); loadAll(); }}
            onChange={loadAll} setError={setError} />}
        </section>
      )}

      {/* ── Register of generated / entered e-way bills ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">e-Way bills</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Order / Doc</th><th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">EWB #</th><th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2">Valid until</th><th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No e-way bills yet.</td></tr>
              )}
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2"><div className="font-medium">{d.order_number ?? d.doc_number}</div>
                    <div className="text-xs text-gray-400">{d.doc_number} · {d.doc_date}</div></td>
                  <td className="px-4 py-2"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-gray-500/10 ${chip(d.status)}`}>{label[d.status] ?? d.status}</span></td>
                  <td className="px-4 py-2 font-mono">{d.ewb_number ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{money(d.total_value_minor)}</td>
                  <td className="px-4 py-2 text-gray-500">{d.valid_until ? d.valid_until.slice(0, 10) : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <RowActions doc={d} conn={conn} onDownload={() => downloadJson(d)} onChange={loadAll} setError={setError} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showSettings && <SettingsDrawer conn={conn} onClose={() => setShowSettings(false)} onSaved={loadAll} setError={setError} />}
    </Page>
  );
};

// ── The result card after building (download + instructions + paste-back) ──────

const GeneratedCard: React.FC<{
  doc: EwbDoc; validations: Validation[]; conn: ConnStatus | null;
  onDownload: () => void; onDone: () => void; onChange: () => void;
  setError: (s: string) => void;
}> = ({ doc, validations, conn, onDownload, onDone, setError }) => {
  const [ewbNumber, setEwbNumber] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = validations.some((v) => v.level === 'error');

  const enterNumber = async () => {
    if (!ewbNumber.trim()) return;
    setBusy(true);
    try {
      await api.post(`/ewb/${doc.id}/entered`, { ewbNumber: ewbNumber.trim(), validUntil: validUntil || null });
      onDone();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const generateApi = async () => {
    setBusy(true);
    try {
      await api.post(`/ewb/${doc.id}/generate-api`, {});
      onDone();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded border bg-white p-4">
      {blocked && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        Fix the errors above before this e-way bill will be accepted by the portal.</div>}

      <div className="flex flex-wrap gap-2">
        <button onClick={onDownload} className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700">
          ⬇ Download JSON
        </button>
        {conn?.configured && (
          <button disabled={busy} onClick={generateApi}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            ⚡ Generate via API
          </button>
        )}
      </div>

      <ol className="mt-4 space-y-1 rounded bg-gray-50 p-3 text-sm text-gray-700">
        <li><b>1.</b> Go to <a className="font-medium text-gray-900 underline" href="https://ewaybillgst.gov.in" target="_blank" rel="noreferrer">ewaybillgst.gov.in</a> → e-Way Bill → <b>Bulk Generation</b>.</li>
        <li><b>2.</b> Upload the JSON file you just downloaded and generate.</li>
        <li><b>3.</b> Type the e-way bill number the portal shows you back here.</li>
      </ol>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <input value={ewbNumber} onChange={(e) => setEwbNumber(e.target.value)}
          placeholder="e-Way bill number from the portal" className="rounded border px-2 py-1.5 text-sm sm:col-span-2" />
        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
          className="rounded border px-2 py-1.5 text-sm" title="Valid until (optional)" />
      </div>
      <button disabled={busy || !ewbNumber.trim()} onClick={enterNumber}
        className="mt-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        Save e-way bill number
      </button>
    </div>
  );
};

// ── Per-row actions in the register ────────────────────────────────────────────

const RowActions: React.FC<{
  doc: EwbDoc; conn: ConnStatus | null; onDownload: () => void; onChange: () => void; setError: (s: string) => void;
}> = ({ doc, conn, onDownload, onChange, setError }) => {
  const cancel = async () => {
    const remark = window.prompt('Reason for cancelling this e-way bill?');
    if (!remark) return;
    try { await api.post(`/ewb/${doc.id}/cancel`, { reasonCode: 4, remark }); onChange(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  const canCancel = ['entered', 'api_generated'].includes(doc.status);
  const canApi = conn?.configured && doc.status !== 'cancelled' && !doc.ewb_number;
  return (
    <div className="inline-flex gap-1">
      <button onClick={onDownload} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">JSON</button>
      {canApi && <button onClick={async () => {
        try { await api.post(`/ewb/${doc.id}/generate-api`, {}); onChange(); }
        catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
      }} className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Generate API</button>}
      {canCancel && <button onClick={cancel} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Cancel</button>}
    </div>
  );
};

// ── API credentials drawer ─────────────────────────────────────────────────────

const SettingsDrawer: React.FC<{
  conn: ConnStatus | null; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}> = ({ conn, onClose, onSaved, setError }) => {
  const [f, setF] = useState({
    environment: conn?.environment ?? 'sandbox', baseUrl: conn?.baseUrl ?? '', pathPrefix: conn?.pathPrefix ?? '',
    gstin: conn?.gstin ?? '', username: conn?.username ?? '', password: '', clientId: '', clientSecret: '', publicKey: '',
  });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    setBusy(true);
    try { await api.put('/ewb/settings/credentials', f); onSaved(); setTest(null); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };
  const runTest = async () => {
    setBusy(true);
    try { const r = await api.post('/ewb/settings/test-connection', {}); setTest(payload(r)); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">e-Way Bill API</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Connect the NIC e-way bill API to generate directly. The offline "Download JSON" path always works without this.
        </p>

        {/* Two separate facts: what's SAVED vs whether it CONNECTS. */}
        <div className="mb-4 grid grid-cols-2 gap-2 rounded border bg-gray-50 p-3 text-xs">
          <div>Credentials: <b>{conn?.configured ? 'complete' : 'incomplete'}</b>{conn?.source ? ` (${conn.source})` : ''}</div>
          <div>Password: <b>{conn?.passwordSet ? 'saved' : 'not set'}</b></div>
          <div>Public key: <b>{conn?.publicKeySet ? 'saved' : 'not set'}</b></div>
          <div>Connection: <b className={test?.ok ? 'text-emerald-700' : test ? 'text-red-700' : ''}>{test ? (test.ok ? 'OK' : 'failed') : 'not tested'}</b></div>
        </div>
        {conn && conn.missing.length > 0 && (
          <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">Still needed: {conn.missing.join(', ')}</div>
        )}

        <div className="space-y-3 text-sm">
          <label className="block"><span className="text-gray-600">Environment</span>
            <select value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5">
              <option value="sandbox">Sandbox (test)</option><option value="production">Production</option>
            </select></label>
          <label className="block"><span className="text-gray-600">API base URL</span>
            <input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="https://…" className="mt-1 w-full rounded border px-2 py-1.5" /></label>
          <label className="block"><span className="text-gray-600">Path prefix (optional)</span>
            <input value={f.pathPrefix} onChange={(e) => setF({ ...f, pathPrefix: e.target.value })} placeholder="/v1.03" className="mt-1 w-full rounded border px-2 py-1.5" /></label>
          <label className="block"><span className="text-gray-600">GSTIN</span>
            <input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
          <label className="block"><span className="text-gray-600">API username</span>
            <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
          <label className="block"><span className="text-gray-600">API password {conn?.passwordSet && <em className="text-gray-400">(leave blank to keep)</em>}</span>
            <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
          <details className="rounded border p-2">
            <summary className="cursor-pointer text-gray-600">GSP / advanced</summary>
            <div className="mt-2 space-y-2">
              <label className="block"><span className="text-gray-600">Client ID</span>
                <input value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="block"><span className="text-gray-600">Client secret {conn?.clientSecretSet && <em className="text-gray-400">(leave blank to keep)</em>}</span>
                <input type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="block"><span className="text-gray-600">NIC public key (PEM) {conn?.publicKeySet && <em className="text-gray-400">(leave blank to keep)</em>}</span>
                <textarea value={f.publicKey} onChange={(e) => setF({ ...f, publicKey: e.target.value })} rows={3} className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" /></label>
            </div>
          </details>
        </div>

        <div className="mt-4 flex gap-2">
          <button disabled={busy} onClick={save} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">Save</button>
          <button disabled={busy} onClick={runTest} className="rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">Test connection</button>
        </div>
        {test && <div className={`mt-3 rounded px-3 py-2 text-sm ${test.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{test.message}</div>}
      </div>
    </div>
  );
};

export default Ewb;
