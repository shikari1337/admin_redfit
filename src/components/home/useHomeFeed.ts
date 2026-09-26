/**
 * What the Dashboard's "Needs your attention" board reads, and what it is
 * allowed to read.
 *
 * Every source here already exists (L5 §8). No new backend route was added: the
 * board is a COMPOSITION of the same endpoints the pages use, so a number on
 * the dashboard can never disagree with the number on the page it links to.
 *
 * A section whose permission or module the viewer lacks is never REQUESTED.
 * That is deliberate: firing it and swallowing the 403 puts a red line in every
 * warehouse worker's console on every page load (COMMON_MISTAKES #83/#85), and
 * an empty card would read as "nothing to do" when it means "not for you".
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';

export interface HomeSources {
  orders: any | null;        // /analytics/panels/orders         (orders.read)
  inventory: any | null;     // /analytics/panels/inventory      (inventory.read + inventory)
  refunds: any | null;       // /refunds/summary                 (orders.read)
  floor: any | null;         // /wms/floor/today                 (warehouse.read + wms)
  receivables: any | null;   // /ar/outstanding                  (accounting.read + accounting)
  platformBill: any | null;  // /billing/overview                (billing.read)
  reviews: any | null;       // /reviews/admin/counts            (content.read + reviews)
  questions: any | null;     // /product-questions/admin/counts  (content.read + product_qa)
  carts: any | null;         // /carts/admin?status=abandoned    (orders.read) — `total` only
  b2bApps: any | null;       // /b2b/applications?status=pending (b2b.read + b2b) — `counts`
  enquiries: any | null;     // /contact/stats                   (customers.read)
  /** Sections not fetched because this viewer may not see them. */
  withheld: string[];
  loading: boolean;
}

interface Gate {
  hasPerm: (p: string) => boolean;
  canAccess: (m: string) => boolean;
  modulesLoaded: boolean;
}

const EMPTY: HomeSources = {
  orders: null, inventory: null, refunds: null, floor: null,
  receivables: null, platformBill: null,
  reviews: null, questions: null, carts: null, b2bApps: null, enquiries: null,
  withheld: [], loading: true,
};

export function useHomeFeed(gate: Gate): HomeSources {
  const [state, setState] = useState<HomeSources>(EMPTY);
  const ran = useRef(false);

  useEffect(() => {
    // Wait for the module map: `canAccess` fails OPEN before it lands, so
    // deciding early asks for a disabled module's data and eats a 403.
    if (!gate.modulesLoaded || ran.current) return;
    ran.current = true;
    let alive = true;

    const withheld: string[] = [];
    const get = (url: string, allowed: boolean, why: string, params?: object) => {
      if (!allowed) { withheld.push(why); return Promise.resolve(null); }
      return api.get(url, { params })
        .then((r) => payload<any>(r))
        .catch(() => null);   // a slow or failing section must not blank the page
    };
    // The list endpoints carry `total` BESIDE the rows; the interceptor keeps it
    // on the array as a non-enumerable property, which `payload()` would drop.
    const total = (url: string, allowed: boolean, why: string, params?: object) => {
      if (!allowed) { withheld.push(why); return Promise.resolve(null); }
      return api.get(url, { params })
        .then((r: any) => {
          const body = r?.data ?? r;
          const t = body?.total ?? r?.total ?? body?.data?.total;
          return { total: Number(t ?? 0) };
        })
        .catch(() => null);
    };

    // Today's sales are NOT asked for here: the dashboard already reads
    // /analytics/panels/commerce for its own tiles and hands the board the
    // summary it needs (refund-due). The floor is only a warehouse role's
    // concern, and only when the store has the WMS.
    const sellRead = gate.hasPerm('orders.read');
    const stockRead = gate.hasPerm('inventory.read') && gate.canAccess('inventory');
    const floorRead = (gate.hasPerm('warehouse.read') || gate.hasPerm('warehouse.operate')) && gate.canAccess('wms');
    const booksRead = gate.hasPerm('accounting.read') && gate.canAccess('accounting');
    const billRead = gate.hasPerm('billing.read');
    const reviewsRead = gate.hasPerm('content.read') && gate.canAccess('reviews');
    const qaRead = gate.hasPerm('content.read') && gate.canAccess('product_qa');
    const b2bRead = gate.hasPerm('b2b.read') && gate.canAccess('b2b');
    const custRead = gate.hasPerm('customers.read');

    Promise.all([
      get('/analytics/panels/orders', sellRead, 'Order queues'),
      get('/analytics/panels/inventory', stockRead, 'Stock'),
      get('/refunds/summary', sellRead, 'Refunds'),
      get('/wms/floor/today', floorRead, 'The floor'),
      get('/ar/outstanding', booksRead, 'Receivables'),
      get('/billing/overview', billRead, 'Your Growcord bill'),
      get('/reviews/admin/counts', reviewsRead, 'Reviews'),
      get('/product-questions/admin/counts', qaRead, 'Questions'),
      total('/carts/admin', sellRead, 'Abandoned carts', { status: 'abandoned', limit: 1 }),
      get('/b2b/applications', b2bRead, 'B2B applications', { status: 'pending' }),
      get('/contact/stats', custRead, 'Enquiries'),
    ]).then(([orders, inventory, refunds, floor, receivables, platformBill, reviews, questions, carts, b2bApps, enquiries]) => {
      if (!alive) return;
      setState({
        orders, inventory, refunds, floor, receivables, platformBill,
        reviews, questions, carts, b2bApps, enquiries,
        withheld, loading: false,
      });
    });

    return () => { alive = false; };
  }, [gate.modulesLoaded, gate.hasPerm, gate.canAccess]);

  return state;
}
