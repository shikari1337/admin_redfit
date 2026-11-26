import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Upload, Calculator, Receipt, AlertTriangle } from 'lucide-react';
import { api, shipmentsAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '@/lib/unwrap';
import { fmtMinor, fmtRupees } from '@/lib/money';
import { formatDate, isoDaysFromToday, todayIso } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, btn,
} from '../../components/erp';
import StatusBadge from '../../components/order/StatusBadge';
import { WalletCard, useStoreWallet } from '../../components/growship/WalletCard';
import { providerTabCounts } from '../../components/shipments/providerCounts';
import type { StatusCounts, TabType } from '../../components/shipments';
import { shipmentAwb, shipmentCharge, shipmentCourier } from '../../components/shipments/shipmentFacts';
import { growshipAPI, isNotEnabled, type GsAccount } from '@/lib/v2/growship';
import { codPayoutsAPI, type CodPayer, type CodSummary } from '../payments/data';

const GS = 'growcord_ship' as const;

/** The board tabs shown as tiles, in the order a parcel moves. */
const TILES: Array<{ tab: TabType; label: string; tone?: 'warn' | 'bad' | 'good' | 'info' }> = [
  { tab: 'pending_orders', label: 'Orders to book', tone: 'info' },
  { tab: 'ready_to_pick', label: 'Waiting for pickup', tone: 'warn' },
  { tab: 'pickup_scheduled', label: 'Pickup booked' },
  { tab: 'in_transit', label: 'On the way' },
  { tab: 'ndr_failed_delivery', label: 'Failed delivery', tone: 'bad' },
  { tab: 'delivered', label: 'Delivered', tone: 'good' },
  { tab: 'rto_in_transit', label: 'Coming back (RTO)', tone: 'warn' },
  { tab: 'rto_delivered', label: 'Returned (RTO)' },
];

const monthStart = () => `${todayIso().slice(0, 8)}01`;

/**
 * Growcord Ship at a glance (owner 26 Nov 2026: a Growcord Ship menu with the complete panel): the wallet its
 * freight comes off with Add money, Growcord Ship parcels by status, this month's shipping charges, cash on
 * delivery still with the couriers, open weight disputes and the latest parcels. Everything is read once when
 * the page opens.
 */
const GrowshipOverview: React.FC = () => {
  const { hasPerm } = useAuth();
  const canBilling = hasPerm('billing.read');
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(canBilling);

  const [account, setAccount] = useState<GsAccount | null | undefined>(undefined);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [notOn, setNotOn] = useState(false);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [recent, setRecent] = useState<any[] | null>(null);
  const [recentTotal, setRecentTotal] = useState<number | null>(null);
  const [month, setMonth] = useState<{ total: number | null; counted: number; unknown: number } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cod, setCod] = useState<CodSummary | null>(null);
  const [codPayers, setCodPayers] = useState<CodPayer[] | null>(null);
  const [codError, setCodError] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<any | null>(null);

  useEffect(() => {
    growshipAPI.account()
      .then((a) => setAccount(a))
      .catch((e) => { setAccount(null); setNotOn(isNotEnabled(e)); setAccountError(errorText(e, 'The Growcord Ship account could not be read.')); });

    providerTabCounts(GS).then(setCounts).catch((e) => setListError(errorText(e, 'The parcel counts could not be read.')));

    shipmentsAPI.getAll({ shippingProvider: GS, page: 1, limit: 8 })
      .then((r: any) => {
        setRecent(Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
        const t = Number(r?.pagination?.total);
        setRecentTotal(Number.isFinite(t) ? t : null);
      })
      .catch((e) => { setRecent([]); setListError(errorText(e, 'The parcels could not be read.')); });

    shipmentsAPI.getAll({ shippingProvider: GS, page: 1, limit: 1, startDate: monthStart(), endDate: todayIso() })
      .then((r: any) => {
        const ct = r?.chargeTotals;
        if (ct && typeof ct === 'object') {
          setMonth({ total: ct.total == null ? null : Number(ct.total), counted: Number(ct.counted) || 0, unknown: Number(ct.unknown) || 0 });
        }
      })
      .catch(() => { /* the parcels line above says what failed */ });

    if (hasPerm('orders.read')) {
      codPayoutsAPI.summary({ from: isoDaysFromToday(-29), to: todayIso() })
        .then(setCod)
        .catch((e) => setCodError(errorText(e, 'Cash on delivery could not be read.')));
      codPayoutsAPI.awaiting()
        .then((a) => setCodPayers(a.couriers.filter((c) => c.provider === GS)))
        .catch(() => setCodPayers([]));
    }

    api.get('/weight-disputes/summary')
      .then((r) => setDisputes(payload<any>(r)?.totals ?? null))
      .catch(() => setDisputes(null));
    // Read once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gsOwed = (codPayers ?? []).reduce((s, p) => s + (Number(p.cod_minor) || 0), 0);
  const gsOwedParcels = (codPayers ?? []).reduce((s, p) => s + (Number(p.parcels) || 0), 0);
  const shipper = account?.shipper ?? null;
  const bookingOff = account?.access?.provider_enabled === false;

  return (
    <Page>
      <PageHeader
        icon={Truck}
        title="Growcord Ship"
        description="One account for every courier: book, track, pay for freight from your wallet and follow cash on delivery."
        actions={
          <>
            <Link to="/growship/bulk" className={btn({ variant: 'primary' })}><Upload /> Bulk shipment</Link>
            <Link to="/growship/rates" className={btn({ variant: 'outline' })}><Calculator /> Rate calculator</Link>
            <Link to="/growship/billing" className={btn({ variant: 'outline' })}><Receipt /> Billing</Link>
          </>
        }
      />

      {notOn && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Growcord Ship is not switched on for this store yet. Switching it on opens the account and its wallet in one step.</span>
          {hasPerm('settings.manage') && <Link to="/settings/shipping" className="font-medium underline">Shipping settings</Link>}
        </div>
      )}
      {bookingOff && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Growcord Ship is switched off for new bookings. Parcels already booked keep moving and tracking. Switch it on in Shipping settings.
        </div>
      )}
      {!notOn && accountError && account === null && (
        <p className="text-sm text-red-600">{accountError}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WalletCard wallet={wallet} error={walletError} onChanged={reloadWallet} />
        </div>
        <SectionCard title="Account">
          {account === undefined && <p className="text-sm text-gray-500">Reading the account...</p>}
          {account === null && <p className="text-sm text-gray-500">{notOn ? 'Not switched on.' : 'Not available.'}</p>}
          {account && (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Name</dt><dd className="font-medium">{shipper?.name || 'Not given'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Status</dt><dd className="font-medium capitalize">{String(shipper?.status ?? 'Not given').replace(/_/g, ' ')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Plan</dt><dd className="font-medium">{account.plan?.code || shipper?.plan_code || 'Not given'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Paid from</dt><dd className="font-medium">{(account.plan?.billing_mode || shipper?.billing_mode) === 'prepaid_wallet' ? 'Wallet, at booking' : String(account.plan?.billing_mode || shipper?.billing_mode || 'Not given').replace(/_/g, ' ')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Pickup addresses</dt><dd className="font-medium">{Array.isArray(account.locations) ? account.locations.length : 0}</dd></div>
            </dl>
          )}
        </SectionCard>
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Growcord Ship parcels by status</h2>
          <Link to="/growship/shipments" className="text-sm text-blue-700 hover:underline">
            All parcels{recentTotal != null ? ` (${recentTotal.toLocaleString('en-IN')})` : ''}
          </Link>
        </div>
        {listError && <p className="text-sm text-red-600">{listError}</p>}
        <StatGrid cols={4}>
          {TILES.map((t) => (
            <Link key={t.tab} to={`/growship/shipments?tab=${t.tab}`} className="block">
              <StatCard
                label={t.label}
                value={counts ? counts[t.tab].toLocaleString('en-IN') : '...'}
                tone={counts && counts[t.tab] > 0 ? t.tone ?? 'default' : 'default'}
                className="transition-shadow hover:shadow-md"
              />
            </Link>
          ))}
        </StatGrid>
      </section>

      <StatGrid cols={3}>
        <StatCard
          label="Shipping charges this month"
          value={month ? (month.total == null ? 'None yet' : fmtRupees(month.total)) : '...'}
          sub={month ? `${month.counted.toLocaleString('en-IN')} parcel${month.counted === 1 ? '' : 's'} booked since the 1st${month.unknown ? `, ${month.unknown} with no charge recorded` : ''}.` : undefined}
        />
        {hasPerm('orders.read') && (
          <Link to="/panel/orders/cod-recon" className="block">
            <StatCard
              label="COD still with Growcord Ship"
              value={codPayers ? fmtMinor(gsOwed) : '...'}
              tone={gsOwed > 0 ? 'warn' : 'default'}
              sub={codError ? codError : cod
                ? `${gsOwedParcels.toLocaleString('en-IN')} delivered COD parcel${gsOwedParcels === 1 ? '' : 's'} not paid out yet. All couriers, last 30 days: ${fmtMinor(cod.remitted_minor ?? 0)} paid out, ${fmtMinor(cod.pending_minor ?? 0)} pending.`
                : `${gsOwedParcels.toLocaleString('en-IN')} delivered COD parcel${gsOwedParcels === 1 ? '' : 's'} not paid out yet.`}
              className="transition-shadow hover:shadow-md"
            />
          </Link>
        )}
        <Link to="/panel/orders/weight-disputes" className="block">
          <StatCard
            label="Weight disputes open"
            value={disputes ? (Number(disputes.open ?? 0) + Number(disputes.disputing ?? 0)).toLocaleString('en-IN') : '...'}
            tone={disputes && Number(disputes.closingSoon ?? disputes.closing_soon ?? 0) > 0 ? 'bad' : 'default'}
            sub={disputes
              ? `${fmtMinor(disputes.atStakeMinor ?? disputes.at_stake_minor ?? 0)} at stake, every courier.${Number(disputes.closingSoon ?? disputes.closing_soon ?? 0) > 0 ? ` ${disputes.closingSoon ?? disputes.closing_soon} closing soon.` : ''}`
              : undefined}
            className="transition-shadow hover:shadow-md"
          />
        </Link>
      </StatGrid>

      <SectionCard
        title="Latest Growcord Ship parcels"
        flush
        action={<Link to="/growship/shipments?tab=ready_to_pick" className="text-sm text-blue-700 hover:underline">Open the board</Link>}
      >
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th>Booked</Th><Th>Order</Th><Th>AWB</Th><Th>Courier</Th><Th>Status</Th><Th num>Charge</Th>
            </THead>
            <TBody>
              {recent === null && <EmptyRow colSpan={6}>Reading...</EmptyRow>}
              {recent && recent.length === 0 && <EmptyRow colSpan={6}>No parcel has been booked with Growcord Ship yet.</EmptyRow>}
              {(recent ?? []).map((s) => {
                const order = Array.isArray(s.orders) ? s.orders[0] : null;
                const charge = shipmentCharge(s);
                return (
                  <Tr key={s._id || s.id}>
                    <Td muted>{formatDate(s.createdAt ?? s.created_at, 'dd MMM, HH:mm', '')}</Td>
                    <Td>{order ? <Link to={`/orders/${order._id || order.id}`} className="text-blue-700 hover:underline">{order.orderId || order.order_id}</Link> : (s.shipmentNumber || '')}</Td>
                    <Td className="font-mono text-xs">{shipmentAwb(s) || <span className="text-gray-400">None yet</span>}</Td>
                    <Td>{shipmentCourier(s) || ''}</Td>
                    <Td>{s.status ? <StatusBadge status={s.status} type="shipment" className="text-xs" /> : null}</Td>
                    <Td num>{charge ? fmtRupees(charge.total) : ''}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>
    </Page>
  );
};

export default GrowshipOverview;
