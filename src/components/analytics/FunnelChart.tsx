import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';

interface FunnelData {
    stage: string;
    count: number;
    fill?: string;
}

interface FunnelChartProps {
    data: FunnelData[];
    loading?: boolean;
}

const FunnelChart: React.FC<FunnelChartProps> = ({ data, loading }) => {
    if (loading) {
        return <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">Loading funnel...</div>;
    }

    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg text-gray-400">No data available</div>;
    }

    // Calculate conversion rates
    const enrichedData = data.map((item, index) => {
        const prevCount = index > 0 ? data[index - 1].count : item.count;
        const conversionRate = prevCount > 0 ? ((item.count / prevCount) * 100).toFixed(1) : '0.0';
        return {
            ...item,
            conversionRate: index === 0 ? '100%' : `${conversionRate}%`
        };
    });

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border rounded shadow-lg">
                    <p className="font-bold text-gray-800">{label}</p>
                    <p className="text-indigo-600 font-semibold">{payload[0].value.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Conversion: {payload[0].payload.conversionRate}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border hover:border-indigo-500 transition-colors h-full">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Conversion Funnel</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={enrichedData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="stage" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={30}>
                            {enrichedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill || '#4F46E5'} fillOpacity={0.8 - (index * 0.1)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs text-gray-500">
                {enrichedData.map((d, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <span className="font-medium text-gray-800">{d.conversionRate}</span>
                        <span className="text-[10px] uppercase truncate w-full">{d.stage}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FunnelChart;
