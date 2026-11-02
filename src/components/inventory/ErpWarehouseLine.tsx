/**
 * Warehouses page ▸ "From the ERP" (ERP-WH-1): a warehouse an ERP branch is mapped to shows
 * what the ERP holds there, with a link to the ERP connection's Warehouses tab where the
 * mapping is made. Read-only and quiet: a store without an ERP, a server without the
 * branch routes, or a person without `settings.read` simply sees nothing extra.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  erpConnUrl, plural, stockBranchIndex, unitsText, whenText,
  type ErpBranch, type ErpConnection,
} from '../../lib/v2/erp';

export interface FacilityBranch { connection: ErpConnection; branch: ErpBranch }

/** facility id → the ERP branches mapped to it (empty when there is nothing to show). */
export function useErpFacilityBranches(): Map<string, FacilityBranch[]> {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('settings.read');
  const [map, setMap] = useState<Map<string, FacilityBranch[]>>(() => new Map());
  useEffect(() => {
    if (!canRead) return;
    let live = true;
    stockBranchIndex()
      .then((entries) => {
        const next = new Map<string, FacilityBranch[]>();
        for (const { connection, branches } of entries) {
          for (const branch of branches ?? []) {
            if (!branch.facility_id) continue;
            next.set(branch.facility_id, [...(next.get(branch.facility_id) ?? []), { connection, branch }]);
          }
        }
        if (live) setMap(next);
      })
      .catch(() => { /* no ERP here, or not on this server: nothing extra to show */ });
    return () => { live = false; };
  }, [canRead]);
  return map;
}

const ErpWarehouseLine: React.FC<{ entries: FacilityBranch[] | undefined }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5" aria-label="From the ERP">
      {entries.map(({ connection, branch }) => (
        <li key={`${connection.id}|${branch.code}`} className="text-xs text-gray-600">
          <span className="font-medium text-gray-800">From the ERP:</span>{' '}
          {branch.code.trim()
            ? <>branch <span className="font-mono">{branch.code}</span>{branch.label ? ` (${branch.label})` : ''}</>
            : 'No branch'}
          {' · '}{plural(branch.skus, 'SKU')} · {unitsText(branch.units)} units · updated {whenText(branch.last_change_us, 'not known')}
          {!branch.counted && ' · not counted in store stock'}
          {!branch.seen && ' · not seen in the last fetch'}
          {' · '}
          <Link to={erpConnUrl(connection.id, 'warehouses')} className="font-medium text-gray-800 underline-offset-2 hover:underline">
            {connection.label}: Warehouses
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default ErpWarehouseLine;
