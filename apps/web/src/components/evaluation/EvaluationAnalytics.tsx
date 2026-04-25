'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts';
import { useEvaluationData } from '@/hooks/useEvaluationData';
import { EvaluationSession, EvaluationResponse, CompetencyDimension } from '@/services/evaluationService';

interface EvaluationAnalyticsProps {
  sessionId: string;
  onBack?: () => void;
}

interface CompetencyAnalysis {
  competency: string;
  category: string;
  selfRating: number;
  parentRating: number;
  teacherRating: number;
  peerRating: number;
  averageRating: number;
  variance: number;
  feedback: string[];
}

interface GroupAnalysis {
  group: string;
  averageRating: number;
  responseCount: number;
  completionRate: number;
  color: string;
}

const COLORS = {
  self: '#8B5CF6',
  parent: '#10B981',
  teacher: '#F59E0B',
  peer: '#EF4444'
};

const EvaluationAnalytics: React.FC<EvaluationAnalyticsProps> = ({
  sessionId,
  onBack
}) => {
  const { loadSession } = useEvaluationData();
  const [session, setSession] = useState<EvaluationSession | null>(null);
  const [responses, setResponses] = useState<EvaluationResponse[]>([]);
  const [competencyAnalysis, setCompetencyAnalysis] = useState<CompetencyAnalysis[]>([]);
  const [groupAnalysis, setGroupAnalysis] = useState<GroupAnalysis[]>([]);
  const [selectedView, setSelectedView] = useState<'overview' | 'competencies' | 'groups' | 'feedback'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData();
  }, [sessionId]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const sessionData = await loadSession(sessionId);
      
      if (sessionData) {
        const responseData = sessionData.responses || [];
        setSession(sessionData);
        setResponses(responseData);
        generateAnalytics(sessionData, responseData);
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAnalytics = (session: EvaluationSession, responses: EvaluationResponse[]) => {
    // Generate competency analysis
    const competencyMap = new Map<string, {
      ratings: { [key: string]: number[] };
      feedback: string[];
      category: string;
    }>();

    // Initialize competency map
    session.competencyDimensions.forEach(comp => {
      competencyMap.set(comp.name, {
        ratings: { self: [], parent: [], teacher: [], sibling_friend: [] },
        feedback: [],
        category: comp.category
      });
    });

    // Aggregate responses
    responses.forEach(response => {
      const evaluator = session.evaluators.find(e => e.id === response.evaluatorId);
      const evaluatorGroup = evaluator?.groupType || 'unknown';
      
      // Find competency from question ID
      const competencyId = response.questionId.replace('_rating', '').replace('_feedback', '');
      const competency = session.competencyDimensions.find(c => c.id === competencyId);
      const comp = competency ? competencyMap.get(competency.name) : null;
      
      if (comp) {
        // Handle rating responses
        if (response.ratingValue !== undefined && response.questionId.includes('_rating')) {
          comp.ratings[evaluatorGroup]?.push(response.ratingValue);
        }
        
        // Handle feedback responses
        if (response.textResponse && response.questionId.includes('_feedback')) {
          comp.feedback.push(response.textResponse);
        }
      }
    });

    // Calculate competency analysis
    const compAnalysis: CompetencyAnalysis[] = [];
    competencyMap.forEach((data, competency) => {
      const selfAvg = data.ratings.self.length > 0 ? 
        data.ratings.self.reduce((a, b) => a + b, 0) / data.ratings.self.length : 0;
      const parentAvg = data.ratings.parent.length > 0 ? 
        data.ratings.parent.reduce((a, b) => a + b, 0) / data.ratings.parent.length : 0;
      const teacherAvg = data.ratings.teacher.length > 0 ? 
        data.ratings.teacher.reduce((a, b) => a + b, 0) / data.ratings.teacher.length : 0;
      const peerAvg = data.ratings.sibling_friend.length > 0 ? 
        data.ratings.sibling_friend.reduce((a, b) => a + b, 0) / data.ratings.sibling_friend.length : 0;
      
      const allRatings = [selfAvg, parentAvg, teacherAvg, peerAvg].filter(r => r > 0);
      const averageRating = allRatings.length > 0 ? 
        allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
      
      const variance = allRatings.length > 1 ? 
        allRatings.reduce((sum, rating) => sum + Math.pow(rating - averageRating, 2), 0) / allRatings.length : 0;

      compAnalysis.push({
        competency,
        category: data.category,
        selfRating: selfAvg,
        parentRating: parentAvg,
        teacherRating: teacherAvg,
        peerRating: peerAvg,
        averageRating,
        variance,
        feedback: data.feedback
      });
    });

    setCompetencyAnalysis(compAnalysis);

    // Generate group analysis
    const groupMap = new Map<string, { ratings: number[], total: number }>();
    const requiredCounts = {
      self: session.evaluatorRequirements.self,
      parent: session.evaluatorRequirements.parent,
      teacher: session.evaluatorRequirements.teacher,
      peer: session.evaluatorRequirements.peer
    };

    // Initialize group map
    Object.keys(requiredCounts).forEach(group => {
      const requirement = requiredCounts[group as keyof typeof requiredCounts];
      groupMap.set(group, { ratings: [], total: requirement.minimum });
    });

    // Aggregate group responses
    responses.forEach(response => {
      // Find evaluator to get group type
      const evaluator = session.evaluators.find(e => e.id === response.evaluatorId);
      if (evaluator && response.ratingValue !== undefined) {
        const group = groupMap.get(evaluator.groupType);
        if (group) {
          group.ratings.push(response.ratingValue);
        }
      }
    });

    // Calculate group analysis
    const groupAnalysisData: GroupAnalysis[] = [];
    groupMap.forEach((data, group) => {
      const averageRating = data.ratings.length > 0 ? 
        data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length : 0;
      const completionRate = (data.ratings.length / data.total) * 100;
      
      groupAnalysisData.push({
        group: group.charAt(0).toUpperCase() + group.slice(1),
        averageRating,
        responseCount: data.ratings.length,
        completionRate,
        color: COLORS[group as keyof typeof COLORS]
      });
    });

    setGroupAnalysis(groupAnalysisData);
  };

  const getOverallProgress = () => {
    if (!session) return 0;
    const totalRequired = Object.values(session.evaluatorRequirements).reduce((a, b) => a + b, 0);
    return Math.round((responses.length / totalRequired) * 100);
  };

  const getTopCompetencies = () => {
    return competencyAnalysis
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 5);
  };

  const getAreasForImprovement = () => {
    return competencyAnalysis
      .sort((a, b) => a.averageRating - b.averageRating)
      .slice(0, 5);
  };

  const getRadarData = () => {
    return competencyAnalysis.map(comp => ({
      competency: comp.competency.substring(0, 15) + (comp.competency.length > 15 ? '...' : ''),
      self: comp.selfRating,
      parent: comp.parentRating,
      teacher: comp.teacherRating,
      peer: comp.peerRating,
      average: comp.averageRating
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Session not found</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">360° Evaluation Analytics</h1>
          <p className="text-gray-600 mt-2">
            Comprehensive analysis for {session.evaluatedPersonName}
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'competencies', label: 'Competencies' },
          { id: 'groups', label: 'Evaluator Groups' },
          { id: 'feedback', label: 'Feedback' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedView(tab.id as any)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              selectedView === tab.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {selectedView === 'overview' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Progress Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Overall Progress</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{getOverallProgress()}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getOverallProgress()}%` }}
                ></div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Total Responses</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{responses.length}</p>
              <p className="text-sm text-gray-600 mt-1">
                of {Object.values(session.evaluatorRequirements).reduce((a, b) => a + b, 0)} required
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Average Rating</h3>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {competencyAnalysis.length > 0 ? 
                  (competencyAnalysis.reduce((sum, comp) => sum + comp.averageRating, 0) / competencyAnalysis.length).toFixed(1)
                  : '0.0'
                }
              </p>
              <p className="text-sm text-gray-600 mt-1">out of 5.0</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Competencies</h3>
              <p className="text-3xl font-bold text-orange-600 mt-2">{competencyAnalysis.length}</p>
              <p className="text-sm text-gray-600 mt-1">evaluated</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Group Comparison */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold mb-4">Evaluator Group Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="group" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Bar dataKey="averageRating" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Completion Status */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold mb-4">Response Completion</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={groupAnalysis}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="completionRate"
                    label={(entry: any) => `${entry.group}: ${entry.completionRate.toFixed(0)}%`}
                  >
                    {groupAnalysis.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Competencies */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold mb-4 text-green-600">Top Strengths</h3>
              <div className="space-y-3">
                {getTopCompetencies().map((comp, index) => (
                  <div key={comp.competency} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{index + 1}. {comp.competency}</span>
                    <span className="text-sm font-bold text-green-600">{comp.averageRating.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold mb-4 text-orange-600">Areas for Growth</h3>
              <div className="space-y-3">
                {getAreasForImprovement().map((comp, index) => (
                  <div key={comp.competency} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{index + 1}. {comp.competency}</span>
                    <span className="text-sm font-bold text-orange-600">{comp.averageRating.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Competencies Tab */}
      {selectedView === 'competencies' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Radar Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Competency Radar Analysis</h3>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={getRadarData()}>
                <PolarGrid />
                <PolarAngleAxis dataKey="competency" />
                <PolarRadiusAxis angle={90} domain={[0, 5]} />
                <Radar name="Self" dataKey="self" stroke={COLORS.self} fill={COLORS.self} fillOpacity={0.1} />
                <Radar name="Parent" dataKey="parent" stroke={COLORS.parent} fill={COLORS.parent} fillOpacity={0.1} />
                <Radar name="Teacher" dataKey="teacher" stroke={COLORS.teacher} fill={COLORS.teacher} fillOpacity={0.1} />
                <Radar name="Peer" dataKey="peer" stroke={COLORS.peer} fill={COLORS.peer} fillOpacity={0.1} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Competency Table */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Detailed Competency Analysis</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Competency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Self</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Peer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Average</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {competencyAnalysis.map((comp) => (
                    <tr key={comp.competency} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {comp.competency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {comp.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {comp.selfRating > 0 ? comp.selfRating.toFixed(1) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {comp.parentRating > 0 ? comp.parentRating.toFixed(1) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {comp.teacherRating > 0 ? comp.teacherRating.toFixed(1) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {comp.peerRating > 0 ? comp.peerRating.toFixed(1) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                        {comp.averageRating.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          comp.variance < 0.5 ? 'bg-green-100 text-green-800' :
                          comp.variance < 1.0 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {comp.variance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Groups Tab */}
      {selectedView === 'groups' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {groupAnalysis.map((group) => (
              <div key={group.group} className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                    {group.group}
                  </h3>
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: group.color }}
                  ></div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Average Rating</p>
                    <p className="text-2xl font-bold" style={{ color: group.color }}>
                      {group.averageRating.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Responses</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {group.responseCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Completion Rate</p>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${group.completionRate}%`,
                            backgroundColor: group.color
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">
                        {group.completionRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Feedback Tab */}
      {selectedView === 'feedback' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {competencyAnalysis
            .filter(comp => comp.feedback.length > 0)
            .map((comp) => (
              <div key={comp.competency} className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold mb-4">{comp.competency}</h3>
                <div className="space-y-3">
                  {comp.feedback.map((feedback, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-700 italic">"{feedback}"</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          }
          {competencyAnalysis.filter(comp => comp.feedback.length > 0).length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">No feedback available yet.</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default EvaluationAnalytics;