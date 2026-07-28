import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Vendor Portal — the supplier-facing surface (spec §12 + §5).
 *
 * No login: the URL token (/vendor/:token) IS the access. Mobile-first, plain
 * language, big tap targets — built for a small supplier opening a WhatsApp
 * link on their phone. Rendered OUTSIDE the admin Layout/ProtectedRoute, so it
 * uses its own self-contained styling and its own tiny fetch client (the shared
 * admin axios injects an admin JWT + camelCase transforms we don't want here).
 */

// ── tiny API client ─────────────────────────────────────────────────────────
const API_VERSION = (import.meta as any).env?.VITE_API_VERSION || 'v1';
let API_BASE = (import.meta as any).env?.VITE_API_SERVER_URL || 'http://localhost:5000';
API_BASE = String(API_BASE).replace(/\/+$/, '').replace(/\/api$/, '');
// Store key: env by default; a localStorage override lets a single dev admin
// build point the portal at any store (used by the headless smoke drive).
function storeKey(): string {
  try {
    const o = localStorage.getItem('portal_api_key');
    if (o && o.trim()) return o.trim();
  } catch { /* ignore */ }
  return (import.meta as any).env?.VITE_API_KEY || '';
}

async function portalGet(token: string, path: string) {
  const res = await fetch(`${API_BASE}/api/${API_VERSION}/vendor-portal${path}`, {
    headers: { 'x-api-key': storeKey(), 'x-portal-token': token },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
async function portalPost(token: string, path: string, payload: any) {
  const res = await fetch(`${API_BASE}/api/${API_VERSION}/vendor-portal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': storeKey(), 'x-portal-token': token },
    body: JSON.stringify(payload || {}),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const rupees = (minor?: string | number | null) => {
  const n = Number(minor ?? 0) / 100;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const prettyDate = (d?: string | null) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const PO_STATE: Record<string, { label: string; cls: string }> = {
  issued:              { label: 'New order',       cls: 'bg-blue-100 text-blue-700' },
  partially_received:  { label: 'Partly received', cls: 'bg-amber-100 text-amber-700' },
  received:            { label: 'Received in full', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:           { label: 'Cancelled',       cls: 'bg-slate-200 text-slate-600' },
};

function BillChip({ status, paid }: { status: string; paid: boolean }) {
  if (paid) return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Paid</span>;
  const label = status === 'recorded' ? 'Received' : status === 'approved' ? 'Approved — payment due' : status === 'cancelled' ? 'Cancelled' : 'Unpaid';
  return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{label}</span>;
}

// ── screens ───────────────────────────────────────────────────────────────────
function CenterScreen({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">{emoji}</div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

const VendorPortal: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'invalid' | 'error' | 'ready'>('loading');
  const [vendor, setVendor] = useState<any>(null);
  const [tab, setTab] = useState<'orders' | 'bills'>('orders');
  const [pos, setPos] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const me = await portalGet(token, '/me');
    if (me.status === 401) { setState('invalid'); return; }
    if (!me.ok) { setState('error'); return; }
    setVendor(me.body?.data ?? null);
    const [poRes, billRes] = await Promise.all([portalGet(token, '/pos'), portalGet(token, '/bills')]);
    setPos(Array.isArray(poRes.body?.data) ? poRes.body.data : []);
    setBills(Array.isArray(billRes.body?.data) ? billRes.body.data : []);
    setState('ready');
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (po: any) => {
    setAckingId(po.id);
    try {
      const res = await portalPost(token, `/pos/${po.id}/ack`, {});
      if (res.ok && res.body?.data) {
        setPos((prev) => prev.map((p) => p.id === po.id ? { ...p, acknowledgedAt: res.body.data.acknowledgedAt } : p));
      } else {
        alert('Could not confirm this order. Please try again.');
      }
    } finally { setAckingId(null); }
  };

  if (state === 'loading') return <CenterScreen emoji="⏳" title="Opening your portal…" />;
  if (state === 'invalid') return <CenterScreen emoji="🔒" title="This link isn't valid anymore" subtitle="Please ask your contact at the store to send you a fresh link." />;
  if (state === 'error') return <CenterScreen emoji="⚠️" title="Something went wrong" subtitle="Please try again in a moment." />;

  const waitingCount = pos.filter((p) => !p.acknowledgedAt && p.status !== 'cancelled').length;
  const unpaidCount = bills.filter((b) => !b.paid && b.status !== 'cancelled').length;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <header className="bg-gray-900 px-5 pb-6 pt-7 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Supplier portal</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{vendor?.business_name || 'Vendor'}</h1>
        {vendor?.gst_number && <p className="mt-1 text-sm text-gray-400">GSTIN {vendor.gst_number}</p>}
      </header>

      {/* Tabs */}
      <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-white shadow-sm">
        {(['orders', 'bills'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 px-4 py-3.5 text-sm font-semibold transition ${
              tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-slate-400'
            }`}
          >
            {t === 'orders' ? `Orders${waitingCount ? ` (${waitingCount})` : ''}` : `Bills${unpaidCount ? ` (${unpaidCount})` : ''}`}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {tab === 'orders' && (
          pos.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
              <div className="text-4xl">📦</div>
              <p className="mt-3 font-medium">No orders yet</p>
              <p className="mt-1 text-sm">When the store sends you a purchase order, it will show up here.</p>
            </div>
          ) : pos.map((po) => {
            const st = PO_STATE[po.status] || { label: po.status, cls: 'bg-slate-200 text-slate-600' };
            const acked = !!po.acknowledgedAt;
            return (
              <div key={po.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">Order {po.poNumber}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {prettyDate(po.orderDate)}
                      {po.expectedDate ? ` · deliver by ${prettyDate(po.expectedDate)}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                </div>

                {/* Plain-language summary */}
                <p className="mt-3 text-[15px] text-slate-700">
                  <span className="font-semibold">{po.lineCount}</span> item{po.lineCount === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold">{po.totalQty}</span> unit{po.totalQty === 1 ? '' : 's'} ·{' '}
                  worth <span className="font-semibold">{rupees(po.subtotalMinor)}</span>
                  {!acked && po.status !== 'cancelled' ? ' — waiting for you to confirm.' : ''}
                </p>

                {/* Line items */}
                <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {(po.lines || []).map((l: any, i: number) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{l.name}{l.variation && l.variation !== l.name ? ` · ${l.variation}` : ''}</span>
                      <span className="shrink-0 font-medium text-slate-900">× {l.qtyOrdered}</span>
                    </li>
                  ))}
                </ul>

                {po.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">“{po.notes}”</p>}

                {/* Acknowledge */}
                <div className="mt-4">
                  {acked ? (
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <span>✅</span> You confirmed this on {prettyDate(po.acknowledgedAt)}
                    </div>
                  ) : po.status === 'cancelled' ? null : (
                    <button
                      onClick={() => acknowledge(po)}
                      disabled={ackingId === po.id}
                      className="w-full rounded-xl bg-gray-900 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-gray-800 active:bg-gray-800 disabled:opacity-60"
                    >
                      {ackingId === po.id ? 'Confirming…' : 'Acknowledge this order'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {tab === 'bills' && (
          bills.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
              <div className="text-4xl">🧾</div>
              <p className="mt-3 font-medium">No bills yet</p>
              <p className="mt-1 text-sm">Your invoices and their payment status will appear here.</p>
            </div>
          ) : bills.map((b) => (
            <div key={b.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">Bill {b.billNumber}</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {prettyDate(b.billDate)}
                    {b.poNumber ? ` · for order ${b.poNumber}` : ''}
                    {b.dueDate ? ` · due ${prettyDate(b.dueDate)}` : ''}
                  </div>
                </div>
                <BillChip status={b.status} paid={b.paid} />
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                <span className="text-sm text-slate-500">Amount</span>
                <span className="text-xl font-bold text-slate-900">{rupees(b.totalMinor)}</span>
              </div>
            </div>
          ))
        )}

        <p className="pt-2 text-center text-xs text-slate-400">
          This is your private link. Please don't share it publicly.
        </p>
      </main>
    </div>
  );
};

export default VendorPortal;
