import { shipmentsAPI } from '../../services/api';
import { TAB_STATUS, type StatusCounts, type TabType } from './ShipmentTabs';

/**
 * The board's tab counts for ONE carrier (the Growcord Ship pages). The board's own `status_counts` count
 * every carrier, so each tab is asked for its total with the carrier filter, one row per answer. Pending
 * Orders is orders with nothing booked yet, which belong to no carrier: it is the board's own figure.
 * Asked when the screen opens, when its filters change and after an action, never on a timer.
 */
export async function providerTabCounts(
  provider: 'shiprocket' | 'delhivery' | 'manual' | 'growcord_ship',
  f: { warehouseId?: string; startDate?: string; endDate?: string } = {},
): Promise<StatusCounts> {
  const tabs = (Object.keys(TAB_STATUS) as TabType[]).filter((t) => t !== 'pending_orders');
  const out: StatusCounts = {
    pending_orders: 0, ready_to_pick: 0, pickup_scheduled: 0, in_transit: 0, ndr_failed_delivery: 0,
    delivered: 0, rto_in_transit: 0, rto_delivered: 0, rto_failed: 0,
  };
  const ask = async (tab: TabType) => {
    const r: any = await shipmentsAPI.getAll({
      shippingProvider: provider, page: 1, limit: 1,
      ...(tab === 'ready_to_pick' ? { tab: 'ready_to_pick' } : { status: TAB_STATUS[tab] }),
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.startDate ? { startDate: f.startDate } : {}),
      ...(f.endDate ? { endDate: f.endDate } : {}),
    });
    const total = Number(r?.pagination?.total ?? r?.data?.pagination?.total);
    out[tab] = Number.isFinite(total) ? total : 0;
    const pending = Number(r?.statusCounts?.pending_orders ?? r?.data?.statusCounts?.pending_orders);
    if (Number.isFinite(pending)) out.pending_orders = pending;
  };
  // Four at a time: each is a board read on the server.
  for (let i = 0; i < tabs.length; i += 4) {
    await Promise.all(tabs.slice(i, i + 4).map(ask));
  }
  return out;
}
