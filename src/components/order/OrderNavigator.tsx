import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { ordersAPI } from '../../services/api';
import { loadOrderNav, saveOrderNav, type OrderNavContext } from '../../lib/orderNav';

/**
 * "← Previous order / Next order →" for the Order Detail page.
 *
 * Walks the exact sequence the Orders list last rendered (same filters, same
 * search, same sort) — published by Orders.tsx into sessionStorage. At a page
 * boundary it fetches the neighbouring page with those same params and jumps to
 * its last/first order, so the walk continues across all 14 pages rather than
 * dead-ending every 100 orders.
 *
 * Renders nothing when there is no usable context (deep link from an email, a
 * stale session, an order that has since dropped out of the filter) — this is a
 * convenience, never the only way to reach an order.
 */
interface OrderNavigatorProps {
  /** The order currently open — its UUID. */
  currentId: string;
  /** Its printed number, used to recognise the order when the list stored ids by number. */
  currentOrderNumber?: string;
}

const OrderNavigator: React.FC<OrderNavigatorProps> = ({ currentId, currentOrderNumber }) => {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<OrderNavContext | null>(null);
  const [busy, setBusy] = useState<'prev' | 'next' | null>(null);

  useEffect(() => { setCtx(loadOrderNav()); }, [currentId]);

  if (!ctx) return null;

  const index = ctx.ids.findIndex((x) => x === currentId || x === currentOrderNumber);
  if (index === -1) return null;

  // Absolute position within the whole filtered result set, not just this page.
  const absolute = ctx.offset + index;
  const hasPrev = absolute > 0;
  const hasNext = absolute < ctx.total - 1;

  /** Pull the neighbouring page with the list's own params and continue the walk there. */
  const crossPage = async (dir: 'prev' | 'next') => {
    const offset = dir === 'prev' ? Math.max(0, ctx.offset - ctx.limit) : ctx.offset + ctx.limit;
    setBusy(dir);
    try {
      const res: any = await ordersAPI.getAll({ ...(ctx.params as any), limit: ctx.limit, offset });
      // Same tolerant unwrap Orders.tsx uses — the axios interceptor may hand
      // back the array itself or a { data } envelope depending on the route.
      const rows: any[] = Array.isArray(res) ? res
        : Array.isArray(res?.data) ? res.data
        : Array.isArray(res?.data?.data) ? res.data.data
        : [];
      if (!rows.length) return;
      const ids = rows.map((o) => o._id ?? o.id);
      const labels: Record<string, string> = {};
      rows.forEach((o) => { const k = o._id ?? o.id; if (k) labels[k] = o.orderId ?? o.order_id ?? ''; });
      saveOrderNav({ ids, labels, offset, limit: ctx.limit, total: ctx.total, params: ctx.params });
      const target = dir === 'prev' ? ids[ids.length - 1] : ids[0];
      if (target) navigate(`/orders/${target}`);
    } catch {
      /* Leave the operator where they are — a failed page fetch must not navigate. */
    } finally {
      setBusy(null);
    }
  };

  const go = (dir: 'prev' | 'next') => {
    const step = dir === 'prev' ? -1 : 1;
    const nextIndex = index + step;
    if (nextIndex >= 0 && nextIndex < ctx.ids.length) {
      navigate(`/orders/${ctx.ids[nextIndex]}`);
      return;
    }
    void crossPage(dir);
  };

  const label = (dir: 'prev' | 'next') => {
    const id = ctx.ids[index + (dir === 'prev' ? -1 : 1)];
    return id ? ctx.labels?.[id] : undefined;
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border-2 border-slate-200 bg-white p-0.5">
      <Button
        type="button" variant="ghost" size="sm"
        className="h-8 px-2.5 font-bold text-slate-700 disabled:opacity-30"
        disabled={!hasPrev || busy !== null}
        onClick={() => go('prev')}
        title={label('prev') ? `Previous order — ${label('prev')}` : 'Previous order'}
      >
        <FaChevronLeft className="h-3 w-3" />
        <span className="ml-1.5 hidden sm:inline">Prev</span>
      </Button>
      <span className="px-2 text-xs font-bold tabular-nums text-slate-500 whitespace-nowrap">
        {(absolute + 1).toLocaleString('en-IN')} / {ctx.total.toLocaleString('en-IN')}
      </span>
      <Button
        type="button" variant="ghost" size="sm"
        className="h-8 px-2.5 font-bold text-slate-700 disabled:opacity-30"
        disabled={!hasNext || busy !== null}
        onClick={() => go('next')}
        title={label('next') ? `Next order — ${label('next')}` : 'Next order'}
      >
        <span className="mr-1.5 hidden sm:inline">Next</span>
        <FaChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default OrderNavigator;
