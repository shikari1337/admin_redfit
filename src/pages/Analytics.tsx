import React, { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { analyticsAPI } from '../services/analyticsService';
import StatsCard from '../components/StatsCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { FaGlobeAmericas, FaMobileAlt, FaDesktop, FaChartLine } from 'react-icons/fa';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const Analytics: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [liveMapData, setLiveMapData] = useState<any[]>([]);
    const [deviceStats, setDeviceStats] = useState<any>(null);
    const [dateRange, setDateRange] = useState('30d'); // 7d, 30d

    const fetchData = async () => {
        try {
            setLoading(true);
            const endDate = new Date();
            let startDate = new Date();
            if (dateRange === '7d') startDate.setDate(endDate.getDate() - 7);
            if (dateRange === '30d') startDate.setDate(endDate.getDate() - 30);

            const [dashboard, mapData, devices] = await Promise.all([
                analyticsAPI.getDashboardStats(undefined, startDate, endDate),
                analyticsAPI.getLiveMap(),
                analyticsAPI.getDeviceStats(),
            ]);

            setDashboardData(dashboard?.data);
            setLiveMapData(mapData?.data || []);
            setDeviceStats(devices?.data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Poll live map every 30s
        const interval = setInterval(async () => {
            const mapData = await analyticsAPI.getLiveMap();
            setLiveMapData(mapData?.data || []);
        }, 30000);
        return () => clearInterval(interval);
    }, [dateRange]);

    if (loading && !dashboardData) {
        return <LoadingSpinner />;
    }

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Analytics Overview</h1>
                <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="border rounded px-3 py-2 bg-white"
                >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                    title="Total Revenue"
                    value={`₹${dashboardData?.sales?.reduce((acc: number, curr: any) => acc + curr.sales, 0).toLocaleString() || 0}`}
                    color="blue"
                    icon={FaChartLine}
                />
                <StatsCard
                    title="Total Orders"
                    value={dashboardData?.sales?.reduce((acc: number, curr: any) => acc + curr.orders, 0) || 0}
                    color="indigo"
                    icon={FaDesktop} // Placeholder icon
                />
                <StatsCard
                    title="Live Visitors (Est.)"
                    value={dashboardData?.liveVisitors || 0}
                    color="green"
                    trend={{ value: 0, isPositive: true }} // Placeholder
                    icon={FaGlobeAmericas}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Sales Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Revenue Trend</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboardData?.sales}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Area type="monotone" dataKey="sales" stroke="#8884d8" fillOpacity={1} fill="url(#colorSales)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Order Status */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Order Status</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dashboardData?.orderStatus}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {dashboardData?.orderStatus?.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Live Map */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center">
                        <FaGlobeAmericas className="mr-2 text-blue-500" /> Live Visitor Locations
                    </h2>
                    <div className="h-96 w-full bg-blue-50 rounded-lg overflow-hidden relative">
                        <ComposableMap projectionConfig={{ scale: 200 }}>
                            <Geographies geography={geoUrl}>
                                {({ geographies }: { geographies: any[] }) =>
                                    geographies.map((geo: any) => (
                                        <Geography
                                            key={geo.rsmKey}
                                            geography={geo}
                                            fill="#D6D6DA"
                                            stroke="#FFFFFF"
                                        />
                                    ))
                                }
                            </Geographies>
                        </ComposableMap>
                        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded shadow-lg">
                            <h4 className="font-bold text-sm mb-2">Top Locations</h4>
                            <ul>
                                {liveMapData.slice(0, 5).map((loc: any) => (
                                    <li key={loc.code} className="flex justify-between text-sm mb-1">
                                        <span>{loc.code}</span>
                                        <span className="font-bold">{loc.count}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Device Stats */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center">
                        <FaMobileAlt className="mr-2 text-gray-500" /> Device Distribution
                    </h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deviceStats?.devices}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#82ca9d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
