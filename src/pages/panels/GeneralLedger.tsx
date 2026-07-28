import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TextInput, SelectInput, Field, inrMinor,
} from '../../components/erp';

/**
 * General Ledger / Account Transactions — pick any chart-of-accounts account and
 * see its running-balance ledger over a date range (Zoho "Account Transactions").
 * Opening balance carried in, every posted journal line, a running balance after
 * each line, and the closing balance — which ties to the trial balance.
 * Reads GET /accounting/accounts + GET /accounting/reports/account-ledger.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const fyStart = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

function downloadBlob(res: any, filename: string) {
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data as any], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

const errMsg = (e: any) => e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message ?? 'Something went wrong';

const GeneralLedger: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountCode, setAccountCode] = useState('1010'); // Bank by default
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = payload<any[]>(await api.get('/accounting/accounts'));
        const arr = Array.isArray(list) ? list : [];
        setAccounts(arr);
        if (arr.length && !arr.some((a) => a.code === accountCode)) setAccountCode(arr[0].code);
      } catch (e: any) { setError(errMsg(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    if (!accountCode) return;
    setLoading(true); setError('');
    try {
      setData(payload<any>(await api.get('/accounting/reports/account-ledger', { params: { accountCode, from, to } })));
    } catch (e: any) { setError(errMsg(e)); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (accounts.length) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accounts.length]);

  const downloadCsv = async () => {
    downloadBlob(
      await api.get('/accounting/reports/account-ledger', { params: { accountCode, from, to, format: 'csv' }, responseType: 'blob' }),
      `account-ledger-${accountCode}-${from}-to-${to}.csv`,
    );
  };

  return (
    <Page>
      <PageHeader
        title="General Ledger"
        description="Pick any account and see every posted entry with a running balance over a date range. The closing balance ties to the trial balance."
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Account" className="min-w-[16rem]">
          <SelectInput value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
            {accounts.length === 0 && <option value="">Loading accounts…</option>}
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Btn onClick={load} disabled={!accountCode}>Show</Btn>
        <Btn variant="success" onClick={downloadCsv} disabled={!data}>Download CSV</Btn>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Opening balance" value={inrMinor(data.openingBalanceMinor)} />
            <StatCard label="Total debits" value={inrMinor(data.periodDebitMinor)} tone="info" />
            <StatCard label="Total credits" value={inrMinor(data.periodCreditMinor)} tone="warn" />
            <StatCard label="Closing balance" value={inrMinor(data.closingBalanceMinor)} tone="good"
              sub={data.account?.debitNormal ? 'Debit-normal account' : 'Credit-normal account'} />
          </StatGrid>

          <SectionCard title={`${data.account.code} — ${data.account.name}`}>
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>Date</Th><Th>Journal</Th><Th>Type</Th><Th>Narration</Th>
                  <Th num>Debit</Th><Th num>Credit</Th><Th num>Running balance</Th>
                </THead>
                <TBody>
                  <Tr className="bg-gray-50 font-medium">
                    <Td muted>{data.from}</Td><Td colSpan={3}>Opening balance</Td>
                    <Td /><Td /><Td num>{inrMinor(data.openingBalanceMinor)}</Td>
                  </Tr>
                  {data.lines.length === 0 && <EmptyRow colSpan={7}>No transactions in this period.</EmptyRow>}
                  {data.lines.map((l: any, i: number) => (
                    <Tr key={`${l.journalId}-${i}`}>
                      <Td muted>{l.date}</Td>
                      <Td className="whitespace-nowrap">{l.journalNumber}</Td>
                      <Td muted>{l.documentType ?? ''}</Td>
                      <Td className="max-w-[24rem] truncate" title={l.narration ?? ''}>{l.narration ?? ''}</Td>
                      <Td num>{l.debitMinor === '0' ? '' : inrMinor(l.debitMinor)}</Td>
                      <Td num>{l.creditMinor === '0' ? '' : inrMinor(l.creditMinor)}</Td>
                      <Td num className={Number(l.runningBalanceMinor) < 0 ? 'text-red-600' : ''}>{inrMinor(l.runningBalanceMinor)}</Td>
                    </Tr>
                  ))}
                  <Tr className="bg-emerald-50 font-semibold">
                    <Td>{data.to}</Td><Td colSpan={2}>Closing balance</Td>
                    <Td />
                    <Td num>{inrMinor(data.periodDebitMinor)}</Td>
                    <Td num>{inrMinor(data.periodCreditMinor)}</Td>
                    <Td num>{inrMinor(data.closingBalanceMinor)}</Td>
                  </Tr>
                </TBody>
              </table>
            </TableShell>
          </SectionCard>

          <SectionCard title="How to read this" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default GeneralLedger;
