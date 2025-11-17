import React from 'react';

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
    { id: 'all' as TabType, label: 'All Shipments', count: statusCounts.all },
    { id: 'ready_to_pickup' as TabType, label: 'Ready to Pickup', count: statusCounts.pending },
    { id: 'pickup_scheduled' as TabType, label: 'Pickup Scheduled', count: statusCounts.pickup_scheduled },
    { id: 'in_transit' as TabType, label: 'In Transit', count: statusCounts.in_transit },
    { id: 'delivered' as TabType, label: 'Delivered', count: statusCounts.delivered },
  ];

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default ShipmentTabs;

