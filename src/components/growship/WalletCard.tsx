import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Plus, Wallet as WalletIcon } from 'lucide-react';
import { walletAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { startWalletRecharge } from '@/lib/walletRecharge';
import { fmtRupees } from '@/lib/money';
import { Btn, SectionCard, TextInput } from '../erp';

/** The store's Growcord wallet (`GET /wallet`, platform WalletView). Money in rupees. */
export interface StoreWallet {
  balance: number;
  low_balance_threshold: number | null;
  is_low: boolean;
  allow_negative: boolean;
  is_active: boolean;
}

/**
 * The wallet Growcord Ship freight comes off, read once when the screen opens (billing.read). `wallet` is
 * `undefined` while asking and `null` when it cannot be read; `error` says why.
 */
export function useStoreWallet(enabled = true) {
  const [wallet, setWallet] = useState<StoreWallet | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!enabled) { setWallet(null); return; }
    walletAPI.get()
      .then((w: any) => {
        const balance = Number(w?.balance);
        if (!Number.isFinite(balance)) { setWallet(null); setError('The wallet answered without a balance.'); return; }
        setError(null);
        setWallet({
          balance,
          low_balance_threshold: w?.low_balance_threshold == null ? null : Number(w.low_balance_threshold),
          is_low: !!w?.is_low,
          allow_negative: !!w?.allow_negative,
          is_active: w?.is_active !== false,
        });
      })
      .catch((e) => { setWallet(null); setError(errorText(e, 'The wallet could not be read.')); });
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { wallet, error, reload };
}

/** Amount box and Add money: the shared Razorpay recharge (lib/walletRecharge.ts). Shown only with billing.manage. */
export const WalletRechargeBox: React.FC<{ onPaid: (amount: number) => void; defaultAmount?: number; compact?: boolean }> = ({
  onPaid, defaultAmount = 1000, compact,
}) => {
  const { hasPerm } = useAuth();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { setAmount(String(defaultAmount)); }, [defaultAmount]);
  if (!hasPerm('billing.manage')) {
    return <p className="text-xs text-gray-500">Adding money needs the billing.manage permission. Ask the store owner.</p>;
  }
  const go = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { setError('Enter an amount in rupees.'); return; }
    setError(null); setDone(null); setBusy(true);
    await startWalletRecharge(n, {
      onPaid: (paid) => { setDone(`${fmtRupees(paid)} added to the wallet.`); onPaid(paid); },
      onError: (m) => setError(m),
      onDone: () => setBusy(false),
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className={compact ? 'block' : 'block space-y-1'}>
          {!compact && <span className="block text-xs font-medium text-gray-500">Amount (Rs)</span>}
          <TextInput
            type="number" min="1" step="1" inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value)} className="w-32" aria-label="Amount to add in rupees"
          />
        </label>
        <Btn onClick={go} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add money
        </Btn>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && <p className="text-xs text-emerald-700">{done}</p>}
    </div>
  );
};

/** Balance, low balance warning and Add money, as one card. */
export const WalletCard: React.FC<{
  wallet: StoreWallet | null | undefined;
  error: string | null;
  onChanged: () => void;
  /** Rupees the next bookings need, when known: the card says whether the balance covers it. */
  needed?: number | null;
}> = ({ wallet, error, onChanged, needed }) => {
  const { hasPerm } = useAuth();
  if (!hasPerm('billing.read')) {
    return (
      <SectionCard title="Wallet">
        <p className="text-sm text-gray-600">Growcord Ship freight comes off the store wallet. Seeing its balance needs the billing.read permission.</p>
      </SectionCard>
    );
  }
  const short = wallet && needed != null && needed > 0 && !wallet.allow_negative ? Math.max(0, needed - wallet.balance) : 0;
  const low = !!wallet && (wallet.is_low || wallet.balance <= 0);
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><WalletIcon className="h-4 w-4 text-gray-500" /> Wallet</span>}
      description="Growcord Ship freight is taken from this balance when a parcel is booked."
      action={<Link to="/growship/wallet" className="text-sm text-blue-700 hover:underline">Wallet history</Link>}
    >
      {wallet === undefined && <p className="text-sm text-gray-500">Reading the balance...</p>}
      {wallet === null && <p className="text-sm text-red-600">{error || 'The wallet could not be read.'}</p>}
      {wallet && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Balance</div>
            <div className={`text-3xl font-bold tabular-nums ${low ? 'text-red-700' : 'text-gray-900'}`}>{fmtRupees(wallet.balance)}</div>
            {wallet.low_balance_threshold != null && (
              <div className="mt-1 text-xs text-gray-500">Low balance alert below {fmtRupees(wallet.low_balance_threshold)}.</div>
            )}
            {needed != null && needed > 0 && (
              <div className={`mt-1 text-sm ${short > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {short > 0 ? `Short by ${fmtRupees(short)} for these bookings (${fmtRupees(needed)}).` : `Covers these bookings (${fmtRupees(needed)}).`}
              </div>
            )}
          </div>
          {wallet.is_active ? <WalletRechargeBox onPaid={onChanged} defaultAmount={short > 0 ? Math.ceil(short / 100) * 100 : 1000} /> : null}
        </div>
      )}
      {wallet && !wallet.is_active && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> The wallet is switched off. Ask Growcord support to switch it on.
        </p>
      )}
      {wallet && wallet.is_active && low && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          The balance is low. A Growcord Ship booking is refused when the wallet cannot cover its freight. Add money before booking.
        </p>
      )}
    </SectionCard>
  );
};

export default WalletCard;
