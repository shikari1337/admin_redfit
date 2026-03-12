import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../../services/analyticsService';
import AnalyticsCard from '../../components/analytics/AnalyticsCard';
import { FaRupeeSign, FaShoppingCart, FaChartLine } from 'react-icons/fa';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AnalyticsDashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [revenueStats, setRevenueStats] = useState<any>(null);
    const [salesTrend, setSalesTrend] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [revenue, trend] = await Promise.all([
                    analyticsAPI.getRevenueStats(),
                    analyticsAPI.getDashboardStats(undefined, new Date(new Date().setDate(new Date().getDate() - 30)), new Date())
                ]);

                setRevenueStats(revenue?.data);
                setSalesTrend(trend?.data?.sales || []);
            } catch (error) {
                console.error('Failed to fetch dashboard analytics:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Analytics Dashboard</h1>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <AnalyticsCard
                    title="Revenue Today"
                    value={`₹${revenueStats?.today?.revenue?.toLocaleString() || 0}`}
                    icon={FaRupeeSign}
                    color="bg-green-600"
                    loading={loading}
                />
                <AnalyticsCard
                    title="Revenue This Month"
                    value={`₹${revenueStats?.month?.revenue?.toLocaleString() || 0}`}
                    icon={FaChartLine}
                    color="bg-blue-600"
                    loading={loading}
                />
                <AnalyticsCard
                    title="Total Orders (Month)"
                    value={revenueStats?.month?.orders || 0}
                    icon={FaShoppingCart}
                    color="bg-purple-600"
                    loading={loading}
                />
            </div>

            {/* Sales Chart */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Revenue Trend (Last 30 Days)</h2>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={salesTrend}>
                            <defs>
                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                            <Area type="monotone" dataKey="sales" stroke="#8884d8" fillOpacity={1} fill="url(#colorSales)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
