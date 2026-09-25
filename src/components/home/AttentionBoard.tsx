/**
 * "Needs your attention" — the top of the Dashboard (owner, 2026-09-25:
 * "show proper analytics in dashboard: all pending actions, orders, questions,
 * reviews, etc.").
 *
 * One tile per queue with something in it: a count, a plain sentence and a
 * link straight to the filtered page. A tile appears when its source answered
 * and its count is non-zero; its source is only asked for when the viewer's
 * permission and the store's modules allow it (`useHomeFeed`), so the board is
 * role-aware without a per-role list to keep in step. Amber = money or time.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, PackageSearch, Truck, Undo2, RotateCcw, Wallet,
  ShoppingCart, AlertTriangle, CalendarClock, Boxes, Star, MessageCircleQuestion,
  Building2, Mail,
} from 'lucide-react';
import type { HomeSources } from './useHomeFeed';
import { fmtRupees, fmtMinor } from '../../lib/money';

export interface Task {
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

/** Every queue with work in it, in the order the desk works them. */
export function buildTasks(f: HomeSources): Task[] {
  const t: Task[] = [];
  const byStatus: Record<string, number> = f.orders?.by_status ?? {};

  // ── Orders ──────────────────────────────────────────────────────────────
  if (n(byStatus.pending)) {
    t.push({ count: n(byStatus.pending), label: 'orders to confirm', to: '/orders?status=pending', icon: ShoppingCart, urgent: true });
  }
  const toPack = n(byStatus.confirmed) + n(byStatus.processing);
  if (toPack) t.push({ count: toPack, label: 'orders to pack and ship', to: '/orders?status=confirmed', icon: Boxes });
  const unshipped = n(byStatus.confirmed) + n(byStatus.processing) - n(byStatus.shipped);
  if (unshipped > 0 && n(byStatus.shipped)) {
    t.push({ count: unshipped, label: 'orders with no parcel yet', to: '/shipments', icon: Truck });
  }
  if (n(f.orders?.summary?.cod_orders_pending)) {
    t.push({
      count: n(f.orders.summary.cod_orders_pending), label: 'COD orders not yet collected',
      to: '/panel/orders/cod-recon', icon: Wallet,
      note: fmtRupees(f.orders.summary.cod_value_pending),
    });
  }
  if (n(f.carts?.total)) {
    t.push({ count: n(f.carts.total), label: 'abandoned carts to recover', to: '/orders/abandoned-carts', icon: ShoppingCart });
  }

  // ── Money back ──────────────────────────────────────────────────────────
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

  // ── Customers talking to you ────────────────────────────────────────────
  if (n(f.questions?.unanswered)) {
    t.push({ count: n(f.questions.unanswered), label: 'product questions unanswered', to: '/questions', icon: MessageCircleQuestion, urgent: true });
  }
  if (n(f.reviews?.pending)) {
    t.push({ count: n(f.reviews.pending), label: 'reviews waiting for approval', to: '/reviews', icon: Star });
  }
  if (n(f.reviews?.reported)) {
    t.push({ count: n(f.reviews.reported), label: 'reviews reported by shoppers', to: '/reviews', icon: AlertTriangle });
  }
  const newEnquiries = n(f.enquiries?.new ?? f.enquiries?.unread);
  if (newEnquiries) t.push({ count: newEnquiries, label: 'new enquiries from the contact form', to: '/settings/contact', icon: Mail });
  const b2bPending = n(f.b2bApps?.counts?.pending ?? (Array.isArray(f.b2bApps?.data) ? f.b2bApps.data.length : Array.isArray(f.b2bApps) ? f.b2bApps.length : 0));
  if (b2bPending) t.push({ count: b2bPending, label: 'B2B applications to approve', to: '/b2b', icon: Building2, urgent: true });

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
  const picks = n(floor.picks_open ?? floor.open_picks ?? floor.pick_lists?.length);
  if (picks) t.push({ count: picks, label: 'pick lists on the floor', to: '/panel/inventory/pick-lists', icon: Boxes });
  const counts = n(floor.counts_due ?? floor.counts?.length);
  if (counts) t.push({ count: counts, label: 'stock counts to do', to: '/panel/inventory/counts', icon: CheckCircle2 });

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

export const AttentionBoard: React.FC<{ feed: HomeSources }> = ({ feed }) => {
  const tasks = buildTasks(feed);
  const urgent = tasks.filter((t) => t.urgent).length;
  return (
    <section aria-label="Needs your attention" data-attention-board>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Needs your attention</h2>
        {!feed.loading && tasks.length > 0 && (
          <span className="text-xs text-gray-500">
            {tasks.length} queue{tasks.length === 1 ? '' : 's'} with work{urgent ? ` · ${urgent} urgent` : ''}
          </span>
        )}
      </div>
      {feed.loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-4 text-sm text-gray-600 shadow-sm">
          <CheckCircle2 className="size-4 text-good" />
          Nothing is waiting on you. Anything that needs a decision will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tasks.map((task) => (
            <Link
              key={`${task.to}-${task.label}`}
              to={task.to}
              data-attention-tile
              className={`group flex flex-col justify-between rounded-lg border bg-white p-3 shadow-sm transition-colors hover:border-brand/40 ${task.urgent ? 'border-l-4 border-l-warn' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl font-semibold tabular-nums text-gray-900">{task.count.toLocaleString('en-IN')}</span>
                <task.icon className={`mt-1 size-4 shrink-0 ${task.urgent ? 'text-warn' : 'text-gray-400'}`} />
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="text-sm leading-snug text-gray-600">{task.label}</span>
                <ArrowRight className="mb-0.5 size-3.5 shrink-0 text-gray-300 group-hover:text-gray-500" />
              </div>
              {task.note && <span className="mt-1 text-xs tabular-nums text-gray-500">{task.note}</span>}
            </Link>
          ))}
        </div>
      )}
      {!feed.loading && feed.withheld.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          Not shown because your role or your plan does not include it: {feed.withheld.join(' · ')}.
        </p>
      )}
    </section>
  );
};

export default AttentionBoard;
