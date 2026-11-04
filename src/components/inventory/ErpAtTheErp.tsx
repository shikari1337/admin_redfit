/**
 * "At the ERP" — where the ERP's figure for ONE store SKU comes from (ERP-WH-1). Read-only.
 *
 * For a store whose stock is set from its ERP (DEC-068), staff see one pooled on-hand per
 * SKU. This section shows the ERP's side: per branch (its label or code, and the warehouse
 * it is mapped to) the batches with expiry and MRP, and the counted total the store's
 * stock is set from. `GET /api/v2/erp/stock/by-sku/{sku}` (`inventory.read`).
 *
 * Which branches count comes from the batch rows when the server says so; otherwise from
 * the ERP's branch list, which needs `settings.read` — without it only the all-branches
 * total is shown. Mounted in the Inventory stock drawer and on the variation edit page.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/erp';
import { useAuth } from '../../contexts/AuthContext';
import {
  erpApi, erpConnUrl, plural, stockBranchIndex, unitsNum, unitsText,
  type ErpBatch, type ErpBranch,
} from '../../lib/v2/erp';
import { useLoad } from '../../pages/panels/erp/shared';
import ErpBatchTable, { branchName } from './ErpBatchTable';

interface Group {
  key: string;
  code: string;
  label: string | null;
  connectionId: string | null;
  connectionLabel: string | null;
  facilityId: string | null;
  counted: boolean | null;
  units: number;
  batches: ErpBatch[];
}

function errInfo(err: unknown): { status?: number; code: string } {
  const e = err as { code?: string; response?: { status?: number; data?: { code?: string } } };
  return { status: e?.response?.status, code: String(e?.response?.data?.code ?? (e?.code === 'V2_BACKEND_GAP' ? 'v2.backend_gap' : '')) };
}

const ErpAtTheErp: React.FC<{
  sku: string | null | undefined;
  /** `drawer`: the Inventory drawer's bordered block; `card`: the variation page's FieldGroup look. */
  variant?: 'drawer' | 'card';
  className?: string;
}> = ({ sku, variant = 'card', className }) => {
  const { hasPerm } = useAuth();
  const code = (sku ?? '').trim();
  const stock = useLoad(() => erpApi.stockBySku(code), [code], !!code);
  const batches = stock.data?.batches ?? [];
  const needFacilities = batches.some((b) => !!b.facility_id);
  const canReadErp = hasPerm('settings.read');
  // The store's stock connections and their branches: which branches count, and whether this
  // store keeps stock in an ERP at all (a store without one does not get an empty section).
  const index = useLoad(() => stockBranchIndex(), [], canReadErp && (!!stock.data || !!stock.error));
  const erpPresent: boolean | null = !canReadErp ? null : index.data ? index.data.length > 0 : index.error ? false : null;
  const facilities = useLoad(() => erpApi.facilities(), [], needFacilities);

  const groups = useMemo<Group[]>(() => {
    const branchOf = (connId: string | null, branchCode: string): { b: ErpBranch; connId: string } | null => {
      for (const x of index.data ?? []) {
        if (connId && x.connection.id !== connId) continue;
        const b = x.branches?.find((y) => y.code === branchCode);
        if (b) return { b, connId: x.connection.id };
      }
      return null;
    };
    const map = new Map<string, Group>();
    for (const row of batches) {
      const key = `${row.connection_id ?? ''}|${row.branch_code}`;
      let g = map.get(key);
      if (!g) {
        const known = branchOf(row.connection_id ?? null, row.branch_code);
        g = {
          key,
          code: row.branch_code,
          label: row.branch_label ?? known?.b.label ?? null,
          connectionId: row.connection_id ?? known?.connId ?? null,
          connectionLabel: row.connection_label ?? null,
          facilityId: row.facility_id ?? known?.b.facility_id ?? null,
          counted: typeof row.counted === 'boolean' ? row.counted : known ? known.b.counted : null,
          units: 0,
          batches: [],
        };
        map.set(key, g);
      }
      g.units += unitsNum(row.quantity);
      g.batches.push(row);
    }
    return [...map.values()];
  }, [batches, index.data]);

  const facilityName = (id: string | null) => (id ? facilities.data?.find((f) => f.id === id)?.name ?? null : null);
  const allUnits = stock.data?.total_units !== undefined ? unitsNum(stock.data.total_units) : groups.reduce((s, g) => s + g.units, 0);
  const countedKnown = stock.data?.counted_units !== undefined || (groups.length > 0 && groups.every((g) => g.counted !== null));
  const countedUnits = stock.data?.counted_units !== undefined
    ? unitsNum(stock.data.counted_units)
    : groups.filter((g) => g.counted).reduce((s, g) => s + g.units, 0);
  const connId = groups.find((g) => g.connectionId)?.connectionId ?? index.data?.[0]?.connection.id ?? null;

  if (!code) return null;

  let body: React.ReactNode;
  if (stock.loading && !stock.data) {
    body = <p className="text-sm text-gray-500" role="status">Reading the ERP’s stock of this SKU…</p>;
  } else if (stock.error) {
    const { status, code: errCode } = errInfo(stock.error);
    if (status === 404 && errCode.startsWith('erp.')) body = <p className="text-sm text-gray-600">The ERP lists no stock for SKU {code}.</p>;
    else if (status === 403) body = <p className="text-sm text-gray-600">Seeing the ERP’s stock needs the Read inventory permission.</p>;
    else if (status === 404 || status === 405 || status === 501 || errCode === 'v2.backend_gap' || errCode === 'v2.not_migrated') {
      if (erpPresent === false) return null;
      body = <p className="text-sm text-gray-500">The ERP’s stock by branch is not available on this server yet.</p>;
    } else {
      body = (
        <p className="text-sm text-red-700">
          The ERP’s stock could not be read.{' '}
          <button type="button" className="font-medium underline" onClick={() => void stock.reload()}>Try again</button>
        </p>
      );
    }
  } else if (groups.length === 0) {
    if (erpPresent !== true) return null;
    body = <p className="text-sm text-gray-600">The ERP lists no stock for SKU {code}.</p>;
  } else {
    body = (
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 sm:max-w-3xl sm:grid-cols-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">Counted</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{countedKnown ? unitsText(countedUnits) : '—'}</dd>
            <dd className="text-[11px] text-gray-500">{countedKnown ? 'what store stock is set from' : 'which branches count is not visible to you'}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">All branches</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{unitsText(allUnits)}</dd>
            <dd className="text-[11px] text-gray-500">{plural(groups.length, 'branch', 'branches')} · {plural(batches.length, 'batch', 'batches')}</dd>
          </div>
          {stock.data?.sellable_units !== undefined && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">On sale</dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900">{unitsText(stock.data.sellable_units)}</dd>
              <dd className="text-[11px] text-gray-500">counted batches outside the order window</dd>
            </div>
          )}
          {stock.data?.held_units !== undefined && (
            <div className={cn('rounded-lg px-3 py-2', unitsNum(stock.data.held_units) > 0 ? 'bg-red-50' : 'bg-gray-50')}>
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">Held for expiry</dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900">{unitsText(stock.data.held_units)}</dd>
              <dd className="text-[11px] text-gray-500">
                {stock.data.stop_selling === false
                  ? 'store window off: only expired batches'
                  : `stop selling ${typeof stock.data.store_stop_days === 'number' ? stock.data.store_stop_days : '—'} days before expiry`}
              </dd>
            </div>
          )}
        </dl>
        {groups.map((g) => {
          const wh = facilityName(g.facilityId);
          return (
            <div key={g.key} className={cn('overflow-hidden rounded-lg border border-gray-200', g.counted === false && 'bg-gray-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-semibold text-gray-900">{branchName(g.code, g.label)}</span>
                  <span className="text-gray-500">
                    {' · '}{wh ?? (g.facilityId ? 'mapped warehouse' : 'no warehouse mapped')}
                    {g.connectionLabel ? ` · ${g.connectionLabel}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">{unitsText(g.units)} units</span>
                  {g.counted === true && <Chip tone="green">Counted</Chip>}
                  {g.counted === false && <Chip tone="neutral">Not counted</Chip>}
                </div>
              </div>
              <ErpBatchTable batches={g.batches} showBranch={false} connectionId={g.connectionId} onWindowChanged={() => void stock.reload()} />
            </div>
          );
        })}
        <p className="text-xs text-gray-500">
          The ERP is the stock master: this SKU’s on-hand is set to the counted batches still on sale at each hourly update; a batch inside its order window is held.
          {canReadErp && connId && <> Which branches count is chosen on the <Link className="font-medium underline" to={erpConnUrl(connId, 'warehouses')}>ERP Warehouses tab</Link>.</>}
        </p>
      </div>
    );
  }

  if (variant === 'drawer') {
    return (
      <section className={className} style={{ border: '1px solid var(--n-200)', borderRadius: 10, overflow: 'hidden' }} aria-label="At the ERP">
        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--n-100)', fontSize: 13, fontWeight: 600 }}>At the ERP</div>
        <div style={{ padding: '10px 14px' }}>{body}</div>
      </section>
    );
  }
  return (
    <section className={cn('rounded-lg border border-gray-200 bg-white p-5 shadow-sm', className)} aria-labelledby="erp-at-the-erp">
      <div className="mb-4">
        <h3 id="erp-at-the-erp" className="text-sm font-semibold text-gray-900">At the ERP</h3>
        <p className="mt-0.5 text-xs text-gray-500">Where the ERP’s figure for this SKU comes from: its branches and batches, read-only.</p>
      </div>
      {body}
    </section>
  );
};

export default ErpAtTheErp;
