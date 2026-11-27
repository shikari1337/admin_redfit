import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export type TabType =
  | 'pending_orders'
  | 'ready_to_pick'
  | 'pickup_scheduled'
  | 'in_transit'
  | 'ndr_failed_delivery'
  | 'delivered'
  | 'rto_in_transit'
  | 'rto_delivered'
  | 'rto_failed';

export interface StatusCounts {
  pending_orders: number;
  ready_to_pick: number;
  pickup_scheduled: number;
  in_transit: number;
  ndr_failed_delivery: number;
  delivered: number;
  rto_in_transit: number;
  rto_delivered: number;
  rto_failed: number;
}

/** The board statuses each tab shows (Pending Orders reads its own list; Ready to Pick also sends `tab`). */
export const TAB_STATUS: Record<TabType, string> = {
  pending_orders: '',
  ready_to_pick: 'pending',
  pickup_scheduled: 'pickup_scheduled',
  in_transit: 'picked_up,in_transit,out_for_delivery',
  ndr_failed_delivery: 'ndr_failed_delivery',
  delivered: 'delivered',
  rto_in_transit: 'rto_in_transit',
  rto_delivered: 'rto_delivered',
  rto_failed: 'rto_failed',
};

export const TAB_TYPES = Object.keys(TAB_STATUS) as TabType[];

interface ShipmentTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  statusCounts: StatusCounts;
  /** A board's own line for a tab, in place of the usual one (a carrier's board explains its Pending Orders count). */
  hints?: Partial<Record<TabType, string>>;
}

/** What a person does on each tab, in one line under the tabs. */
const TAB_HINTS: Record<TabType, string> = {
  pending_orders: 'Orders with nothing booked yet. Create a shipment for each.',
  ready_to_pick: 'Booked and waiting for the courier. Tick several to schedule one pickup and print labels and the manifest.',
  pickup_scheduled: 'The courier is booked to collect these. Keep the labels on and the manifest ready.',
  in_transit: 'On the way. The courier updates these; set a status by hand only for parcels on your own carrier.',
  ndr_failed_delivery: 'The courier could not deliver. Answer each one before it is sent back: try again, another day, a new phone or address, or return.',
  delivered: 'Delivered. Cash on delivery comes back on the courier\'s payout: record it in COD payouts.',
  rto_in_transit: 'Coming back to you. Check each one in when it lands.',
  rto_delivered: 'Returned to you.',
  rto_failed: 'The courier could not bring these back. Take it up with the courier.',
};

const ShipmentTabs: React.FC<ShipmentTabsProps> = ({ activeTab, onTabChange, statusCounts, hints }) => {
  const tabs: { id: TabType; label: string; count: number; group?: string }[] = [
    { id: 'pending_orders', label: 'Pending Orders', count: statusCounts.pending_orders },
    { id: 'ready_to_pick', label: 'Ready to Pick', count: statusCounts.ready_to_pick },
    { id: 'pickup_scheduled', label: 'Pickup Scheduled', count: statusCounts.pickup_scheduled },
    { id: 'in_transit', label: 'In Transit', count: statusCounts.in_transit },
    { id: 'ndr_failed_delivery', label: 'Failed Delivery', count: statusCounts.ndr_failed_delivery },
    { id: 'delivered', label: 'Delivered', count: statusCounts.delivered },
    { id: 'rto_in_transit', label: 'RTO In Transit', count: statusCounts.rto_in_transit, group: 'RTO' },
    { id: 'rto_delivered', label: 'RTO Delivered', count: statusCounts.rto_delivered, group: 'RTO' },
    { id: 'rto_failed', label: 'RTO Failed', count: statusCounts.rto_failed, group: 'RTO' },
  ];

  return (
    <div className="mb-6">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as TabType)} className="w-full overflow-x-auto pb-4">
        <TabsList className="h-10 px-1 border border-border flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="px-3 text-xs gap-1.5"
            >
              {tab.label}
              {tab.count > 0 && (
                <Badge variant={activeTab === tab.id ? 'default' : 'secondary'} className="px-1.5 py-0 min-w-5 justify-center text-[10px]">
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="-mt-2 text-xs text-muted-foreground">{hints?.[activeTab] ?? TAB_HINTS[activeTab]}</p>
    </div>
  );
};

export default ShipmentTabs;
