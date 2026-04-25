'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  DocumentArrowDownIcon,
  PrinterIcon,
  ShareIcon,
  ChartBarIcon,
  UserGroupIcon,
  StarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrophyIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
import { useEvaluationData } from '@/hooks/useEvaluationData';
import { EvaluationSession, EvaluationResponse, CompetencyDimension } from '@/services/evaluationService';

interface EvaluationReportProps {
  sessionId: string;
  onBack?: () => void;
}

interface CompetencyReport {
  competency: CompetencyDimension;
  selfRating: number;
  parentRating: number;
  teacherRating: number;
  peerRating: number;
  averageRating: number;
  variance: number;
  feedback: {
    group: string;
    comment: string;
    evaluatorName?: string;
  }[];
  strengths: string[];
  improvements: string[];
}

interface ReportSummary {
  overallScore: number;
  topStrengths: string[];
  keyImprovements: string[];
  responseRate: number;
  completionDate: Date;
  recommendations: string[];
}

const EvaluationReport: React.FC<EvaluationReportProps> = ({
  sessionId,
  onBack
}) => {
  const { loadSession } = useEvaluationData();
  const [session, setSession] = useState<EvaluationSession | null>(null);
  const [responses, setResponses] = useState<EvaluationResponse[]>([]);
  const [competencyReports, setCompetencyReports] = useState<CompetencyReport[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [selectedView, setSelectedView] = useState<'summary' | 'detailed' | 'feedback' | 'recommendations'>('summary');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadReportData();
  }, [sessionId]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const sessionData = await loadSession(sessionId);
      
      if (sessionData) {
        setSession(sessionData);
        const responseData = sessionData.responses || [];
        const evaluators = sessionData.evaluators || [];
        setResponses(responseData);
        generateReport(sessionData, responseData, evaluators);
      }
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (session: EvaluationSession, responses: EvaluationResponse[], evaluators: any[]) => {
    // Generate competency reports
    const competencyMap = new Map<string, {
      ratings: { [key: string]: number[] };
      feedback: { group: string; comment: string; evaluatorName?: string }[];
      dimension: CompetencyDimension;
    }>();

    // Initialize competency map
    session.competencyDimensions.forEach(comp => {
      competencyMap.set(comp.name, {
        ratings: { self: [], parent: [], teacher: [], peer: [] },
        feedback: [],
        dimension: comp
      });
    });

    // Aggregate responses
    responses.forEach(response => {
      const evaluator = evaluators.find(e => e.id === response.evaluatorId);
      const evaluatorGroup = evaluator?.groupType || 'unknown';
      
      // Find competency from question ID
      const competencyId = response.questionId.replace('_rating', '').replace('_feedback', '');
      const comp = competencyMap.get(competencyId);
      
      if (comp) {
        // Handle rating responses
        if (response.ratingValue !== undefined && response.questionId.includes('_rating')) {
          comp.ratings[evaluatorGroup]?.push(response.ratingValue);
        }
        
        // Handle feedback responses
        if (response.textResponse && response.questionId.includes('_feedback')) {
          comp.feedback.push({
            group: evaluatorGroup,
            comment: response.textResponse,
            evaluatorName: evaluator?.name
          });
        }
      }
    });

    // Generate competency reports
    const reports: CompetencyReport[] = [];
    competencyMap.forEach((data, competencyName) => {
      const selfAvg = data.ratings.self.length > 0 ? 
        data.ratings.self.reduce((a, b) => a + b, 0) / data.ratings.self.length : 0;
      const parentAvg = data.ratings.parent.length > 0 ? 
        data.ratings.parent.reduce((a, b) => a + b, 0) / data.ratings.parent.length : 0;
      const teacherAvg = data.ratings.teacher.length > 0 ? 
        data.ratings.teacher.reduce((a, b) => a + b, 0) / data.ratings.teacher.length : 0;
      const peerAvg = data.ratings.peer.length > 0 ? 
        data.ratings.peer.reduce((a, b) => a + b, 0) / data.ratings.peer.length : 0;
      
      const allRatings = [selfAvg, parentAvg, teacherAvg, peerAvg].filter(r => r > 0);
      const averageRating = allRatings.length > 0 ? 
        allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
      
      const variance = allRatings.length > 1 ? 
        allRatings.reduce((sum, rating) => sum + Math.pow(rating - averageRating, 2), 0) / allRatings.length : 0;

      // Generate insights
      const strengths: string[] = [];
      const improvements: string[] = [];

      if (averageRating >= 4.0) {
        strengths.push(`Strong performance in ${competencyName.toLowerCase()}`);
      }
      if (averageRating >= 4.5) {
        strengths.push(`Exceptional ${competencyName.toLowerCase()} abilities`);
      }
      if (selfAvg > 0 && parentAvg > 0 && Math.abs(selfAvg - parentAvg) < 0.5) {
        strengths.push('Good self-awareness and alignment with parent perspective');
      }
      if (averageRating < 3.0) {
        improvements.push(`Focus on developing ${competencyName.toLowerCase()} skills`);
      }
      if (variance > 1.0) {
        improvements.push('Work on consistency across different contexts');
      }
      if (selfAvg > 0 && averageRating > 0 && selfAvg - averageRating > 1.0) {
        improvements.push('Consider more realistic self-assessment');
      }

      reports.push({
        competency: data.dimension,
        selfRating: selfAvg,
        parentRating: parentAvg,
        teacherRating: teacherAvg,
        peerRating: peerAvg,
        averageRating,
        variance,
        feedback: data.feedback,
        strengths,
        improvements
      });
    });

    setCompetencyReports(reports);

    // Generate summary
    const overallScore = reports.length > 0 ? 
      reports.reduce((sum, report) => sum + report.averageRating, 0) / reports.length : 0;
    
    const topStrengths = reports
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 3)
      .map(report => report.competency.name);
    
    const keyImprovements = reports
      .sort((a, b) => a.averageRating - b.averageRating)
      .slice(0, 3)
      .map(report => report.competency.name);
    
    const totalRequired = session.evaluatorGroups.reduce((sum, group) => sum + group.minRequired, 0);
    const responseRate = (responses.length / totalRequired) * 100;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (overallScore >= 4.0) {
      recommendations.push('Continue building on existing strengths while maintaining current performance levels.');
    }
    if (overallScore < 3.0) {
      recommendations.push('Focus on fundamental skill development with structured support and guidance.');
    }
    if (responseRate < 80) {
      recommendations.push('Consider gathering additional feedback to ensure comprehensive assessment.');
    }
    
    const highVarianceCompetencies = reports.filter(r => r.variance > 1.0);
    if (highVarianceCompetencies.length > 0) {
      recommendations.push('Work on consistency in performance across different environments and relationships.');
    }
    
    const selfAwarenessIssues = reports.filter(r => r.selfRating > 0 && Math.abs(r.selfRating - r.averageRating) > 1.0);
    if (selfAwarenessIssues.length > 0) {
      recommendations.push('Develop better self-awareness through reflection and feedback integration.');
    }

    setReportSummary({
      overallScore,
      topStrengths,
      keyImprovements,
      responseRate,
      completionDate: new Date(),
      recommendations
    });
  };

  const generatePDFReport = async () => {
    setGenerating(true);
    try {
      // In a real implementation, you would use a PDF generation library like jsPDF or react-pdf
      // For now, we'll simulate the process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a simple text-based report for download
      const reportContent = generateTextReport();
      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `360-evaluation-report-${session?.evaluatedPersonName?.replace(/\s+/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  const generateTextReport = (): string => {
    if (!session || !reportSummary) return '';
    
    let report = `360-DEGREE EVALUATION REPORT\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `Evaluatee: ${session.evaluatedPersonName}\n`;
    report += `Date: ${reportSummary.completionDate.toLocaleDateString()}\n`;
    report += `Response Rate: ${reportSummary.responseRate.toFixed(1)}%\n\n`;
    
    report += `EXECUTIVE SUMMARY\n`;
    report += `${'-'.repeat(20)}\n`;
    report += `Overall Score: ${reportSummary.overallScore.toFixed(1)}/5.0\n\n`;
    
    report += `Top Strengths:\n`;
    reportSummary.topStrengths.forEach((strength, index) => {
      report += `${index + 1}. ${strength}\n`;
    });
    report += `\n`;
    
    report += `Areas for Development:\n`;
    reportSummary.keyImprovements.forEach((improvement, index) => {
      report += `${index + 1}. ${improvement}\n`;
    });
    report += `\n`;
    
    report += `DETAILED COMPETENCY ANALYSIS\n`;
    report += `${'-'.repeat(30)}\n\n`;
    
    competencyReports.forEach(comp => {
      report += `${comp.competency.name}\n`;
      report += `Average Rating: ${comp.averageRating.toFixed(1)}/5.0\n`;
      if (comp.selfRating > 0) report += `Self: ${comp.selfRating.toFixed(1)} `;
      if (comp.parentRating > 0) report += `Parent: ${comp.parentRating.toFixed(1)} `;
      if (comp.teacherRating > 0) report += `Teacher: ${comp.teacherRating.toFixed(1)} `;
      if (comp.peerRating > 0) report += `Peer: ${comp.peerRating.toFixed(1)}`;
      report += `\n\n`;
      
      if (comp.feedback.length > 0) {
        report += `Feedback:\n`;
        comp.feedback.forEach(fb => {
          report += `- ${fb.group}: "${fb.comment}"\n`;
        });
        report += `\n`;
      }
    });
    
    report += `RECOMMENDATIONS\n`;
    report += `${'-'.repeat(15)}\n`;
    reportSummary.recommendations.forEach((rec, index) => {
      report += `${index + 1}. ${rec}\n`;
    });
    
    return report;
  };

  const printReport = () => {
    window.print();
  };

  const shareReport = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `360° Evaluation Report - ${session?.evaluatedPersonName}`,
          text: `360-degree evaluation report for ${session?.evaluatedPersonName}`,
          url: window.location.href
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copy URL to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could show a toast notification here
      } catch (error) {
        console.error('Error copying to clipboard:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const { t } = useTranslation();
  if (!session || !reportSummary) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">{t('evaluation.noReportData')}</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('common.back')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 print:mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 print:text-2xl">{t('evaluation.reportTitle')}</h1>
          <p className="text-gray-600 mt-2">
            {t('evaluation.reportDescription', { name: session.evaluatedPersonName })}
          </p>
        </div>
        <div className="flex items-center space-x-3 print:hidden">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← {t('common.back')}
            </button>
          )}
          <button
            onClick={shareReport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <ShareIcon className="w-4 h-4" />
            <span>{t('common.share')}</span>
          </button>
          <button
            onClick={printReport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <PrinterIcon className="w-4 h-4" />
            <span>{t('common.print')}</span>
          </button>
          <button
            onClick={generatePDFReport}
            disabled={generating}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            <span>{generating ? t('common.generating') : t('common.download')}</span>
          </button>
        </div>
      </div>

      {/* Report Info */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8 print:shadow-none print:border-gray-300">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">{t('evaluation.evaluationPeriod')}</h3>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(session.startDate).toLocaleDateString()} - {new Date(session.endDate).toLocaleDateString()}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">{t('evaluation.responseRate')}</h3>
            <p className="text-lg font-semibold text-green-600">
              {reportSummary.responseRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">{t('evaluation.overallScore')}</h3>
            <p className="text-lg font-semibold text-blue-600">
              {reportSummary.overallScore.toFixed(1)}/5.0
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">{t('evaluation.reportGenerated')}</h3>
            <p className="text-lg font-semibold text-gray-900">
              {reportSummary.completionDate.toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg print:hidden">
        {[
          { id: 'summary', label: 'Executive Summary', icon: ChartBarIcon },
          { id: 'detailed', label: 'Detailed Analysis', icon: UserGroupIcon },
          { id: 'feedback', label: 'Feedback', icon: StarIcon },
          { id: 'recommendations', label: 'Recommendations', icon: LightBulbIcon }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedView(tab.id as any)}
              className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center space-x-2 ${
                selectedView === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Executive Summary */}
      {(selectedView === 'summary' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Score Overview */}
          <div className="bg-white p-6 rounded-lg shadow-sm border print:shadow-none print:border-gray-300">
            <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
              <TrophyIcon className="w-6 h-6 text-yellow-500" />
              <span>Performance Overview</span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Overall Performance</span>
                      <span className="text-sm font-bold text-blue-600">
                        {reportSummary.overallScore.toFixed(1)}/5.0
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${(reportSummary.overallScore / 5) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {reportSummary.topStrengths.length}
                      </div>
                      <div className="text-sm text-green-700">Top Strengths</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {reportSummary.keyImprovements.length}
                      </div>
                      <div className="text-sm text-orange-700">Growth Areas</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Performance Level</h3>
                <div className="text-center">
                  <div className={`text-4xl font-bold mb-2 ${
                    reportSummary.overallScore >= 4.5 ? 'text-green-600' :
                    reportSummary.overallScore >= 4.0 ? 'text-blue-600' :
                    reportSummary.overallScore >= 3.0 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {reportSummary.overallScore >= 4.5 ? 'Excellent' :
                     reportSummary.overallScore >= 4.0 ? 'Very Good' :
                     reportSummary.overallScore >= 3.0 ? 'Good' :
                     'Needs Improvement'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Based on multi-rater feedback
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Strengths */}
          <div className="bg-white p-6 rounded-lg shadow-sm border print:shadow-none print:border-gray-300">
            <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
              <span>Key Strengths</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {reportSummary.topStrengths.map((strength, index) => {
                const competencyReport = competencyReports.find(r => r.competency.name === strength);
                return (
                  <div key={strength} className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-green-800">#{index + 1}</h3>
                      <span className="text-sm font-bold text-green-600">
                        {competencyReport?.averageRating.toFixed(1)}/5.0
                      </span>
                    </div>
                    <p className="text-sm text-green-700">{strength}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Areas for Development */}
          <div className="bg-white p-6 rounded-lg shadow-sm border print:shadow-none print:border-gray-300">
            <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
              <span>Development Opportunities</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {reportSummary.keyImprovements.map((improvement, index) => {
                const competencyReport = competencyReports.find(r => r.competency.name === improvement);
                return (
                  <div key={improvement} className="p-4 bg-orange-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-orange-800">#{index + 1}</h3>
                      <span className="text-sm font-bold text-orange-600">
                        {competencyReport?.averageRating.toFixed(1)}/5.0
                      </span>
                    </div>
                    <p className="text-sm text-orange-700">{improvement}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Detailed Analysis */}
      {selectedView === 'detailed' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {competencyReports.map((report) => (
            <div key={report.competency.name} className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{report.competency.name}</h3>
                <span className="text-xl font-bold text-blue-600">
                  {report.averageRating.toFixed(1)}/5.0
                </span>
              </div>
              
              <p className="text-gray-600 mb-4">{report.competency.description}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Self', value: report.selfRating, color: 'purple' },
                  { label: 'Parent', value: report.parentRating, color: 'green' },
                  { label: 'Teacher', value: report.teacherRating, color: 'blue' },
                  { label: 'Peer', value: report.peerRating, color: 'orange' }
                ].map((rating) => (
                  <div key={rating.label} className="text-center">
                    <div className={`text-2xl font-bold text-${rating.color}-600`}>
                      {rating.value > 0 ? rating.value.toFixed(1) : '-'}
                    </div>
                    <div className="text-sm text-gray-600">{rating.label}</div>
                  </div>
                ))}
              </div>
              
              {(report.strengths.length > 0 || report.improvements.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {report.strengths.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-green-700 mb-2">Strengths</h4>
                      <ul className="space-y-1">
                        {report.strengths.map((strength, index) => (
                          <li key={index} className="text-sm text-green-600 flex items-start space-x-2">
                            <CheckCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {report.improvements.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-orange-700 mb-2">Areas for Growth</h4>
                      <ul className="space-y-1">
                        {report.improvements.map((improvement, index) => (
                          <li key={index} className="text-sm text-orange-600 flex items-start space-x-2">
                            <LightBulbIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{improvement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* Feedback */}
      {selectedView === 'feedback' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {competencyReports
            .filter(report => report.feedback.length > 0)
            .map((report) => (
              <div key={report.competency.name} className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold mb-4">{report.competency.name}</h3>
                <div className="space-y-4">
                  {report.feedback.map((feedback, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          feedback.group === 'self' ? 'bg-purple-100 text-purple-800' :
                          feedback.group === 'parent' ? 'bg-green-100 text-green-800' :
                          feedback.group === 'teacher' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {feedback.group.charAt(0).toUpperCase() + feedback.group.slice(1)}
                        </span>
                        {feedback.evaluatorName && (
                          <span className="text-xs text-gray-500">{feedback.evaluatorName}</span>
                        )}
                      </div>
                      <p className="text-gray-700 italic">"{feedback.comment}"</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          }
          {competencyReports.filter(report => report.feedback.length > 0).length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">No detailed feedback available.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Recommendations */}
      {selectedView === 'recommendations' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-lg shadow-sm border"
        >
          <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
            <LightBulbIcon className="w-6 h-6 text-yellow-500" />
            <span>Development Recommendations</span>
          </h2>
          <div className="space-y-4">
            {reportSummary.recommendations.map((recommendation, index) => (
              <div key={index} className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <p className="text-blue-800">{recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default EvaluationReport;