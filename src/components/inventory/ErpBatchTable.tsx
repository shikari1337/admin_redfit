/**
 * The ERP's batches of one item (ERP-WH-1): branch, batch, quantity, MRP / PTR / PTS and
 * expiry — expired in red, within 30 days in amber, always with the words too so the
 * colour is never the only signal. Shared by the ERP ▸ Warehouses drawer and the
 * Inventory "At the ERP" section, so both read the same.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/erp';
import {
  daysUntil, expiryText, expiryTone, priceText, unitsText, whenText, type ErpBatch,
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

const ErpBatchTable: React.FC<{
  batches: ErpBatch[];
  currency?: string;
  /** Hide the branch column when the list is already one branch's. */
  showBranch?: boolean;
  /** The mapped warehouse's name, when known. */
  facilityName?: (id: string | null) => string | null;
  className?: string;
}> = ({ batches, currency = 'INR', showBranch = true, facilityName, className }) => (
  <div className={cn('overflow-x-auto', className)}>
    <table className="w-full min-w-[640px] text-sm">
      <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <tr className="border-b border-gray-200">
          {showBranch && <th scope="col" className="px-3 py-2">Branch</th>}
          <th scope="col" className="px-3 py-2">Batch</th>
          <th scope="col" className="px-3 py-2 text-right">Qty</th>
          <th scope="col" className="px-3 py-2 text-right">MRP</th>
          <th scope="col" className="px-3 py-2 text-right">PTR</th>
          <th scope="col" className="px-3 py-2 text-right">PTS</th>
          <th scope="col" className="px-3 py-2">Expiry</th>
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
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default ErpBatchTable;
