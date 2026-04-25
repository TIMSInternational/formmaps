import { motion } from 'motion/react';

const competencyData = [
  { name: 'Leadership', percentage: 54, color: '#3b82f6' },
  { name: 'PCA/LIA/Interest', percentage: 20, color: '#10b981' },
  { name: 'Thinking', percentage: 26, color: '#ef4444' },
  { name: 'Technical Analytics', percentage: 28, color: '#8b5cf6' },
];

export function CompetencyChart() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Competency Profit & Development Plan
          </h3>
          <p className="text-sm text-gray-500">Tue, 14 Nov, 2022, 11:30 AM</p>
        </div>
        <span className="text-sm text-gray-500">Today</span>
      </div>

      <div className="flex items-center space-x-8">
        {/* Doughnut Chart Placeholder */}
        <div className="relative w-48 h-48" aria-hidden="true">
          <svg width="192" height="192" className="transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="80"
              fill="transparent"
              stroke="#f3f4f6"
              strokeWidth="16"
            />
            {competencyData.map((item, index) => {
              const circumference = 2 * Math.PI * 80;
              const strokeDasharray = (item.percentage / 100) * circumference;
              const strokeDashoffset = circumference - strokeDasharray;

              return (
                <motion.circle
                  key={`${item.name}-${index}`}
                  cx="96"
                  cy="96"
                  r="80"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="16"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ delay: index * 0.2, duration: 1 }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-gray-600">All Categories</span>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3" role="list">
          {competencyData.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center space-x-3" role="listitem">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="text-sm text-gray-700">{item.name}</span>
              <span className="text-sm font-medium text-gray-900">
                {item.percentage}%
              </span>
              <span className="text-xs text-green-600" aria-label="Trending up">↑</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
