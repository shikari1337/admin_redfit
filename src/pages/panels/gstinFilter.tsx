import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { Field, SelectInput } from '../../components/erp';

/**
 * Per-registration GST filter — shared by the four GST-return panels (GSTR-1,
 * GSTR-3B, GSTR-9, ITC/2B). A multi-branch business holds one GSTIN per state;
 * these controls let a return be scoped to ONE registration. "All registrations"
 * (the empty value) is the org-wide default, so a single-GSTIN store sees the
 * selector hidden and nothing changes.
 *
 * Backend contract: GET /accounting/gst/registrations → { registrations, defaultGstin }.
 * The chosen GSTIN is passed as ?gstin= to the return endpoints.
 */

export interface GstinRegistration {
  id: string | null;
  gstin: string;
  label: string;
  state: string;
  /** The catch-all bucket unmapped-warehouse orders and all purchase ITC fall to. */
  isDefault: boolean;
}

/** Fetch the org's GST registrations once. Empty on error (selector then hides). */
export function useGstRegistrations(): GstinRegistration[] {
  const [regs, setRegs] = useState<GstinRegistration[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = payload(await api.get('/accounting/gst/registrations'));
        if (alive) setRegs(Array.isArray(data?.registrations) ? data.registrations : []);
      } catch { /* single-GSTIN / no config — selector stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);
  return regs;
}

/**
 * The registration dropdown. Renders NOTHING when the store has 0 or 1
 * registration — the org-wide return is the only thing that makes sense there.
 */
export const RegistrationSelect: React.FC<{
  regs: GstinRegistration[];
  value: string;
  onChange: (gstin: string) => void;
  label?: string;
}> = ({ regs, value, onChange, label = 'Registration' }) => {
  if (regs.length <= 1) return null;
  return (
    <Field label={label}>
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)} title="Scope the return to one GST registration">
        <option value="">All registrations</option>
        {regs.map((r) => (
          <option key={r.gstin} value={r.gstin}>
            {r.label} — {r.gstin}{r.isDefault ? ' (default)' : ''}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
};
