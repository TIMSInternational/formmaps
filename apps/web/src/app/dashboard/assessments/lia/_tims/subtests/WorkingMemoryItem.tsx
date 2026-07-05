"use client";

import { WorkingMemoryData } from '@/services/liaService';

interface WorkingMemoryItemProps {
  data: WorkingMemoryData;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

export function WorkingMemoryItem({ data, onAnswer, disabled }: WorkingMemoryItemProps) {
  // Guard against undefined data
  if (!data || !data.letters || data.letters.length < 3) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const { letters } = data;
  const [left, middle, right] = letters;

  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Instructions */}
      <p className="text-gray-600 dark:text-gray-400 text-center">
        ¿Cuál letra exterior está más lejos alfabéticamente de la letra del centro?
      </p>

      {/* Letters display */}
      <div className="flex justify-center items-end gap-8 md:gap-16">
        {/* Left letter - clickable */}
        <button
          onClick={() => onAnswer('left')}
          disabled={disabled}
          className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          <span className="text-6xl font-bold text-gray-900 dark:text-white font-mono">
            {left}
          </span>
          <span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-100 dark:bg-blue-900" />
        </button>

        {/* Middle letter - not clickable */}
        <div className="flex flex-col items-center p-6">
          <span className="text-6xl font-bold text-gray-500 dark:text-gray-400 font-mono">
            {middle}
          </span>
          <span className="text-sm text-gray-400 mt-3">centro</span>
        </div>

        {/* Right letter - clickable */}
        <button
          onClick={() => onAnswer('right')}
          disabled={disabled}
          className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          <span className="text-6xl font-bold text-gray-900 dark:text-white font-mono">
            {right}
          </span>
          <span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-100 dark:bg-blue-900" />
        </button>
      </div>
    </div>
  );
}
