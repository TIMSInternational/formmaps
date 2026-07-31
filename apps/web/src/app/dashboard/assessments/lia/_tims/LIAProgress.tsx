"use client";

import { LIASubtest, SUBTEST_ORDER, SUBTEST_CONFIG } from '@/services/liaService';
import { CheckCircle } from 'lucide-react';

interface LIAProgressProps {
  currentSubtest: LIASubtest;
  completedSubtests: LIASubtest[];
  currentItem: number;
  language?: 'es' | 'en';
}

export function LIAProgress({
  currentSubtest,
  completedSubtests,
  currentItem,
  language = 'es',
}: LIAProgressProps) {
  const currentConfig = SUBTEST_CONFIG[currentSubtest];
  const currentIndex = SUBTEST_ORDER.indexOf(currentSubtest);

  return (
    <div className="w-full">
      {/* Subtest progress */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {language === 'es' ? 'Sección' : 'Section'} {currentIndex + 1}/5:{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {currentConfig.displayName[language]}
          </span>
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {currentItem}/{currentConfig.itemCount}
        </span>
      </div>

      {/* Item progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(currentItem / currentConfig.itemCount) * 100}%` }}
        />
      </div>

      {/* Subtests overview */}
      <div className="flex justify-between">
        {SUBTEST_ORDER.map((subtest, i) => {
          const isCompleted = completedSubtests.includes(subtest);
          const isCurrent = subtest === currentSubtest;

          return (
            <div
              key={subtest}
              className={`flex flex-col items-center ${
                isCompleted
                  ? 'text-green-500'
                  : isCurrent
                  ? 'text-blue-600'
                  : 'text-gray-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isCompleted
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : isCurrent
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                {isCompleted ? <CheckCircle className="w-5 h-5" /> : i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact version for assessment header
interface LIAProgressCompactProps {
  currentSubtest: LIASubtest;
  currentItem: number;
  language?: 'es' | 'en';
}

export function LIAProgressCompact({
  currentSubtest,
  currentItem,
  language = 'es',
}: LIAProgressCompactProps) {
  const config = SUBTEST_CONFIG[currentSubtest];

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {language === 'es' ? 'Pregunta' : 'Question'}{' '}
        <span className="font-bold text-gray-900 dark:text-white">{currentItem}</span>
        <span className="text-gray-400"> / {config.itemCount}</span>
      </span>
      <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(currentItem / config.itemCount) * 100}%` }}
        />
      </div>
    </div>
  );
}
