"use client";

import { NumericalSpeedData } from '@/services/liaService';

interface NumericalSpeedItemProps {
  data: NumericalSpeedData;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

export function NumericalSpeedItem({ data, onAnswer, disabled }: NumericalSpeedItemProps) {
  // Guard against undefined data
  if (!data || !data.numbers) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const { numbers } = data;
  const labels = ['A', 'B', 'C'];

  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Instructions */}
      <p className="text-gray-600 dark:text-gray-400 text-center">
        ¿Cuál número está más lejos del valor medio?
      </p>

      {/* Numbers display */}
      <div className="flex justify-center gap-8 md:gap-16">
        {numbers.map((num, i) => (
          <button
            key={i}
            onClick={() => onAnswer(labels[i])}
            disabled={disabled}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl min-w-[120px]"
          >
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              [{labels[i]}]
            </span>
            <span className="text-5xl font-bold text-gray-900 dark:text-white">
              {num}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
