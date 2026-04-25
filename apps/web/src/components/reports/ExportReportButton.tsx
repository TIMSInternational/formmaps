'use client';

import React, { useState } from 'react';
import { FileDown, Loader2, CheckCircle } from 'lucide-react';
import { generateReport, ReportType, LIAReportData, PCAReportData } from './reportGenerationService';
import { cn } from '@/lib/utils';

interface ExportReportButtonProps {
  reportType: ReportType;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  liaData?: LIAReportData;
  pcaData?: PCAReportData;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

const ExportReportButton: React.FC<ExportReportButtonProps> = ({
  reportType,
  label,
  variant = 'default',
  size = 'md',
  className,
  liaData,
  pcaData,
  onSuccess,
  onError,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const reportLabels: Record<ReportType, string> = {
    lia: 'LIA Assessment Report',
    pca: 'Personality Profile Report',
    evaluation: '360° Evaluation Report',
    timeline: 'Career Timeline Report',
    coaching: 'Coaching Session Report',
    benchmark: 'Benchmark Comparison Report',
  };

  const handleExport = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setIsComplete(false);

    try {
      await generateReport(reportType, { liaData, pcaData });
      setIsComplete(true);
      onSuccess?.();
      
      // Reset complete state after 2 seconds
      setTimeout(() => setIsComplete(false), 2000);
    } catch (error) {
      console.error('Report generation failed:', error);
      onError?.(error as Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  const variantClasses = {
    default: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    outline: 'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50',
    ghost: 'text-indigo-600 hover:bg-indigo-50',
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;

  return (
    <button
      onClick={handleExport}
      disabled={isGenerating}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        'disabled:opacity-70 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {isGenerating ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : isComplete ? (
        <CheckCircle size={iconSize} className="text-green-500" />
      ) : (
        <FileDown size={iconSize} />
      )}
      <span>
        {isGenerating 
          ? 'Generating PDF...' 
          : isComplete 
            ? 'Downloaded!' 
            : label || `Download ${reportLabels[reportType]}`}
      </span>
    </button>
  );
};

export default ExportReportButton;

// Also export a simpler hook for custom implementations
export const useReportExport = (reportType: ReportType) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportReport = async (options?: { liaData?: LIAReportData; pcaData?: PCAReportData }) => {
    setIsGenerating(true);
    setError(null);

    try {
      await generateReport(reportType, options);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  return { exportReport, isGenerating, error };
};
