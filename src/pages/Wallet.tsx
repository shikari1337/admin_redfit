import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Wallet as WalletIcon, AlertTriangle, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { walletAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { localeDateTime } from '../utils/date';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface WalletBalance {
  balance: number;
  currency: string;
  low_balance_threshold: number;
  is_low: boolean;
  allow_negative: boolean;
  is_active: boolean;
}

interface WalletTransaction {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  category: string;
  reference?: string | null;
  note?: string | null;
  created_at: string;
}

interface Recharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  razorpay_payment_id?: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;
const SERVICE_LABELS: Record<string, string> = {
  sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', shipping: 'Shipping label', ai: 'AI generation',
};

declare global {
  interface Window { Razorpay?: any; }
}

// Razorpay's checkout widget isn't preloaded anywhere in the admin shell — load it once, lazily.
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) { existing.addEventListener('load', () => resolve(true)); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const fmtMoney = (n: number | undefined, currency = 'INR') =>
  `${currency === 'INR' ? '₹' : currency + ' '}${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  // Backend (routes/wallet.ts): reads (balance/transactions/pricing/recharges) are
  // billing.read, which the route-level RouteGuard already covers to reach this page.
  // The only write action is recharge create-order+verify -> billing.manage — this page
  // had ZERO client-side gating on it before.
  const canManageBilling = hasPerm('billing.manage');
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [directionFilter, setDirectionFilter] = useState<'' | 'credit' | 'debit'>('');

  const [rechargeAmount, setRechargeAmount] = useState('500');
  const [recharging, setRecharging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const extractError = (err: any) =>
    err?.response?.data?.error?.message || err?.response?.data?.message || 'Something went wrong. Please try again.';

  const loadOverview = async () => {
    try {
      setLoading(true);
      const [w, p, r] = await Promise.all([
        walletAPI.get(), walletAPI.getPricing(), walletAPI.getRecharges(),
      ]);
      setWallet(w);
      setPricing(p || {});
      setRecharges(Array.isArray(r) ? r : []);
    } catch (err: any) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (page: number, direction: '' | 'credit' | 'debit') => {
    try {
      const list = await walletAPI.getTransactions({
        page, limit: PAGE_SIZE, ...(direction ? { direction } : {}),
      });
      setTransactions(Array.isArray(list) ? list : []);
      setTxTotal(typeof (list as any)?.total === 'number' ? (list as any).total : (Array.isArray(list) ? list.length : 0));
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { loadTransactions(txPage, directionFilter); }, [txPage, directionFilter]);

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    setError(null);
    setRecharging(true);
    try {
      const order = await walletAPI.createRechargeOrder(amount);
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setError('Could not load the payment widget. Check your connection and try again.');
        setRecharging(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: Math.round(order.amount * 100),
        currency: order.currency || 'INR',
        name: 'Wallet Top-up',
        description: `Add ${fmtMoney(order.amount)} to store wallet`,
        order_id: order.razorpay_order_id,
        handler: async (response: any) => {
          try {
            await walletAPI.verifyRecharge({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setSuccess(`Wallet credited with ${fmtMoney(order.amount)}.`);
            setTimeout(() => setSuccess(null), 5000);
            loadOverview();
            loadTransactions(1, directionFilter);
            setTxPage(1);
          } catch (err: any) {
            setError(extractError(err));
          } finally {
            setRecharging(false);
          }
        },
        modal: { ondismiss: () => setRecharging(false) },
        theme: { color: '#dc2626' },
      });
      rzp.on('payment.failed', () => { setError('Payment failed. No amount was deducted from the wallet.'); setRecharging(false); });
      rzp.open();
    } catch (err: any) {
      setError(extractError(err));
      setRecharging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(txTotal / PAGE_SIZE));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your prepaid balance for metered services — SMS, WhatsApp, email, shipping labels and AI generation.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      {/* Balance */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <WalletIcon className="h-4 w-4" /> Current balance
              </div>
              <div className="text-4xl font-bold tracking-tight">{fmtMoney(wallet?.balance, wallet?.currency)}</div>
              <div className="flex items-center gap-2 mt-2">
                {wallet?.is_low && (
                  <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Low balance</Badge>
                )}
                {!wallet?.is_active && <Badge variant="destructive">Wallet inactive</Badge>}
                {wallet?.is_active && !wallet?.is_low && <Badge className="bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25">Active</Badge>}
              </div>
              {wallet && (
                <p className="text-xs text-muted-foreground mt-2">
                  Low-balance alert threshold: {fmtMoney(wallet.low_balance_threshold, wallet.currency)}
                  {wallet.allow_negative ? ' · Negative balance allowed' : ''}
                </p>
              )}
            </div>
            {canManageBilling && (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Amount (₹)</label>
                  <Input
                    type="number" min="1" step="1" value={rechargeAmount}
                    onChange={e => setRechargeAmount(e.target.value)}
                    className="w-32 h-9"
                  />
                </div>
                <Button onClick={handleRecharge} disabled={recharging} className="h-9">
                  {recharging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Money
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Service pricing */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">What each service costs</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(SERVICE_LABELS).map(([key, label]) => (
              <div key={key} className="rounded-md border p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="font-semibold">{fmtMoney(pricing[key], wallet?.currency)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recharge history */}
      {recharges.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recharge history</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recharges.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{localeDateTime(r.created_at, undefined, 'en-IN')}</TableCell>
                    <TableCell className="font-medium">{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'paid' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                        className={r.status === 'paid' ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{r.razorpay_payment_id || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Transaction ledger */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Transaction ledger</CardTitle>
          <div className="flex gap-1">
            {(['', 'credit', 'debit'] as const).map(d => (
              <Button
                key={d || 'all'} size="sm" variant={directionFilter === d ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => { setDirectionFilter(d); setTxPage(1); }}
              >
                {d === '' ? 'All' : d === 'credit' ? 'Credits' : 'Debits'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
              ) : transactions.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm">{localeDateTime(tx.created_at, undefined, 'en-IN')}</TableCell>
                  <TableCell className="capitalize text-sm">{tx.category.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{tx.note || tx.reference || '—'}</TableCell>
                  <TableCell className={`text-right font-medium flex items-center justify-end gap-1 ${tx.direction === 'credit' ? 'text-green-600' : 'text-destructive'}`}>
                    {tx.direction === 'credit' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    {tx.direction === 'credit' ? '+' : '-'}{fmtMoney(tx.amount, wallet?.currency)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{fmtMoney(tx.balance_after, wallet?.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {txTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Page {txPage} of {totalPages} · {txTotal} total</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={txPage >= totalPages} onClick={() => setTxPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
