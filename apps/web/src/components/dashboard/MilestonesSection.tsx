import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function MilestonesSection() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("dashboard.milestones")}</h3>
      
      <div className="flex items-center justify-center">
        <div 
          className="relative w-32 h-32"
          role="progressbar"
          aria-valuenow={45} // Calculated from 9/20
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Milestones progress: 9 out of 20 completed"
        >
          <svg width="128" height="128" className="transform -rotate-90" aria-hidden="true">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="transparent"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            <motion.circle
              cx="64"
              cy="64"
              r="56"
              fill="transparent"
              stroke="#2E9098"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 56}`}
              strokeDashoffset={`${2 * Math.PI * 56 * (1 - 0.45)}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - 0.45) }}
              transition={{ duration: 1.5 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">9/20</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 space-y-2" role="list">
        <div className="flex items-center space-x-2" role="listitem">
          <div className="w-3 h-3 bg-blue-500 rounded-full" aria-hidden="true"></div>
          <span className="text-sm text-gray-600">CurriDRAW</span>
        </div>
        <div className="flex items-center space-x-2" role="listitem">
          <div className="w-3 h-3 bg-green-500 rounded-full" aria-hidden="true"></div>
          <span className="text-sm text-gray-600">InDesign</span>
        </div>
        <div className="flex items-center space-x-2" role="listitem">
          <div className="w-3 h-3 bg-purple-500 rounded-full" aria-hidden="true"></div>
          <span className="text-sm text-gray-600">Canva</span>
        </div>
      </div>
    </motion.div>
  );
}
