import React from 'react';
import { IconType } from 'react-icons';

interface AnalyticsCardProps {
    title: string;
    value: string | number;
    icon: IconType;
    color: string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    loading?: boolean;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({ title, value, icon: Icon, color, trend, loading }) => {
    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</p>
                    <div className="flex items-end gap-2 mt-1">
                        <p className="text-2xl font-bold text-gray-900">{value}</p>
                        {trend && (
                            <span className={`text-xs font-medium mb-1 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {trend.isPositive ? '+' : ''}{trend.value}%
                            </span>
                        )}
                    </div>
                </div>
                <div className={`${color} p-3 rounded-lg opacity-90 text-white`}>
                    <Icon size={24} />
                </div>
            </div>
        </div>
    );
};

export default AnalyticsCard;
