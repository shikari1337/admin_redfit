import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { fmtMinor } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Field, TextInput, Btn,
  ExportMenu, DrillLink, type CsvColumn,
} from '../../components/erp';

// The account rows are already client-held — CSV is assembled in the browser (money = minor units).
const tbCols: CsvColumn<any>[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Account' },
  { key: 'account_type', label: 'Type' },
  { key: 'debit_minor', label: 'Debit', money: true },
  { key: 'credit_minor', label: 'Credit', money: true },
];

const TrialBalance: React.FC = () => {
  const [asOf, setAsOf] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async (date?: string) => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/trial-balance', { params: date ? { asOf: date } : {} });
      setData(payload(res));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Page>
      <PageHeader
        title="Trial Balance"
        description="Derived from the append-only general ledger."
        actions={
          <div className="flex items-end gap-2">
            <Field label="As of"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <Btn onClick={() => load(asOf || undefined)}>Apply</Btn>
            <ExportMenu
              filename={`trial-balance-${asOf || 'latest'}`}
              columns={tbCols}
              rows={data?.rows ?? []}
              disabled={!data?.rows?.length}
            />
          </div>
        }
      />

      {data && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${data.nets_to_zero ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {data.nets_to_zero
            ? `Balanced — debits ${fmtMinor(data.total_debit_minor)} = credits ${fmtMinor(data.total_credit_minor)}`
            : `OUT OF BALANCE — debits ${fmtMinor(data.total_debit_minor)} vs credits ${fmtMinor(data.total_credit_minor)} (invariant I2 broken — escalate)`}
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Code</Th>
            <Th>Account</Th>
            <Th>Type</Th>
            <Th num>Debit</Th>
            <Th num>Credit</Th>
          </THead>
          <TBody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
            {!loading && (!data?.rows?.length) && (
              <EmptyRow colSpan={5}>No GL activity{asOf ? ` up to ${asOf}` : ''}.</EmptyRow>
            )}
            {data?.rows?.map((r: any) => (
              <Tr key={r.code}>
                <Td className="font-mono">
                  <DrillLink to={`/panel/accounting/general-ledger?account=${r.code}${asOf ? `&to=${asOf}` : ''}`} title="View this account's ledger">{r.code}</DrillLink>
                </Td>
                <Td>{r.name}</Td>
                <Td muted className="capitalize">{r.account_type}</Td>
                <Td num>{fmtMinor(r.debit_minor)}</Td>
                <Td num>{fmtMinor(r.credit_minor)}</Td>
              </Tr>
            ))}
          </TBody>
          {data?.rows?.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2.5" colSpan={3}>Totals</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(data.total_debit_minor)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(data.total_credit_minor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </TableShell>
    </Page>
  );
};

export default TrialBalance;
