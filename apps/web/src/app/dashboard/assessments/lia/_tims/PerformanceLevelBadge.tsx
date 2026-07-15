"use client";

import { LIAPerformanceLevel } from '@/services/liaService';

interface PerformanceLevelBadgeProps {
  level: LIAPerformanceLevel;
  size?: 'sm' | 'md' | 'lg';
  language?: 'es' | 'en';
}

const LEVEL_CONFIG: Record<
  LIAPerformanceLevel,
  { color: string; bgColor: string; label: { es: string; en: string } }
> = {
  insufficient: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: { es: 'Insuficiente', en: 'Insufficient' },
  },
  low: {
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: { es: 'Bajo', en: 'Low' },
  },
  acceptable: {
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: { es: 'Adecuado', en: 'Acceptable' },
  },
  high: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: { es: 'Excede', en: 'Exceeds' },
  },
  outstanding: {
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: { es: 'Excepcional', en: 'Outstanding' },
  },
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

export function PerformanceLevelBadge({
  level,
  size = 'md',
  language = 'es',
}: PerformanceLevelBadgeProps) {
  const config = LEVEL_CONFIG[level];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${config.color} ${config.bgColor} ${SIZE_CLASSES[size]}`}
    >
      {config.label[language]}
    </span>
  );
}

// Large display for results page
interface PerformanceLevelDisplayProps {
  level: LIAPerformanceLevel;
  percentile: number;
  language?: 'es' | 'en';
}

export function PerformanceLevelDisplay({
  level,
  percentile,
  language = 'es',
}: PerformanceLevelDisplayProps) {
  const config = LEVEL_CONFIG[level];

  const descriptions: Record<LIAPerformanceLevel, { es: string; en: string }> = {
    insufficient: {
      es: 'Capacidad de adaptación muy limitada. Requiere desarrollo significativo.',
      en: 'Very limited adaptation capacity. Requires significant development.',
    },
    low: {
      es: 'Capacidad de adaptación por debajo del promedio. Beneficiaría de entrenamiento cognitivo.',
      en: 'Below-average adaptation capacity. Would benefit from cognitive training.',
    },
    acceptable: {
      es: 'Capacidad de adaptación dentro del rango normal. Adecuado para la mayoría de roles.',
      en: 'Adaptation capacity within normal range. Suitable for most roles.',
    },
    high: {
      es: 'Capacidad de adaptación superior al promedio. Ideal para roles dinámicos.',
      en: 'Above-average adaptation capacity. Ideal for dynamic roles.',
    },
    outstanding: {
      es: 'Capacidad de adaptación excepcional. Excelente para liderazgo y roles de alta complejidad.',
      en: 'Exceptional adaptation capacity. Excellent for leadership and high-complexity roles.',
    },
  };

  return (
    <div className={`rounded-2xl p-6 ${config.bgColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {language === 'es' ? 'Nivel de Desempeño' : 'Performance Level'}
          </p>
          <h3 className={`text-3xl font-bold ${config.color}`}>
            {config.label[language]}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {language === 'es' ? 'Percentil Global' : 'Global Percentile'}
          </p>
          <p className={`text-4xl font-bold ${config.color}`}>{Math.round(percentile)}%</p>
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400">{descriptions[level][language]}</p>
    </div>
  );
}
