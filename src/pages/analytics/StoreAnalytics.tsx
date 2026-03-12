import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../../services/analyticsService';
import AnalyticsCard from '../../components/analytics/AnalyticsCard';
import FunnelChart from '../../components/analytics/FunnelChart';
import StatusPipeline from '../../components/analytics/StatusPipeline';
import { FaShoppingBag, FaUserCheck, FaPercentage, FaChartBar } from 'react-icons/fa';

const StoreAnalytics: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<any>(null);
    const [funnelData, setFunnelData] = useState<any[]>([]);
    const [orderStats, setOrderStats] = useState<any[]>([]);
    const [shipmentStats, setShipmentStats] = useState<any[]>([]);
    const [dateRange, setDateRange] = useState('30d');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const endDate = new Date();
                let startDate = new Date();
                if (dateRange === '7d') startDate.setDate(endDate.getDate() - 7);
                if (dateRange === '30d') startDate.setDate(endDate.getDate() - 30);

                const [kpisResponse, funnelResponse, ordersResponse, shipmentsResponse] = await Promise.all([
                    analyticsAPI.getStoreKPIs(undefined, startDate, endDate),
                    analyticsAPI.getFunnelStats(undefined, startDate, endDate),
                    analyticsAPI.getOrderStats(undefined, startDate, endDate),
                    analyticsAPI.getShipmentStats(undefined, startDate, endDate)
                ]);

                setKpis(kpisResponse?.data);

                // Process Funnel Data
                if (funnelResponse?.data) {
                    const f = funnelResponse.data;
                    setFunnelData([
                        { stage: 'Visitors', count: f.visitors || 0, fill: '#6366f1' },
                        { stage: 'Add to Cart', count: f.addToCart || 0, fill: '#8b5cf6' },
                        { stage: 'Checkout', count: f.checkout || 0, fill: '#ec4899' },
                        { stage: 'Payment', count: f.payment || 0, fill: '#f43f5e' },
                        { stage: 'Orders', count: f.orders || 0, fill: '#10b981' }
                    ]);
                }

                setOrderStats(ordersResponse?.data?.statuses || ordersResponse?.data || []);
                setShipmentStats(shipmentsResponse?.data?.statuses || shipmentsResponse?.data || []);

            } catch (error) {
                console.error('Failed to fetch store analytics:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [dateRange]);

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Store Analytics</h1>
                <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="border rounded px-3 py-2 bg-white"
                >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <AnalyticsCard
                    title="Average Order Value"
                    value={`₹${Math.round(kpis?.aov || 0).toLocaleString()}`}
                    icon={FaShoppingBag}
                    color="bg-indigo-600"
                    loading={loading}
                />
                <AnalyticsCard
                    title="Conversion Rate"
                    value={`${(kpis?.conversionRate || 0).toFixed(2)}%`}
                    icon={FaPercentage}
                    color="bg-green-600"
                    loading={loading}
                />
                <AnalyticsCard
                    title="Total Sessions"
                    value={kpis?.totalSessions || 0}
                    icon={FaUserCheck}
                    color="bg-blue-500"
                    loading={loading}
                />
                <AnalyticsCard
                    title="Total Revenue"
                    value={`₹${(kpis?.totalRevenue || 0).toLocaleString()}`}
                    icon={FaChartBar}
                    color="bg-purple-600"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-1 h-full">
                    <FunnelChart data={funnelData} loading={loading} />
                </div>
                <div className="lg:col-span-2 h-full">
                    <StatusPipeline
                        orderStats={orderStats}
                        shipmentStats={shipmentStats}
                        loading={loading}
                    />
                </div>
            </div>
        </div>
    );
};

export default StoreAnalytics;
