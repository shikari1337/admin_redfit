import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TextInput, SelectInput, Field,
  FilterBar, ExportMenu, Pagination, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * CURRENCIES & FX — the owner/accountant screen for multi-currency (migration
 * 088; backend routes/fx.ts).
 *
 * The promise, in plain language: "Foreign amounts are remembered; your BOOKS
 * stay in ₹." Everything on this page is about remembering the ORIGINAL foreign
 * figure and the rate it was converted at. No rupee figure anywhere in the ERP
 * changes currency — the trial balance, GST returns and stock valuation are all
 * still in rupees, exactly as before.
 *
 * Three things happen here:
 *   1. switch the feature on (off by default — nothing at all runs while off),
 *   2. switch on the currencies you actually deal in,
 *   3. enter the day's rate (and read back every rate ever used).
 */

interface CurrencyRow {
  code: string; name: string; symbol: string | null; decimals: number;
  isActive: boolean; isBase: boolean;
  latestRate: string | null; latestRateDate: string | null;
}
interface RateRow {
  id: string; currency: string; rate: string; as_of_date: string;
  source: string; note: string | null; created_at: string;
}
interface FxData {
  enabled: boolean; ratePolicy?: string; baseCurrency: string;
  currencies: CurrencyRow[]; asOf: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const POLICY_LABEL: Record<string, string> = {
  rbi_reference: 'RBI reference rate',
  customs_notified: 'CBIC notified rate (import valuation)',
  bank_deal: 'The rate my bank actually dealt at',
  other: 'Something else (noted per rate)',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'typed in',
  api: 'from a feed',
  customs: 'CBIC notified',
};

// Client-side CSV exports. Rate is a ₹-per-unit decimal STRING (not minor units);
// revaluation unrealised IS minor units → money:true.
const RATE_COLS: CsvColumn<RateRow>[] = [
  { key: 'as_of_date', label: 'As on' },
  { key: 'currency', label: 'Currency' },
  { key: 'rate', label: 'INR per unit', format: (r) => r.rate },
  { key: 'source', label: 'Source', format: (r) => SOURCE_LABEL[r.source] ?? r.source },
  { key: 'note', label: 'Note', format: (r) => r.note ?? '' },
];
const REVAL_COLS: CsvColumn<any>[] = [
  { key: 'period', label: 'Period' },
  { key: 'currency', label: 'Currency' },
  { key: 'unrealised_minor', label: 'Unrealised', money: true },
  { key: 'status', label: 'Status' },
  { key: 'as_of_date', label: 'As at' },
];

const FxRates: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('accounting.post');

  const [data, setData] = useState<FxData | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // New-rate form
  const [form, setForm] = useState({ currency: '', rateToInr: '', asOfDate: today(), source: 'manual', note: '' });

  // Convert preview
  const [conv, setConv] = useState({ currency: '', amount: '100', asOf: today() });
  const [convOut, setConvOut] = useState<{ inrMajor: string; rate: string; rateDate: string; source: string } | null>(null);

  const [historyFilter, setHistoryFilter] = useState('');
  const histLc = useListControls({ pageSize: 25 });  // rate-history date range + paging (client-side)

  // Period-end (unrealised) revaluation
  const lastDayPrevMonth = () => { const d = new Date(); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const [revalAsOf, setRevalAsOf] = useState(lastDayPrevMonth());
  const [revalPreview, setRevalPreview] = useState<any | null>(null);
  const [revals, setRevals] = useState<any[]>([]);
  const [revalBusy, setRevalBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        api.get('/fx'),
        api.get('/fx/rates', { params: { limit: 200 } }),
      ]);
      const dd: FxData = payload(d);
      setData(dd);
      // /fx/rates returns { success, rows, total } (not the {success,data} envelope),
      // so read defensively: array (if unwrapped) or the { rows } object.
      const rr: any = payload(r);
      setRates(Array.isArray(rr) ? rr : (rr?.rows ?? []));
      const firstForeign = dd.currencies.find((c) => c.isActive && !c.isBase)
        ?? dd.currencies.find((c) => !c.isBase);
      if (firstForeign) {
        setForm((f) => (f.currency ? f : { ...f, currency: firstForeign.code }));
        setConv((c) => (c.currency ? c : { ...c, currency: firstForeign.code }));
      }
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not load currencies.' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); loadRevals(); /* eslint-disable-next-line */ }, []);

  const revMinor = (m: string | number) =>
    '₹' + (Number(m) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadRevals = async () => {
    try { setRevals(payload<any[]>(await api.get('/fx/revaluations', { params: { limit: 50 } })) ?? []); }
    catch { /* the module may simply not be migrated yet */ }
  };

  const previewReval = async () => {
    setRevalBusy('preview'); setMsg(null); setRevalPreview(null);
    try {
      setRevalPreview(payload<any>(await api.get('/fx/revaluation', { params: { asOf: revalAsOf } })));
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not compute the revaluation.' });
    } finally { setRevalBusy(null); }
  };

  const postReval = async (currency: string) => {
    setRevalBusy(currency); setMsg(null);
    try {
      const out = payload<any>(await api.post('/fx/revaluation', { asOfDate: revalAsOf, currency }));
      setMsg({ kind: 'ok', text: out.detail });
      await loadRevals();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not post the revaluation.' });
    } finally { setRevalBusy(null); }
  };

  const toggleEngine = async (enabled: boolean) => {
    setSaving('config'); setMsg(null);
    try {
      await api.put('/fx/config', { enabled });
      setMsg({
        kind: 'ok',
        text: enabled
          ? 'Multi-currency is ON. You can now record a bill in a foreign currency — its rupee value is worked out from the rate on the bill’s own date, and your books stay in ₹.'
          : 'Multi-currency is OFF. No document can be raised in a foreign currency. Anything already booked keeps the rate it was booked at.',
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not change the setting.' });
    } finally { setSaving(null); }
  };

  const savePolicy = async (ratePolicy: string) => {
    setSaving('policy'); setMsg(null);
    try {
      await api.put('/fx/config', { ratePolicy });
      setMsg({ kind: 'ok', text: 'Noted. This is a record of which published rate your accountant told you to use — it does not change any arithmetic.' });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not save.' });
    } finally { setSaving(null); }
  };

  const toggleCurrency = async (code: string, active: boolean) => {
    setSaving(code); setMsg(null);
    try {
      await api.put(`/fx/currencies/${code}`, { active });
      setMsg({ kind: 'ok', text: active ? `${code} switched on. Enter today’s rate below before booking a ${code} document.` : `${code} switched off.` });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not change the currency.' });
    } finally { setSaving(null); }
  };

  const addRate = async () => {
    setSaving('rate'); setMsg(null);
    try {
      await api.post('/fx/rates', {
        currency: form.currency, rateToInr: form.rateToInr.trim(),
        asOfDate: form.asOfDate, source: form.source, note: form.note || undefined,
      });
      setMsg({ kind: 'ok', text: `Rate saved: 1 ${form.currency} = ₹${form.rateToInr} on ${form.asOfDate}.` });
      setForm((f) => ({ ...f, rateToInr: '', note: '' }));
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not save the rate.' });
    } finally { setSaving(null); }
  };

  const runConvert = async () => {
    setSaving('convert'); setMsg(null); setConvOut(null);
    try {
      const out = payload(await api.get('/fx/convert', {
        params: { currency: conv.currency, amount: conv.amount, asOf: conv.asOf },
      }));
      setConvOut({
        inrMajor: out.inrMajor, rate: out.resolved.rate,
        rateDate: out.resolved.rateDate, source: out.resolved.source,
      });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not convert.' });
    } finally { setSaving(null); }
  };

  const currencies = data?.currencies ?? [];
  const foreign = currencies.filter((c) => !c.isBase);
  const activeForeign = foreign.filter((c) => c.isActive);
  const shownRates = useMemo(
    () => rates.filter((r) => {
      if (historyFilter && r.currency !== historyFilter) return false;
      if (histLc.from && r.as_of_date < histLc.from) return false;   // ISO strings sort lexically
      if (histLc.to && r.as_of_date > histLc.to) return false;
      return true;
    }),
    [rates, historyFilter, histLc.from, histLc.to]);
  const pageRates = shownRates.slice((histLc.page - 1) * histLc.pageSize, histLc.page * histLc.pageSize);

  return (
    <Page>
      <PageHeader
        title="Currencies & FX"
        description="For when a supplier bills you in dollars or a buyer pays in dirhams. The foreign amount is remembered on the document along with the rate used — and your books stay in ₹, exactly as they are today."
        actions={<Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Btn>}
      />

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.kind === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-red-300 bg-red-50 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      {/* ── The one switch ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Deal in foreign currencies"
        description="Off by default. While it is off, nothing here runs at all and every document is in ₹ — which is what every existing document already is."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="max-w-3xl text-sm text-gray-600">
            <div className="mb-1 font-medium text-gray-900">
              Currently{' '}
              {data?.enabled
                ? <span className="text-emerald-700">ON — foreign-currency documents allowed</span>
                : <span className="text-gray-700">OFF — every document is in ₹</span>}
            </div>
            <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              <strong>Foreign amounts are remembered; your BOOKS stay in ₹.</strong> Turning this on
              lets you record what a supplier actually billed — say $100 — next to its rupee value.
              Every ledger, every GST return and every report stays in rupees. Nothing you have
              already recorded changes.
            </p>
            Example: a $100 bill dated 1 April, when the rate on record for that day is ₹84.50, is
            booked as ₹8,450.00. Pay it later when the rate is ₹85.20 and the extra ₹70.00 is shown
            honestly as an exchange loss instead of quietly vanishing.
          </div>
          <Btn
            variant={data?.enabled ? 'danger' : 'success'}
            disabled={!canWrite || saving === 'config' || !data}
            onClick={() => toggleEngine(!data?.enabled)}
          >
            {saving === 'config' ? 'Saving…' : data?.enabled ? 'Switch off' : 'Switch on'}
          </Btn>
        </div>
        <div className="flex flex-wrap items-end gap-4 border-t border-gray-100 px-6 py-4">
          <Field label="Which published rate do you follow?">
            <SelectInput
              value={data?.ratePolicy ?? 'rbi_reference'}
              disabled={!canWrite || saving === 'policy' || !data}
              onChange={(e) => savePolicy(e.target.value)}
              className="min-w-[22rem]"
            >
              {Object.keys(POLICY_LABEL).map((k) => (
                <option key={k} value={k}>{POLICY_LABEL[k]}</option>
              ))}
            </SelectInput>
          </Field>
          <p className="max-w-xl text-xs text-gray-500">
            A record of your accountant's instruction. Customs valuation of imports uses the CBIC
            notified rate; ordinary book-keeping usually uses the RBI reference rate or the rate your
            bank actually gave you. Ask your CA which applies — it is a policy decision, not a
            software one.
          </p>
        </div>
      </SectionCard>

      {/* ── Currency master ───────────────────────────────────────────────── */}
      <SectionCard
        title="Currencies"
        description="Switch on only the ones you actually deal in — they are the only ones that appear when you record a document. ₹ is your books' currency and can never be switched off."
      >
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Currency</Th><Th>Code</Th><Th num>Newest rate on record</Th>
              <Th>As on</Th><Th>Status</Th><Th />
            </THead>
            <TBody>
              {loading && <EmptyRow colSpan={6}>Loading…</EmptyRow>}
              {!loading && currencies.length === 0 &&
                <EmptyRow colSpan={6}>No currency master yet — the API may need a restart to apply migration 088.</EmptyRow>}
              {!loading && currencies.map((c) => (
                <Tr key={c.code}>
                  <Td className="font-medium">{c.symbol ? `${c.symbol} ` : ''}{c.name}</Td>
                  <Td>{c.code}</Td>
                  <Td num>{c.isBase ? '— (your books)' : c.latestRate ? `₹${c.latestRate}` : '— none entered —'}</Td>
                  <Td muted>{c.isBase ? '' : c.latestRateDate ?? ''}</Td>
                  <Td>
                    {c.isBase
                      ? <Chip tone="blue">books currency</Chip>
                      : c.isActive ? <Chip tone="green">on</Chip> : <Chip tone="neutral">off</Chip>}
                  </Td>
                  <Td>
                    {!c.isBase && (
                      <Btn
                        variant={c.isActive ? 'outline' : 'success'}
                        disabled={!canWrite || saving === c.code}
                        onClick={() => toggleCurrency(c.code, !c.isActive)}
                      >
                        {saving === c.code ? '…' : c.isActive ? 'Switch off' : 'Switch on'}
                      </Btn>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      {/* ── Enter a rate ──────────────────────────────────────────────────── */}
      <SectionCard
        title="Enter today's rate"
        description="How many rupees one unit of that currency is worth on a given day. One rate per currency per day — a day's rate is never overwritten, because documents already booked at it must stay reproducible."
      >
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <Field label="Currency">
            <SelectInput
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="min-w-[10rem]"
            >
              <option value="">— pick —</option>
              {foreign.map((c) => (
                <option key={c.code} value={c.code}>{c.code}{c.isActive ? '' : ' (off)'}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label={`1 ${form.currency || 'unit'} = ₹`}>
            <TextInput
              value={form.rateToInr}
              placeholder="84.50"
              inputMode="decimal"
              onChange={(e) => setForm({ ...form, rateToInr: e.target.value })}
              className="w-32"
            />
          </Field>
          <Field label="As on">
            <TextInput type="date" value={form.asOfDate}
              onChange={(e) => setForm({ ...form, asOfDate: e.target.value })} />
          </Field>
          <Field label="Where from">
            <SelectInput value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="manual">Typed in</option>
              <option value="customs">CBIC notified</option>
              <option value="api">From a feed</option>
            </SelectInput>
          </Field>
          <Field label="Note (optional)">
            <TextInput value={form.note} placeholder="e.g. bank advice ref"
              onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-56" />
          </Field>
          <Btn
            variant="primary"
            disabled={!canWrite || saving === 'rate' || !form.currency || !form.rateToInr.trim()}
            onClick={addRate}
          >
            {saving === 'rate' ? 'Saving…' : 'Save rate'}
          </Btn>
        </div>
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500">
          Type the rate as a plain number (84.5 or 84.50000000). If no rate exists for a document's
          exact date, the most recent EARLIER rate is used — a bill dated Sunday correctly uses
          Friday's rate. If there is no earlier rate at all, the document is refused rather than
          booked at a guess.
        </p>
      </SectionCard>

      {/* ── Convert preview ──────────────────────────────────────────────── */}
      <SectionCard
        title="Check a conversion"
        description="A read-only sanity check before you record something: what is this foreign amount worth in ₹ on that date, at which rate, published on which day?"
      >
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <Field label="Currency">
            <SelectInput value={conv.currency}
              onChange={(e) => setConv({ ...conv, currency: e.target.value })}
              className="min-w-[9rem]">
              <option value="">— pick —</option>
              {activeForeign.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </SelectInput>
          </Field>
          <Field label="Amount">
            <TextInput value={conv.amount} inputMode="decimal" className="w-32"
              onChange={(e) => setConv({ ...conv, amount: e.target.value })} />
          </Field>
          <Field label="On date">
            <TextInput type="date" value={conv.asOf}
              onChange={(e) => setConv({ ...conv, asOf: e.target.value })} />
          </Field>
          <Btn disabled={saving === 'convert' || !conv.currency} onClick={runConvert}>
            {saving === 'convert' ? '…' : 'Convert'}
          </Btn>
          {convOut && (
            <div className="rounded border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
              <span className="font-semibold text-gray-900">₹{convOut.inrMajor}</span>
              <span className="ml-2 text-gray-600">
                at ₹{convOut.rate} per {conv.currency}, rate published {convOut.rateDate}
                {convOut.source === 'prior' && ' (an earlier day — no rate was entered for the date asked)'}
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Period-end revaluation (unrealised) ───────────────────────────── */}
      <SectionCard
        title="Period-end revaluation (unrealised)"
        description="At month-end, restate what your still-unpaid FOREIGN supplier bills would be worth at that day's rate. The difference is an UNREALISED exchange gain or loss — recorded for the period and reversed on the 1st, because nothing has actually been paid yet. Nothing posts to your books unless automatic book-keeping is switched on."
      >
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <Field label="As at (period end)">
            <TextInput type="date" value={revalAsOf}
              onChange={(e) => setRevalAsOf(e.target.value)} />
          </Field>
          <Btn disabled={revalBusy === 'preview'} onClick={previewReval}>
            {revalBusy === 'preview' ? '…' : 'Preview revaluation'}
          </Btn>
          <p className="max-w-xl text-xs text-gray-500">
            Reads your open foreign vendor bills and this period's rate. This is a preview — use
            “Post” per currency to record it (and, if auto-posting is on, book the journal + its
            next-day reversal).
          </p>
        </div>
        {revalPreview && (
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Currency</Th><Th num>Open bills</Th><Th num>Booked ₹</Th>
                <Th num>At {revalPreview.asOfDate} rate</Th><Th num>Unrealised</Th><Th />
              </THead>
              <TBody>
                {revalPreview.currencies.length === 0 &&
                  <EmptyRow colSpan={6}>No open foreign supplier balances to revalue as at {revalPreview.asOfDate}.</EmptyRow>}
                {revalPreview.currencies.map((c: any) => {
                  const signed = Number(c.unrealisedMinor);
                  return (
                    <Tr key={c.currency}>
                      <Td className="font-medium">{c.currency}</Td>
                      <Td num>{c.error ? '—' : c.billCount}</Td>
                      <Td num>{c.error ? '—' : revMinor(c.openInrBookedMinor)}</Td>
                      <Td num>{c.error ? '—' : revMinor(c.openInrPeriodMinor)}</Td>
                      <Td num>
                        {c.error
                          ? <span className="text-amber-700">{c.error}</span>
                          : <span className={signed > 0 ? 'text-emerald-700' : signed < 0 ? 'text-red-600' : 'text-gray-500'}>
                              {signed === 0 ? '—' : `${revMinor(Math.abs(signed))} ${c.kind}`}
                            </span>}
                      </Td>
                      <Td>
                        {!c.error && (
                          <Btn variant="primary" disabled={!canWrite || revalBusy === c.currency || signed === 0}
                            onClick={() => postReval(c.currency)}>
                            {revalBusy === c.currency ? '…' : 'Post'}
                          </Btn>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        )}
        {revals.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Recorded revaluations</div>
              <ExportMenu filename="fx-revaluations" columns={REVAL_COLS} rows={revals} disabled={revals.length === 0} />
            </div>
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>Period</Th><Th>Currency</Th><Th num>Unrealised</Th><Th>Status</Th><Th>As at</Th>
                </THead>
                <TBody>
                  {revals.map((r: any) => {
                    const signed = Number(r.unrealised_minor);
                    return (
                      <Tr key={r.id}>
                        <Td className="font-medium">{r.period}</Td>
                        <Td>{r.currency}</Td>
                        <Td num>
                          <span className={signed > 0 ? 'text-emerald-700' : signed < 0 ? 'text-red-600' : 'text-gray-500'}>
                            {signed === 0 ? '—' : revMinor(Math.abs(signed))}
                          </span>
                        </Td>
                        <Td><Chip tone={r.status === 'posted' ? 'green' : r.status === 'reversed' ? 'blue' : 'neutral'}>{r.status}</Chip></Td>
                        <Td muted>{r.as_of_date}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </table>
            </TableShell>
          </div>
        )}
      </SectionCard>

      {/* ── History ───────────────────────────────────────────────────────── */}
      <SectionCard
        title="Rate history"
        description="Every rate ever entered, with where it came from. This is the audit trail behind each foreign document's rupee value."
        action={<ExportMenu filename="fx-rate-history" columns={RATE_COLS} rows={shownRates} disabled={shownRates.length === 0} />}
      >
        <FilterBar>
          <Field label="Show">
            <SelectInput value={historyFilter} onChange={(e) => { setHistoryFilter(e.target.value); histLc.setPage(1); }}
              className="min-w-[10rem]">
              <option value="">All currencies</option>
              {foreign.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </SelectInput>
          </Field>
          <Field label="From"><TextInput type="date" value={histLc.from} onChange={(e) => histLc.setFrom(e.target.value)} /></Field>
          <Field label="To"><TextInput type="date" value={histLc.to} onChange={(e) => histLc.setTo(e.target.value)} /></Field>
        </FilterBar>
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>As on</Th><Th>Currency</Th><Th num>₹ per unit</Th><Th>Where from</Th><Th>Note</Th>
            </THead>
            <TBody>
              {shownRates.length === 0 &&
                <EmptyRow colSpan={5}>{rates.length === 0 ? 'No rates entered yet.' : 'No rates match your filters.'}</EmptyRow>}
              {pageRates.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.as_of_date}</Td>
                  <Td>{r.currency}</Td>
                  <Td num>₹{r.rate}</Td>
                  <Td><Chip tone={r.source === 'customs' ? 'blue' : 'neutral'}>{SOURCE_LABEL[r.source] ?? r.source}</Chip></Td>
                  <Td muted className="max-w-[26rem]">{r.note ?? ''}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={histLc.page} pageSize={histLc.pageSize} total={shownRates.length} onPage={histLc.setPage} onPageSize={histLc.setPageSize} />
      </SectionCard>

      <SectionCard title="What this does and does not do" flush>
        <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
          <li><strong>Your books stay in ₹.</strong> Every ledger entry, GST figure and report is in rupees. The foreign amount and its rate are remembered on the document as the source record.</li>
          <li>A document uses the rate in force on <em>its own date</em> — not today's rate. Old bills keep the rate they were booked at, forever.</li>
          <li>When you pay a foreign bill at a different rate, the difference is worked out as a realised exchange gain or loss (accounts 4210 / 5910) — <em>if</em> automatic book-keeping is switched on for your store.</li>
          <li>Month-end revaluation of still-open foreign SUPPLIER bills is now available (above) — the unrealised difference is recorded for the period and reversed on the 1st. Have your CA confirm the revaluation policy and the reversing convention before relying on it.</li>
          <li>What it deliberately does NOT do yet: revalue the receivable side (your sales are priced and posted in ₹, so there is no open foreign receivable), fetch rates automatically from a feed, or price your storefront/checkout in another currency.</li>
          <li>Have a CA confirm your rate policy and the two exchange accounts before relying on this for a filing.</li>
        </ul>
      </SectionCard>
    </Page>
  );
};

export default FxRates;
