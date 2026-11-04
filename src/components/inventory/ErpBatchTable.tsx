/**
 * The ERP's batches of one item (ERP-WH-1): branch, batch, quantity, MRP / PTR / PTS and
 * expiry — expired in red, within 30 days in amber, always with the words too so the
 * colour is never the only signal. Shared by the ERP ▸ Warehouses drawer and the
 * Inventory "At the ERP" section, so both read the same.
 *
 * ERP-LOTS-1: each lot also says whether it is on sale ("On sale until …") or held for expiry
 * ("Held — expires …"), and staff with `inventory.adjust` can give one lot its own number of
 * days (`PUT /erp/connections/{id}/stock/lots/window`); the next stock update applies it.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Btn, Chip } from '@/components/erp';
import { useAuth } from '../../contexts/AuthContext';
import {
  daysUntil, erpApi, errorText, expiryText, expiryTone, priceText, saleWindowText, unitsText, whenText, type ErpBatch,
} from '../../lib/v2/erp';

/** A badge for one expiry date. */
export const ExpiryChip: React.FC<{ on: string | null | undefined }> = ({ on }) => {
  if (!on) return <span className="text-gray-400">no expiry</span>;
  const tone = expiryTone(on);
  if (tone === 'neutral') return <span className="whitespace-nowrap text-gray-700">{expiryText(on)}</span>;
  return <Chip tone={tone}>{expiryText(on)}</Chip>;
};

/** "Branch label (CODE)", just the code, or "No branch" for stock rows that name none (code ""). */
export function branchName(code: string, label: string | null | undefined): string {
  if (!code.trim()) return label && label.trim() ? label.trim() : 'No branch';
  return label && label.trim() && label.trim() !== code ? `${label.trim()} (${code})` : code;
}

/** ERP-LOTS-1: one lot's sale state, and (for staff who may) its own order window. */
const SaleCell: React.FC<{ b: ErpBatch; connectionId: string | null; canEdit: boolean; onChanged?: () => void }> = ({
  b, connectionId, canEdit, onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (b.held === undefined && b.on_sale_until === undefined) return <span className="text-gray-400">—</span>;
  const { text, held } = saleWindowText(b.expires_on, b.on_sale_until, b.held);
  const editable = canEdit && !!b.lot_key && !!connectionId;
  const save = async (value: number | null) => {
    if (!b.lot_key || !connectionId) return;
    setBusy(true); setErr('');
    try {
      await erpApi.setLotWindow(connectionId, b.lot_key, value);
      setOpen(false);
      onChanged?.();
    } catch (e) {
      setErr(errorText(e));
    } finally { setBusy(false); }
  };
  const submit = () => {
    const n = Number(days);
    if (days.trim() === '' || !Number.isInteger(n) || n < 0 || n > 730) { setErr('Enter whole days, 0 to 730.'); return; }
    void save(n);
  };
  return (
    <div className="space-y-1">
      {held ? <Chip tone="red">{text}</Chip> : <span className="whitespace-nowrap text-gray-700">{text}</span>}
      <div className="text-[11px] text-gray-500">
        {typeof b.stop_days === 'number' && b.expires_on ? `${b.stop_days} days before expiry` : null}
        {b.own_stop_days != null ? ' · this lot’s own' : b.expires_on ? ' · store setting' : null}
      </div>
      {editable && !open && (
        <button type="button" className="text-[11px] font-medium text-gray-700 underline" onClick={() => { setDays(b.own_stop_days != null ? String(b.own_stop_days) : ''); setErr(''); setOpen(true); }}>
          Set days for this lot
        </button>
      )}
      {editable && open && (
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="number" min={0} max={730} step={1} inputMode="numeric" value={days}
            onChange={(e) => setDays(e.target.value)} aria-label="Stop selling this many days before expiry"
            className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs" disabled={busy}
          />
          <Btn size="sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
          {b.own_stop_days != null && <Btn size="sm" variant="outline" onClick={() => void save(null)} disabled={busy}>Use store setting</Btn>}
          <Btn size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
        </div>
      )}
      {err && <div className="text-[11px] text-red-700">{err}</div>}
    </div>
  );
};

const ErpBatchTable: React.FC<{
  batches: ErpBatch[];
  currency?: string;
  /** Hide the branch column when the list is already one branch's. */
  showBranch?: boolean;
  /** The mapped warehouse's name, when known. */
  facilityName?: (id: string | null) => string | null;
  /** ERP-LOTS-1: the connection, when the rows do not carry it (one connection's item read). */
  connectionId?: string | null;
  /** ERP-LOTS-1: called after a lot's order window was saved, to read the lots again. */
  onWindowChanged?: () => void;
  className?: string;
}> = ({ batches, currency = 'INR', showBranch = true, facilityName, connectionId = null, onWindowChanged, className }) => {
  const { hasPerm } = useAuth();
  const canEdit = hasPerm('inventory.adjust');
  return (
  <div className={cn('overflow-x-auto', className)}>
    <table className="w-full min-w-[760px] text-sm">
      <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <tr className="border-b border-gray-200">
          {showBranch && <th scope="col" className="px-3 py-2">Branch</th>}
          <th scope="col" className="px-3 py-2">Batch</th>
          <th scope="col" className="px-3 py-2 text-right">Qty</th>
          <th scope="col" className="px-3 py-2 text-right">MRP</th>
          <th scope="col" className="px-3 py-2 text-right">PTR</th>
          <th scope="col" className="px-3 py-2 text-right">PTS</th>
          <th scope="col" className="px-3 py-2">Expiry</th>
          <th scope="col" className="px-3 py-2">On sale</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {batches.map((b, i) => {
          const d = daysUntil(b.expires_on);
          const wh = facilityName?.(b.facility_id) ?? null;
          return (
            <tr key={`${b.connection_id ?? ''}|${b.branch_code}|${b.batch_no ?? ''}|${i}`} className={d !== null && d < 0 ? 'bg-red-50/40' : undefined}>
              {showBranch && (
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-gray-900">{branchName(b.branch_code, b.branch_label)}</div>
                  {wh && <div className="text-xs text-gray-500">{wh}</div>}
                </td>
              )}
              <td className="px-3 py-2 align-top">
                <span className="font-mono text-xs text-gray-800">{b.batch_no || '—'}</span>
                {b.modified_us ? <div className="text-[11px] text-gray-400">changed {whenText(b.modified_us)}</div> : null}
              </td>
              <td className="px-3 py-2 text-right align-top tabular-nums">{unitsText(b.quantity)}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">{priceText(b.mrp, currency)}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">{priceText(b.ptr, currency)}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">{priceText(b.pts, currency)}</td>
              <td className="px-3 py-2 align-top"><ExpiryChip on={b.expires_on} /></td>
              <td className="px-3 py-2 align-top">
                <SaleCell b={b} connectionId={b.connection_id ?? connectionId} canEdit={canEdit} onChanged={onWindowChanged} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  );
};

export default ErpBatchTable;
