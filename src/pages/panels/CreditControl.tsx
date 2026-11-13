import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { creditControlAPI, customersAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { CreditStatus } from '../../components/b2b/CreditPosition';
import {
  Page, PageHeader, Btn, Field, TextInput, SearchInput, StatCard, StatGrid, TabBar, EmptyState, inr,
} from '../../components/erp';

/**
 * Credit Control: "trust a customer up to Rs X; they pay within N days."
 *
 * Opens with the customers to act on (on hold or over their limit), then everyone the store
 * gives credit to. Pick a row, or find any customer, to set their limit and payment terms or
 * put them on hold. The order desk stops an order that would push a customer past their limit
 * (a manager can still override). Books `customer_credit_control` is the one record; the B2B
 * screens write through the same `creditControlAPI`.
 */

interface CustomerHit { customer_id: string; name: string | null; company?: string | null; phone: string | null }
interface WatchRow {
  customer_id: string; name: string | null; company: string | null; phone: string | null; gstin: string | null;
  on_hold: boolean; hold_reason: string | null; terms_days: number | null;
  limit: number | null; outstanding: number; available: number | null; over_by: number;
  status: 'on_hold' | 'over_limit' | 'ok';
}
interface Summary {
  count?: number; on_hold_count?: number; over_limit_count?: number; total_exposure?: number;
  on_credit_count?: number; credit_outstanding?: number;
}
type View = 'act' | 'all';

const VIEWS = [
  { key: 'act', label: 'Needs action' },
  { key: 'all', label: 'Everyone on credit' },
] as const;

const label = (c: { company?: string | null; name?: string | null }) => c.company || c.name || 'Customer';
const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreditControl: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('customers.manage');
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<View>('act');
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  // search + editor
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const [limit, setLimit] = useState('');
  const [terms, setTerms] = useState('');
  const [note, setNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async (v: View) => {
    setLoading(true); setListError('');
    try {
      const wl = (await creditControlAPI.watchlist(v === 'all')) as { customers?: WatchRow[]; summary?: Summary } | null;
      setRows(Array.isArray(wl?.customers) ? wl!.customers! : []);
      setSummary(wl?.summary ?? null);
    } catch (e: any) {
      setListError(errText(e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(view); }, [view, loadList]);

  const search = async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setHits([]); return; }
    try {
      const r: any = await customersAPI.getAll({ search: term.trim(), limit: 8 });
      const arr: any[] = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
      setHits(arr.map((h) => ({
        customer_id: String(h.customer_id ?? h.customerId ?? h.id ?? ''),
        name: h.name ?? null, company: h.company ?? null, phone: h.phone ?? null,
      })).filter((h) => h.customer_id));
    } catch { setHits([]); }
  };

  const fill = (s: CreditStatus) => {
    setStatus(s);
    setLimit(s.limit == null ? '' : String(s.limit));
    setTerms(s.terms_days == null ? '' : String(s.terms_days));
    setNote(s.note ?? '');
    setHoldReason(s.hold_reason ?? '');
  };

  const openCustomer = useCallback(async (c: CustomerHit) => {
    setPicked(c); setHits([]); setQ(''); setMsg(''); setError(''); setStatus(null); setOpening(true);
    try {
      fill((await creditControlAPI.status(c.customer_id)) as CreditStatus);
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e: any) { setError(errText(e)); }
    finally { setOpening(false); }
  }, []);

  // A link from another screen (the B2B account card) opens that customer: `?customer=<id>`.
  const linked = params.get('customer');
  useEffect(() => {
    if (!linked || !UUID.test(linked) || picked?.customer_id === linked) return;
    const row = rows.find((r) => r.customer_id === linked);
    openCustomer(row
      ? { customer_id: row.customer_id, name: row.name, company: row.company, phone: row.phone }
      : { customer_id: linked, name: params.get('name'), phone: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  const closeEditor = () => {
    setPicked(null); setStatus(null); setMsg(''); setError('');
    if (linked) { params.delete('customer'); params.delete('name'); setParams(params, { replace: true }); }
  };

  const saveSettings = async () => {
    if (!picked) return;
    const lim = limit.trim() === '' ? null : Number(limit);
    const days = terms.trim() === '' ? null : Number(terms);
    if (lim != null && (!Number.isFinite(lim) || lim < 0)) { setError('Enter the limit as an amount of zero or more, or leave it blank.'); return; }
    if (days != null && (!Number.isInteger(days) || days < 0)) { setError('Enter the payment days as a whole number, or leave it blank.'); return; }
    setBusy(true); setMsg(''); setError('');
    try {
      fill((await creditControlAPI.saveSettings(picked.customer_id, {
        creditLimit: lim, paymentTermsDays: days, note: note.trim() === '' ? null : note.trim(),
      })) as CreditStatus);
      setMsg('Saved.'); loadList(view);
    } catch (e: any) { setError(errText(e)); }
    finally { setBusy(false); }
  };

  const toggleHold = async (onHold: boolean) => {
    if (!picked) return;
    setBusy(true); setMsg(''); setError('');
    try {
      fill((await creditControlAPI.setHold(picked.customer_id, onHold, holdReason.trim() || null)) as CreditStatus);
      setMsg(onHold ? 'Customer put on hold.' : 'Hold released.'); loadList(view);
    } catch (e: any) { setError(errText(e)); }
    finally { setBusy(false); }
  };

  const flagged = summary?.count ?? 0;
  const exposure = summary?.total_exposure ?? 0;
  const onCredit = summary?.on_credit_count;
  const over = status?.available != null && status.available < 0;

  return (
    <Page>
      <PageHeader
        title="Credit Control"
        description="Who is on hold or over their limit, and how much credit each customer gets. The order desk will not let a customer go past what you trust them for."
      />

      <StatGrid cols={3}>
        <StatCard label="Need action" value={String(flagged)} tone={flagged > 0 ? 'bad' : 'good'}
          sub={flagged > 0
            ? `${summary?.on_hold_count ?? 0} on hold, ${summary?.over_limit_count ?? 0} over limit`
            : 'Nobody on hold or over their limit'} />
        <StatCard label="Owed by them" value={inr(exposure)} tone={exposure > 0 ? 'warn' : 'default'}
          sub="Unpaid orders of the customers to act on" />
        <StatCard label="On credit" value={onCredit == null ? '-' : String(onCredit)}
          sub={summary?.credit_outstanding != null ? `${inr(summary.credit_outstanding)} unpaid in all` : 'Customers with a limit or a hold'} />
      </StatGrid>

      {/* ── editor (a picked customer) ─────────────────────────── */}
      <div ref={editorRef} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {!picked && (
          <div className="relative max-w-md">
            <Field label="Set credit for a customer">
              <SearchInput placeholder="Search by name, phone or email" value={q} onChange={(e) => search(e.target.value)} />
            </Field>
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {hits.map((h) => (
                  <button key={h.customer_id} onClick={() => openCustomer(h)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                    <span className="font-medium text-gray-900">{label(h)}</span>
                    {h.phone && <span className="text-gray-500">, {h.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {picked && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{label(picked)}</div>
                {picked.phone && <div className="text-xs text-gray-500">{picked.phone}</div>}
                <Link to={`/customers/${picked.customer_id}`} className="text-xs text-primary hover:underline">Open customer</Link>
              </div>
              <Btn variant="ghost" onClick={closeEditor}>Pick another customer</Btn>
            </div>

            {opening && (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading their credit</div>
            )}
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            {status && (
              <>
                {status.on_hold && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    On hold{status.hold_reason ? `: ${status.hold_reason}` : ''}. No new orders on credit until the hold is released.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">They owe</div>
                    <div className="text-lg font-bold text-gray-900">{inr(status.outstanding)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Credit limit</div>
                    <div className="text-lg font-bold text-gray-900">{status.limit == null ? 'No limit' : inr(status.limit)}</div>
                  </div>
                  <div className={`rounded-lg border p-3 ${over ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="text-xs text-gray-500">{over ? 'Over by' : 'Headroom left'}</div>
                    <div className={`text-lg font-bold ${over ? 'text-red-700' : 'text-gray-900'}`}>
                      {status.available == null ? 'Not limited' : inr(Math.abs(status.available))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Pays within</div>
                    <div className="text-lg font-bold text-gray-900">{status.terms_days == null ? 'On receipt' : `${status.terms_days} days`}</div>
                  </div>
                </div>

                {canManage ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Credit limit in rupees (blank for no limit)">
                        <TextInput type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 50000" value={limit} onChange={(e) => setLimit(e.target.value)} />
                      </Field>
                      <Field label="Pays within, in days (blank for on receipt)">
                        <TextInput type="number" min="0" step="1" inputMode="numeric" placeholder="e.g. 30" value={terms} onChange={(e) => setTerms(e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Note (optional)">
                      <TextInput placeholder="Anything the team should know" value={note} onChange={(e) => setNote(e.target.value)} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <Btn onClick={saveSettings} disabled={busy}>Save credit settings</Btn>
                      {!status.on_hold ? (
                        <>
                          <TextInput placeholder="Reason for hold (optional)" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} className="w-full sm:max-w-xs" />
                          <Btn variant="danger" onClick={() => toggleHold(true)} disabled={busy}>Put on hold</Btn>
                        </>
                      ) : (
                        <Btn variant="success" onClick={() => toggleHold(false)} disabled={busy}>Release hold</Btn>
                      )}
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {msg && <span className="text-sm text-emerald-700">{msg}</span>}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">You can see this customer's credit. Changing it needs the Manage customers permission.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── the list: to act on first, or everyone on credit ──── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2">
          <TabBar tabs={VIEWS} active={view} onChange={(k) => setView(k as View)} className="border-b-0" />
          <Link to="/panel/accounting/receivables" className="text-xs text-primary hover:underline">Everyone who owes money</Link>
        </div>
        {listError ? (
          <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>Could not load the list: {listError}</span>
            <Btn variant="ghost" onClick={() => loadList(view)}>Try again</Btn>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck}
            title={view === 'act' ? 'Nobody is on hold or over their limit' : 'No customer has a credit limit yet'}
            description={view === 'act'
              ? 'Customers who pass their limit or are put on hold show here.'
              : 'Search for a customer above to give them a limit and payment terms.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Standing</th>
                  <th className="px-4 py-2 text-right">Owes</th>
                  <th className="hidden px-4 py-2 text-right sm:table-cell">Limit</th>
                  <th className="px-4 py-2 text-right">Over by / left</th>
                  <th className="hidden px-4 py-2 text-right md:table-cell">Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((c) => (
                  <tr key={c.customer_id}
                    onClick={() => openCustomer({ customer_id: c.customer_id, name: c.name, company: c.company, phone: c.phone })}
                    className={`cursor-pointer hover:bg-gray-50 ${picked?.customer_id === c.customer_id ? 'bg-gray-50' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{label(c)}</div>
                      {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                    </td>
                    <td className="px-4 py-2">
                      {c.status === 'on_hold'
                        ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">On hold{c.hold_reason ? `: ${c.hold_reason}` : ''}</span>
                        : c.status === 'over_limit'
                          ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Over limit</span>
                          : <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Within limit</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">{inr(c.outstanding)}</td>
                    <td className="hidden px-4 py-2 text-right font-mono text-gray-600 sm:table-cell">{c.limit == null ? 'No limit' : inr(c.limit)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${c.over_by > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                      {c.over_by > 0 ? inr(c.over_by) : c.available == null ? '-' : inr(c.available)}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-gray-600 md:table-cell">{c.terms_days == null ? 'On receipt' : `${c.terms_days} days`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
};

export default CreditControl;
