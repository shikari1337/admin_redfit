import React from 'react';
import { IconType } from 'react-icons';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon?: IconType;
    color?: string; // e.g., 'blue', 'green'
    trend?: {
        value: number;
        isPositive: boolean;
    };
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon: Icon, color = 'blue', trend }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
                <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
                <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>

                {trend && (
                    <div className={`flex items-center mt-2 text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        <span>{trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
                        <span className="text-gray-400 ml-1">vs last period</span>
                    </div>
                )}
            </div>

            {Icon && (
                <div className={`p-3 rounded-full bg-${color}-50 text-${color}-600`}>
                    <Icon size={24} />
                </div>
            )}
        </div>
    );
};

export default StatsCard;
