/**
 * Home — what needs you today, then the numbers.
 *
 * The old `/dashboard` was a wall of tiles: totals with no verb, the same for
 * every role, and nothing that said what to DO. This lists the work first —
 * each line a count, a plain sentence and a link straight to the queue — and
 * puts today's figures underneath, where a number belongs once the work is
 * visible.
 *
 * It is role-aware without being role-branched: a line appears when its source
 * answered and its count is non-zero, and its source is only asked for when the
 * viewer's permission and the store's modules allow it (`useHomeFeed`). A
 * warehouse worker therefore lands on the floor's lines, an accountant on
 * receivables — from ONE component, with no per-role list to keep in step.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useHomeFeed } from './useHomeFeed';
import { fmtRupees, fmtMinor } from '../../lib/money';
import {
  ArrowRight, CheckCircle2, PackageSearch, Truck, Undo2, RotateCcw, Wallet,
  ShoppingCart, AlertTriangle, CalendarClock, Boxes, LineChart, ExternalLink,
} from 'lucide-react';
import { productUrl } from '../../lib/menu';

interface Task {
  count: number;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Amber when it is money or time-critical, plain otherwise. */
  urgent?: boolean;
  /** The money the line is about, already formatted. */
  note?: string;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function buildTasks(f: ReturnType<typeof useHomeFeed>): Task[] {
  const t: Task[] = [];
  const byStatus: Record<string, number> = f.orders?.by_status ?? {};

  // ── Sell ────────────────────────────────────────────────────────────────
  if (n(byStatus.pending)) {
    t.push({ count: n(byStatus.pending), label: 'orders to confirm', to: '/orders?status=pending', icon: ShoppingCart, urgent: true });
  }
  const toPack = n(byStatus.confirmed) + n(byStatus.processing);
  if (toPack) t.push({ count: toPack, label: 'orders to pack', to: '/orders?status=confirmed', icon: Boxes });
  if (n(f.orders?.summary?.cod_orders_pending)) {
    t.push({
      count: n(f.orders.summary.cod_orders_pending), label: 'COD orders not yet collected',
      to: '/panel/orders/cod-recon', icon: Wallet,
      note: fmtRupees(f.orders.summary.cod_value_pending),
    });
  }
  if (n(f.refunds?.awaitingApproval?.count)) {
    t.push({
      count: n(f.refunds.awaitingApproval.count), label: 'refunds waiting for approval',
      to: '/panel/orders/refunds', icon: Undo2, urgent: true,
      note: fmtMinor(f.refunds.awaitingApproval.amountMinor),
    });
  }
  if (n(f.refunds?.readyToSend?.count)) {
    t.push({
      count: n(f.refunds.readyToSend.count), label: 'refunds approved but not sent',
      to: '/panel/orders/refunds', icon: Undo2, urgent: true,
      note: fmtMinor(f.refunds.readyToSend.amountMinor),
    });
  }
  if (n(f.refunds?.failed?.count)) {
    t.push({ count: n(f.refunds.failed.count), label: 'refunds that failed to send', to: '/panel/orders/refunds', icon: AlertTriangle, urgent: true });
  }
  if (n(f.commerce?.summary?.refund_due_orders)) {
    t.push({
      count: n(f.commerce.summary.refund_due_orders), label: 'paid orders cancelled with no refund raised',
      to: '/panel/orders/refunds', icon: AlertTriangle, urgent: true,
      note: fmtRupees(f.commerce.summary.refund_due),
    });
  }
  const returns = n(f.orders?.summary?.returns);
  if (returns) t.push({ count: returns, label: 'returns to deal with', to: '/returns', icon: RotateCcw });
  const unshipped = n(byStatus.confirmed) + n(byStatus.processing) - n(byStatus.shipped);
  if (unshipped > 0 && n(byStatus.shipped)) {
    t.push({ count: unshipped, label: 'orders with no parcel yet', to: '/shipments', icon: Truck });
  }

  // ── Stock ───────────────────────────────────────────────────────────────
  if (n(f.inventory?.summary?.out_of_stock)) {
    t.push({ count: n(f.inventory.summary.out_of_stock), label: 'SKUs out of stock', to: '/inventory?filter=outOfStock', icon: PackageSearch, urgent: true });
  }
  if (n(f.inventory?.summary?.low_stock)) {
    t.push({ count: n(f.inventory.summary.low_stock), label: 'SKUs running low', to: '/inventory?filter=lowStock', icon: PackageSearch });
  }
  const expiring = n(f.inventory?.expiry?.expiring_soon ?? f.inventory?.expiry?.expiring_90d);
  if (expiring) t.push({ count: expiring, label: 'lots expiring soon', to: '/panel/inventory/batches', icon: CalendarClock, urgent: true });

  // ── The floor ───────────────────────────────────────────────────────────
  const floor = f.floor ?? {};
  if (n(floor.picks_open ?? floor.open_picks ?? floor.pick_lists?.length)) {
    t.push({ count: n(floor.picks_open ?? floor.open_picks ?? floor.pick_lists?.length), label: 'pick lists on the floor', to: '/panel/inventory/pick-lists', icon: Boxes });
  }
  if (n(floor.counts_due ?? floor.counts?.length)) {
    t.push({ count: n(floor.counts_due ?? floor.counts?.length), label: 'counts to do', to: '/panel/inventory/counts', icon: CheckCircle2 });
  }

  // ── Money ───────────────────────────────────────────────────────────────
  const arRows: any[] = Array.isArray(f.receivables) ? f.receivables : (f.receivables?.rows ?? []);
  const overdue = arRows.filter((r: any) => n(r.days_overdue ?? r.overdue_days) > 0);
  if (overdue.length) {
    t.push({
      count: overdue.length, label: 'invoices past their due date', to: '/panel/accounting/receivables',
      icon: Wallet, urgent: true,
      note: fmtRupees(overdue.reduce((s: number, r: any) => s + n(r.outstanding ?? r.balance ?? 0), 0)),
    });
  }
  if (n(f.platformBill?.totalDue)) {
    t.push({ count: n(f.platformBill?.invoiceCount) || 1, label: 'Growcord invoices to pay', to: '/settings/billing', icon: Wallet, note: fmtRupees(f.platformBill.totalDue) });
  }

  return t;
}

const Tile: React.FC<{ label: string; value: string; sub?: string; to?: string }> = ({ label, value, sub, to }) => {
  const body = (
    <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-mute">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const RoleHome: React.FC = () => {
  const { user, hasPerm, canAccess, modulesLoaded } = useAuth();
  const feed = useHomeFeed({ hasPerm, canAccess, modulesLoaded });
  const tasks = buildTasks(feed);
  const s = feed.commerce?.summary;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name ?? '').split(' ')[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {feed.loading ? 'Checking what needs you…'
              : tasks.length ? `${tasks.length} thing${tasks.length === 1 ? '' : 's'} need you today.`
              : 'Nothing is waiting on you.'}
          </p>
        </div>
        {hasPerm('orders.manage') && (
          <Link
            to="/orders/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
          >
            New order
          </Link>
        )}
      </header>

      {/* ── what needs you ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-mute">Needs you</h2>
        {feed.loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            <CheckCircle2 className="size-4 text-good" />
            Nothing is waiting. Anything that needs a decision will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {tasks.map((task) => (
              <li key={`${task.to}-${task.label}`}>
                <Link to={task.to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <task.icon className={`size-4 shrink-0 ${task.urgent ? 'text-warn' : 'text-ink-mute'}`} />
                  <span className="text-sm tabular-nums font-semibold text-ink">{task.count}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{task.label}</span>
                  {task.note && <span className="shrink-0 text-sm tabular-nums text-ink-mute">{task.note}</span>}
                  <ArrowRight className="size-4 shrink-0 text-ink-mute" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── today ──────────────────────────────────────────────────────── */}
      {s && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-mute">Today</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Sales" value={fmtRupees(s.gross_sales)} sub={`${n(s.orders)} order${n(s.orders) === 1 ? '' : 's'}`} to="/analytics/dashboard" />
            <Tile label="Collected" value={fmtRupees(s.collected_revenue)} sub={`${n(s.collected_orders)} paid`} to="/orders" />
            <Tile label="Average order" value={fmtRupees(s.aov)} sub={`${n(s.units_sold)} units`} />
            <Tile label="New customers" value={String(n(s.new_customers))} sub={n(s.sessions) ? `${n(s.sessions)} visits` : undefined} to="/customers" />
          </div>
        </section>
      )}

      {/* The floor's home is the WMS panel (ruling WH13), not this console. */}
      {(hasPerm('warehouse.read') || hasPerm('warehouse.operate')) && canAccess('wms') && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-mute">Warehouse</h2>
          <a href={productUrl('wms', '/floor')} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft hover:bg-surface-2" data-wms-floor>
            <Boxes className="size-4 text-ink-mute" />
            <span className="flex-1">The floor — picks, putaway, counts and packing, in Growcord WMS</span>
            <ExternalLink className="size-4 text-ink-mute" />
          </a>
        </section>
      )}

      {feed.marketing && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-mute">Marketing</h2>
          <Link to="/panel/marketing" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft hover:bg-surface-2">
            <LineChart className="size-4 text-ink-mute" />
            <span className="flex-1">Campaigns, audiences and what they brought in</span>
            <ArrowRight className="size-4 text-ink-mute" />
          </Link>
        </section>
      )}

      {/* Honest about what this viewer is not shown, rather than an empty card. */}
      {!feed.loading && feed.withheld.length > 0 && (
        <p className="text-xs text-ink-mute">
          Not shown here because your role or your plan does not include it: {feed.withheld.join(' · ')}.
        </p>
      )}
    </div>
  );
};

export default RoleHome;
