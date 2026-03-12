import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

type TabType = 'all' | 'ready_to_pickup' | 'pickup_scheduled' | 'in_transit' | 'delivered';

interface ShipmentTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  statusCounts: {
    all: number;
    pending: number;
    pickup_scheduled: number;
    in_transit: number;
    delivered: number;
  };
}

const ShipmentTabs: React.FC<ShipmentTabsProps> = ({ activeTab, onTabChange, statusCounts }) => {
  const tabs = [
    { id: 'all' as TabType, label: 'All', count: statusCounts.all },
    { id: 'ready_to_pickup' as TabType, label: 'Ready to Pickup', count: statusCounts.pending },
    { id: 'pickup_scheduled' as TabType, label: 'Pickup Scheduled', count: statusCounts.pickup_scheduled },
    { id: 'in_transit' as TabType, label: 'In Transit', count: statusCounts.in_transit },
    { id: 'delivered' as TabType, label: 'Delivered', count: statusCounts.delivered },
  ];

  return (
    <div className="mb-6">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as TabType)} className="w-full overflow-x-auto pb-4">
        <TabsList className="h-10 px-1 border border-border">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="px-4 text-sm gap-2"
            >
              {tab.label}
              {tab.count > 0 && (
                <Badge variant={activeTab === tab.id ? 'default' : 'secondary'} className="px-1.5 py-0 min-w-5 justify-center">
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

