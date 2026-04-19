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

interface ShipmentTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  statusCounts: StatusCounts;
}

const ShipmentTabs: React.FC<ShipmentTabsProps> = ({ activeTab, onTabChange, statusCounts }) => {
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
    </div>
  );
};

export default ShipmentTabs;
