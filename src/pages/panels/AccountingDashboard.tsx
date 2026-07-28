import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMinor, fmtRupees } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries } from '../../components/panelAnalytics/Kit';
import { SERIES } from '../../components/panelAnalytics/vizTheme';
import { Page, PageHeader, SectionCard } from '../../components/erp';
import { BookOpen, Scale, FileSpreadsheet, ShieldAlert } from 'lucide-react';

/**
 * Accounting panel home. Books figures (positions, P&L) come from the GL in
 * minor units; GST trend comes from the order tax snapshots — the same source
 * the GSTR-1 draft reads, so the two screens always agree.
 */
const AccountingDashboard: React.FC = () => {
  const { user, hasPerm } = useAuth();
  const { range, preset, setPreset, custom, setCustom } = useDateRange('fy');
  const { data, error } = usePanelStats<any>('accounting', range);
  const [journals, setJournals] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [jRes, rcRes] = await Promise.allSettled([
        api.get('/accounting/journals', { params: { limit: 5 } }),
        api.get('/accounting/gst/rate-check'),
      ]);
      if (jRes.status === 'fulfilled') setJournals(payload(jRes.value) ?? []);
      if (rcRes.status === 'fulfilled') setFindings(payload<any>(rcRes.value)?.findings ?? []);
    })();
  }, []);

  const critical = findings.filter((f) => f.severity === 'critical');
  const tb = data?.trial_balance;
  const pos = data?.positions_minor;
  const pnlRows = (data?.pnl ?? []).map((r: any) => ({
    bucket: r.bucket,
    income: Number(r.income_minor) / 100,
    expense: Number(r.expense_minor) / 100,
  }));
  const gstRows = data?.gst_by_month ?? [];
  const glSales = Number(data?.books_vs_orders?.gl_sales_minor ?? 0) / 100;
  const orderSales = data?.books_vs_orders?.order_gross_sales ?? 0;

  return (
    <Page>
      <PageHeader
        title="Accounting"
        description={user?.role === 'auditor' ? 'Read-only auditor view — books, journals and GST reports.' : 'Books, journals and GST for this store.'}
        actions={<DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {critical.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-red-800">
            <ShieldAlert className="h-5 w-5" /> {critical.length} critical GST configuration finding{critical.length > 1 ? 's' : ''}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-red-700">
            {critical.map((f) => <li key={f.code}>{f.message}</li>)}
          </ul>
          <Link to="/panel/accounting/rate-check" className="mt-2 inline-block text-sm font-medium text-red-800 underline">
            Review in Rate Check →
          </Link>
        </div>
      )}

      {tb && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Trial balance"
            value={tb.nets_to_zero ? 'Balanced' : 'OUT OF BALANCE'}
            sub={`Dr ${fmtMinor(tb.total_debit_minor)} · Cr ${fmtMinor(tb.total_credit_minor)}${tb.as_of ? ` as of ${tb.as_of}` : ''}`} />
          <StatTile label="Cash & bank" value={fmtMinor(pos.cash_and_bank)} />
          <StatTile label="Receivables / Payables"
            value={fmtMinor(pos.accounts_receivable)}
            sub={`AP ${fmtMinor(pos.accounts_payable)} · GR/IR ${fmtMinor(pos.grir_clearing)}`} />
          <StatTile label="Inventory (books)" value={fmtMinor(pos.inventory)}
            sub={`GST output ${fmtMinor(pos.gst_output)} · input ${fmtMinor(pos.gst_input)}`} />
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="P&L from the books" sub="Income vs expense posted to the GL (by period)">
            {pnlRows.length > 0 ? (
              <TimeSeries data={pnlRows} granularity={data.bucket === 'day' ? 'day' : 'month'} money
                series={[
                  { key: 'income', name: 'Income', color: SERIES[0], kind: 'bar', money: true },
                  { key: 'expense', name: 'Expense', color: SERIES[1], kind: 'bar', money: true },
                ]} />
            ) : (
              <div className="py-10 text-center text-sm text-gray-500">
                No GL postings in range. Order→GL auto-posting is
                {' '}<Link to="/panel/accounting/settings" className="font-medium text-gray-900 underline">flag-gated in Settings</Link>{' '}
                (CA gate before enabling on real books).
              </div>
            )}
          </ChartCard>

          <ChartCard title="GST by month" sub="From order tax snapshots — same source as the GSTR-1 draft">
            {gstRows.length > 0 ? (
              <TimeSeries data={gstRows} granularity="month" money
                series={[
                  { key: 'cgst', name: 'CGST', color: SERIES[0], kind: 'bar', stackId: 'gst', money: true },
                  { key: 'sgst', name: 'SGST', color: SERIES[1], kind: 'bar', stackId: 'gst', money: true },
                  { key: 'igst', name: 'IGST', color: SERIES[2], kind: 'bar', stackId: 'gst', money: true },
                ]} />
            ) : <div className="py-10 text-center text-sm text-gray-500">No orders with tax snapshots in range.</div>}
          </ChartCard>
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <StatTile label="Order sales in range" value={fmtRupees(orderSales)}
            sub="Gross non-cancelled order value" />
          <StatTile label="Posted to 4000 Sales" value={fmtRupees(glSales)}
            sub={glSales === 0 && orderSales > 0 ? 'Books lag orders — GL auto-posting is off' : 'Books vs orders'} />
          <StatTile label="Journals in range"
            value={Number(data.journals?.journals ?? 0).toLocaleString('en-IN')}
            sub={`${Number(data.journals?.reversed ?? 0)} reversed`} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/panel/accounting/trial-balance', icon: Scale, title: 'Trial Balance', sub: tb ? (tb.nets_to_zero ? 'Nets to zero ✔' : '⚠ OUT OF BALANCE') : '—' },
          { to: '/panel/accounting/journals', icon: BookOpen, title: 'Journals', sub: `${journals.length ? journals[0].journal_number : 'No entries yet'}` },
          { to: '/panel/accounting/gstr1', icon: FileSpreadsheet, title: 'GSTR-1 Draft', sub: 'Outward supplies by period' },
          { to: '/panel/accounting/rate-check', icon: ShieldAlert, title: 'GST Rate Check', sub: `${findings.filter((f) => f.severity !== 'info').length} finding(s)` },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
            <c.icon className="h-6 w-6 text-gray-700" />
            <div className="mt-2 font-semibold text-gray-900">{c.title}</div>
            <div className="text-sm text-gray-500">{c.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Vendor bills (in range)" flush>
          <div className="divide-y divide-gray-100 text-sm">
            {(data?.vendor_bills ?? []).length === 0 && <div className="p-5 text-gray-500">No vendor bills in range.</div>}
            {(data?.vendor_bills ?? []).map((b: any) => (
              <div key={b.status} className="flex items-center justify-between px-5 py-2.5">
                <span className="capitalize text-gray-700">{b.status}</span>
                <span className="tabular-nums">{fmtMinor(b.value_minor)}
                  <span className="ml-2 text-xs text-gray-400">{b.count} bill(s)</span>
                </span>
              </div>
            ))}
            <div className="px-5 py-2.5">
              <Link to="/panel/accounting/bills" className="text-sm font-medium text-gray-900 hover:underline">Vendor bills →</Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Recent journals"
          action={hasPerm('accounting.post') && (
            <Link to="/panel/accounting/journals?new=1" className="text-sm font-medium text-gray-900 hover:underline">+ Manual journal</Link>
          )}
          flush
        >
          <div className="divide-y divide-gray-100 text-sm">
            {journals.length === 0 && <div className="p-5 text-gray-500">No journals posted yet.</div>}
            {journals.map((j) => (
              <div key={j.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <span className="font-mono font-medium">{j.journal_number}</span>
                  <span className="ml-2 text-gray-500">{j.narration ?? j.document_type}</span>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">{fmtMinor(j.total_debit_minor)}</div>
                  <div className="text-xs text-gray-400">{j.journal_date}{j.status === 'reversed' ? ' · reversed' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </Page>
  );
};

export default AccountingDashboard;
