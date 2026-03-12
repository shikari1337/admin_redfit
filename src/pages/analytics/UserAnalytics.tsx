import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../../services/analyticsService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { FaSearch, FaUser } from 'react-icons/fa';

const UserAnalytics: React.FC = () => {
    const [deviceStats, setDeviceStats] = useState<any>(null);
    const [sessionId, setSessionId] = useState('');
    const [journey, setJourney] = useState<any[]>([]);
    const [journeyLoading, setJourneyLoading] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await analyticsAPI.getDeviceStats();
                setDeviceStats(response?.data);
            } catch (error) {
                console.error('Failed to fetch device stats:', error);
            }
        };

        fetchStats();
    }, []);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionId) return;

        try {
            setJourneyLoading(true);
            const response = await analyticsAPI.getUserJourney(sessionId);
            setJourney(response?.data || []);
        } catch (error) {
            console.error('Failed to fetch user journey:', error);
            setJourney([]);
        } finally {
            setJourneyLoading(false);
        }
    };

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">User Analytics</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Device Stats */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Device Distribution</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deviceStats?.devices}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Browser Stats */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Browser Distribution</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={deviceStats?.browsers}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#82ca9d"
                                    dataKey="value"
                                    paddingAngle={5}
                                >
                                    {deviceStats?.browsers?.map((_entry: any, index: number) => (
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

            {/* User Journey Viewer */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h2 className="text-lg font-semibold mb-4">User Journey Lookup</h2>
                <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                        placeholder="Enter Session ID"
                        className="flex-1 border rounded px-4 py-2"
                    />
                    <button
                        type="submit"
                        disabled={journeyLoading}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {journeyLoading ? 'Searching...' : <FaSearch />}
                    </button>
                </form>

                {journey.length > 0 ? (
                    <div className="relative border-l-2 border-gray-200 ml-4 space-y-6">
                        {journey.map((step, index) => (
                            <div key={index} className="ml-6 relative">
                                <span className="absolute -left-9 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                                    <FaUser className="text-blue-600 text-xs" />
                                </span>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">{step.action.replace(/_/g, ' ').toUpperCase()}</h3>
                                        <p className="text-sm text-gray-500">
                                            {step.resourceId ? `Resource: ${step.resourceId}` : step.metadata?.path || 'No details'}
                                        </p>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {new Date(step.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                {step.metadata && (
                                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto">
                                        {JSON.stringify(step.metadata, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    !journeyLoading && sessionId && <p className="text-gray-500 text-center py-4">No journey found for this session.</p>
                )}
            </div>
        </div>
    );
};

export default UserAnalytics;
