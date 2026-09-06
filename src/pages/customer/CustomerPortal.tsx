import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { localeDate } from '../../utils/date';

/**
 * Customer Portal — the B2B buyer's self-service window (spec §12), the
 * customer-facing mirror of the Vendor Portal.
 *
 * No login: the URL token (/customer/:token) IS the access. Think like a small
 * pharmacy that buys wholesale — the seller WhatsApps them a link; on their
 * phone they see what they owe, every invoice and payment, and can download
 * their statement PDF. Mobile-first, plain language, big tap targets. Rendered
 * OUTSIDE the admin Layout/ProtectedRoute with its own tiny fetch client (the
 * shared admin axios injects an admin JWT + camelCase transforms we don't want).
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

const PORTAL = (path: string) => `${API_BASE}/api/${API_VERSION}/customer-portal${path}`;

async function portalGet(token: string, path: string) {
  const res = await fetch(PORTAL(path), {
    headers: { 'x-api-key': storeKey(), 'x-portal-token': token },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const rupees = (n?: number | string | null) => {
  const v = Number(n ?? 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const prettyDate = (d?: string | null) => {
  if (!d) return '';
  try { return localeDate(d, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-IN'); }
  catch { return d; }
};
// Days since a date, derived from the date itself so it can never contradict the
// shown date (the AR oldest-unpaid age field is computed independently upstream).
const daysSince = (d?: string | null): number | null => {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

function PaidChip({ paid }: { paid: boolean }) {
  return paid
    ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Paid</span>
    : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Unpaid</span>;
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

const CustomerPortal: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'invalid' | 'error' | 'ready'>('loading');
  const [customer, setCustomer] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    const me = await portalGet(token, '/me');
    if (me.status === 401) { setState('invalid'); return; }
    if (!me.ok) { setState('error'); return; }
    setCustomer(me.body?.data ?? null);
    const [sumRes, ordRes] = await Promise.all([portalGet(token, '/summary'), portalGet(token, '/orders')]);
    setSummary(sumRes.body?.data ?? null);
    setOrders(Array.isArray(ordRes.body?.data) ? ordRes.body.data : []);
    setState('ready');
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const downloadStatement = async () => {
    setDownloading(true);
    try {
      const res = await fetch(PORTAL('/statement/pdf'), {
        headers: { 'x-api-key': storeKey(), 'x-portal-token': token },
      });
      if (!res.ok) { alert('Could not prepare your statement. Please try again.'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'statement.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Could not prepare your statement. Please try again.');
    } finally { setDownloading(false); }
  };

  if (state === 'loading') return <CenterScreen emoji="⏳" title="Opening your account…" />;
  if (state === 'invalid') return <CenterScreen emoji="🔒" title="This link isn't valid anymore" subtitle="Please ask the store to send you a fresh link." />;
  if (state === 'error') return <CenterScreen emoji="⚠️" title="Something went wrong" subtitle="Please try again in a moment." />;

  const owed = Number(summary?.outstanding ?? 0);
  const oldest = summary?.oldest_unpaid;
  const lastPay = summary?.last_payment;
  const displayName = customer?.company || customer?.name || 'Your account';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <header className="bg-gray-900 px-5 pb-6 pt-7 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Account statement</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{displayName}</h1>
        {customer?.gstin && <p className="mt-1 text-sm text-gray-400">GSTIN {customer.gstin}</p>}
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {/* Big "You currently owe ₹X" card */}
        <div className={`rounded-2xl p-6 shadow-sm ${owed > 0 ? 'bg-white' : 'bg-emerald-50'}`}>
          {owed > 0 ? (
            <>
              <p className="text-sm font-medium text-slate-500">You currently owe</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">{rupees(owed)}</p>
              {oldest?.date && (() => {
                const ago = daysSince(oldest.date);
                return (
                  <p className="mt-2 text-sm text-amber-700">
                    Oldest unpaid invoice: {prettyDate(oldest.date)}
                    {ago !== null ? ` · ${ago} days ago` : ''}
                  </p>
                );
              })()}
            </>
          ) : (
            <>
              <p className="text-2xl">✅</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">You're all settled up</p>
              <p className="mt-1 text-sm text-emerald-700">There's nothing outstanding on your account. Thank you!</p>
            </>
          )}

          {/* Ageing chips (only when owing) */}
          {owed > 0 && summary?.ageing && (
            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-100 pt-4 text-center">
              {[
                { k: 'd0_30', label: '0–30d' },
                { k: 'd31_60', label: '31–60d' },
                { k: 'd61_90', label: '61–90d' },
                { k: 'd90_plus', label: '90+ d' },
              ].map(({ k, label }) => {
                const v = Number(summary.ageing[k] ?? 0);
                return (
                  <div key={k}>
                    <div className={`text-sm font-bold ${k === 'd90_plus' && v > 0 ? 'text-red-600' : 'text-slate-800'}`}>{rupees(v)}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {lastPay?.date && (
            <p className="mt-4 text-sm text-slate-500">
              Last payment received: <span className="font-medium text-slate-700">{rupees(lastPay.amount)}</span> on {prettyDate(lastPay.date)}
            </p>
          )}

          <button
            onClick={downloadStatement}
            disabled={downloading}
            className="mt-5 w-full rounded-xl bg-gray-900 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-gray-800 active:bg-gray-800 disabled:opacity-60"
          >
            {downloading ? 'Preparing…' : '⬇  Download statement (PDF)'}
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total billed</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{rupees(summary?.total_billed)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total paid</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{rupees(summary?.total_collected)}</p>
          </div>
        </div>

        {/* Invoices / orders */}
        <div>
          <h2 className="px-1 pb-2 pt-2 text-sm font-semibold text-slate-500">
            Your invoices{orders.length ? ` (${orders.length})` : ''}
          </h2>
          {orders.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
              <div className="text-4xl">🧾</div>
              <p className="mt-3 font-medium">No invoices yet</p>
              <p className="mt-1 text-sm">Your invoices and their payment status will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{o.invoice_number || o.order_id}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {prettyDate(o.date)}
                        {o.order_type && o.order_type !== 'retail' ? ` · ${o.order_type}` : ''}
                      </div>
                    </div>
                    <PaidChip paid={!!o.paid} />
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                    <span className="text-sm text-slate-500">Amount</span>
                    <span className="text-xl font-bold text-slate-900">{rupees(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="pt-2 text-center text-xs text-slate-400">
          This is your private link. Please don't share it publicly.
        </p>
      </main>
    </div>
  );
};

export default CustomerPortal;
