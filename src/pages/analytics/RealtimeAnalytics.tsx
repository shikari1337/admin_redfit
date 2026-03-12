import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../../services/analyticsService';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { FaGlobeAmericas, FaDesktop, FaMobileAlt } from 'react-icons/fa';
import LoadingSpinner from '../../components/LoadingSpinner';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const RealtimeAnalytics: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [visitors, setVisitors] = useState<any[]>([]);
    const [geoData, setGeoData] = useState<any[]>([]);

    const fetchData = async () => {
        try {
            const [visitorList, mapData] = await Promise.all([
                analyticsAPI.getRealtimeVisitors(),
                analyticsAPI.getLiveMap()
            ]);
            setVisitors(visitorList?.data || []);
            setGeoData(mapData?.data || []);
        } catch (error) {
            console.error('Failed to fetch realtime data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && visitors.length === 0) return <LoadingSpinner />;

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Realtime Overview
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Live Map */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center">
                        <FaGlobeAmericas className="mr-2 text-blue-500" /> Active Locations
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
                                            style={{
                                                default: { outline: "none" },
                                                hover: { fill: "#F53", outline: "none" },
                                                pressed: { outline: "none" },
                                            }}
                                        />
                                    ))
                                }
                            </Geographies>
                        </ComposableMap>

                        {/* Top Locations Overlay */}
                        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded shadow-lg">
                            <h4 className="font-bold text-sm mb-2">Top Locations</h4>
                            <ul>
                                {geoData.slice(0, 5).map((loc: any) => (
                                    <li key={loc.code} className="flex justify-between text-sm mb-1 gap-4">
                                        <span>{loc.code}</span>
                                        <span className="font-bold">{loc.count}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Active Visitors Table */}
                <div className="bg-white p-6 rounded-lg shadow-sm overflow-hidden">
                    <h2 className="text-lg font-semibold mb-4">Active Sessions ({visitors.length})</h2>
                    <div className="overflow-y-auto h-96">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Details</th>
                                    <th className="px-4 py-2">Active</th>
                                    <th className="px-4 py-2">Page</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visitors.map((visitor, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {visitor.device === 'mobile' ? <FaMobileAlt className="text-gray-400" /> : <FaDesktop className="text-gray-400" />}
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {visitor.location || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate w-32">
                                                        {visitor.sessionId}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(visitor.lastActive).toLocaleTimeString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                {visitor.page || visitor.lastAction}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {visitors.length === 0 && (
                            <div className="text-center py-10 text-gray-500">No active visitors right now.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RealtimeAnalytics;
