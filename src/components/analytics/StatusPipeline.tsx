import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface StatusData {
    status: string;
    count: number;
}

interface StatusPipelineProps {
    orderStats: StatusData[];
    shipmentStats: StatusData[];
    loading?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ef4444', '#14b8a6'];

/** Capitalize and beautify a snake_case status label */
const formatLabel = (status: string): string =>
    status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const StatusPipeline: React.FC<StatusPipelineProps> = ({ orderStats, shipmentStats, loading }) => {
    if (loading) {
        return <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">Loading pipeline...</div>;
    }

    const renderChart = (title: string, rawData: StatusData[]) => {
        // Filter out statuses with 0 count so the pie chart stays clean
        const data = (rawData || [])
            .filter(d => d.count > 0)
            .map(d => ({ ...d, status: formatLabel(d.status) }));

        return (
            <div className="bg-white p-6 rounded-lg shadow-md border hover:border-indigo-500 transition-colors h-full flex flex-col">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
                {data.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400">No data available</div>
                ) : (
                    <div className="flex-1 min-h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="status"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {data.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => [value, 'Count']} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderChart('Order Status Distribution', orderStats)}
            {renderChart('Shipment Lifecycle', shipmentStats)}
        </div>
    );
};

export default StatusPipeline;

