"use client";

import { useState, useEffect } from 'react';
import { PatternRecognitionData } from '@/services/liaService';

interface PatternRecognitionItemProps {
  data: PatternRecognitionData;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

export function PatternRecognitionItem({ data, onAnswer, disabled }: PatternRecognitionItemProps) {
  const [clickedButton, setClickedButton] = useState<number | null>(null);

  // Reset clicked button when question data changes
  useEffect(() => {
    setClickedButton(null);
  }, [data]);

  // Guard against undefined data
  if (!data || !data.row1 || !data.row2) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const { row1, row2 } = data;

  const handleClick = (n: number) => {
    console.log('PatternRecognitionItem: Button clicked:', n, 'disabled:', disabled);
    if (disabled) return;
    setClickedButton(n);
    onAnswer(n.toString());
  };

  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Instructions */}
      <p className="text-gray-600 text-center">
        ¿Cuántas columnas tienen letras iguales? (sin importar mayúsculas/minúsculas)
      </p>

      {/* Letter grid */}
      <div className="bg-[#1F2937] rounded-xl p-8 shadow-lg">
        <div className="grid grid-cols-4 gap-6">
          {/* Top row */}
          {row1.map((letter, i) => (
            <div
              key={`top-${i}`}
              className="w-16 h-16 flex items-center justify-center text-4xl font-mono font-bold text-white border-b-2 border-gray-500"
            >
              {letter}
            </div>
          ))}
          {/* Bottom row */}
          {row2.map((letter, i) => (
            <div
              key={`bottom-${i}`}
              className="w-16 h-16 flex items-center justify-center text-4xl font-mono font-bold text-white"
            >
              {letter}
            </div>
          ))}
        </div>
      </div>

      {/* Answer buttons */}
      <div className="flex gap-4">
        {[0, 1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => handleClick(n)}
            disabled={disabled}
            className={`w-16 h-16 rounded-xl text-2xl font-bold transition-all shadow-md hover:shadow-lg ${
              clickedButton === n
                ? 'bg-green-600 text-white scale-95'
                : 'bg-[#102B47] hover:bg-[#0b1f33] text-white'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
