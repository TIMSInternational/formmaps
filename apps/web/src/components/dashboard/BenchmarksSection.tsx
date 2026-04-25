import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function BenchmarksSection() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{t("dashboard.benchmarksLabel")}</h3>
        <span className="text-sm text-gray-500">{t("common.today")}</span>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="text-3xl font-bold text-gray-900">$ 9460.00</div>
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-red-500">↓ 1.5%</span>
            <span className="text-gray-500">Compared to $9940 yesterday</span>
          </div>
        </div>
        
        <div>
          <div className="text-sm text-gray-600">Last week income</div>
          <div className="text-lg font-semibold text-gray-900">$25658.00</div>
        </div>
      </div>
    </motion.div>
  );
}
