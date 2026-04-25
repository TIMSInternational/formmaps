import { motion } from 'motion/react';
import { dashboardData } from './data';
import { cn } from '@/lib/utils';

interface ActivityChartProps {
  className?: string;
}

export function ActivityChart({ className }: ActivityChartProps) {
  const { activity } = dashboardData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("bg-transparent backdrop-blur-md rounded-lg border border-gray-200 p-6", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Your Activity</h3>
        <select className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option>{activity.timeRange}</option>
        </select>
      </div>
      
      {/* Chart */}
      <div className="h-40 flex items-end justify-between space-x-2 mb-4">
        {activity.data.map((dataPoint, index) => (
          <motion.div
            key={dataPoint.month}
            initial={{ height: 0 }}
            animate={{ height: `${(dataPoint.value / activity.maxValue) * 100}%` }}
            transition={{ delay: index * 0.1, duration: 0.6 }}
            className="flex-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-t min-h-[8px]"
            title={`${dataPoint.month}: ${dataPoint.value}`}
          />
        ))}
      </div>
      
      {/* X-axis Labels */}
      <div className="flex justify-between text-sm text-gray-500 mb-4">
        {activity.data.map((dataPoint) => (
          <span key={dataPoint.month} className="text-center flex-1">
            {dataPoint.month}
          </span>
        ))}
      </div>
      
      {/* Y-axis Labels */}
      <div className="flex justify-between items-center text-sm text-gray-500">
        <span>$100k</span>
        <span>$200k</span>
        <span>$300k</span>
      </div>
    </motion.div>
  );
}
