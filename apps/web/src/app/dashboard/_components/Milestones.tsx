import { motion } from 'motion/react';
import { dashboardData } from './data';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface MilestonesProps {
  className?: string;
}

export function Milestones({ className }: MilestonesProps) {
  const { milestones } = dashboardData;
  const { t } = useTranslation();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("bg-transparent backdrop-blur-md rounded-lg border border-gray-200 p-6", className)}
      aria-labelledby="milestones-heading"
    >
      <h2 id="milestones-heading" className="text-lg font-semibold text-gray-900 mb-6">
        {t("dashboard.milestones")}
      </h2>
      
      {/* Progress Circle */}
      <div className="flex justify-center mb-6">
        <div 
          className="relative w-32 h-32"
          role="img"
          aria-label={`${milestones.current} of ${milestones.total} milestones completed`}
        >
          <svg width="128" height="128" className="transform -rotate-90" aria-hidden="true">
            <title>Milestones Progress</title>
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
              stroke="#3b82f6"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 56}`}
              strokeDashoffset={`${2 * Math.PI * 56 * (1 - milestones.progress / 100)}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - milestones.progress / 100) }}
              transition={{ duration: 1.5 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {milestones.current}/{milestones.total}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Skills Legend */}
      <ul className="space-y-3" aria-label="Skills progress">
        {milestones.skills.map((skill) => (
          <li key={skill.name} className="flex items-center space-x-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: skill.color }}
              aria-hidden="true"
            />
            <span className="text-sm text-gray-600">{skill.name}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

