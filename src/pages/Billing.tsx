import { useState, useEffect } from 'react';
import { billingAPI } from '../services/api';

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

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c' },
  paid: { label: 'Paid', bg: '#f0fdf4', color: '#16a34a' },
  overdue: { label: 'Overdue', bg: '#fef2f2', color: '#dc2626' },
  waived: { label: 'Waived', bg: '#f3f4f6', color: '#6b7280' },
};

export default function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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

  return (
    <div className="billing-page">
      <div className="page-header">
        <div>
          <h1>Billing & Invoices</h1>
          <p className="subtitle">View your usage, invoices and make payments.</p>
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
                  {new Date(usage.period.start).toLocaleDateString()} – {new Date(usage.period.end).toLocaleDateString()}
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
                  <span className="stat-label">Commission</span>
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
            <h2>Invoices</h2>
            {invoices.length === 0 ? (
              <div className="empty"><p>No invoices found.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Period</th>
                      <th>Commission</th>
                      <th>API Cost</th>
                      <th>Fixed Fee</th>
                      <th>Total</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                      return (
                        <tr key={inv._id}>
                          <td><strong>{inv.invoiceNumber ?? inv._id.slice(-8)}</strong></td>
                          <td>
                            {inv.period
                              ? `${new Date(inv.period.start).toLocaleDateString()} – ${new Date(inv.period.end).toLocaleDateString()}`
                              : '—'}
                          </td>
                          <td>{fmt(inv.commissionAmount)}</td>
                          <td>{fmt(inv.apiUsageAmount)}</td>
                          <td>{fmt(inv.fixedFee)}</td>
                          <td><strong>{fmt(inv.totalAmount)}</strong></td>
                          <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                          <td>
                            <span className="status-pill" style={{ background: sc.bg, color: sc.color }}>
                              {sc.label}
                            </span>
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
                                {new Date(inv.paidAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .billing-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: #666; font-size: 0.875rem; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }
        .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading { text-align: center; padding: 60px; }
        .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .usage-card { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; color: #fff; }
        .usage-card h2 { margin: 0 0 4px; font-size: 1rem; font-weight: 600; opacity: 0.9; }
        .period { margin: 0 0 20px; font-size: 0.8rem; opacity: 0.75; }
        .usage-stats { display: flex; gap: 0; flex-wrap: wrap; }
        .stat { flex: 1; min-width: 120px; padding: 0 20px; border-right: 1px solid rgba(255,255,255,0.2); }
        .stat:first-child { padding-left: 0; }
        .stat:last-child { border-right: none; }
        .stat-label { display: block; font-size: 0.75rem; opacity: 0.75; margin-bottom: 4px; }
        .stat-value { display: block; font-size: 1.2rem; font-weight: 700; }
        .stat-total .stat-value { font-size: 1.4rem; }
        .invoices-section h2 { font-size: 1.1rem; margin: 0 0 16px; color: #374151; }
        .empty { text-align: center; padding: 40px; color: #9ca3af; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th { padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        tr:hover td { background: #fafafa; }
        .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
        .paid-date { font-size: 0.75rem; color: #9ca3af; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-sm { padding: 4px 12px; font-size: 0.8rem; }
        .btn-primary { background: #4f46e5; color: #fff; }
        .btn-primary:hover { background: #4338ca; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
