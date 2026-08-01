import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Card, SectionCard, Field, TextInput, SelectInput,
  ExportMenu, DrillLink, type CsvColumn,
} from '../../components/erp';

const obCols: CsvColumn<any>[] = [
  { key: 'section', label: 'Section' },
  { key: 'ref', label: 'Account / Party' },
  { key: 'name', label: 'Name' },
  { key: 'debitMinor', label: 'Debit', money: true },
  { key: 'creditMinor', label: 'Credit', money: true },
];

interface Account { code: string; name: string; account_type: string; is_active: boolean; }
interface AccRow { code: string; debit: string; credit: string; }
interface SubRow { label: string; amount: string; }

const emptyAcc = (): AccRow => ({ code: '', debit: '', credit: '' });
const emptySub = (): SubRow => ({ label: '', amount: '' });
const rup = (minor: string | number) => (Number(minor) / 100);
const minor = (rupees: string) => Math.round((Number(rupees) || 0) * 100);
const inr = (n: number) => `₹${n.toFixed(2)}`;

const OpeningBalances: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [accRows, setAccRows] = useState<AccRow[]>([emptyAcc()]);
  const [custRows, setCustRows] = useState<SubRow[]>([emptySub()]);
  const [venRows, setVenRows] = useState<SubRow[]>([emptySub()]);
  const [existingJournal, setExistingJournal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const load = async () => {
    try {
      const [accRes, obRes] = await Promise.all([
        api.get('/accounting/coa/accounts'),
        api.get('/accounting/coa/opening-balances'),
      ]);
      setAccounts((payload(accRes) ?? []).filter((a: Account) => a.is_active));
      const ob = payload(obRes) ?? {};
      setExistingJournal(ob.journalNumber ?? null);
      if (ob.openingDate) setOpeningDate(ob.openingDate);
      const ar: AccRow[] = (ob.accounts ?? []).map((a: any) => ({
        code: a.code,
        debit: Number(a.debitMinor) > 0 ? String(rup(a.debitMinor)) : '',
        credit: Number(a.creditMinor) > 0 ? String(rup(a.creditMinor)) : '',
      }));
      setAccRows(ar.length ? ar : [emptyAcc()]);
      const cr: SubRow[] = (ob.customers ?? []).map((c: any) => ({ label: c.label ?? c.ref, amount: String(rup(c.amountMinor)) }));
      setCustRows(cr.length ? cr : [emptySub()]);
      const vr: SubRow[] = (ob.vendors ?? []).map((v: any) => ({ label: v.label ?? v.ref, amount: String(rup(v.amountMinor)) }));
      setVenRows(vr.length ? vr : [emptySub()]);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  // Live balance maths (rupees).
  const accDr = accRows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const accCr = accRows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const custDr = custRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const venCr = venRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalDr = accDr + custDr;
  const totalCr = accCr + venCr;
  const plug = totalDr - totalCr;               // + ⇒ Cr 3900, − ⇒ Dr 3900

  const setAcc = (i: number, patch: Partial<AccRow>) =>
    setAccRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setError(''); setResult(null); setBusy(true);
    try {
      const res = await api.post('/accounting/coa/opening-balances', {
        openingDate,
        accounts: accRows
          .filter((r) => r.code && (Number(r.debit) > 0 || Number(r.credit) > 0))
          .map((r) => ({
            code: r.code,
            debitMinor: Number(r.debit) > 0 ? String(minor(r.debit)) : undefined,
            creditMinor: Number(r.credit) > 0 ? String(minor(r.credit)) : undefined,
          })),
        customers: custRows.filter((r) => r.label && Number(r.amount) > 0)
          .map((r) => ({ ref: r.label, label: r.label, amountMinor: String(minor(r.amount)) })),
        vendors: venRows.filter((r) => r.label && Number(r.amount) > 0)
          .map((r) => ({ ref: r.label, label: r.label, amountMinor: String(minor(r.amount)) })),
      });
      setResult(payload(res));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const nothingEntered = totalDr === 0 && totalCr === 0;

  const exportRows = [
    ...accRows.filter((r) => r.code && (Number(r.debit) > 0 || Number(r.credit) > 0)).map((r) => ({
      section: 'Account', ref: r.code, name: accounts.find((a) => a.code === r.code)?.name ?? '',
      debitMinor: String(minor(r.debit || '0')), creditMinor: String(minor(r.credit || '0')),
    })),
    ...custRows.filter((r) => r.label && Number(r.amount) > 0).map((r) => ({
      section: 'Customer (AR 1100)', ref: '1100', name: r.label, debitMinor: String(minor(r.amount)), creditMinor: '0',
    })),
    ...venRows.filter((r) => r.label && Number(r.amount) > 0).map((r) => ({
      section: 'Vendor (AP 2100)', ref: '2100', name: r.label, debitMinor: '0', creditMinor: String(minor(r.amount)),
    })),
  ];

  return (
    <Page>
      <PageHeader
        title="Opening Balances"
        description="Enter balances as of your books opening date. One balanced journal is posted; everything nets against 3900 Opening Balance Equity. Re-posting replaces the last entry (reverses + re-posts) — it never duplicates."
        actions={
          <ExportMenu filename={`opening-balances-${openingDate}`} columns={obCols} rows={exportRows} disabled={!exportRows.length} />
        }
      />

      {existingJournal && (
        <div className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 ring-1 ring-inset ring-blue-600/20">
          An opening journal already exists (<DrillLink to={`/panel/accounting/journals?q=${encodeURIComponent(existingJournal)}`} title="Find this journal">{existingJournal}</DrillLink>). Posting again will reverse it and re-post the values below.
        </div>
      )}

      <SectionCard title="Books opening date">
        <Field label="As of">
          <TextInput type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </Field>
      </SectionCard>

      <SectionCard title="Account opening balances">
        <div className="space-y-2">
          {accRows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <SelectInput className="min-w-[260px]" value={r.code} onChange={(e) => setAcc(i, { code: e.target.value })}>
                <option value="">— account —</option>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name} ({a.account_type})</option>)}
              </SelectInput>
              <TextInput type="number" min="0" step="0.01" placeholder="Debit ₹" className="w-32 text-right tabular-nums"
                value={r.debit} onChange={(e) => setAcc(i, { debit: e.target.value, credit: '' })} />
              <TextInput type="number" min="0" step="0.01" placeholder="Credit ₹" className="w-32 text-right tabular-nums"
                value={r.credit} onChange={(e) => setAcc(i, { credit: e.target.value, debit: '' })} />
              {accRows.length > 1 && (
                <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                  onClick={() => setAccRows((rs) => rs.filter((_, j) => j !== i))}>✕</Btn>
              )}
            </div>
          ))}
          <Btn variant="ghost" size="sm" onClick={() => setAccRows((rs) => [...rs, emptyAcc()])}>+ account line</Btn>
        </div>
      </SectionCard>

      <SectionCard title="Customer opening balances (receivable — they owe you)">
        <div className="space-y-2">
          {custRows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <TextInput className="min-w-[260px]" placeholder="Customer name / reference"
                value={r.label} onChange={(e) => setCustRows((rs) => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <TextInput type="number" min="0" step="0.01" placeholder="Amount ₹" className="w-32 text-right tabular-nums"
                value={r.amount} onChange={(e) => setCustRows((rs) => rs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
              {custRows.length > 1 && (
                <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                  onClick={() => setCustRows((rs) => rs.filter((_, j) => j !== i))}>✕</Btn>
              )}
            </div>
          ))}
          <Btn variant="ghost" size="sm" onClick={() => setCustRows((rs) => [...rs, emptySub()])}>+ customer</Btn>
        </div>
      </SectionCard>

      <SectionCard title="Vendor opening balances (payable — you owe them)">
        <div className="space-y-2">
          {venRows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <TextInput className="min-w-[260px]" placeholder="Vendor name / reference"
                value={r.label} onChange={(e) => setVenRows((rs) => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <TextInput type="number" min="0" step="0.01" placeholder="Amount ₹" className="w-32 text-right tabular-nums"
                value={r.amount} onChange={(e) => setVenRows((rs) => rs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
              {venRows.length > 1 && (
                <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                  onClick={() => setVenRows((rs) => rs.filter((_, j) => j !== i))}>✕</Btn>
              )}
            </div>
          ))}
          <Btn variant="ghost" size="sm" onClick={() => setVenRows((rs) => [...rs, emptySub()])}>+ vendor</Btn>
        </div>
      </SectionCard>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="tabular-nums">Total debits <b>{inr(totalDr)}</b></span>
          <span className="tabular-nums">Total credits <b>{inr(totalCr)}</b></span>
          <span className="tabular-nums text-gray-600">
            → 3900 Opening Balance Equity: {plug === 0 ? 'none' : plug > 0 ? `Credit ${inr(plug)}` : `Debit ${inr(-plug)}`}
          </span>
          <span className="text-emerald-700">Journal will balance ✔</span>
          {canPost && (
            <Btn variant="success" disabled={busy || nothingEntered} onClick={submit}>Post opening journal</Btn>
          )}
        </div>
        {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
        {result && (
          <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
            Posted <b><DrillLink to={`/panel/accounting/journals?q=${encodeURIComponent(result.journalNumber)}`} title="Find this journal">{result.journalNumber}</DrillLink></b> as of {result.openingDate} —
            Dr {inr(rup(result.totalDebitMinor))} / Cr {inr(rup(result.totalCreditMinor))}
            {result.balanced ? ' · balanced ✔' : ' · NOT balanced ✖'}
            {result.reversedPrior?.length ? ` (replaced ${result.reversedPrior.join(', ')})` : ''}
          </div>
        )}
      </Card>
    </Page>
  );
};

export default OpeningBalances;
