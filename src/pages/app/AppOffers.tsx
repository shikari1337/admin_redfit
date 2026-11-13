import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BadgePercent, Pencil, Plus } from 'lucide-react';
import { EmptyRow, Page, PageHeader, SectionCard, StatusChip, TableShell, TBody, Td, Th, THead, Tr, btn } from '@/components/erp';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllCoupons } from '@/pages/Coupons';
import { fmtRupees } from '@/lib/money';
import { formatDateTime } from '@/utils/date';
import {
  APP_SALES_CHANNEL, couponChannels, couponFirstChannelOrder, couponKnowsChannels,
} from '@/lib/v2/appGrowth';

/**
 * APP OFFERS (HMAPP-3 point 6): discounts only for orders placed in the store's app. An app offer is
 * a COUPON limited to the app (lane BA: `coupons.sales_channels` `["app"]`, tenant 450, and
 * `first_channel_order` for a customer's first app order only). The server applies the best live one
 * by itself on app orders, with no code typed, and the app shows the result as the App price; website
 * orders never get it. This page lists them; making and changing one is the coupon form, the one
 * editor for every discount (`/coupons/new?channel=app`, `/coupons/{id}/edit`).
 *
 * Read `marketing.read`, write `marketing.manage`, as coupons.
 */

type Row = Record<string, any>;

const idOf = (c: Row) => String(c._id ?? c.id ?? '');
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function discountText(c: Row): string {
  const value = num(c.value);
  const cap = num(c.maxDiscount ?? c.max_discount);
  if (c.type === 'percentage') return `${value ?? 'a percent not given'}% off${cap ? `, at most ${fmtRupees(cap)}` : ''}`;
  if (c.type === 'fixed') return value === null ? 'an amount not given' : `${fmtRupees(value)} off`;
  if (c.type === 'b2g1') return 'Buy 2 get 1 free';
  return String(c.type ?? 'not given');
}

function stateOf(c: Row, now: number): { code: string; label: string } {
  const active = (c.isActive ?? c.is_active) !== false;
  if (!active) return { code: 'inactive', label: 'Off' };
  const from = Date.parse(c.validFrom ?? c.valid_from ?? '');
  const to = Date.parse(c.validUntil ?? c.valid_until ?? '');
  if (Number.isFinite(from) && from > now) return { code: 'scheduled', label: 'Starts later' };
  if (Number.isFinite(to) && to < now) return { code: 'expired', label: 'Ended' };
  return { code: 'active', label: 'Running' };
}

const AppOffers: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('marketing.manage');
  // Every coupon, page by page (the v2 list answers at most 200 a call), as the Coupons page reads them.
  const data = useLoad(async (): Promise<Row[]> => fetchAllCoupons(), []);
  const all = data.data ?? [];
  const offers = useMemo(() => all.filter((c) => couponChannels(c).includes(APP_SALES_CHANNEL)), [all]);
  const serverKeepsChannels = all.some(couponKnowsChannels);
  const now = Date.now();
  const off = whyDisabled(canSave, [], 'Manage marketing');

  return (
    <Page>
      <PageHeader
        icon={BadgePercent}
        title="App offers"
        description="Discounts only for orders placed in the app. The server applies them at checkout with no code typed, and the app shows the App price; website orders never get them."
        actions={canSave ? (
          <Link to={`/coupons/new?channel=${APP_SALES_CHANNEL}`} className={btn({ size: 'sm' })}><Plus className="h-4 w-4" />New app offer</Link>
        ) : undefined}
      />
      <Notice tone="info">
        An app offer is a coupon limited to the app, made and changed on the coupon form like every other discount. All codes are on <Link to="/coupons" className="underline">Coupons</Link>. Prices in the app follow the store's display settings, and an item out of stock stays unorderable whatever the offer.
      </Notice>
      {data.loading && !data.data ? <Loading label="Reading the coupons" /> : data.error ? (
        <ErrorNote error={data.error} what="App offers" onRetry={() => void data.reload()} />
      ) : (
        <>
          {all.length > 0 && !serverKeepsChannels && (
            <Notice tone="warn" title="Not available on this server yet">
              This server does not yet keep where a coupon may be used, so an app offer cannot be saved here until the server is updated.
            </Notice>
          )}
          <SectionCard title="Offers" description={`${offers.length} ${offers.length === 1 ? 'coupon is' : 'coupons are'} limited to the app. When several fit an order, the server picks the best.`}>
            <TableShell>
              <THead>
                <Tr>
                  <Th>Code</Th>
                  <Th>Discount</Th>
                  <Th>Minimum order</Th>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>State</Th>
                  <Th className="text-right">Used</Th>
                  <Th><span className="sr-only">Edit</span></Th>
                </Tr>
              </THead>
              <TBody>
                {offers.length === 0 && <EmptyRow colSpan={8}>No app offer yet.</EmptyRow>}
                {offers.map((c) => {
                  const st = stateOf(c, now);
                  const min = num(c.minPurchase ?? c.min_purchase);
                  const used = num(c.usageCount ?? c.usage_count);
                  const limit = num(c.usageLimit ?? c.usage_limit);
                  return (
                    <Tr key={idOf(c)}>
                      <Td>
                        <div className="font-mono text-sm font-medium text-gray-900">{c.code}</div>
                        {c.description && <div className="text-xs text-gray-500">{c.description}</div>}
                      </Td>
                      <Td>{discountText(c)}</Td>
                      <Td>{min ? fmtRupees(min) : 'Any order'}</Td>
                      <Td className="whitespace-nowrap text-xs text-gray-600">
                        From {formatDateTime(c.validFrom ?? c.valid_from, 'not given')}<br />until {formatDateTime(c.validUntil ?? c.valid_until, 'not given')}
                      </Td>
                      <Td>{couponFirstChannelOrder(c) ? 'First app order only' : 'Every app order'}</Td>
                      <Td><StatusChip status={st.code} label={st.label} /></Td>
                      <Td className="text-right tabular-nums">{used ?? 0}{limit ? ` of ${limit}` : ''}</Td>
                      <Td>
                        {canSave ? (
                          <Link to={`/coupons/${encodeURIComponent(idOf(c))}/edit`} className={btn({ size: 'sm', variant: 'ghost' })} aria-label={`Edit ${c.code}`}>
                            <Pencil className="h-4 w-4" />Edit
                          </Link>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </TableShell>
            {off && <p className="mt-2 text-xs text-gray-500">{off}</p>}
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default AppOffers;
