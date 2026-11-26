import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Upload, Calculator, Receipt, AlertTriangle } from 'lucide-react';
import { api, shipmentsAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '@/lib/unwrap';
import { fmtMinor, fmtRupees } from '@/lib/money';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, btn, Chip,
} from '../../components/erp';
import StatusBadge from '../../components/order/StatusBadge';
import { WalletCard, useStoreWallet } from '../../components/growship/WalletCard';
import type { TabType } from '../../components/shipments';
import { shipmentAwb, shipmentCharge, shipmentCourier } from '../../components/shipments/shipmentFacts';
import {
  NOT_TAKEN_TEXT, growshipAPI, isNotEnabled, notTakenBookings, notTakenMatcher, type GsAccount, type GsConsignment,
} from '@/lib/v2/growship';
import { codPayoutsAPI, type CodPayer } from '../payments/data';

const GS = 'growcord_ship' as const;

/** The board's tabs, in the order a parcel moves; their counts are on the Shipments page (one board read). */
const TABS: Array<{ tab: TabType; label: string }> = [
  { tab: 'pending_orders', label: 'Orders to book' },
  { tab: 'ready_to_pick', label: 'Waiting for pickup' },
  { tab: 'pickup_scheduled', label: 'Pickup booked' },
  { tab: 'in_transit', label: 'On the way' },
  { tab: 'ndr_failed_delivery', label: 'Failed delivery' },
  { tab: 'delivered', label: 'Delivered' },
  { tab: 'rto_in_transit', label: 'Coming back (RTO)' },
  { tab: 'rto_delivered', label: 'Returned (RTO)' },
];

/**
 * Growcord Ship at a glance (owner 26 Nov 2026: a Growcord Ship menu with the complete panel): the wallet its
 * freight comes off with Add money, the account, the latest parcels with the charges so far, cash on delivery still
 * with Growcord Ship, open weight disputes, and bookings no courier took (refunded, listed apart, never shown as
 * live parcels). Six reads, once, when the page opens; the counts by status are on the Shipments page.
 */
const GrowshipOverview: React.FC = () => {
  const { hasPerm } = useAuth();
  const canBilling = hasPerm('billing.read');
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(canBilling);

  const [account, setAccount] = useState<GsAccount | null | undefined>(undefined);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [notOn, setNotOn] = useState(false);
  const [recent, setRecent] = useState<any[] | null>(null);
  const [recentTotal, setRecentTotal] = useState<number | null>(null);
  const [charges, setCharges] = useState<{ total: number | null; counted: number; unknown: number } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [codPayers, setCodPayers] = useState<CodPayer[] | null>(null);
  const [notTaken, setNotTaken] = useState<GsConsignment[]>([]);
  const [codError, setCodError] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<any | null>(null);

  useEffect(() => {
    // Bookings no courier took: refunded at once, so they are listed apart and never read as live parcels.
    if (hasPerm('shipments.read')) notTakenBookings(20).then(setNotTaken).catch(() => setNotTaken([]));

    growshipAPI.account()
      .then((a) => setAccount(a))
      .catch((e) => { setAccount(null); setNotOn(isNotEnabled(e)); setAccountError(errorText(e, 'The Growcord Ship account could not be read.')); });

    // One board read: the latest parcels, how many there are, and the board's own sum of their charges.
    shipmentsAPI.getAll({ shippingProvider: GS, page: 1, limit: 8 })
      .then((r: any) => {
        setRecent(Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
        const t = Number(r?.pagination?.total);
        setRecentTotal(Number.isFinite(t) ? t : null);
        const ct = r?.chargeTotals;
        if (ct && typeof ct === 'object') {
          setCharges({ total: ct.total == null ? null : Number(ct.total), counted: Number(ct.counted) || 0, unknown: Number(ct.unknown) || 0 });
        }
      })
      .catch((e) => { setRecent([]); setListError(errorText(e, 'The parcels could not be read.')); });

    if (hasPerm('orders.read')) {
      codPayoutsAPI.awaiting()
        .then((a) => setCodPayers(a.couriers.filter((c) => c.provider === GS)))
        .catch((e) => { setCodPayers([]); setCodError(errorText(e, 'Cash on delivery could not be read.')); });
    }

    api.get('/weight-disputes/summary')
      .then((r) => setDisputes(payload<any>(r)?.totals ?? null))
      .catch(() => setDisputes(null));
    // Read once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notTakenOf = notTakenMatcher(notTaken);
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
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.tab} to={`/growship/shipments?tab=${t.tab}`} className={btn({ variant: 'outline', size: 'sm' })}>{t.label}</Link>
          ))}
        </div>
        <p className="text-xs text-gray-500">How many are in each is on the Shipments page.</p>
      </section>

      <StatGrid cols={3}>
        <StatCard
          label="Shipping charges so far"
          value={charges ? (charges.total == null ? 'None yet' : fmtRupees(charges.total)) : '...'}
          sub={charges ? `${charges.counted.toLocaleString('en-IN')} Growcord Ship parcel${charges.counted === 1 ? '' : 's'}${charges.unknown ? `, ${charges.unknown} with no charge recorded` : ''}. By period: Billing and charges.` : undefined}
        />
        {hasPerm('orders.read') && (
          <Link to="/panel/orders/cod-recon" className="block">
            <StatCard
              label="COD still with Growcord Ship"
              value={codPayers ? fmtMinor(gsOwed) : '...'}
              tone={gsOwed > 0 ? 'warn' : 'default'}
              sub={codError ?? `${gsOwedParcels.toLocaleString('en-IN')} delivered COD parcel${gsOwedParcels === 1 ? '' : 's'} not paid out yet.`}
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
                const refused = notTakenOf(s);
                return (
                  <Tr key={s._id || s.id}>
                    <Td muted>{formatDate(s.createdAt ?? s.created_at, 'dd MMM, HH:mm', '')}</Td>
                    <Td>{order ? <Link to={`/orders/${order._id || order.id}`} className="text-blue-700 hover:underline">{order.orderId || order.order_id}</Link> : (s.shipmentNumber || '')}</Td>
                    <Td className="font-mono text-xs">{shipmentAwb(s) || <span className="text-gray-400">None yet</span>}</Td>
                    <Td>{shipmentCourier(s) || ''}</Td>
                    <Td>{refused ? <Chip tone="neutral">{NOT_TAKEN_TEXT}</Chip> : s.status ? <StatusBadge status={s.status} type="shipment" className="text-xs" /> : null}</Td>
                    <Td num>{refused ? <span className="text-xs text-gray-500">Refunded</span> : charge ? fmtRupees(charge.total) : ''}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      {notTaken.length > 0 && (
        <SectionCard
          title="Bookings no courier took"
          description="Growcord Ship gave the money back at once. These are not parcels: book the order again when ready."
          flush
        >
          <TableShell className="rounded-none border-0 shadow-none">
            <table className="w-full text-sm">
              <THead><Th>Tried</Th><Th>Order</Th><Th>To</Th><Th>State</Th><Th num>Amount</Th></THead>
              <TBody>
                {notTaken.slice(0, 5).map((c) => (
                  <Tr key={c.id}>
                    <Td muted>{formatDate(c.created_at, 'dd MMM, HH:mm', '')}</Td>
                    <Td>{c.shipper_reference || c.consignment_number || ''}</Td>
                    <Td className="text-xs">{c.destination_pincode || ''}</Td>
                    <Td><Chip tone="neutral">{NOT_TAKEN_TEXT}</Chip></Td>
                    <Td num className="text-gray-500">{c.sell_with_gst != null ? `${fmtRupees(c.sell_with_gst)} back` : ''}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      )}
    </Page>
  );
};

export default GrowshipOverview;
