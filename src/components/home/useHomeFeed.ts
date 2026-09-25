/**
 * What the Home page reads, and what it is allowed to read.
 *
 * Every source here already exists (L5 §8). No new backend route was added: the
 * home is a COMPOSITION of the same endpoints the panels use, so a number on
 * the home can never disagree with the number on the page it links to.
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
  commerce: any | null;      // /analytics/panels/commerce  (orders.read)
  orders: any | null;        // /analytics/panels/orders    (orders.read)
  inventory: any | null;     // /analytics/panels/inventory (inventory.read + inventory)
  refunds: any | null;       // /refunds/summary            (orders.read)
  floor: any | null;         // /wms/floor/today            (warehouse.read + wms)
  receivables: any | null;   // /ar/outstanding             (accounting.read + accounting)
  platformBill: any | null;  // /billing/overview           (billing.read)
  marketing: any | null;     // /marketing-hub/overview     (marketing.read + marketing)
  /** Sections not fetched because this viewer may not see them. */
  withheld: string[];
  loading: boolean;
}

interface Gate {
  hasPerm: (p: string) => boolean;
  canAccess: (m: string) => boolean;
  modulesLoaded: boolean;
}

/** Today in the STORE's civil day — the server ranges on the same boundary. */
function todayRange(): { from: string; to: string } {
  // `toISOString().slice(0,10)` is the UTC day and is wrong for 5.5h every day
  // (CLAUDE.md rule 8). `en-CA` formats as YYYY-MM-DD in the viewer's zone,
  // which the axios layer has already aligned to the store's.
  const d = new Date().toLocaleDateString('en-CA');
  return { from: d, to: d };
}

const EMPTY: HomeSources = {
  commerce: null, orders: null, inventory: null, refunds: null, floor: null,
  receivables: null, platformBill: null, marketing: null, withheld: [], loading: true,
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

    const range = todayRange();
    const sellRead = gate.hasPerm('orders.read');
    const stockRead = gate.hasPerm('inventory.read') && gate.canAccess('inventory');
    const floorRead = (gate.hasPerm('warehouse.read') || gate.hasPerm('inventory.read')) && gate.canAccess('wms');
    const booksRead = gate.hasPerm('accounting.read') && gate.canAccess('accounting');
    const billRead = gate.hasPerm('billing.read');
    const mktRead = gate.hasPerm('marketing.read') && gate.canAccess('marketing');

    Promise.all([
      get('/analytics/panels/commerce', sellRead, 'Today’s sales', range),
      get('/analytics/panels/orders', sellRead, 'Order queues'),
      get('/analytics/panels/inventory', stockRead, 'Stock'),
      get('/refunds/summary', sellRead, 'Refunds'),
      get('/wms/floor/today', floorRead, 'The floor'),
      get('/ar/outstanding', booksRead, 'Receivables'),
      get('/billing/overview', billRead, 'Your Growcord bill'),
      get('/marketing-hub/overview', mktRead, 'Marketing'),
    ]).then(([commerce, orders, inventory, refunds, floor, receivables, platformBill, marketing]) => {
      if (!alive) return;
      setState({
        commerce, orders, inventory, refunds, floor, receivables, platformBill, marketing,
        withheld, loading: false,
      });
    });

    return () => { alive = false; };
  }, [gate.modulesLoaded, gate.hasPerm, gate.canAccess]);

  return state;
}
