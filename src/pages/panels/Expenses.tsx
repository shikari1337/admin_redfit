import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, StatCard, StatGrid, StatusChip, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, inrMinor, AttachmentPanel,
} from '../../components/erp';

/**
 * Expenses & Bank Book — the shop accountant's day-to-day: record rent /
 * electricity / transport / salary bills with their GST, pay from Bank or Cash
 * (or leave unpaid), and watch a running bank book. Every entry posts a balanced
 * GL journal behind the scenes; the bank book is read straight from the GL.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

interface CatOpt { key: string; label: string; }

const blankForm = () => ({
  expenseDate: todayStr(),
  category: 'rent',
  vendorName: '',
  description: '',
  amountRupees: '' as string,
  hasGst: false,
  gstRupees: '' as string,
  gstType: 'cgst_sgst' as 'cgst_sgst' | 'igst',
  itcEligible: false,
  paidFrom: 'bank' as 'bank' | 'cash' | 'unpaid',
});

const Expenses: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [tab, setTab] = useState<'expenses' | 'recurring' | 'bankbook'>('expenses');
  const [error, setError] = useState('');

  // ── Expenses tab ──
  const [cats, setCats] = useState<CatOpt[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  // Which expense's attachments (receipts/PDFs) are open below the table.
  const [attachFor, setAttachFor] = useState<{ id: string; number: string } | null>(null);

  const loadExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      const d = payload<any>(res);
      setRows(d.rows ?? []);
      setMonthly(d.monthly ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  useEffect(() => {
    api.get('/expenses/categories').then((r) => setCats(payload<CatOpt[]>(r) ?? [])).catch(() => {});
    loadExpenses();
  }, []);

  const submit = async () => {
    setError(''); setSaving(true);
    try {
      await api.post('/expenses', {
        expenseDate: form.expenseDate,
        category: form.category,
        vendorName: form.vendorName || null,
        description: form.description,
        amountRupees: Number(form.amountRupees) || 0,
        gstRupees: form.hasGst ? (Number(form.gstRupees) || 0) : 0,
        gstType: form.hasGst ? form.gstType : undefined,
        itcEligible: form.hasGst ? form.itcEligible : false,
        paidFrom: form.paidFrom,
      });
      setForm(blankForm()); setShowNew(false);
      await loadExpenses();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const pay = async (id: string, paidFrom: 'bank' | 'cash') => {
    setError('');
    try { await api.post(`/expenses/${id}/pay`, { paidFrom, paymentDate: todayStr() }); await loadExpenses(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const paidChip = (v: string) =>
    v === 'unpaid'
      ? <StatusChip status="unpaid" />
      : <StatusChip status={v} tone="green" label={v === 'bank' ? 'Paid · Bank' : 'Paid · Cash'} />;

  return (
    <Page>
      <PageHeader
        title="Expenses & Bank Book"
        description="Record shop expenses with their GST, pay from Bank or Cash, and see a running bank book. Each entry posts a balanced accounting journal automatically."
        actions={tab === 'expenses' && canPost && (
          <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Record expense'}</Btn>
        )}
      />

      <TabBar
        tabs={[
          { key: 'expenses', label: 'Expenses' },
          { key: 'recurring', label: 'Recurring' },
          { key: 'bankbook', label: 'Bank Book' },
        ]}
        active={tab}
        onChange={(k) => { setError(''); setTab(k as any); }}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === 'expenses' ? (
        <>
          {showNew && canPost && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-gray-600">Date</span>
                  <input type="date" value={form.expenseDate}
                    onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5" />
                </label>
                <label className="space-y-1">
                  <span className="text-gray-600">Category</span>
                  <select value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5">
                    {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-gray-600">Paid to (name)</span>
                  <input placeholder="Landlord, power board, courier…" value={form.vendorName}
                    onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5" />
                </label>
                <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <span className="text-gray-600">Description *</span>
                  <input placeholder="What was this expense for?" value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5" />
                </label>
                <label className="space-y-1">
                  <span className="text-gray-600">Amount (₹, before GST)</span>
                  <input type="number" min={0} step="0.01" value={form.amountRupees}
                    onChange={(e) => setForm((f) => ({ ...f, amountRupees: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5 text-right" />
                </label>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.hasGst}
                    onChange={(e) => setForm((f) => ({ ...f, hasGst: e.target.checked }))} />
                  <span className="font-medium text-gray-700">This bill has GST</span>
                </label>
                {form.hasGst && (
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="space-y-1">
                      <span className="text-gray-600">GST amount (₹)</span>
                      <input type="number" min={0} step="0.01" value={form.gstRupees}
                        onChange={(e) => setForm((f) => ({ ...f, gstRupees: e.target.value }))}
                        className="w-32 rounded border px-2 py-1.5 text-right" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-gray-600">GST kind</span>
                      <select value={form.gstType}
                        onChange={(e) => setForm((f) => ({ ...f, gstType: e.target.value as any }))}
                        className="rounded border px-2 py-1.5">
                        <option value="cgst_sgst">Local (CGST + SGST)</option>
                        <option value="igst">Inter-state (IGST)</option>
                      </select>
                    </label>
                    <label className="flex max-w-xs items-start gap-2">
                      <input type="checkbox" checked={form.itcEligible} className="mt-1"
                        onChange={(e) => setForm((f) => ({ ...f, itcEligible: e.target.checked }))} />
                      <span>
                        <span className="font-medium text-gray-700">Claim this GST back (ITC)</span>
                        <span className="block text-xs text-gray-500">Can you claim this GST back? Ask your CA if unsure — leave it off and the GST becomes part of the expense.</span>
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="space-y-1">
                  <span className="text-gray-600">Paid from</span>
                  <select value={form.paidFrom}
                    onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value as any }))}
                    className="rounded border px-2 py-1.5">
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="unpaid">Not paid yet (record as payable)</option>
                  </select>
                </label>
                <Btn onClick={submit}
                  disabled={saving || !form.description.trim() || !(Number(form.amountRupees) > 0)}>
                  {saving ? 'Saving…' : 'Record expense'}
                </Btn>
              </div>
            </div>
          )}

          {monthly.length > 0 && (
            <StatGrid cols={4}>
              {monthly.slice(0, 4).map((m: any) => (
                <StatCard key={m.month} label={monthLabel(m.month)} value={inrMinor(m.total_minor)}
                  sub={`${m.count} ${m.count === 1 ? 'expense' : 'expenses'} · GST ${inrMinor(m.gst_minor)}`} />
              ))}
            </StatGrid>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Number</Th><Th>Date</Th><Th>Category</Th><Th>Paid to</Th><Th>Description</Th>
                <Th num>Amount</Th><Th num>GST</Th><Th num>Total</Th><Th>Paid from</Th>
                {canPost && <Th num>Action</Th>}
              </THead>
              <TBody>
                {rows.length === 0 && <EmptyRow colSpan={canPost ? 10 : 9}>No expenses recorded yet.</EmptyRow>}
                {rows.map((e: any) => (
                  <Tr key={e.id}>
                    <Td className="font-mono">
                      <button
                        onClick={() => setAttachFor((cur) => cur?.id === e.id ? null : { id: e.id, number: e.expense_number })}
                        className={`hover:underline ${attachFor?.id === e.id ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                        title="View / add attachments"
                      >{e.expense_number}</button>
                    </Td>
                    <Td>{e.expense_date}</Td>
                    <Td>{e.category_label}</Td>
                    <Td>{e.vendor_name ?? '—'}</Td>
                    <Td className="max-w-xs truncate" title={e.description}>{e.description}</Td>
                    <Td num>{inrMinor(e.amount_minor)}</Td>
                    <Td num>{Number(e.gst_minor) ? inrMinor(e.gst_minor) : '—'}{e.itc_eligible ? ' *' : ''}</Td>
                    <Td num className="font-medium">{inrMinor(e.total_minor)}</Td>
                    <Td>{paidChip(e.paid_from)}</Td>
                    {canPost && (
                      <Td num>
                        {e.paid_from === 'unpaid' ? (
                          <span className="whitespace-nowrap">
                            <button onClick={() => pay(e.id, 'bank')} className="font-medium text-gray-900 hover:underline">Pay (Bank)</button>
                            <span className="text-gray-300"> · </span>
                            <button onClick={() => pay(e.id, 'cash')} className="font-medium text-gray-900 hover:underline">Cash</button>
                          </span>
                        ) : '—'}
                      </Td>
                    )}
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          <p className="text-xs text-gray-400">
            * GST marked with an asterisk is being claimed as Input Tax Credit (ITC).
            {' '}Click an expense number to attach its receipt or supporting PDF.
          </p>

          {attachFor && (
            <AttachmentPanel
              entityType="expense"
              entityId={attachFor.id}
              title={`Attachments · ${attachFor.number}`}
              description="Receipt scans, bills and supporting files for this expense."
            />
          )}
        </>
      ) : tab === 'recurring' ? (
        <Recurring cats={cats} canPost={canPost} onError={setError} />
      ) : (
        <BankBook onError={setError} />
      )}
    </Page>
  );
};

// ── Recurring templates tab ────────────────────────────────────────────────────
// A template repeats a fixed expense on a schedule (rent on the 1st, etc.). A
// daily scheduler turns due templates into real expenses; the accountant can
// also force a "generate due now" pass here.
const freqLabel: Record<string, string> = { monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' };
const niceDate = (d: string) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};
const nextMonthFirst = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10); };

const blankTemplate = () => ({
  label: '', category: 'rent', vendorName: '', description: '',
  amountRupees: '' as string, hasGst: false, gstRupees: '' as string,
  gstType: 'cgst_sgst' as 'cgst_sgst' | 'igst', itcEligible: false,
  paidFrom: 'unpaid' as 'bank' | 'cash' | 'unpaid',
  frequency: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
  nextDue: nextMonthFirst(),
});

const Recurring: React.FC<{ cats: CatOpt[]; canPost: boolean; onError: (m: string) => void }> = ({ cats, canPost, onError }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blankTemplate());
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    try { setRows((payload<any>(await api.get('/expenses/recurring')))?.rows ?? []); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    onError(''); setSaving(true);
    try {
      await api.post('/expenses/recurring', {
        label: form.label || null,
        category: form.category,
        vendorName: form.vendorName || null,
        description: form.description,
        amountRupees: Number(form.amountRupees) || 0,
        gstRupees: form.hasGst ? (Number(form.gstRupees) || 0) : 0,
        gstType: form.hasGst ? form.gstType : undefined,
        itcEligible: form.hasGst ? form.itcEligible : false,
        paidFrom: form.paidFrom,
        frequency: form.frequency,
        nextDue: form.nextDue,
      });
      setForm(blankTemplate()); setShowNew(false); await load();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const toggle = async (id: string, active: boolean) => {
    onError('');
    try { await api.post(`/expenses/recurring/${id}/${active ? 'pause' : 'resume'}`); await load(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  const remove = async (id: string) => {
    onError('');
    if (!window.confirm('Delete this recurring template? Already-generated expenses are kept.')) return;
    try { await api.delete(`/expenses/recurring/${id}`); await load(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  const runNow = async () => {
    onError(''); setRunning(true);
    try {
      const res = payload<any>(await api.post('/expenses/recurring/run', {}));
      await load();
      window.alert(res?.count ? `Generated ${res.count} expense(s) that were due.` : 'Nothing was due right now.');
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setRunning(false); }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Set up bills that repeat — rent, salaries, subscriptions. We create the expense automatically on its date so you never retype it.
        </p>
        {canPost && (
          <div className="flex gap-2">
            <Btn variant="outline" onClick={runNow} disabled={running}>{running ? 'Generating…' : 'Generate due now'}</Btn>
            <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ New recurring'}</Btn>
          </div>
        )}
      </div>

      {showNew && canPost && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-gray-600">Name (optional)</span>
              <input placeholder="Shop rent, Internet…" value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Category</span>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded border px-2 py-1.5">
                {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Paid to (name)</span>
              <input placeholder="Landlord, ISP…" value={form.vendorName}
                onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-gray-600">Description *</span>
              <input placeholder="What is this expense for?" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Amount (₹, before GST)</span>
              <input type="number" min={0} step="0.01" value={form.amountRupees}
                onChange={(e) => setForm((f) => ({ ...f, amountRupees: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Repeats</span>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as any }))}
                className="w-full rounded border px-2 py-1.5">
                <option value="monthly">Every month</option>
                <option value="quarterly">Every 3 months</option>
                <option value="yearly">Every year</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Starts on (first due date)</span>
              <input type="date" value={form.nextDue}
                onChange={(e) => setForm((f) => ({ ...f, nextDue: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Paid from</span>
              <select value={form.paidFrom} onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value as any }))}
                className="w-full rounded border px-2 py-1.5">
                <option value="unpaid">Record as payable (pay later)</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasGst}
                onChange={(e) => setForm((f) => ({ ...f, hasGst: e.target.checked }))} />
              <span className="font-medium text-gray-700">This bill has GST</span>
            </label>
            {form.hasGst && (
              <div className="flex flex-wrap items-end gap-4">
                <label className="space-y-1">
                  <span className="text-gray-600">GST amount (₹)</span>
                  <input type="number" min={0} step="0.01" value={form.gstRupees}
                    onChange={(e) => setForm((f) => ({ ...f, gstRupees: e.target.value }))}
                    className="w-32 rounded border px-2 py-1.5 text-right" />
                </label>
                <label className="space-y-1">
                  <span className="text-gray-600">GST kind</span>
                  <select value={form.gstType} onChange={(e) => setForm((f) => ({ ...f, gstType: e.target.value as any }))}
                    className="rounded border px-2 py-1.5">
                    <option value="cgst_sgst">Local (CGST + SGST)</option>
                    <option value="igst">Inter-state (IGST)</option>
                  </select>
                </label>
                <label className="flex max-w-xs items-start gap-2">
                  <input type="checkbox" checked={form.itcEligible} className="mt-1"
                    onChange={(e) => setForm((f) => ({ ...f, itcEligible: e.target.checked }))} />
                  <span className="text-xs text-gray-600">Claim this GST back (ITC) — ask your CA if unsure.</span>
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Btn onClick={submit} disabled={saving || !form.description.trim() || !(Number(form.amountRupees) > 0)}>
              {saving ? 'Saving…' : 'Save template'}
            </Btn>
          </div>
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Name / Description</Th><Th>Category</Th><Th>Repeats</Th>
            <Th num>Amount</Th><Th>Next due</Th><Th>Paid from</Th><Th>Status</Th>
            {canPost && <Th num>Action</Th>}
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={canPost ? 8 : 7}>No recurring expenses set up yet.</EmptyRow>}
            {rows.map((r: any) => (
              <Tr key={r.id}>
                <Td>
                  <div className="font-medium text-gray-900">{r.label || r.description}</div>
                  {r.label && <div className="text-xs text-gray-500">{r.description}</div>}
                </Td>
                <Td>{r.category_label}</Td>
                <Td>{freqLabel[r.frequency] ?? r.frequency}</Td>
                <Td num className="font-medium">{inrMinor(r.total_minor)}</Td>
                <Td>
                  {r.active
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">Next on {niceDate(r.next_due)}</span>
                    : <span className="text-gray-400">Paused</span>}
                </Td>
                <Td>{r.paid_from === 'unpaid' ? 'Payable' : r.paid_from === 'bank' ? 'Bank' : 'Cash'}</Td>
                <Td><StatusChip status={r.active ? 'active' : 'inactive'} label={r.active ? 'Active' : 'Paused'} /></Td>
                {canPost && (
                  <Td num>
                    <span className="whitespace-nowrap">
                      <button onClick={() => toggle(r.id, r.active)} className="font-medium text-gray-900 hover:underline">{r.active ? 'Pause' : 'Resume'}</button>
                      <span className="text-gray-300"> · </span>
                      <button onClick={() => remove(r.id)} className="font-medium text-red-600 hover:underline">Delete</button>
                    </span>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </>
  );
};

// ── Bank Book tab ─────────────────────────────────────────────────────────────
const BankBook: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [account, setAccount] = useState<'bank' | 'cash'>('bank');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [book, setBook] = useState<any>(null);

  const load = async () => {
    try {
      const params: any = { account };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/expenses/bank-book', { params });
      setBook(payload<any>(res));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, [account]);

  const downloadCsv = () => {
    if (!book) return;
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rup = (m: string) => (Number(m) / 100).toFixed(2);
    const header = ['Date', 'Reference', 'Type', 'Narration', 'Money in', 'Money out', 'Balance'].map(q).join(',');
    const opening = ['', '', 'opening', 'Opening balance', '', '', rup(book.openingMinor)].map(q).join(',');
    const lines = (book.rows ?? []).map((r: any) => [
      r.date, r.journal_number ?? '', r.document_type ?? '', r.narration ?? '',
      Number(r.debit_minor) ? rup(r.debit_minor) : '', Number(r.credit_minor) ? rup(r.credit_minor) : '',
      rup(r.balance_minor),
    ].map(q).join(','));
    const blob = new Blob(['﻿' + [header, opening, ...lines].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${account}-book.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const closing = book ? Number(book.closingMinor) : 0;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">Account</span>
          <select value={account} onChange={(e) => setAccount(e.target.value as any)} className="block rounded border px-2 py-1.5">
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block rounded border px-2 py-1.5" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block rounded border px-2 py-1.5" />
        </label>
        <Btn variant="outline" onClick={load}>Apply</Btn>
        <Btn variant="outline" onClick={downloadCsv} disabled={!book}>Export CSV</Btn>
      </div>

      {book && (
        <StatGrid cols={3}>
          <StatCard label="Opening balance" value={inrMinor(book.openingMinor)} />
          <StatCard label={`${account === 'cash' ? 'Cash' : 'Bank'} on hand (closing)`} value={inrMinor(book.closingMinor)}
            tone={closing < 0 ? 'bad' : 'good'} />
          <StatCard label="Entries" value={book.rows?.length ?? 0} />
        </StatGrid>
      )}

      <TableShell maxHeight="60vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Date</Th><Th>Reference</Th><Th>Details</Th>
            <Th num>Money in</Th><Th num>Money out</Th><Th num>Balance</Th>
          </THead>
          <TBody>
            {book && (
              <Tr className="bg-gray-50/60">
                <Td colSpan={5} className="text-gray-500">Opening balance</Td>
                <Td num className="font-medium">{inrMinor(book.openingMinor)}</Td>
              </Tr>
            )}
            {book && (book.rows ?? []).length === 0 && <EmptyRow colSpan={6}>No movements in this period.</EmptyRow>}
            {book && (book.rows ?? []).map((r: any, i: number) => (
              <Tr key={i}>
                <Td>{r.date}</Td>
                <Td className="font-mono text-xs">{r.journal_number ?? '—'}</Td>
                <Td className="max-w-md truncate" title={r.narration ?? ''}>{r.narration ?? r.document_type ?? '—'}</Td>
                <Td num className="text-emerald-700">{Number(r.debit_minor) ? inrMinor(r.debit_minor) : '—'}</Td>
                <Td num className="text-red-700">{Number(r.credit_minor) ? inrMinor(r.credit_minor) : '—'}</Td>
                <Td num className="font-medium">{inrMinor(r.balance_minor)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </>
  );
};

export default Expenses;
