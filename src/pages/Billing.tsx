import { useState, useEffect } from 'react';
import { billingAPI } from '../services/api';
import StatusBadge from '../components/order/StatusBadge';
import { localeDate } from '../utils/date';
import InfoTip from '@/components/common/InfoTip';
import { downloadCsv, type CsvColumn } from '@/lib/csv';

interface Invoice {
  _id: string;
  invoiceNumber?: string;
  period?: { start: string; end: string };
  commissionAmount?: number;
  apiUsageAmount?: number;
  fixedFee?: number;
  totalAmount?: number;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  dueDate?: string;
  paidAt?: string;
  createdAt?: string;
}

interface UsageSummary {
  totalApiCalls?: number;
  estimatedCost?: number;
  commissionAmount?: number;
  fixedFee?: number;
  totalDue?: number;
  period?: { start: string; end: string };
}

/** The invoice list as a spreadsheet — the same columns the table shows. */
const BILLING_CSV_COLUMNS: CsvColumn<Invoice>[] = [
  { key: 'invoiceNumber', label: 'Invoice #', format: (i) => i.invoiceNumber ?? i._id.slice(-8) },
  { key: 'period', label: 'Period', format: (i) => (i.period ? `${i.period.start} to ${i.period.end}` : '') },
  { key: 'commissionAmount', label: 'Commission', format: (i) => Number(i.commissionAmount ?? 0).toFixed(2) },
  { key: 'apiUsageAmount', label: 'API cost', format: (i) => Number(i.apiUsageAmount ?? 0).toFixed(2) },
  { key: 'fixedFee', label: 'Fixed fee', format: (i) => Number(i.fixedFee ?? 0).toFixed(2) },
  { key: 'totalAmount', label: 'Total', format: (i) => Number(i.totalAmount ?? 0).toFixed(2) },
  { key: 'dueDate', label: 'Due', format: (i) => i.dueDate ?? '' },
  { key: 'status', label: 'Status' },
  { key: 'paidAt', label: 'Paid on', format: (i) => i.paidAt ?? '' },
];

export default function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [find, setFind] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invData, usageData] = await Promise.all([
        billingAPI.getInvoices({ limit: 20 }),
        billingAPI.getUsage({ period: 'current' }),
      ]);
      setInvoices(Array.isArray(invData) ? invData : invData?.invoices ?? invData?.data ?? []);
      setUsage(usageData?.usage ?? usageData?.data ?? usageData);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      setPayingId(invoiceId);
      setError(null);
      const initData = await billingAPI.initiatePayment(invoiceId);
      const order = initData?.order ?? initData;
      if (!order?.id) {
        setError('Failed to initiate payment. Please try again.');
        return;
      }

      if (!(window as any).Razorpay) {
        setError('Razorpay SDK not loaded. Please refresh the page.');
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency ?? 'INR',
        name: 'Store Billing',
        description: `Invoice Payment`,
        order_id: order.id,
        handler: async (response: any) => {
          try {
            await billingAPI.verifyPayment(invoiceId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setSuccess('Payment successful!');
            setTimeout(() => setSuccess(null), 4000);
            loadData();
          } catch {
            setError('Payment verification failed. Contact support.');
          }
        },
        modal: { ondismiss: () => setPayingId(null) },
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Payment initiation failed');
    } finally {
      setPayingId(null);
    }
  };

  const fmt = (n?: number) => n != null ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';

  /** The invoices the table draws, and what they add up to. */
  const shown = invoices.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    const q = find.trim().toLowerCase();
    if (!q) return true;
    return [inv.invoiceNumber, inv._id, inv.status, inv.period?.start, inv.period?.end]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  });
  const sum = (k: 'commissionAmount' | 'apiUsageAmount' | 'fixedFee' | 'totalAmount') =>
    shown.reduce((t, i) => t + Number(i[k] ?? 0), 0);

  return (
    <div className="billing-page">
      <div className="page-header">
        <div>
          <h1>What Growcord charges you</h1>
          <p className="subtitle">
            This month so far, and every invoice Growcord has raised for your store. These are the
            platform's bills to you — not the invoices you raise for your own customers.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {usage && (
            <div className="usage-card">
              <h2>Current Month Usage</h2>
              {usage.period && (
                <p className="period">
                  {localeDate(usage.period.start)} – {localeDate(usage.period.end)}
                </p>
              )}
              <div className="usage-stats">
                <div className="stat">
                  <span className="stat-label">API Calls</span>
                  <span className="stat-value">{(usage.totalApiCalls ?? 0).toLocaleString()}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">API Cost</span>
                  <span className="stat-value">{fmt(usage.estimatedCost)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">
                    Commission <InfoTip className="align-baseline" text="A share of the orders that have been delivered AND are past their return window. A sale usually earns commission in a LATER month than the one it was placed in." />
                  </span>
                  <span className="stat-value">{fmt(usage.commissionAmount)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Fixed Fee</span>
                  <span className="stat-value">{fmt(usage.fixedFee)}</span>
                </div>
                <div className="stat stat-total">
                  <span className="stat-label">Total Due</span>
                  <span className="stat-value">{fmt(usage.totalDue)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="invoices-section">
            <div className="section-head">
              <h2>Invoices</h2>
              <div className="section-actions">
                <input
                  className="find"
                  placeholder="Find an invoice…"
                  value={find}
                  onChange={(e) => setFind(e.target.value)} />
                <select className="find" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Any status</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="waived">Waived</option>
                </select>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={shown.length === 0}
                  onClick={() => downloadCsv('growcord-invoices', BILLING_CSV_COLUMNS, shown)}
                >Export CSV</button>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="empty"><p>
                {invoices.length === 0
                  ? 'No invoices yet. Growcord raises one per month, once there is something to bill.'
                  : 'No invoice matches those filters.'}
              </p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Period</th>
                      <th className="num">Commission ₹</th>
                      <th className="num">API cost ₹</th>
                      <th className="num">Fixed fee ₹</th>
                      <th className="num">Total ₹</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(inv => {
                      return (
                        <tr key={inv._id}>
                          <td><strong>{inv.invoiceNumber ?? inv._id.slice(-8)}</strong></td>
                          <td>
                            {inv.period
                              ? `${localeDate(inv.period.start)} – ${localeDate(inv.period.end)}`
                              : '—'}
                          </td>
                          <td className="num">{fmt(inv.commissionAmount)}</td>
                          <td className="num">{fmt(inv.apiUsageAmount)}</td>
                          <td className="num">{fmt(inv.fixedFee)}</td>
                          <td className="num"><strong>{fmt(inv.totalAmount)}</strong></td>
                          <td>{inv.dueDate ? localeDate(inv.dueDate) : '—'}</td>
                          <td>
                            <StatusBadge status={inv.status} type="billing" />
                          </td>
                          <td>
                            {(inv.status === 'pending' || inv.status === 'overdue') && (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={payingId === inv._id}
                                onClick={() => handlePayInvoice(inv._id)}
                              >
                                {payingId === inv._id ? 'Opening…' : 'Pay Now'}
                              </button>
                            )}
                            {inv.status === 'paid' && inv.paidAt && (
                              <span className="paid-date">
                                {localeDate(inv.paidAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{shown.length} invoice{shown.length === 1 ? '' : 's'}</td>
                      <td className="num">{fmt(sum('commissionAmount'))}</td>
                      <td className="num">{fmt(sum('apiUsageAmount'))}</td>
                      <td className="num">{fmt(sum('fixedFee'))}</td>
                      <td className="num"><strong>{fmt(sum('totalAmount'))}</strong></td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .billing-page { padding: 0; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: var(--n-500); font-size: 0.875rem; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: var(--d-50); border: 1px solid var(--d-300); color: var(--d-600); }
        .alert-success { background: var(--g-50); border: 1px solid var(--g-300); color: var(--g-600); }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading { text-align: center; padding: 60px; }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--n-200); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .usage-card { background: linear-gradient(135deg, var(--accent) 0%, var(--accent) 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; color: var(--surface); }
        .usage-card h2 { margin: 0 0 4px; font-size: 1rem; font-weight: 600; opacity: 0.9; }
        .period { margin: 0 0 20px; font-size: 0.8rem; opacity: 0.75; }
        .usage-stats { display: flex; gap: 0; flex-wrap: wrap; }
        .stat { flex: 1; min-width: 120px; padding: 0 20px; border-right: 1px solid color-mix(in srgb, var(--surface) 20%, transparent); }
        .stat:first-child { padding-left: 0; }
        .stat:last-child { border-right: none; }
        .stat-label { display: block; font-size: 0.75rem; opacity: 0.75; margin-bottom: 4px; }
        .stat-value { display: block; font-size: 1.2rem; font-weight: 700; }
        .stat-total .stat-value { font-size: 1.4rem; }
        .invoices-section h2 { font-size: 1.1rem; margin: 0; color: var(--n-700); }
        .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 16px; }
        .section-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .find { height: 32px; padding: 0 10px; font-size: 0.8125rem; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { padding: 10px 12px; border-top: 2px solid var(--n-200); background: var(--n-50); font-weight: 600; }
        .btn-outline { background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
        .empty { text-align: center; padding: 40px; color: var(--n-400); }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th { padding: 10px 12px; text-align: left; font-weight: 600; color: var(--n-700); background: var(--n-50); border-bottom: 2px solid var(--n-200); white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--n-100); vertical-align: middle; }
        tr:hover td { background: var(--n-50); }
        .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
        .paid-date { font-size: 0.75rem; color: var(--n-400); }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-sm { padding: 4px 12px; font-size: 0.8rem; }
        .btn-primary { background: var(--accent); color: var(--surface); }
        .btn-primary:hover { background: var(--b-700); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
