import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export interface SetupStep {
  key: string;
  label: string;
  description: string;
  path: string;
  done: boolean;
}

export interface SetupStatus {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: SetupStep[];
  loading: boolean;
  refresh: () => void;
}

function checkStep(settings: Record<string, any>, key: string): boolean {
  const val = settings[key];
  if (!val) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return !!val;
}

function checkPaymentConfigured(settings: Record<string, any>): boolean {
  const rp = settings.razorpay;
  const upi = settings.upi;
  const cod = settings.cod;
  const mp = settings.manualPayment;
  if (rp?.isEnabled && rp?.keyId) return true;
  if (upi?.isEnabled && upi?.upiId) return true;
  if (cod?.isEnabled) return true;
  if (mp?.isEnabled) return true;
  return false;
}

export function useSetupStatus(): SetupStatus {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.get('/settings/admin')
      .then(res => {
        if (cancelled) return;
        const raw = res.data;
        const settings: Record<string, any> =
          raw?.success !== undefined && raw?.data !== undefined ? raw.data : raw ?? {};

        const storeNameDone = !!(settings.general?.siteName?.trim());
        const contactDone = !!(settings.general?.websiteUrl || settings.storeEmail || settings.contact?.email);
        const logoDone = !!(settings.logo?.logoUrl?.trim());
        const gstDone = !!(settings.gstin?.trim() || settings.gst);
        const paymentDone = checkPaymentConfigured(settings);
        const shippingDone = !!(settings.shipping?.freeShippingAmount != null || settings.shippingFee != null);

        setSteps([
          {
            key: 'store_info',
            label: 'Store Information',
            description: 'Store name, description, currency, and website URL',
            path: '/appearance/style',
            done: storeNameDone,
          },
          {
            key: 'contact',
            label: 'Contact Details',
            description: 'Email, phone, and WhatsApp number',
            path: '/settings/contact',
            done: contactDone,
          },
          {
            key: 'logo',
            label: 'Logo & Branding',
            description: 'Store logo, favicon, and brand colors',
            path: '/appearance/style',
            done: logoDone,
          },
          {
            key: 'gst',
            label: 'Tax / GST',
            description: 'GSTIN, GST display preferences, and tax rules',
            path: '/settings/gst',
            done: gstDone,
          },
          {
            key: 'payment',
            label: 'Payment Methods',
            description: 'Enable at least one payment method (Razorpay, UPI, or COD)',
            path: '/settings/payment-gateways',
            done: paymentDone,
          },
          {
            key: 'shipping',
            label: 'Shipping Settings',
            description: 'Free shipping threshold, COD charges, and carrier setup',
            path: '/settings/shipping',
            done: shippingDone,
          },
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        // If settings can't be loaded, assume incomplete but don't block
        setSteps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;
  const isComplete = totalCount > 0 && completedCount === totalCount;

  return { isComplete, completedCount, totalCount, steps, loading, refresh };
}
