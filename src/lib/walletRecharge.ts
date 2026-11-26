import { token } from '@/lib/theme';
import { walletAPI } from '../services/api';
import { fmtRupees } from '@/lib/money';

/**
 * Adding money to the store's Growcord wallet through Razorpay: the ONE recharge flow. The Wallet page
 * (Settings, Wallet) and the Growcord Ship pages both start it here, so a payment is created, paid and
 * verified the same way wherever the button sits (`POST /wallet/recharges`, then `/verify`; billing.manage).
 */

declare global {
  interface Window { Razorpay?: any; }
}

// Razorpay's checkout widget is not preloaded anywhere in the admin shell: load it once, lazily.
export function loadRazorpayScript(): Promise<boolean> {
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

const extractError = (err: any) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || 'Something went wrong. Please try again.';

export interface RechargeHandlers {
  /** The payment was verified and the wallet credited with `amount` rupees. */
  onPaid: (amount: number) => void;
  /** Why it did not go through, in words. */
  onError: (message: string) => void;
  /** The flow is over, paid or not (the button can be used again). */
  onDone: () => void;
}

/** Opens Razorpay for `amount` rupees and credits the wallet once the payment is verified. */
export async function startWalletRecharge(amount: number, h: RechargeHandlers): Promise<void> {
  try {
    const order = await walletAPI.createRechargeOrder(amount);
    const ready = await loadRazorpayScript();
    if (!ready || !window.Razorpay) {
      h.onError('Could not load the payment widget. Check your connection and try again.');
      h.onDone();
      return;
    }
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: Math.round(order.amount * 100),
      currency: order.currency || 'INR',
      name: 'Wallet Top-up',
      description: `Add ${fmtRupees(order.amount)} to store wallet`,
      order_id: order.razorpay_order_id,
      handler: async (response: any) => {
        try {
          await walletAPI.verifyRecharge({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          h.onPaid(Number(order.amount));
        } catch (err: any) {
          h.onError(extractError(err));
        } finally {
          h.onDone();
        }
      },
      modal: { ondismiss: () => h.onDone() },
      theme: { color: token('accent') },
    });
    rzp.on('payment.failed', () => { h.onError('Payment failed. No amount was deducted from the wallet.'); h.onDone(); });
    rzp.open();
  } catch (err: any) {
    h.onError(extractError(err));
    h.onDone();
  }
}
