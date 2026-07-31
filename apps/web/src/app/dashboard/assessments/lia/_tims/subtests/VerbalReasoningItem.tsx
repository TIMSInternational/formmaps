"use client";

import { VerbalReasoningData } from '@/services/liaService';

interface VerbalReasoningItemProps {
  data: VerbalReasoningData;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

export function VerbalReasoningItem({ data, onAnswer, disabled }: VerbalReasoningItemProps) {
  // Guard against undefined data
  if (!data || !data.premises || !data.options) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const { premises, question, options } = data;
  const optionLabels = ['A', 'B', 'C'];

  return (
    <div className="flex flex-col items-center space-y-8 max-w-2xl mx-auto">
      {/* Premises */}
      <div className="w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg space-y-3">
        {premises.map((premise, i) => (
          <p key={i} className="text-lg text-gray-800 dark:text-gray-200">
            {premise}
          </p>
        ))}
      </div>

      {/* Question */}
      <div className="w-full text-center">
        <p className="text-xl font-semibold text-gray-900 dark:text-white">
          {question}
        </p>
      </div>

      {/* Options */}
      <div className="w-full flex flex-col gap-3">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => onAnswer(optionLabels[i])}
            disabled={disabled}
            className="w-full py-4 px-6 rounded-xl text-left text-lg bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold mr-4">
              {optionLabels[i]}
            </span>
            <span className="text-gray-800 dark:text-gray-200">{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
