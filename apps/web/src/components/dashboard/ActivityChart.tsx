import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function ActivityChart() {
  const { t } = useTranslation();
  const months = ['May', 'Jun', 'Jul'];
  const data = [240, 180, 280, 220, 260, 200, 240, 190, 250, 210, 270, 230];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900" id="activity-chart-title">{t('dashboard.activityChart')}</h3>
        <label htmlFor="activity-period" className="sr-only">{t('common.selectPeriod')}</label>
        <select id="activity-period" className="text-sm border rounded px-2 py-1 text-gray-600">
          <option>Mar 2022 - Oct 2022</option>
        </select>
      </div>
      
      <div className="h-40 flex items-end space-x-2">
        {data.map((value, index) => (
          <motion.div
            key={index}
            initial={{ height: 0 }}
            animate={{ height: `${(value / 300) * 100}%` }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className="flex-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-t"
          />
        ))}
      </div>
      
      <div className="flex justify-between mt-2 text-sm text-gray-500">
        {months.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
      
      <div className="flex justify-between items-center mt-4 text-sm">
        <span className="text-gray-600">$300k</span>
        <span className="text-gray-600">$200k</span>
        <span className="text-gray-600">$100k</span>
      </div>
    </motion.div>
  );
}
