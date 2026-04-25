'use client';

import { pdf } from '@react-pdf/renderer';
import LIAReportPDF, { LIAReportData, dummyLIAData } from './LIAReportPDF';
import PCAReportPDF, { PCAReportData, dummyPCAData } from './PCAReportPDF';

// Report types
export type ReportType = 'lia' | 'pca' | 'evaluation' | 'timeline' | 'coaching' | 'benchmark';

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

// Generate and download LIA Report
export const generateLIAReport = async (data?: LIAReportData): Promise<void> => {
  const reportData = data || dummyLIAData;
  const fileName = `LIA_Assessment_Report_${reportData.user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  
  try {
    const blob = await pdf(<LIAReportPDF data={reportData} />).toBlob();
    downloadBlob(blob, fileName);
  } catch (error) {
    throw error;
  }
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

// Get preview URL for LIA Report (for iframe display)
export const getLIAReportPreviewUrl = async (data?: LIAReportData): Promise<string> => {
  const reportData = data || dummyLIAData;
  const blob = await pdf(<LIAReportPDF data={reportData} />).toBlob();
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
  }
): Promise<void> => {
  switch (type) {
    case 'lia':
      return generateLIAReport(options?.liaData);
    case 'pca':
      return generatePCAReport(options?.pcaData);
    case 'evaluation':
      // TODO: Implement
      return;
    case 'timeline':
      // TODO: Implement
      return;
    case 'coaching':
      // TODO: Implement
      return;
    case 'benchmark':
      // TODO: Implement
      return;
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
};

// Export all types and dummy data
export { dummyLIAData, dummyPCAData };
export type { LIAReportData, PCAReportData };
