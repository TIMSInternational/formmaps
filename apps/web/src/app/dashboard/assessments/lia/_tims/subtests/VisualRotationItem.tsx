"use client";

import { VisualRotationData, VisualRotationFigure } from '@/services/liaService';

interface VisualRotationItemProps {
  data: VisualRotationData;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

function RenderFigure({ figure }: { figure: VisualRotationFigure }) {
  // Parse figure type: "R", "R_90", "ᖉ", "ᖉ_180", etc.
  const isReversed = figure.startsWith('ᖉ');
  const rotationMatch = figure.match(/_(\d+)$/);
  const rotation = rotationMatch ? parseInt(rotationMatch[1]) : 0;

  return (
    <span
      className="text-5xl font-serif font-bold text-gray-900 dark:text-white select-none"
      style={{
        display: 'inline-block',
        transform: `${isReversed ? 'scaleX(-1)' : ''} rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      R
    </span>
  );
}

export function VisualRotationItem({ data, onAnswer, disabled }: VisualRotationItemProps) {
  // Guard against undefined data
  if (!data || !data.topRow || !data.bottomRow) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  const { topRow, bottomRow } = data;

  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Instructions */}
      <p className="text-gray-600 dark:text-gray-400 text-center">
        ¿Cuántas columnas tienen figuras iguales? (rotaciones permitidas, espejos no)
      </p>

      {/* Figure grid */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg">
        <div className="grid grid-cols-3 gap-8">
          {/* Top row */}
          {topRow.map((fig, i) => (
            <div
              key={`top-${i}`}
              className="w-20 h-20 flex items-center justify-center border-b-2 border-gray-300 dark:border-gray-600"
            >
              <RenderFigure figure={fig} />
            </div>
          ))}
          {/* Bottom row */}
          {bottomRow.map((fig, i) => (
            <div
              key={`bottom-${i}`}
              className="w-20 h-20 flex items-center justify-center"
            >
              <RenderFigure figure={fig} />
            </div>
          ))}
        </div>
      </div>

      {/* Answer buttons */}
      <div className="flex gap-4">
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => onAnswer(n.toString())}
            disabled={disabled}
            className="w-16 h-16 rounded-xl text-2xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
