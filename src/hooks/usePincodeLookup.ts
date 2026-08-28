import { useEffect, useRef, useState } from 'react';
import { pincodeLookupAPI } from '../services/api';

/**
 * Indian pincode → district / state autofill — same India Post data and the
 * same `GET /pincode/:pincode` backend proxy the storefront's primary
 * checkout shipping form uses (`storefront/src/checkout/useCheckoutAddress.ts`),
 * simplified to one district/state pair (the admin form has plain text
 * inputs, not a multi-district selector).
 *
 * Only fires for a complete 6-digit pincode, debounced, and aborts in-flight
 * lookups so a fast typist can't land an older response on a newer pincode.
 */

export interface PincodeResult {
  district: string;
  state: string;
}

export function usePincodeLookup(pincode: string, enabled = true) {
  const [result, setResult] = useState<PincodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const pin = (pincode || '').replace(/\D/g, '');
    if (!enabled || pin.length !== 6) {
      setResult(null);
      setError('');
      return;
    }

    const myRequestId = ++requestIdRef.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await pincodeLookupAPI.lookup(pin);
        // Stale response — a newer pincode was typed while this was in flight.
        if (myRequestId !== requestIdRef.current) return;

        const entry = Array.isArray(data) ? data[0] : null;
        const offices = entry?.PostOffice;
        if (entry?.Status !== 'Success' || !offices?.length) {
          setResult(null);
          setError('Could not find this pincode.');
          return;
        }
        const po = offices[0];
        setResult({
          district: po.District || '',
          state: po.State || '',
        });
      } catch {
        if (myRequestId === requestIdRef.current) setError('Could not look up this pincode.');
      } finally {
        if (myRequestId === requestIdRef.current) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [pincode, enabled]);

  return { result, loading, error };
}

export default usePincodeLookup;
