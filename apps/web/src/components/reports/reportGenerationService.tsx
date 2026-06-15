'use client';

import { pdf } from '@react-pdf/renderer';
import LIAReportPDF, { LIAReportData } from './LIAReportPDF';
import PCAReportPDF, { PCAReportData, dummyPCAData } from './PCAReportPDF';

// Report types
export type ReportType = 'lia' | 'pca' | 'evaluation' | 'timeline' | 'coaching' | 'benchmark';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// Generic report generation function
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Fetch a PDF report from the backend
const fetchBackendReport = async (endpoint: string, filename: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/pdf',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to generate report (${response.status})`);
  }

  const blob = await response.blob();
  downloadBlob(blob, filename);
};

// Generate and download LIA Report.
// REQUIRES real assessment data — there is no dummy fallback. If a caller
// fails to pass data we fail safe (log + no-op) rather than emitting a fake
// "Alex Johnson" report.
export const generateLIAReport = async (data?: LIAReportData): Promise<void> => {
  if (!data) {
    console.error('generateLIAReport called without data — refusing to emit a placeholder report.');
    return;
  }
  const fileName = `LIA_Assessment_Report_${data.user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob = await pdf(<LIAReportPDF data={data} />).toBlob();
  downloadBlob(blob, fileName);
};

// Generate and download PCA Report
export const generatePCAReport = async (data?: PCAReportData): Promise<void> => {
  const reportData = data || dummyPCAData;
  const fileName = `PCA_Personality_Report_${reportData.user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  try {
    const blob = await pdf(<PCAReportPDF data={reportData} />).toBlob();
    downloadBlob(blob, fileName);
  } catch (error) {
    throw error;
  }
};

// Generate and download Evaluation Report from backend
export const generateEvaluationReport = async (userId?: string): Promise<void> => {
  const uid = userId || JSON.parse(localStorage.getItem('user') || '{}').id;
  if (!uid) throw new Error('User ID required for evaluation report');
  const date = new Date().toISOString().split('T')[0];
  await fetchBackendReport(
    `/api/report/user-report/${uid}?section=evaluation`,
    `360_Evaluation_Report_${date}.pdf`
  );
};

// Generate and download Timeline Report from backend
export const generateTimelineReport = async (userId?: string): Promise<void> => {
  const uid = userId || JSON.parse(localStorage.getItem('user') || '{}').id;
  if (!uid) throw new Error('User ID required for timeline report');
  const date = new Date().toISOString().split('T')[0];
  await fetchBackendReport(
    `/api/report/user-report/${uid}?section=timeline`,
    `Career_Timeline_Report_${date}.pdf`
  );
};

// Generate and download Coaching Report from backend
export const generateCoachingReport = async (): Promise<void> => {
  const date = new Date().toISOString().split('T')[0];
  await fetchBackendReport(
    `/api/v1/coach/me/analytics/report?type=pdf`,
    `Coaching_Session_Report_${date}.pdf`
  );
};

// Generate and download Benchmark Report from backend
export const generateBenchmarkReport = async (userId?: string): Promise<void> => {
  const uid = userId || JSON.parse(localStorage.getItem('user') || '{}').id;
  if (!uid) throw new Error('User ID required for benchmark report');
  const date = new Date().toISOString().split('T')[0];
  await fetchBackendReport(
    `/api/report/user-report/${uid}?section=benchmark`,
    `Benchmark_Comparison_Report_${date}.pdf`
  );
};

// Get preview URL for LIA Report (for iframe display). Requires real data.
export const getLIAReportPreviewUrl = async (data: LIAReportData): Promise<string> => {
  const blob = await pdf(<LIAReportPDF data={data} />).toBlob();
  return URL.createObjectURL(blob);
};

// Get preview URL for PCA Report (for iframe display)
export const getPCAReportPreviewUrl = async (data?: PCAReportData): Promise<string> => {
  const reportData = data || dummyPCAData;
  const blob = await pdf(<PCAReportPDF data={reportData} />).toBlob();
  return URL.createObjectURL(blob);
};

// Generic report generation based on type
export const generateReport = async (
  type: ReportType,
  options?: {
    liaData?: LIAReportData;
    pcaData?: PCAReportData;
    userId?: string;
  }
): Promise<void> => {
  switch (type) {
    case 'lia':
      return generateLIAReport(options?.liaData);
    case 'pca':
      return generatePCAReport(options?.pcaData);
    case 'evaluation':
      return generateEvaluationReport(options?.userId);
    case 'timeline':
      return generateTimelineReport(options?.userId);
    case 'coaching':
      return generateCoachingReport();
    case 'benchmark':
      return generateBenchmarkReport(options?.userId);
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
};

// Export shared types (PCA still ships a dummy fallback; LIA does not).
export { dummyPCAData };
export type { LIAReportData, PCAReportData };
