
import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isUp: boolean;
  };
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, trend }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">{title}</span>
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {trend && (
          <p className={`text-sm mt-1 flex items-center ${trend.isUp ? 'text-red-500' : 'text-green-500'}`}>
            {trend.isUp ? '↑' : '↓'} {Math.abs(trend.value)}% 
            <span className="text-slate-400 ml-1">vs last month</span>
          </p>
        )}
      </div>
    </div>
  );
};
