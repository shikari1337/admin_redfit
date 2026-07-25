import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { shippingAPI } from '../../services/api';

/**
 * Map one local warehouse to a pickup location registered on a courier account.
 *
 * Couriers ship from locations that exist on *their* side, so a store with
 * several warehouses can't use one global pickup location — each warehouse has
 * to point at its own. This fetches the real list from the connected account so
 * the admin picks instead of guessing a code (a typo here silently breaks every
 * booking from that warehouse).
 *
 * Falls back to a free-text field when the carrier can't list locations, so an
 * account without that API is never locked out.
 */

export interface CarrierLocation {
  /** The nickname the carrier expects (Shiprocket pickup_location / Delhivery warehouse name). */
  code: string;
  name: string;
  /** Contact person registered against the location, when different from the code. */
  contact_name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
}

interface Props {
  provider: 'shiprocket' | 'delhivery';
  /** Currently mapped location code (warehouse.shippingProviders[provider].*). */
  value: string;
  onChange: (code: string) => void;
  label?: string;
  /** Only fetch once the carrier is switched on for this warehouse. */
  active: boolean;
}

export const CarrierLocationMap: React.FC<Props> = ({ provider, value, onChange, label, active }) => {
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<CarrierLocation[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const r = await shippingAPI.getPickupLocations(provider);
      setConfigured(r.configured);
      setSupported(r.supported !== false);
      setLocations(r.locations ?? []);
      if (r.message) setMessage(r.message);
    } catch (e: any) {
      setMessage(e?.message || 'Could not load pickup locations');
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (active) load(); /* eslint-disable-next-line */ }, [active, provider]);

  if (!active) return null;

  const selected = locations.find((l) => l.code === value);
  // A code saved earlier that no longer exists on the carrier is a real problem —
  // bookings from this warehouse would fail — so call it out rather than silently
  // showing an empty select.
  const orphaned = !!value && locations.length > 0 && !selected;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label ?? `${provider === 'shiprocket' ? 'Shiprocket' : 'Delhivery'} pickup location`}
        </label>
        <button
          type="button" onClick={load} disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading locations from {provider}…
        </p>
      )}

      {/* Carrier not connected — mapping is meaningless until it is */}
      {!loading && configured === false && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {provider} isn&apos;t connected yet. Add its credentials in <strong>Settings → Shipping</strong>, then refresh.
        </div>
      )}

      {/* Normal case: pick from the carrier's real locations */}
      {!loading && configured && supported && locations.length > 0 && (
        <>
          <select
            value={selected ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">— Select a pickup location —</option>
            {locations.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
                {l.city ? ` — ${l.city}` : ''}
                {l.pincode ? ` (${l.pincode})` : ''}
                {l.contact_name ? ` · ${l.contact_name}` : ''}
              </option>
            ))}
          </select>

          {selected && (
            <p className="flex items-start gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Mapped to <strong>{selected.name}</strong>
                {selected.address ? ` · ${selected.address}` : ''}
                {selected.pincode ? ` · ${selected.pincode}` : ''}
              </span>
            </p>
          )}

          {orphaned && (
            <p className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Saved location <span className="font-mono">{value}</span> no longer exists on this {provider} account.
                Pick a current one — shipments from this warehouse will fail otherwise.
              </span>
            </p>
          )}
        </>
      )}

      {/* Connected but the account has no locations registered */}
      {!loading && configured && supported && locations.length === 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <MapPin className="mr-1 inline h-3 w-3" />
          No pickup locations found on this {provider} account. Create one in the {provider} dashboard, then refresh.
          {message ? <span className="block mt-1 opacity-80">{message}</span> : null}
        </div>
      )}

      {/* Carrier can't list them — let the admin type the code */}
      {!loading && configured && !supported && (
        <>
          <input
            type="text" value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter the location/warehouse name exactly as registered"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {message && <p className="text-xs text-gray-500">{message}</p>}
        </>
      )}
    </div>
  );
};

export default CarrierLocationMap;
