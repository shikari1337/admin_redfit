import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inventoryAPI } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { fmtMinor, fmtRupees } from '../../lib/money';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries } from '../../components/panelAnalytics/Kit';
import { SERIES, STATUS } from '../../components/panelAnalytics/vizTheme';
import { Page, PageHeader, SectionCard, THead, Th, TBody, Tr, Td } from '../../components/erp';
import { Warehouse, PackageSearch, AlertTriangle, ShoppingBag, Layers } from 'lucide-react';

/**
 * Inventory panel home. Stock truth = stock_balances/stock_ledger_entries;
 * movement history begins at the ledger cutover (shown as "ledger since").
 */
const InventoryPanelDashboard: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, error } = usePanelStats<any>('inventory', range);
  const [low, setLow] = useState<any[]>([]);
  const [intel, setIntel] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const lowRes = await inventoryAPI.list({ lowStock: true, limit: 10 });
        setLow((lowRes as any).data ?? []);
      } catch { /* list unavailable — analytics still render */ }
      try {
        const res = await api.get('/analytics/panels/inventory/intelligence');
        setIntel(payload(res));
      } catch { /* intelligence unavailable — sections hide */ }
    })();
  }, []);

  const s = data?.summary;
  const bucket = data?.bucket ?? 'day';
  const exp = data?.expiry ?? {};
  const pur = data?.purchasing ?? {};

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description={<>Stock health, movements and expiry. Stock is ledgered — every change is recorded
          {data?.ledger_since ? ` (ledger since ${data.ledger_since})` : ''}.</>}
        actions={<DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile label="SKUs" value={s.total_skus.toLocaleString('en-IN')} />
            <StatTile label="Units on hand" value={s.units_on_hand.toLocaleString('en-IN')}
              sub={`${s.units_reserved.toLocaleString('en-IN')} reserved`} />
            <StatTile label="Out of stock" value={s.out_of_stock.toLocaleString('en-IN')} accent={STATUS.critical} />
            <StatTile label="Low stock" value={s.low_stock.toLocaleString('en-IN')}
              sub={`≤ ${s.low_stock_threshold} units`} accent={STATUS.warning} />
            <StatTile label="Stock value (WAC)" value={fmtMinor(s.stock_value_minor)}
              sub={s.uncosted_skus > 0 ? `${s.uncosted_skus.toLocaleString('en-IN')} SKUs uncosted — value understated` : 'all stocked SKUs costed'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Stock movements" sub="Units received vs issued (stock ledger, opening balances excluded)">
                <TimeSeries data={data.movements} granularity={bucket}
                  series={[
                    { key: 'qty_in', name: 'In', color: SERIES[0], kind: 'bar' },
                    { key: 'qty_out', name: 'Out', color: SERIES[1], kind: 'bar' },
                  ]} />
              </ChartCard>
            </div>
            <SectionCard title="Batch expiry" description="Batches with stock on hand" flush>
              <div className="space-y-2 p-5 text-sm">
                {([
                  ['Expired', exp.expired, STATUS.critical],
                  ['Within 30 days', exp.within_30d, STATUS.serious],
                  ['31–90 days', exp.within_90d, STATUS.warning],
                  ['Later', exp.later, STATUS.good],
                  ['No expiry set', exp.no_expiry, '#898781'],
                ] as const).map(([label, n, color]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-700">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color as string }} />
                      {label}
                    </span>
                    <span className="tabular-nums text-gray-900">{Number(n ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <Link to="/panel/inventory/batches" className="mt-2 inline-block text-sm font-medium text-gray-900 hover:underline">
                  Batches &amp; expiry →
                </Link>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Top movers (units out, in range)" flush>
              <div className="divide-y divide-gray-100 text-sm">
                {(data.top_movers ?? []).length === 0 && <div className="p-5 text-gray-500">No outbound movements in range.</div>}
                {(data.top_movers ?? []).map((m: any, i: number) => (
                  <div key={m.variation_id ?? i} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0 pr-3">
                      <span className="font-medium text-gray-800">{m.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-400">{m.sku}</span>
                    </div>
                    <span className="tabular-nums">{Number(m.qty_out).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Movements by type (in range)" flush>
                <div className="divide-y divide-gray-100 text-sm">
                  {(data.by_movement_type ?? []).length === 0 && <div className="p-5 text-gray-500">No ledger entries in range.</div>}
                  {(data.by_movement_type ?? []).map((t: any) => (
                    <div key={t.movement_type} className="flex items-center justify-between px-5 py-2.5">
                      <span className="capitalize text-gray-700">{String(t.movement_type).replace(/_/g, ' ')}</span>
                      <span className="tabular-nums">
                        {Number(t.net_qty) > 0 ? '+' : ''}{Number(t.net_qty).toLocaleString('en-IN')}
                        <span className="ml-2 text-xs text-gray-400">{t.entries} entries</span>
                      </span>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <div className="grid grid-cols-3 gap-4">
                <StatTile label="Open POs" value={Number(pur.open_pos ?? 0)} />
                <StatTile label="Draft POs" value={Number(pur.draft_pos ?? 0)} />
                <StatTile label="GRNs in range" value={Number(pur.grns_in_range ?? 0)} />
              </div>
            </div>
          </div>
        </>
      )}

      {intel && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Reorder suggestions"
            description={`Sales velocity (last ${intel.window_days}d) vs current stock — movers with under ${intel.cover_days} days of cover`} flush>
            {(intel.reorder ?? []).length > 0 ? (
              <table className="w-full text-sm">
                <THead sticky={false}>
                  <Th>SKU</Th><Th num>Units/day</Th><Th num>Stock</Th><Th num>Days cover</Th>
                </THead>
                <TBody>
                  {intel.reorder.slice(0, 10).map((m: any) => (
                    <Tr key={m.variation_id}>
                      <Td>
                        <span className="font-medium text-gray-800">{m.name}</span>
                        <span className="ml-2 font-mono text-xs text-gray-400">{m.sku}</span>
                      </Td>
                      <Td num>{m.velocity_per_day.toFixed(2)}</Td>
                      <Td num>{m.stock}</Td>
                      <Td num className="font-semibold text-red-700">{Math.round(m.days_of_cover)}d</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            ) : (
              <div className="p-5 text-sm text-gray-500">
                Nothing urgent — every mover has {intel.cover_days}+ days of cover.
                {(intel.movers ?? []).length > 0 && (
                  <span> Fastest: {intel.movers[0].name} at {intel.movers[0].velocity_per_day.toFixed(2)}/day
                    ({intel.movers[0].days_of_cover === null ? '∞' : `${Math.round(intel.movers[0].days_of_cover)}d`} cover).</span>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Dead stock"
            description={`On-hand with zero sales in ${intel.dead_days} days — capital locked on the shelf`} flush>
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
              {[
                ['SKUs', Number(intel.dead_stock?.skus ?? 0).toLocaleString('en-IN')],
                ['Units', Number(intel.dead_stock?.units ?? 0).toLocaleString('en-IN')],
                ['Retail value', fmtRupees(intel.dead_stock?.retail_value ?? 0)],
              ].map(([label, value]) => (
                <div key={label as string} className="px-2 py-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
                  <div className="mt-0.5 font-bold tabular-nums text-gray-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-gray-100 text-sm">
              {(intel.dead_stock?.top ?? []).slice(0, 5).map((d: any) => (
                <div key={d.variation_id} className="flex items-center justify-between px-5 py-2.5">
                  <div className="min-w-0 truncate pr-3">
                    <span className="font-medium text-gray-800">{d.name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-400">{d.sku}</span>
                  </div>
                  <span className="shrink-0 tabular-nums">{fmtRupees(d.retail_value)}
                    <span className="ml-1 text-xs text-gray-400">×{d.stock}</span>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/inventory" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <PackageSearch className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold text-gray-900">Stock levels</div>
          <div className="text-sm text-gray-500">Search, adjust and export SKU stock</div>
        </Link>
        <Link to="/panel/inventory/purchasing" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <ShoppingBag className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold text-gray-900">Purchasing</div>
          <div className="text-sm text-gray-500">POs, receiving and batch capture</div>
        </Link>
        <Link to="/warehouses" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <Warehouse className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold text-gray-900">Warehouses</div>
          <div className="text-sm text-gray-500">Locations, pickup addresses, carrier mapping</div>
        </Link>
      </div>

      <SectionCard
        title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock — act first</span>}
        flush
      >
        <div className="divide-y divide-gray-100 text-sm">
          {low.length === 0 && <div className="p-5 text-gray-500">Nothing low. 🎉</div>}
          {low.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-2.5">
              <div className="truncate pr-4">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{r.sku}</span>
              </div>
              <span className="tabular-nums">{r.available_stock} left</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {!s && !error && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Layers className="h-4 w-4" /> Loading analytics…
        </div>
      )}
    </Page>
  );
};

export default InventoryPanelDashboard;
