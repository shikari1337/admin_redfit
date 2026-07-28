import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader, Btn, Field, TextInput, StatCard, StatGrid, inr } from '../../components/erp';

/**
 * Credit Control — "Trust a customer up to ₹X; they pay within N days."
 *
 * Plain-language surface for the accounts person: search a customer, set how much
 * credit you'll extend them and their payment terms, or put them on hold. A
 * watchlist shows everyone currently over their limit or on hold, with the numbers.
 * The order desk is stopped automatically from placing an order that would push a
 * customer past what they're trusted for (a manager can still override).
 */

interface CustomerHit { customer_id: string; name: string | null; company?: string | null; phone: string | null; email?: string | null; }
interface CreditStatus {
  customer_id: string; configured: boolean; on_hold: boolean; hold_reason: string | null;
  terms_days: number | null; note: string | null;
  limit: number | null; outstanding: number; available: number | null; updated_at: string | null;
}
interface WatchRow {
  customer_id: string; name: string | null; company: string | null; phone: string | null; gstin: string | null;
  on_hold: boolean; hold_reason: string | null; terms_days: number | null;
  limit: number | null; outstanding: number; available: number | null; over_by: number;
  status: 'on_hold' | 'over_limit';
}

const label = (c: { company?: string | null; name?: string | null }) => c.company || c.name || 'Customer';

const CreditControl: React.FC = () => {
  const [wl, setWl] = useState<{ customers: WatchRow[]; summary: any } | null>(null);
  const [error, setError] = useState('');

  // search + editor
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [limit, setLimit] = useState('');
  const [terms, setTerms] = useState('');
  const [note, setNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadWatchlist = async () => {
    setError('');
    try { setWl(payload<any>(await api.get('/credit-control/watchlist'))); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { loadWatchlist(); }, []);

  const search = async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setHits([]); return; }
    try {
      const res = await api.get('/customers', { params: { search: term.trim(), limit: 8 } });
      const arr = payload<any>(res);
      setHits(Array.isArray(arr) ? arr : (arr?.data ?? []));
    } catch { setHits([]); }
  };

  const openCustomer = async (c: CustomerHit) => {
    setPicked(c); setHits([]); setQ(''); setMsg('');
    try {
      const s = payload<CreditStatus>(await api.get(`/credit-control/status/${c.customer_id}`));
      setStatus(s);
      setLimit(s.limit == null ? '' : String(s.limit));
      setTerms(s.terms_days == null ? '' : String(s.terms_days));
      setNote(s.note ?? '');
      setHoldReason(s.hold_reason ?? '');
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const saveSettings = async () => {
    if (!picked) return;
    setBusy(true); setMsg(''); setError('');
    try {
      const body = {
        creditLimit: limit.trim() === '' ? null : Number(limit),
        paymentTermsDays: terms.trim() === '' ? null : Number(terms),
        note: note.trim() === '' ? null : note.trim(),
      };
      const s = payload<CreditStatus>(await api.put(`/credit-control/settings/${picked.customer_id}`, body));
      setStatus(s); setMsg('Saved.'); loadWatchlist();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const toggleHold = async (onHold: boolean) => {
    if (!picked) return;
    setBusy(true); setMsg(''); setError('');
    try {
      const s = payload<CreditStatus>(await api.put(`/credit-control/hold/${picked.customer_id}`, { onHold, reason: onHold ? holdReason.trim() : null }));
      setStatus(s); setMsg(onHold ? 'Customer put on hold.' : 'Hold released.'); loadWatchlist();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const s = wl?.summary;
  const exposure = s?.total_exposure ?? 0;
  const flagged = s?.count ?? 0;

  return (
    <Page>
      <PageHeader
        title="Credit Control"
        description="Decide how much credit each customer gets and how long they have to pay. We'll stop the order desk from letting a customer go past what you trust them for."
      />

      <StatGrid cols={3}>
        <StatCard label="At-risk exposure" value={inr(exposure)} tone={exposure > 0 ? 'bad' : 'default'}
          sub={`${flagged} customer${flagged === 1 ? '' : 's'} over limit or on hold`} />
        <StatCard label="On credit hold" value={String(s?.on_hold_count ?? 0)} tone={(s?.on_hold_count ?? 0) > 0 ? 'warn' : 'default'} />
        <StatCard label="Over their limit" value={String(s?.over_limit_count ?? 0)} tone={(s?.over_limit_count ?? 0) > 0 ? 'bad' : 'default'} />
      </StatGrid>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ── editor ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-gray-900">Set a customer's credit</div>

        {!picked && (
          <div className="relative max-w-md">
            <Field label="Find a customer">
              <TextInput placeholder="Search by name, phone or email…" value={q} onChange={(e) => search(e.target.value)} />
            </Field>
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {hits.map((h) => (
                  <button key={h.customer_id} onClick={() => openCustomer(h)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                    <span className="font-medium text-gray-900">{label(h)}</span>
                    {h.phone && <span className="text-gray-500"> · {h.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {picked && status && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">{label(picked)}</div>
                {picked.phone && <div className="text-xs text-gray-500">{picked.phone}</div>}
              </div>
              <Btn variant="ghost" onClick={() => { setPicked(null); setStatus(null); }}>Pick another customer</Btn>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">They currently owe</div>
                <div className="text-lg font-bold text-gray-900">{inr(status.outstanding)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Credit limit</div>
                <div className="text-lg font-bold text-gray-900">{status.limit == null ? 'No limit' : inr(status.limit)}</div>
              </div>
              <div className={`rounded-lg border p-3 ${status.available != null && status.available < 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="text-xs text-gray-500">Headroom left</div>
                <div className={`text-lg font-bold ${status.available != null && status.available < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {status.available == null ? '—' : inr(status.available)}
                </div>
              </div>
              <div className={`rounded-lg border p-3 ${status.on_hold ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="text-xs text-gray-500">Status</div>
                <div className={`text-lg font-bold ${status.on_hold ? 'text-red-700' : 'text-emerald-700'}`}>{status.on_hold ? 'On hold' : 'OK'}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Trust them up to (₹) — leave blank for no limit">
                <TextInput type="number" min="0" step="0.01" placeholder="e.g. 50000" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
              <Field label="They pay within (days) — leave blank for due-on-receipt">
                <TextInput type="number" min="0" step="1" placeholder="e.g. 30" value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
            </div>
            <Field label="Note (optional)">
              <TextInput placeholder="Anything the team should know" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={saveSettings} disabled={busy}>Save credit settings</Btn>
              {!status.on_hold ? (
                <>
                  <TextInput placeholder="Reason for hold (optional)" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} className="max-w-xs" />
                  <Btn variant="danger" onClick={() => toggleHold(true)} disabled={busy}>Put on hold</Btn>
                </>
              ) : (
                <Btn variant="success" onClick={() => toggleHold(false)} disabled={busy}>Release hold</Btn>
              )}
              {msg && <span className="text-sm text-emerald-700">{msg}</span>}
            </div>
            {status.on_hold && status.hold_reason && (
              <div className="text-sm text-red-700">On hold: {status.hold_reason}</div>
            )}
          </div>
        )}
      </div>

      {/* ── watchlist ──────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-900">Watchlist — customers over limit or on hold</div>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Why</th>
              <th className="px-4 py-2 text-right">Owes</th>
              <th className="px-4 py-2 text-right">Limit</th>
              <th className="px-4 py-2 text-right">Over by</th>
              <th className="px-4 py-2 text-right">Terms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!wl || wl.customers.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No customers over limit or on hold. 🎉</td></tr>
            )}
            {wl?.customers.map((c) => (
              <tr key={c.customer_id} onClick={() => openCustomer({ customer_id: c.customer_id, name: c.name, company: c.company, phone: c.phone })}
                className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{label(c)}</div>
                  {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                </td>
                <td className="px-4 py-2">
                  {c.status === 'on_hold'
                    ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">On hold{c.hold_reason ? `: ${c.hold_reason}` : ''}</span>
                    : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Over limit</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">{inr(c.outstanding)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-600">{c.limit == null ? '—' : inr(c.limit)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-red-700">{c.over_by > 0 ? inr(c.over_by) : '—'}</td>
                <td className="px-4 py-2 text-right text-gray-600">{c.terms_days == null ? '—' : `${c.terms_days}d`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
};

export default CreditControl;
