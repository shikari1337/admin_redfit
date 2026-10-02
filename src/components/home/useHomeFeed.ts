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
 *
 * Sources land one by one (2026-10-02): receivables alone can take several
 * seconds on a large store, and the board used to wait for the slowest source
 * before showing anything. Now each queue appears as soon as its own answer
 * does; `pending` names what is still being checked and `failed` what could
 * not be read, so a missing tile never silently means "nothing to do".
 */
import { useEffect, useState } from 'react';
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
  /** Sections asked for whose answer has not arrived yet. */
  pending: string[];
  /** Sections asked for that answered with an error. */
  failed: string[];
  /** True until every allowed section has answered (or failed). */
  loading: boolean;
}

type SourceKey = Exclude<keyof HomeSources, 'withheld' | 'pending' | 'failed' | 'loading'>;

interface Gate {
  hasPerm: (p: string) => boolean;
  canAccess: (m: string) => boolean;
  modulesLoaded: boolean;
}

const EMPTY: HomeSources = {
  orders: null, inventory: null, refunds: null, floor: null,
  receivables: null, platformBill: null,
  reviews: null, questions: null, carts: null, b2bApps: null, enquiries: null,
  withheld: [], pending: [], failed: [], loading: true,
};

interface SourceDef {
  key: SourceKey;
  name: string;
  url: string;
  allowed: boolean;
  params?: object;
  /** The list endpoints carry `total` BESIDE the rows; read it, not the rows. */
  totalOnly?: boolean;
}

export function useHomeFeed(gate: Gate): HomeSources {
  const [state, setState] = useState<HomeSources>(EMPTY);

  // What this viewer may read, as one string: the feed is asked for once per
  // distinct answer, not once per render (hasPerm/canAccess are re-created
  // whenever the auth context refreshes).
  const access = [
    'orders.read', 'inventory.read', 'warehouse.read', 'warehouse.operate', 'accounting.read',
    'billing.read', 'content.read', 'b2b.read', 'customers.read',
  ].map((p) => (gate.hasPerm(p) ? 1 : 0)).join('')
    + ':' + ['inventory', 'wms', 'accounting', 'reviews', 'product_qa', 'b2b'].map((m) => (gate.canAccess(m) ? 1 : 0)).join('');

  useEffect(() => {
    // Wait for the module map: `canAccess` fails OPEN before it lands, so
    // deciding early asks for a disabled module's data and eats a 403.
    if (!gate.modulesLoaded) return;
    let alive = true;

    // Today's sales are NOT asked for here: the dashboard reads
    // /analytics/panels/commerce itself and hands the board the summary it
    // needs (refund-due). The floor is only a warehouse role's concern, and
    // only when the store has the WMS.
    const sellRead = gate.hasPerm('orders.read');
    const stockRead = gate.hasPerm('inventory.read') && gate.canAccess('inventory');
    const floorRead = (gate.hasPerm('warehouse.read') || gate.hasPerm('warehouse.operate')) && gate.canAccess('wms');
    const booksRead = gate.hasPerm('accounting.read') && gate.canAccess('accounting');
    const billRead = gate.hasPerm('billing.read');
    const reviewsRead = gate.hasPerm('content.read') && gate.canAccess('reviews');
    const qaRead = gate.hasPerm('content.read') && gate.canAccess('product_qa');
    const b2bRead = gate.hasPerm('b2b.read') && gate.canAccess('b2b');
    const custRead = gate.hasPerm('customers.read');

    const sources: SourceDef[] = [
      { key: 'orders', name: 'Order queues', url: '/analytics/panels/orders', allowed: sellRead },
      { key: 'inventory', name: 'Stock', url: '/analytics/panels/inventory', allowed: stockRead },
      { key: 'refunds', name: 'Refunds', url: '/refunds/summary', allowed: sellRead },
      { key: 'floor', name: 'The floor', url: '/wms/floor/today', allowed: floorRead },
      // Live money only: order history imported from an old website keeps the old
      // site's payment status and is left out here (the Receivables page keeps it).
      { key: 'receivables', name: 'Receivables', url: '/ar/outstanding', allowed: booksRead, params: { excludeImported: 1 } },
      { key: 'platformBill', name: 'Your Growcord bill', url: '/billing/overview', allowed: billRead },
      { key: 'reviews', name: 'Reviews', url: '/reviews/admin/counts', allowed: reviewsRead },
      { key: 'questions', name: 'Questions', url: '/product-questions/admin/counts', allowed: qaRead },
      { key: 'carts', name: 'Abandoned carts', url: '/carts/admin', allowed: sellRead, params: { status: 'abandoned', limit: 1 }, totalOnly: true },
      { key: 'b2bApps', name: 'B2B applications', url: '/b2b/applications', allowed: b2bRead, params: { status: 'pending' } },
      { key: 'enquiries', name: 'Enquiries', url: '/contact/stats', allowed: custRead },
    ];

    const withheld = sources.filter((s) => !s.allowed).map((s) => s.name);
    const asked = sources.filter((s) => s.allowed);
    setState({ ...EMPTY, withheld, pending: asked.map((s) => s.name), loading: asked.length > 0 });

    for (const s of asked) {
      api.get(s.url, { params: s.params })
        .then((r: any) => {
          if (!s.totalOnly) return payload<any>(r);
          // The interceptor keeps `total` on the array as a non-enumerable
          // property, which `payload()` would drop.
          const body = r?.data ?? r;
          const t = body?.total ?? r?.total ?? body?.data?.total;
          return { total: Number(t ?? 0) };
        })
        .then((value) => {
          if (!alive) return;
          setState((prev) => {
            const pending = prev.pending.filter((n) => n !== s.name);
            return { ...prev, [s.key]: value, pending, loading: pending.length > 0 };
          });
        })
        .catch(() => {
          // A slow or failing section must not blank the page — but it is named.
          if (!alive) return;
          setState((prev) => {
            const pending = prev.pending.filter((n) => n !== s.name);
            return { ...prev, pending, failed: [...prev.failed, s.name], loading: pending.length > 0 };
          });
        });
    }

    return () => { alive = false; };
    // `access` already encodes every hasPerm/canAccess answer used above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.modulesLoaded, access]);

  return state;
}
