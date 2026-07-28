import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, StatCard, StatGrid, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, inrMinor,
} from '../../components/erp';

/**
 * Fixed Assets — things you bought that last years: vans, fridges, computers.
 * They lose value every month; we book that depreciation for you and keep a
 * register of what each is worth today. Each asset, each depreciation run, and
 * each disposal posts a balanced accounting journal behind the scenes.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const rupees = (minor: string | number) => (Number(minor) / 100);

interface Opt { key: string; label: string; }

const blankForm = () => ({
  name: '',
  category: 'equipment',
  purchaseDate: todayStr(),
  costRupees: '' as string,
  salvageRupees: '' as string,
  usefulLifeMonths: '60' as string,
  method: 'slm' as 'slm' | 'wdv',
  wdvRatePct: '' as string,
  paidFrom: 'bank' as 'bank' | 'cash' | 'unpaid',
  notes: '',
});

const FixedAssets: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [cats, setCats] = useState<Opt[]>([]);
  const [reg, setReg] = useState<{ rows: any[]; totals: any }>({ rows: [], totals: {} });
  const [statusFilter, setStatusFilter] = useState<'active' | 'disposed' | ''>('active');
  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);

  // schedule drawer
  const [schedule, setSchedule] = useState<{ asset: any; rows: any[] } | null>(null);
  // dispose modal
  const [disposing, setDisposing] = useState<any | null>(null);

  const load = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      setReg(payload<any>(await api.get('/assets', { params })) ?? { rows: [], totals: {} });
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  useEffect(() => { api.get('/assets/categories').then((r) => setCats(payload<Opt[]>(r) ?? [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [statusFilter]);

  // Live depreciation preview (matches the server — SLM flat, WDV reducing balance).
  const preview = useMemo(() => {
    const cost = Math.round((Number(form.costRupees) || 0) * 100);
    const salvage = Math.round((Number(form.salvageRupees) || 0) * 100);
    const life = Math.trunc(Number(form.usefulLifeMonths) || 0);
    const base = cost - salvage;
    if (life < 1 || base <= 0) return null;
    if (form.method === 'wdv') {
      const rate = Number(form.wdvRatePct) || 0;
      if (rate <= 0 || rate > 100) return null;
      const year1 = Math.round((cost * rate) / 100);   // first year on the full cost
      return { method: 'wdv' as const, year1, rate, life };
    }
    const monthly = Math.round(base / life); // half-up-ish, display only
    return { method: 'slm' as const, monthly, life, base };
  }, [form.costRupees, form.salvageRupees, form.usefulLifeMonths, form.method, form.wdvRatePct]);

  const submit = async () => {
    setError(''); setSaving(true);
    try {
      await api.post('/assets', {
        name: form.name,
        category: form.category,
        purchaseDate: form.purchaseDate,
        costRupees: Number(form.costRupees) || 0,
        salvageRupees: Number(form.salvageRupees) || 0,
        usefulLifeMonths: Math.trunc(Number(form.usefulLifeMonths) || 0),
        method: form.method,
        wdvRatePct: form.method === 'wdv' ? (Number(form.wdvRatePct) || 0) : undefined,
        paidFrom: form.paidFrom,
        notes: form.notes || null,
      });
      setForm(blankForm()); setShowNew(false); await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const openSchedule = async (id: string) => {
    setError('');
    try { setSchedule(payload<any>(await api.get(`/assets/${id}/schedule`))); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const [depMonth, setDepMonth] = useState(thisMonth());
  const [depRunning, setDepRunning] = useState(false);
  const runDepreciation = async () => {
    setError('');
    if (!window.confirm(`Book depreciation for ${depMonth} across all active assets? This posts accounting journals.`)) return;
    setDepRunning(true);
    try {
      const res = payload<any>(await api.post('/assets/run-depreciation', { period: depMonth }));
      await load();
      window.alert(`Depreciation for ${depMonth}: ${res?.assetsProcessed ?? 0} asset(s), total ${inrMinor(res?.totalDepreciatedMinor ?? '0')}.`);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setDepRunning(false); }
  };

  const t = reg.totals ?? {};

  return (
    <Page>
      <PageHeader
        title="Fixed Assets"
        description="Things you bought that last years — vans, fridges, computers. They lose value monthly; we book that depreciation for you and track what each is worth today."
        actions={canPost && <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Add asset'}</Btn>}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <StatGrid cols={3}>
        <StatCard label="Total cost (live assets)" value={inrMinor(t.cost_minor ?? '0')} />
        <StatCard label="Depreciated so far" value={inrMinor(t.accumulated_minor ?? '0')} />
        <StatCard label="Book value today" value={inrMinor(t.book_value_minor ?? '0')} tone="good" />
      </StatGrid>

      {/* Run-depreciation toolbar */}
      {canPost && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
          <label className="space-y-1">
            <span className="text-gray-600">Book depreciation for month</span>
            <input type="month" value={depMonth} onChange={(e) => setDepMonth(e.target.value)}
              className="block rounded border px-2 py-1.5" />
          </label>
          <Btn variant="outline" onClick={runDepreciation} disabled={depRunning}>
            {depRunning ? 'Booking…' : 'Run depreciation'}
          </Btn>
          <span className="text-xs text-gray-400">Safe to run monthly — each asset is booked once per month.</span>
        </div>
      )}

      {showNew && canPost && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-gray-600">Asset name *</span>
              <input placeholder="Delivery van, Display fridge…" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Type</span>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded border px-2 py-1.5">
                {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Bought on</span>
              <input type="date" value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Cost (₹)</span>
              <input type="number" min={0} step="0.01" value={form.costRupees}
                onChange={(e) => setForm((f) => ({ ...f, costRupees: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Scrap / salvage value (₹)</span>
              <input type="number" min={0} step="0.01" value={form.salvageRupees}
                onChange={(e) => setForm((f) => ({ ...f, salvageRupees: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Useful life (months)</span>
              <input type="number" min={1} step="1" value={form.usefulLifeMonths}
                onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Depreciation method</span>
              <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as 'slm' | 'wdv' }))}
                className="w-full rounded border px-2 py-1.5">
                <option value="slm">Straight-line (same every month)</option>
                <option value="wdv">Written-down value (reducing balance)</option>
              </select>
            </label>
            {form.method === 'wdv' && (
              <label className="space-y-1">
                <span className="text-gray-600">WDV rate (% per year)</span>
                <input type="number" min={0} max={100} step="0.001" value={form.wdvRatePct}
                  placeholder="40"
                  onChange={(e) => setForm((f) => ({ ...f, wdvRatePct: e.target.value }))}
                  className="w-full rounded border px-2 py-1.5 text-right" />
              </label>
            )}
            <label className="space-y-1">
              <span className="text-gray-600">Paid from</span>
              <select value={form.paidFrom} onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value as any }))}
                className="w-full rounded border px-2 py-1.5">
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="unpaid">Not paid yet (payable)</option>
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-gray-600">Notes</span>
              <input placeholder="Reg number, serial, warranty…" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {preview
                ? preview.method === 'wdv'
                  ? <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
                      Year 1 ≈ <strong>₹{(preview.year1 / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ({preview.rate}% per year on the reducing balance, spread across the year’s months)
                    </span>
                  : <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
                      Depreciation ≈ <strong>₹{(preview.monthly / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> every month for {preview.life} months
                    </span>
                : <span className="text-gray-400">Enter cost, useful life{form.method === 'wdv' ? ' and a WDV rate' : ' and salvage'} to preview the depreciation.</span>}
            </div>
            <Btn onClick={submit} disabled={saving || !form.name.trim() || !(Number(form.costRupees) > 0) || !(Number(form.usefulLifeMonths) >= 1) || (form.method === 'wdv' && !(Number(form.wdvRatePct) > 0))}>
              {saving ? 'Saving…' : 'Add asset'}
            </Btn>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Show:</span>
        {(['active', 'disposed', ''] as const).map((s) => (
          <button key={s || 'all'} onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === '' ? 'All' : s === 'active' ? 'In use' : 'Disposed'}
          </button>
        ))}
      </div>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Number</Th><Th>Asset</Th><Th>Type</Th><Th>Bought</Th>
            <Th num>Cost</Th><Th num>Depreciated</Th><Th num>Book value</Th><Th>Status</Th><Th num>Action</Th>
          </THead>
          <TBody>
            {reg.rows.length === 0 && <EmptyRow colSpan={9}>No assets in this view.</EmptyRow>}
            {reg.rows.map((a: any) => (
              <Tr key={a.id}>
                <Td className="font-mono">{a.asset_number}</Td>
                <Td className="font-medium text-gray-900">{a.name}</Td>
                <Td>{a.category_label}</Td>
                <Td>{a.purchase_date}</Td>
                <Td num>{inrMinor(a.cost_minor)}</Td>
                <Td num>{inrMinor(a.accumulated_depreciation_minor)}<span className="text-gray-400"> ({a.months_booked}m)</span></Td>
                <Td num className="font-medium">{inrMinor(a.book_value_minor)}</Td>
                <Td><StatusChip status={a.status} /></Td>
                <Td num>
                  <span className="whitespace-nowrap">
                    <button onClick={() => openSchedule(a.id)} className="font-medium text-gray-900 hover:underline">Schedule</button>
                    {canPost && a.status === 'active' && (
                      <>
                        <span className="text-gray-300"> · </span>
                        <button onClick={() => setDisposing(a)} className="font-medium text-red-600 hover:underline">Dispose</button>
                      </>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      {schedule && <ScheduleDrawer data={schedule} onClose={() => setSchedule(null)} />}
      {disposing && (
        <DisposeModal asset={disposing} onClose={() => setDisposing(null)}
          onDone={async () => { setDisposing(null); await load(); }} onError={setError} />
      )}
    </Page>
  );
};

// ── Depreciation schedule drawer ───────────────────────────────────────────────
const ScheduleDrawer: React.FC<{ data: { asset: any; rows: any[] }; onClose: () => void }> = ({ data, onClose }) => {
  const a = data.asset;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{a.name}</h2>
            <p className="text-sm text-gray-500">{a.asset_number} · {a.category_label} · bought {a.purchase_date}</p>
          </div>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
        <StatGrid cols={3} >
          <StatCard label="Cost" value={inrMinor(a.cost_minor)} />
          <StatCard label="Depreciated so far" value={inrMinor(a.accumulated_depreciation_minor)} />
          <StatCard label="Book value" value={inrMinor(a.book_value_minor)} tone="good" />
        </StatGrid>
        <p className="mt-3 text-sm text-gray-500">
          {a.method === 'wdv'
            ? <>Written-down value at {a.wdv_rate_pct ?? '—'}% per year over {a.useful_life_months} months</>
            : <>Straight-line over {a.useful_life_months} months</>}
          {Number(a.salvage_minor) > 0 && <> · scrap value {inrMinor(a.salvage_minor)}</>}.
          {a.status === 'disposed' && <span className="ml-1 font-medium text-red-600">Disposed on {a.disposal_date}.</span>}
        </p>
        <TableShell maxHeight="60vh">
          <table className="w-full text-sm">
            <THead>
              <Th>Month</Th><Th num>Depreciation</Th><Th num>Accumulated</Th><Th num>Book value</Th><Th>Status</Th>
            </THead>
            <TBody>
              {data.rows.map((r: any) => (
                <Tr key={r.period}>
                  <Td>{r.period}</Td>
                  <Td num>{inrMinor(r.depreciation_minor)}</Td>
                  <Td num>{inrMinor(r.accumulated_minor)}</Td>
                  <Td num className="font-medium">{inrMinor(r.book_value_minor)}</Td>
                  <Td><StatusChip status={r.status} tone={r.status === 'posted' ? 'green' : 'neutral'} label={r.status === 'posted' ? 'Booked' : 'Projected'} /></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </div>
    </div>
  );
};

// ── Disposal modal ─────────────────────────────────────────────────────────────
const DisposeModal: React.FC<{ asset: any; onClose: () => void; onDone: () => void; onError: (m: string) => void }> = ({ asset, onClose, onDone, onError }) => {
  const [disposalDate, setDisposalDate] = useState(todayStr());
  const [proceedsRupees, setProceedsRupees] = useState('');
  const [proceedsTo, setProceedsTo] = useState<'bank' | 'cash'>('bank');
  const [saving, setSaving] = useState(false);

  const bookValue = rupees(asset.book_value_minor);
  const proceeds = Number(proceedsRupees) || 0;
  const gainLoss = proceeds - bookValue;

  const submit = async () => {
    onError(''); setSaving(true);
    try {
      await api.post(`/assets/${asset.id}/dispose`, {
        disposalDate, proceedsRupees: proceeds, proceedsTo,
      });
      onDone();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4 text-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900">Dispose “{asset.name}”</h2>
        <p className="text-gray-500">Current book value is <strong>{inrMinor(asset.book_value_minor)}</strong>. Enter what you sold it for (0 if scrapped).</p>
        <label className="block space-y-1">
          <span className="text-gray-600">Disposal date</span>
          <input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} className="w-full rounded border px-2 py-1.5" />
        </label>
        <label className="block space-y-1">
          <span className="text-gray-600">Sold for (₹)</span>
          <input type="number" min={0} step="0.01" value={proceedsRupees} onChange={(e) => setProceedsRupees(e.target.value)} className="w-full rounded border px-2 py-1.5 text-right" />
        </label>
        {proceeds > 0 && (
          <label className="block space-y-1">
            <span className="text-gray-600">Money received into</span>
            <select value={proceedsTo} onChange={(e) => setProceedsTo(e.target.value as any)} className="w-full rounded border px-2 py-1.5">
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
        )}
        <div className={`rounded-lg px-3 py-2 font-medium ${gainLoss >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {gainLoss >= 0
            ? `Gain on disposal: ₹${gainLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `Loss on disposal: ₹${Math.abs(gainLoss).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" onClick={submit} disabled={saving}>{saving ? 'Recording…' : 'Confirm disposal'}</Btn>
        </div>
      </div>
    </div>
  );
};

export default FixedAssets;
