import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * PARTNER PORTAL — the franchise partner's own window (migration 085; spec Part V
 * §5 + §12), the third and last of the token portals after Vendor (#45.6) and
 * Customer (#59).
 *
 * No login: the URL (/partner/:token) IS the access. Think like a small chemist
 * who holds a distributor's stock — the distributor WhatsApps them a link; on
 * their phone they see what is on their shelf, they TELL US WHAT THEY SOLD, and
 * they see the money: their commission, their settlements, their royalty bills.
 *
 * The spec calls partner-reported sell-through "the weak point" of consignment.
 * That is what the middle tab fixes: the shopkeeper types the numbers themselves,
 * against the exact shelf we believe they hold.
 *
 * WRITTEN FOR THE PERSON, NOT THE ACCOUNTANT. Three tabs, no jargon, one job per
 * screen, thumb-sized targets, and a plain sentence at the top of every card. No
 * word on this page requires an accounting education: "on your shelf", "you
 * sold", "money". Rendered OUTSIDE the admin Layout/ProtectedRoute with its own
 * tiny fetch client (the shared admin axios injects an admin JWT + camelCase
 * transforms we do not want here).
 */

// ── tiny API client ─────────────────────────────────────────────────────────
const API_VERSION = (import.meta as any).env?.VITE_API_VERSION || 'v1';
let API_BASE = (import.meta as any).env?.VITE_API_SERVER_URL || 'http://localhost:5000';
API_BASE = String(API_BASE).replace(/\/+$/, '').replace(/\/api$/, '');

/** Store key: env by default; a localStorage override points a single dev build at any store. */
function storeKey(): string {
  try {
    const o = localStorage.getItem('portal_api_key');
    if (o && o.trim()) return o.trim();
  } catch { /* ignore */ }
  return (import.meta as any).env?.VITE_API_KEY || '';
}

const PORTAL = (token: string, path: string) =>
  `${API_BASE}/api/${API_VERSION}/partner-portal/${encodeURIComponent(token)}${path}`;

const headers = () => ({ 'x-api-key': storeKey() });

async function portalGet(token: string, path: string) {
  const res = await fetch(PORTAL(token, path), { headers: headers() as any });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function portalPost(token: string, path: string, payload: any) {
  const res = await fetch(PORTAL(token, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() } as any,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const rupees = (minor?: number | string | null) => {
  const v = Number(minor ?? 0) / 100;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const prettyDate = (d?: string | null) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

interface ShelfLine {
  itemId: string; consignmentId: string; consignmentNumber: string | null; dispatchedOn: string | null;
  sku: string | null; productName: string | null; qtyAtShop: number;
  unitPriceMinor: string; lineValueMinor: string;
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

const Chip: React.FC<{ tone: 'green' | 'amber' | 'slate'; children: React.ReactNode }> = ({ tone, children }) => {
  const c = tone === 'green' ? 'bg-emerald-100 text-emerald-700'
    : tone === 'amber' ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c}`}>{children}</span>;
};

const PartnerPortal: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'invalid' | 'error' | 'ready'>('loading');
  const [tab, setTab] = useState<'shelf' | 'sold' | 'money'>('shelf');
  const [summary, setSummary] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  /** itemId → what the shopkeeper typed. Strings so the box can be empty. */
  const [sold, setSold] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const sum = await portalGet(token, '/summary');
    if (sum.status === 401) { setState('invalid'); return; }
    if (!sum.ok) { setState('error'); return; }
    setSummary(sum.body?.data ?? null);
    const [stl, inv] = await Promise.all([
      portalGet(token, '/settlements'),
      portalGet(token, '/royalty-invoices'),
    ]);
    setSettlements(Array.isArray(stl.body?.data) ? stl.body.data : []);
    setInvoices(Array.isArray(inv.body?.data) ? inv.body.data : []);
    setState('ready');
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const shelf: ShelfLine[] = useMemo(() => summary?.shelf?.lines ?? [], [summary]);

  const typedTotal = useMemo(
    () => shelf.reduce((s, l) => s + (Math.max(0, Math.round(Number(sold[l.itemId]) || 0))), 0),
    [shelf, sold]);
  const typedValueMinor = useMemo(
    () => shelf.reduce((s, l) => {
      const q = Math.max(0, Math.round(Number(sold[l.itemId]) || 0));
      return s + q * Number(l.unitPriceMinor || 0);
    }, 0),
    [shelf, sold]);

  const bump = (l: ShelfLine, delta: number) => {
    const cur = Math.max(0, Math.round(Number(sold[l.itemId]) || 0));
    const next = Math.min(l.qtyAtShop, Math.max(0, cur + delta));
    setSold({ ...sold, [l.itemId]: next === 0 ? '' : String(next) });
  };

  const submitSales = async () => {
    setMsg(''); setOkMsg('');
    const lines = shelf
      .map((l) => ({ itemId: l.itemId, qty: Math.max(0, Math.round(Number(sold[l.itemId]) || 0)) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) { setMsg('Type how many you sold next to at least one product.'); return; }
    const over = shelf.find((l) => Math.round(Number(sold[l.itemId]) || 0) > l.qtyAtShop);
    if (over) {
      setMsg(`You only have ${over.qtyAtShop} of ${over.productName || over.sku} — please check the number.`);
      return;
    }
    setSending(true);
    try {
      const res = await portalPost(token, '/report-sales', { lines });
      if (!res.ok) {
        setMsg(res.body?.message || 'That did not go through. Please try again.');
        return;
      }
      setOkMsg(res.body?.plain || res.body?.data?.plain || 'Thank you — we have recorded your sales.');
      setSold({});
      await load();
      setTab('shelf');
    } catch {
      setMsg('We could not reach the store. Please check your internet and try again.');
    } finally { setSending(false); }
  };

  const downloadInvoice = async (inv: any) => {
    setDownloading(inv.id);
    try {
      const res = await fetch(PORTAL(token, `/royalty-invoices/${inv.id}/pdf`), { headers: headers() as any });
      if (!res.ok) { setMsg('Could not prepare that bill. Please try again.'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(inv.number || 'royalty-invoice').replace(/[^\w.-]+/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setMsg('Could not prepare that bill. Please try again.');
    } finally { setDownloading(null); }
  };

  if (state === 'loading') return <CenterScreen emoji="⏳" title="Opening your shop…" />;
  if (state === 'invalid') {
    return <CenterScreen emoji="🔒" title="This link isn't valid anymore"
      subtitle="Please ask the store to send you a fresh link." />;
  }
  if (state === 'error') return <CenterScreen emoji="⚠️" title="Something went wrong" subtitle="Please try again in a moment." />;

  const partner = summary?.partner ?? {};
  const money = summary?.money ?? {};
  const owe = Number(money.total_you_owe_minor ?? 0);
  const canReport = summary?.can_report_sales !== false;

  const TABS: Array<{ k: typeof tab; label: string; icon: string }> = [
    { k: 'shelf', label: 'On your shelf', icon: '📦' },
    { k: 'sold', label: 'You sold', icon: '✍️' },
    { k: 'money', label: 'Money', icon: '💰' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-gray-900 px-5 pb-6 pt-7 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Your shop</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{partner.name || 'Your shop'}</h1>
        <p className="mt-1 text-sm text-gray-400">
          {partner.gstin ? `GSTIN ${partner.gstin}` : partner.code}
        </p>
        {summary?.plain && <p className="mt-3 text-[15px] leading-snug text-gray-200">{summary.plain}</p>}
      </header>

      {/* Big obvious tabs */}
      <nav className="sticky top-0 z-10 grid grid-cols-3 gap-1 border-b border-slate-200 bg-white px-2 py-2 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => { setTab(t.k); setMsg(''); setOkMsg(''); }}
            className={`rounded-xl px-2 py-3 text-center text-[13px] font-semibold leading-tight transition ${
              tab === t.k ? 'bg-gray-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span className="block text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {msg && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[15px] font-medium text-red-800">{msg}</div>
        )}
        {okMsg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[15px] font-medium text-emerald-800">
            ✅ {okMsg}
          </div>
        )}

        {/* ── ON YOUR SHELF ──────────────────────────────────────────────── */}
        {tab === 'shelf' && (
          <>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Stock of ours at your shop</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">
                {Number(summary?.shelf?.qty_at_shop ?? 0).toLocaleString('en-IN')}
                <span className="ml-2 text-lg font-semibold text-slate-400">units</span>
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Worth <span className="font-semibold text-slate-700">{rupees(summary?.shelf?.value_at_price_minor)}</span> at your selling price
              </p>
              {canReport && Number(summary?.shelf?.qty_at_shop ?? 0) > 0 && (
                <button
                  onClick={() => setTab('sold')}
                  className="mt-5 w-full rounded-xl bg-gray-900 py-4 text-center text-[16px] font-semibold text-white active:bg-gray-800"
                >
                  ✍️  I sold some — tell the store
                </button>
              )}
            </div>

            {shelf.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
                <div className="text-4xl">📦</div>
                <p className="mt-3 font-medium">Nothing of ours is on your shelf</p>
                <p className="mt-1 text-sm">
                  {canReport
                    ? 'When the store sends you stock it will show up here.'
                    : 'You buy your stock outright, so everything at your shop is already yours.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {shelf.map((l) => (
                  <div key={l.itemId} className="rounded-2xl bg-white p-5 shadow-sm">
                    <div className="font-bold text-slate-900">{l.productName || l.sku}</div>
                    {l.sku && <div className="mt-0.5 font-mono text-xs text-slate-400">{l.sku}</div>}
                    <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                      <div>
                        <div className="text-2xl font-bold text-slate-900">{l.qtyAtShop}</div>
                        <div className="text-xs text-slate-400">still with you</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-700">{rupees(l.unitPriceMinor)}</div>
                        <div className="text-xs text-slate-400">each</div>
                      </div>
                    </div>
                    {l.consignmentNumber && (
                      <p className="mt-3 text-xs text-slate-400">
                        Delivery {l.consignmentNumber}{l.dispatchedOn ? ` · ${prettyDate(l.dispatchedOn)}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── YOU SOLD — TELL US ─────────────────────────────────────────── */}
        {tab === 'sold' && (
          <>
            {!canReport ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
                <div className="text-4xl">🧾</div>
                <p className="mt-3 font-medium text-slate-700">You buy your stock outright</p>
                <p className="mt-1 text-sm">It is already yours the day it arrives, so there is nothing to report here.</p>
              </div>
            ) : shelf.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
                <div className="text-4xl">📦</div>
                <p className="mt-3 font-medium">There is nothing on your shelf to report</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[15px] font-semibold text-slate-900">How many did you sell?</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Tap <span className="font-semibold">+</span> or type the number next to each product, then press the
                    green button. You can only enter up to what you still have.
                  </p>
                </div>

                <div className="space-y-3">
                  {shelf.map((l) => {
                    const typed = Math.max(0, Math.round(Number(sold[l.itemId]) || 0));
                    return (
                      <div key={l.itemId} className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="font-bold text-slate-900">{l.productName || l.sku}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          You have <span className="font-semibold text-slate-600">{l.qtyAtShop}</span> · {rupees(l.unitPriceMinor)} each
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <button
                            onClick={() => bump(l, -1)}
                            disabled={typed <= 0}
                            aria-label={`One less ${l.productName || l.sku}`}
                            className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200 disabled:opacity-40"
                          >−</button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={l.qtyAtShop}
                            value={sold[l.itemId] ?? ''}
                            placeholder="0"
                            onChange={(e) => setSold({ ...sold, [l.itemId]: e.target.value })}
                            className="h-14 min-w-0 flex-1 rounded-xl border border-slate-300 text-center text-2xl font-bold text-slate-900"
                          />
                          <button
                            onClick={() => bump(l, +1)}
                            disabled={typed >= l.qtyAtShop}
                            aria-label={`One more ${l.productName || l.sku}`}
                            className="h-14 w-14 shrink-0 rounded-xl bg-slate-900 text-2xl font-bold text-white active:bg-gray-800 disabled:opacity-40"
                          >+</button>
                        </div>
                        {typed > l.qtyAtShop && (
                          <p className="mt-2 text-sm font-medium text-red-600">
                            You only have {l.qtyAtShop} — please check that number.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Sticky confirm bar — the one action on this screen */}
                <div className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">You are reporting</span>
                    <span className="font-bold text-slate-900">
                      {typedTotal} unit{typedTotal === 1 ? '' : 's'} · {rupees(typedValueMinor)}
                    </span>
                  </div>
                  <button
                    onClick={submitSales}
                    disabled={sending || typedTotal === 0}
                    className="mt-3 w-full rounded-xl bg-emerald-600 py-4 text-center text-[16px] font-bold text-white active:bg-emerald-700 disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : `✅  Yes — I sold these ${typedTotal || ''}`.trim()}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    The store is told straight away. Nothing else changes on your shelf.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {/* ── MONEY ──────────────────────────────────────────────────────── */}
        {tab === 'money' && (
          <>
            <div className={`rounded-2xl p-6 shadow-sm ${owe > 0 ? 'bg-white' : 'bg-emerald-50'}`}>
              {owe > 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-500">You owe the store</p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">{rupees(owe)}</p>
                  <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
                    {Number(money.settlement_due_minor ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">For stock you sold</span>
                        <span className="font-semibold text-slate-800">{rupees(money.settlement_due_minor)}</span>
                      </div>
                    )}
                    {Number(money.royalty_outstanding_minor ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Royalty &amp; marketing fund</span>
                        <span className="font-semibold text-slate-800">{rupees(money.royalty_outstanding_minor)}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl">✅</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">Nothing is owed</p>
                  <p className="mt-1 text-sm text-emerald-700">You are all settled up with the store. Thank you!</p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400">Your commission earned</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">{rupees(money.margin_earned_minor)}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400">Sold, not settled yet</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{rupees(money.reported_not_settled_minor)}</p>
              </div>
            </div>

            {/* Settlements */}
            <div>
              <h2 className="px-1 pb-2 pt-2 text-sm font-semibold text-slate-500">
                Settlements{settlements.length ? ` (${settlements.length})` : ''}
              </h2>
              {settlements.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
                  <div className="text-4xl">🤝</div>
                  <p className="mt-3 font-medium">No settlements yet</p>
                  <p className="mt-1 text-sm">Once you report sales, the store settles the period and it shows up here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {settlements.map((s) => (
                    <div key={s.id} className="rounded-2xl bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{s.settlement_number}</div>
                          <div className="mt-0.5 text-sm text-slate-500">
                            {s.period_from && s.period_to
                              ? `${prettyDate(s.period_from)} — ${prettyDate(s.period_to)}`
                              : prettyDate(s.created_at)}
                          </div>
                        </div>
                        <Chip tone={s.status === 'settled' ? 'green' : 'slate'}>{s.status}</Chip>
                      </div>
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">You sold</span>
                          <span className="font-semibold text-slate-800">{s.qty_sold} units · {rupees(s.gross_minor)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">You keep ({s.margin_pct}%)</span>
                          <span className="font-semibold text-emerald-700">{rupees(s.partner_margin_minor)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-100 pt-1">
                          <span className="font-medium text-slate-600">You pay the store</span>
                          <span className="text-lg font-bold text-slate-900">{rupees(s.net_due_minor)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Royalty invoices */}
            <div>
              <h2 className="px-1 pb-2 pt-2 text-sm font-semibold text-slate-500">
                Royalty &amp; marketing fund bills{invoices.length ? ` (${invoices.length})` : ''}
              </h2>
              {invoices.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
                  <div className="text-4xl">🧾</div>
                  <p className="mt-3 font-medium">No bills yet</p>
                  <p className="mt-1 text-sm">Monthly royalty and marketing-fund bills will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="rounded-2xl bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{inv.number}</div>
                          <div className="mt-0.5 text-sm text-slate-500">
                            {prettyDate(inv.period_from)} — {prettyDate(inv.period_to)}
                          </div>
                        </div>
                        <Chip tone={inv.status === 'paid' ? 'green' : 'amber'}>
                          {inv.status === 'paid' ? 'Paid' : 'To pay'}
                        </Chip>
                      </div>
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Royalty ({inv.royalty_pct}%)</span>
                          <span className="font-semibold text-slate-800">{rupees(inv.royalty_minor)}</span>
                        </div>
                        {Number(inv.marketing_fund_minor ?? 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Marketing fund ({inv.marketing_fund_pct}%)</span>
                            <span className="font-semibold text-slate-800">{rupees(inv.marketing_fund_minor)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-500">GST</span>
                          <span className="font-semibold text-slate-800">{rupees(inv.tax_minor)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-100 pt-1">
                          <span className="font-medium text-slate-600">Total</span>
                          <span className="text-lg font-bold text-slate-900">{rupees(inv.total_minor)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadInvoice(inv)}
                        disabled={downloading === inv.id}
                        className="mt-4 w-full rounded-xl bg-gray-900 py-3.5 text-center text-[15px] font-semibold text-white active:bg-gray-800 disabled:opacity-60"
                      >
                        {downloading === inv.id ? 'Preparing…' : '⬇  Download this bill (PDF)'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <p className="pt-2 text-center text-xs text-slate-400">
          This is your private link. Please don't share it publicly.
        </p>
      </main>
    </div>
  );
};

export default PartnerPortal;
