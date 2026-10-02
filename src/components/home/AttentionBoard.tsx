/**
 * "Needs your attention" — the top of the Dashboard (owner, 2026-09-25:
 * "show proper analytics in dashboard: all pending actions, orders, questions,
 * reviews, etc."; 2026-10-02: "pendencies … as a business owner").
 *
 * Every queue with work in it, grouped by the area it belongs to (Orders &
 * delivery · Money · Stock · Customers & content) and, inside each group, the
 * most urgent first. Each line is a count, a plain sentence, the money at stake
 * where the source carries it, and a link straight to the filtered page.
 * Urgency is said in words with an icon, never by colour alone.
 *
 * A line appears when its source answered and its count is non-zero; a source
 * is only asked for when the viewer's permission and the store's modules allow
 * it (`useHomeFeed`), so the board is role-aware without a per-role list.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Boxes, Building2, CalendarClock, CheckCircle2, ChevronRight, Clock,
  Mail, MessageCircleQuestion, PackageSearch, PauseCircle, RotateCcw, ShoppingCart, Star, Truck,
  Undo2, Wallet, ClipboardCheck, PackageCheck,
} from 'lucide-react';
import type { HomeSources } from './useHomeFeed';
import { fmtRupees, fmtMinor } from '../../lib/money';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '@/lib/utils';
import { CARD } from '../erp/Card';

export type TaskArea = 'orders' | 'money' | 'stock' | 'customers';
/** critical = act now (money or a customer is waiting) · warn = soon · normal = routine work. */
export type TaskSeverity = 'critical' | 'warn' | 'normal';

export interface Task {
  count: number;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  area: TaskArea;
  severity: TaskSeverity;
  /** The money the line is about, already formatted. */
  note?: string;
  /** For ordering inside a group: the rupees at stake. */
  amount?: number;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
/** `by_status` rows are `{ orders, value }` (orders panel); older callers passed a bare count. */
const statusCount = (v: any): number => (v && typeof v === 'object' ? n(v.orders) : n(v));
const statusValue = (v: any): number => (v && typeof v === 'object' ? n(v.value) : 0);

/** The slice of the commerce summary the board reads (the dashboard fetches it, all time). */
export interface CommerceSummary {
  refund_due_orders?: number;
  refund_due?: number;
}

const AREAS: Array<{ key: TaskArea; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'orders', title: 'Orders & delivery', icon: Truck },
  { key: 'money', title: 'Money', icon: Wallet },
  { key: 'stock', title: 'Stock', icon: Boxes },
  { key: 'customers', title: 'Customers & content', icon: MessageCircleQuestion },
];

const RANK: Record<TaskSeverity, number> = { critical: 0, warn: 1, normal: 2 };

/** Every queue with work in it. */
export function buildTasks(f: HomeSources, commerce?: CommerceSummary | null): Task[] {
  const t: Task[] = [];
  const byStatus: Record<string, any> = f.orders?.by_status ?? {};
  const add = (task: Task) => { if (task.count > 0) t.push(task); };
  const money = (v: number) => (v > 0 ? fmtRupees(v) : undefined);

  // ── Orders & delivery ──────────────────────────────────────────────────
  add({ count: statusCount(byStatus.pending), label: 'orders to confirm', to: '/orders?status=pending',
    icon: ShoppingCart, area: 'orders', severity: 'warn', note: money(statusValue(byStatus.pending)), amount: statusValue(byStatus.pending) });
  add({ count: statusCount(byStatus.confirmed), label: 'confirmed orders to pack', to: '/orders?status=confirmed',
    icon: Boxes, area: 'orders', severity: 'normal', note: money(statusValue(byStatus.confirmed)), amount: statusValue(byStatus.confirmed) });
  add({ count: statusCount(byStatus.processing), label: 'orders being packed', to: '/orders?status=processing',
    icon: PackageCheck, area: 'orders', severity: 'normal', note: money(statusValue(byStatus.processing)), amount: statusValue(byStatus.processing) });
  add({ count: statusCount(byStatus.on_hold), label: 'orders on hold', to: '/orders?status=on_hold',
    icon: PauseCircle, area: 'orders', severity: 'warn', note: money(statusValue(byStatus.on_hold)), amount: statusValue(byStatus.on_hold) });
  add({ count: n(f.orders?.summary?.returns), label: 'returns to deal with', to: '/returns',
    icon: RotateCcw, area: 'orders', severity: 'warn' });
  const floor = f.floor?.counts ?? {};
  add({ count: n(floor.dispatchReady), label: 'parcels ready to hand over', to: '/shipments', icon: Truck, area: 'orders', severity: 'normal' });
  add({ count: n(floor.packExceptionsOpen), label: 'packing problems to sort out', to: '/panel/inventory/pick-lists', icon: AlertTriangle, area: 'orders', severity: 'warn' });

  // ── Money ──────────────────────────────────────────────────────────────
  add({ count: n(f.refunds?.failed?.count), label: 'refunds that failed to send', to: '/panel/orders/refunds',
    icon: AlertTriangle, area: 'money', severity: 'critical',
    note: n(f.refunds?.failed?.amountMinor) ? fmtMinor(f.refunds.failed.amountMinor) : undefined, amount: n(f.refunds?.failed?.amountMinor) / 100 });
  add({ count: n(commerce?.refund_due_orders), label: 'paid orders cancelled with no refund raised', to: '/panel/orders/refunds',
    icon: AlertTriangle, area: 'money', severity: 'critical', note: money(n(commerce?.refund_due)), amount: n(commerce?.refund_due) });
  add({ count: n(f.refunds?.readyToSend?.count), label: 'refunds approved but not sent', to: '/panel/orders/refunds',
    icon: Undo2, area: 'money', severity: 'critical',
    note: fmtMinor(f.refunds?.readyToSend?.amountMinor), amount: n(f.refunds?.readyToSend?.amountMinor) / 100 });
  add({ count: n(f.refunds?.awaitingApproval?.count), label: 'refunds waiting for approval', to: '/panel/orders/refunds',
    icon: Undo2, area: 'money', severity: 'warn',
    note: fmtMinor(f.refunds?.awaitingApproval?.amountMinor), amount: n(f.refunds?.awaitingApproval?.amountMinor) / 100 });
  // Receivables: the AR payload is { summary, customers[] } with ageing per customer.
  const arCustomers: any[] = Array.isArray(f.receivables?.customers) ? f.receivables.customers : [];
  const late = arCustomers
    .map((c) => n(c.ageing?.d31_60) + n(c.ageing?.d61_90) + n(c.ageing?.d90_plus))
    .filter((v) => v > 0.005);
  const lateTotal = late.reduce((s, v) => s + v, 0);
  add({ count: late.length, label: 'customers owing for over 30 days', to: '/panel/accounting/receivables',
    icon: Clock, area: 'money', severity: 'warn', note: money(lateTotal), amount: lateTotal });
  add({ count: n(f.orders?.summary?.cod_orders_pending), label: 'COD orders not yet collected', to: '/panel/orders/cod-recon',
    icon: Wallet, area: 'money', severity: 'normal', note: money(n(f.orders?.summary?.cod_value_pending)), amount: n(f.orders?.summary?.cod_value_pending) });
  if (n(f.platformBill?.totalDue) > 0) {
    add({ count: n(f.platformBill?.invoiceCount) || 1, label: 'Growcord invoices to pay', to: '/settings/billing',
      icon: Wallet, area: 'money', severity: 'warn', note: fmtRupees(f.platformBill.totalDue), amount: n(f.platformBill.totalDue) });
  }

  // ── Stock ──────────────────────────────────────────────────────────────
  add({ count: n(f.inventory?.summary?.out_of_stock), label: 'SKUs out of stock', to: '/inventory?filter=out',
    icon: PackageSearch, area: 'stock', severity: 'warn' });
  add({ count: n(f.inventory?.summary?.low_stock), label: 'SKUs running low', to: '/inventory?filter=low',
    icon: PackageSearch, area: 'stock', severity: 'normal' });
  add({ count: n(f.inventory?.expiry?.expired), label: 'expired lots still in stock', to: '/panel/inventory/batches',
    icon: CalendarClock, area: 'stock', severity: 'critical' });
  add({ count: n(f.inventory?.expiry?.within_30d), label: 'lots expiring within 30 days', to: '/panel/inventory/batches',
    icon: CalendarClock, area: 'stock', severity: 'warn' });
  add({ count: n(floor.pickListsOpen), label: 'pick lists on the floor', to: '/panel/inventory/pick-lists', icon: Boxes, area: 'stock', severity: 'normal' });
  add({ count: n(floor.countsOpen), label: 'stock counts to do', to: '/panel/inventory/counts', icon: ClipboardCheck, area: 'stock', severity: 'normal' });

  // ── Customers & content ────────────────────────────────────────────────
  add({ count: n(f.questions?.unanswered), label: 'product questions unanswered', to: '/questions',
    icon: MessageCircleQuestion, area: 'customers', severity: 'warn' });
  const b2bPending = n(f.b2bApps?.counts?.pending ?? (Array.isArray(f.b2bApps?.data) ? f.b2bApps.data.length : Array.isArray(f.b2bApps) ? f.b2bApps.length : 0));
  add({ count: b2bPending, label: 'B2B applications to approve', to: '/b2b', icon: Building2, area: 'customers', severity: 'warn' });
  add({ count: n(f.reviews?.reported), label: 'reviews reported by shoppers', to: '/reviews', icon: AlertTriangle, area: 'customers', severity: 'warn' });
  add({ count: n(f.reviews?.pending), label: 'reviews waiting for approval', to: '/reviews', icon: Star, area: 'customers', severity: 'normal' });
  add({ count: n(f.enquiries?.new ?? f.enquiries?.unread), label: 'new enquiries from the contact form', to: '/settings/contact', icon: Mail, area: 'customers', severity: 'normal' });
  add({ count: n(f.carts?.total), label: 'abandoned carts to recover', to: '/orders/abandoned-carts', icon: ShoppingCart, area: 'customers', severity: 'normal' });

  return t.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.amount ?? 0) - (a.amount ?? 0));
}

const SeverityTag: React.FC<{ severity: TaskSeverity }> = ({ severity }) => {
  if (severity === 'normal') return null;
  return severity === 'critical' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-bad-bg px-1.5 py-0.5 text-[11px] font-medium text-bad-ink">
      <AlertTriangle aria-hidden className="size-3" />Urgent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn-ink">
      <Clock aria-hidden className="size-3" />Soon
    </span>
  );
};

export const AttentionBoard: React.FC<{ feed: HomeSources; commerce?: CommerceSummary | null }> = ({ feed, commerce }) => {
  // A store on simple SKU stock (the `batches` module off) has no lots, so a
  // lot queue pointing at a hidden page is not shown.
  const { canAccess } = useAuth();
  const tasks = buildTasks(feed, commerce).filter((t) => canAccess('batches') || t.to !== '/panel/inventory/batches');
  const critical = tasks.filter((t) => t.severity === 'critical').length;
  const nothingYet = feed.loading && tasks.length === 0;
  const groups = AREAS.map((a) => ({ ...a, tasks: tasks.filter((t) => t.area === a.key) })).filter((g) => g.tasks.length > 0);

  return (
    <section aria-label="Needs your attention" data-attention-board>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-gray-900">Needs your attention</h2>
        <span className="text-xs text-gray-500" data-attention-summary>
          {tasks.length > 0
            ? `${tasks.length} thing${tasks.length === 1 ? '' : 's'} to do${critical ? ` · ${critical} urgent` : ''}`
            : feed.loading ? 'Checking your queues…' : ''}
          {tasks.length > 0 && feed.pending.length > 0 ? ` · still checking ${feed.pending.length}` : ''}
        </span>
      </div>

      {nothingYet ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className={cn(CARD, 'flex items-center gap-3 px-4 py-4 text-sm text-gray-600')} data-attention-clear>
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-good" />
          <div>
            <div className="font-medium text-gray-900">All clear</div>
            <div className="text-gray-500">Nothing is waiting on you. Anything that needs a decision will appear here.</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <div key={g.key} className={cn(CARD, 'flex flex-col')} data-attention-group={g.key}>
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <g.icon aria-hidden className="size-4 text-gray-400" />{g.title}
                </span>
                <span className="text-xs tabular-nums text-gray-400">{g.tasks.length}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {g.tasks.map((task) => (
                  <li key={`${task.to}-${task.label}`}>
                    <Link to={task.to} data-attention-tile data-severity={task.severity}
                      className="group flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none">
                      <task.icon aria-hidden className={cn('mt-0.5 size-4 shrink-0',
                        task.severity === 'critical' ? 'text-bad' : task.severity === 'warn' ? 'text-warn' : 'text-gray-400')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="font-semibold tabular-nums text-gray-900">{task.count.toLocaleString('en-IN')}</span>
                          <span className="text-sm text-gray-700">{task.label}</span>
                        </span>
                        {(task.note || task.severity !== 'normal') && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-2">
                            <SeverityTag severity={task.severity} />
                            {task.note && <span className="text-xs tabular-nums text-gray-500">{task.note}</span>}
                          </span>
                        )}
                      </span>
                      <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(feed.failed.length > 0 || (!feed.loading && feed.withheld.length > 0)) && (
        <div className="mt-2 space-y-0.5 text-xs text-gray-400">
          {feed.failed.length > 0 && <p>Could not check right now: {feed.failed.join(' · ')}.</p>}
          {!feed.loading && feed.withheld.length > 0 && (
            <p>Not shown because your role or your plan does not include it: {feed.withheld.join(' · ')}.</p>
          )}
        </div>
      )}
    </section>
  );
};

export default AttentionBoard;
