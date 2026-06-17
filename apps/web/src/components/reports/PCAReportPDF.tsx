'use client';

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import {
  sharedStyles,
  chartColors,
  ReportFooter,
  ProgressBar,
  InfoCard,
  SectionDivider,
} from './PDFReportComponents';

// PCA Report specific styles
const styles = StyleSheet.create({
  ...sharedStyles,
  headerBanner: {
    backgroundColor: '#0d9488',
    marginHorizontal: -40,
    marginTop: -40,
    paddingHorizontal: 40,
    paddingVertical: 25,
    marginBottom: 25,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 3,
  },
  headerSubtitle: {
    color: '#99f6e4',
    fontSize: 11,
  },
  headerLogo: {
    color: '#5eead4',
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 15,
  },
  discWheel: {
    alignItems: 'center',
    marginVertical: 20,
  },
  discQuadrant: {
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    minHeight: 70,
  },
  discLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#ffffff',
    marginBottom: 3,
  },
  discScore: {
    fontSize: 22,
    fontWeight: 700,
    color: '#ffffff',
  },
  discDescription: {
    fontSize: 8,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 3,
  },
  competencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  careerCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: chartColors.success,
  },
  starContainer: {
    flexDirection: 'row',
    gap: 2,
  },
});

// PCA Report Data Interface
export interface PCAReportData {
  user: {
    id: string;
    name: string;
    email: string;
  };
  reportDate: string;
  pcaCod: string;
  completionDate: string;
  discProfile: {
    dominance: { natural: number; adapted: number; description: string };
    influence: { natural: number; adapted: number; description: string };
    steadiness: { natural: number; adapted: number; description: string };
    conscientiousness: { natural: number; adapted: number; description: string };
  };
  primaryStyle: string;
  secondaryStyle: string;
  profileSummary: string;
  competencies: {
    name: string;
    score: number;
    maxScore: number;
    category: string;
  }[];
  careerRecommendations: {
    careerTitle: string;
    matchScore: number;
    reasons: string[];
  }[];
  communicationStyle: {
    strengths: string[];
    challenges: string[];
  };
  workEnvironmentPreferences: string[];
}

// Dummy data for testing
export const dummyPCAData: PCAReportData = {
  user: {
    id: 'user123',
    name: 'Alex Johnson',
    email: 'alex.johnson@example.com',
  },
  reportDate: new Date().toISOString(),
  pcaCod: 'PCA12345',
  completionDate: '2026-01-04T10:00:00Z',
  discProfile: {
    dominance: {
      natural: 72,
      adapted: 65,
      description: 'Results-driven, competitive',
    },
    influence: {
      natural: 45,
      adapted: 55,
      description: 'Moderately social, collaborative',
    },
    steadiness: {
      natural: 38,
      adapted: 42,
      description: 'Adaptable, variety-seeking',
    },
    conscientiousness: {
      natural: 68,
      adapted: 70,
      description: 'Detail-oriented, analytical',
    },
  },
  primaryStyle: 'DC',
  secondaryStyle: 'D',
  profileSummary: 'A results-oriented professional who combines drive and determination with analytical precision. You excel in environments that offer clear goals and the autonomy to achieve them. Your natural leadership style is direct and efficient, with a focus on quality outcomes. While highly capable of independent work, you also value collaboration when it serves strategic objectives.',
  competencies: [
    { name: 'Leadership', score: 4.2, maxScore: 5, category: 'Interpersonal' },
    { name: 'Analytical Thinking', score: 4.5, maxScore: 5, category: 'Cognitive' },
    { name: 'Decision Making', score: 4.3, maxScore: 5, category: 'Executive' },
    { name: 'Communication', score: 3.8, maxScore: 5, category: 'Interpersonal' },
    { name: 'Teamwork', score: 3.5, maxScore: 5, category: 'Interpersonal' },
    { name: 'Adaptability', score: 3.9, maxScore: 5, category: 'Personal' },
    { name: 'Problem Solving', score: 4.4, maxScore: 5, category: 'Cognitive' },
    { name: 'Time Management', score: 4.0, maxScore: 5, category: 'Executive' },
  ],
  careerRecommendations: [
    {
      careerTitle: 'Project Manager',
      matchScore: 92,
      reasons: ['High D aligns with leadership demands', 'C supports quality focus and planning'],
    },
    {
      careerTitle: 'Business Analyst',
      matchScore: 88,
      reasons: ['Analytical thinking matches C profile', 'D drives stakeholder management'],
    },
    {
      careerTitle: 'Operations Director',
      matchScore: 85,
      reasons: ['Results orientation fits operational goals', 'Process improvement alignment'],
    },
    {
      careerTitle: 'Entrepreneur',
      matchScore: 82,
      reasons: ['Self-directed D style', 'Risk tolerance and decision-making'],
    },
  ],
  communicationStyle: {
    strengths: [
      'Direct and clear communication',
      'Results-focused discussions',
      'Confident presentation skills',
      'Logical argumentation',
    ],
    challenges: [
      'May appear impatient at times',
      'Could benefit from more empathy in delivery',
      'Tendency to skip small talk',
    ],
  },
  workEnvironmentPreferences: [
    'Challenging projects with clear goals',
    'Autonomy in decision-making',
    'Recognition for achievements',
    'Fast-paced, dynamic settings',
    'Opportunities for advancement',
  ],
};

// Star Rating Component
const StarRating: React.FC<{ score: number; maxScore: number }> = ({ score, maxScore }) => {
  const fullStars = Math.floor(score);
  const hasHalfStar = score % 1 >= 0.5;
  
  return (
    <View style={styles.starContainer}>
      {Array.from({ length: maxScore }, (_, i) => (
        <Text key={i} style={{ fontSize: 10, color: i < fullStars || (i === fullStars && hasHalfStar) ? '#facc15' : '#d1d5db' }}>
          ★
        </Text>
      ))}
    </View>
  );
};

// PCA Report PDF Document Component
interface PCAReportPDFProps {
  data?: PCAReportData;
}

const PCAReportPDF: React.FC<PCAReportPDFProps> = ({ data = dummyPCAData }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Document>
      {/* Page 1: DISC Profile */}
      <Page size="A4" style={sharedStyles.page}>
        {/* Header Banner */}
        <View style={styles.headerBanner}>
          <Text style={styles.headerLogo}>FormMaps</Text>
          <Text style={styles.headerTitle}>PCA Personality Profile Report</Text>
          <Text style={styles.headerSubtitle}>Personal Characteristics Assessment • DISC-Based Analysis</Text>
        </View>

        {/* User Info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>PREPARED FOR</Text>
            <Text style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>{data.user.name}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{data.user.email}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>ASSESSMENT DATE</Text>
            <Text style={{ fontSize: 11, fontWeight: 500, color: '#1a1a2e' }}>{formatDate(data.completionDate)}</Text>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 4 }}>ID: {data.pcaCod}</Text>
          </View>
        </View>

        {/* DISC Wheel Visualization */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row' }}>
            {/* D Quadrant */}
            <View style={{ ...styles.discQuadrant, backgroundColor: chartColors.dominance, borderTopLeftRadius: 8 }}>
              <Text style={styles.discLabel}>D - Dominance</Text>
              <Text style={styles.discScore}>{data.discProfile.dominance.natural}%</Text>
              <Text style={styles.discDescription}>{data.discProfile.dominance.description}</Text>
            </View>
            {/* I Quadrant */}
            <View style={{ ...styles.discQuadrant, backgroundColor: chartColors.influence, borderTopRightRadius: 8 }}>
              <Text style={styles.discLabel}>I - Influence</Text>
              <Text style={styles.discScore}>{data.discProfile.influence.natural}%</Text>
              <Text style={styles.discDescription}>{data.discProfile.influence.description}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {/* S Quadrant */}
            <View style={{ ...styles.discQuadrant, backgroundColor: chartColors.steadiness, borderBottomLeftRadius: 8 }}>
              <Text style={styles.discLabel}>S - Solidity</Text>
              <Text style={styles.discScore}>{data.discProfile.steadiness.natural}%</Text>
              <Text style={styles.discDescription}>{data.discProfile.steadiness.description}</Text>
            </View>
            {/* C Quadrant */}
            <View style={{ ...styles.discQuadrant, backgroundColor: chartColors.conscientiousness, borderBottomRightRadius: 8 }}>
              <Text style={styles.discLabel}>C - Control</Text>
              <Text style={styles.discScore}>{data.discProfile.conscientiousness.natural}%</Text>
              <Text style={styles.discDescription}>{data.discProfile.conscientiousness.description}</Text>
            </View>
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 9, fontWeight: 600, color: '#374151' }}>Primary Style: </Text>
              <Text style={{ fontSize: 9, color: chartColors.dominance, fontWeight: 700 }}>{data.primaryStyle}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 9, fontWeight: 600, color: '#374151' }}>Secondary: </Text>
              <Text style={{ fontSize: 9, color: '#6b7280' }}>{data.secondaryStyle}</Text>
            </View>
          </View>
        </View>

        {/* DISC Bars */}
        <View style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 15, marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Natural vs Adapted Profile</Text>
          <View style={{ marginBottom: 10 }}>
            <ProgressBar label="Dominance" value={data.discProfile.dominance.natural} color={chartColors.dominance} />
          </View>
          <View style={{ marginBottom: 10 }}>
            <ProgressBar label="Influence" value={data.discProfile.influence.natural} color={chartColors.influence} />
          </View>
          <View style={{ marginBottom: 10 }}>
            <ProgressBar label="Solidity" value={data.discProfile.steadiness.natural} color={chartColors.steadiness} />
          </View>
          <View>
            <ProgressBar label="Control" value={data.discProfile.conscientiousness.natural} color={chartColors.conscientiousness} />
          </View>
        </View>

        {/* Profile Summary */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Profile Summary</Text>
          <Text style={{ fontSize: 10, color: '#374151', lineHeight: 1.6 }}>{data.profileSummary}</Text>
        </View>

        <ReportFooter />
      </Page>

      {/* Page 2: Competencies & Career Recommendations */}
      <Page size="A4" style={sharedStyles.page}>
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 5 }}>
            Competencies & Career Alignment
          </Text>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>
            Your strengths and recommended career paths based on your personality profile
          </Text>
        </View>

        {/* Competencies Section */}
        <View style={{ marginBottom: 25 }}>
          <Text style={sharedStyles.sectionTitle}>Core Competencies</Text>
          {data.competencies.map((comp, index) => (
            <View key={index} style={styles.competencyRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 500, color: '#1a1a2e' }}>{comp.name}</Text>
                <Text style={{ fontSize: 8, color: '#9ca3af' }}>{comp.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <StarRating score={comp.score} maxScore={comp.maxScore} />
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{comp.score.toFixed(1)}/5.0</Text>
              </View>
            </View>
          ))}
        </View>

        <SectionDivider />

        {/* Career Recommendations */}
        <View style={{ marginBottom: 25 }}>
          <Text style={sharedStyles.sectionTitle}>Career Recommendations</Text>
          {data.careerRecommendations.map((career, index) => (
            <View key={index} style={styles.careerCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: 600, color: '#166534' }}>{career.careerTitle}</Text>
                <View style={{ 
                  backgroundColor: '#22c55e', 
                  paddingHorizontal: 8, 
                  paddingVertical: 3, 
                  borderRadius: 10 
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 600, color: '#ffffff' }}>{career.matchScore}% Match</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {career.reasons.map((reason, idx) => (
                  <Text key={idx} style={{ 
                    fontSize: 8, 
                    color: '#166534', 
                    backgroundColor: '#dcfce7',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}>
                    • {reason}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <SectionDivider />

        {/* Communication Style & Work Environment */}
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', marginBottom: 10 }}>
              Communication Strengths
            </Text>
            {data.communicationStyle.strengths.map((strength, idx) => (
              <Text key={idx} style={{ fontSize: 9, color: '#16a34a', marginBottom: 4 }}>✓ {strength}</Text>
            ))}
            <Text style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', marginTop: 12, marginBottom: 10 }}>
              Areas to Develop
            </Text>
            {data.communicationStyle.challenges.map((challenge, idx) => (
              <Text key={idx} style={{ fontSize: 9, color: '#d97706', marginBottom: 4 }}>○ {challenge}</Text>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', marginBottom: 10 }}>
              Ideal Work Environment
            </Text>
            {data.workEnvironmentPreferences.map((pref, idx) => (
              <Text key={idx} style={{ fontSize: 9, color: '#374151', marginBottom: 4 }}>• {pref}</Text>
            ))}
          </View>
        </View>

        {/* Footer Note */}
        <View style={{ 
          marginTop: 'auto', 
          backgroundColor: '#f0fdfa', 
          padding: 15, 
          borderRadius: 6,
          marginBottom: 40,
        }}>
          <Text style={{ fontSize: 9, color: '#0d9488', fontWeight: 600, marginBottom: 5 }}>
            About This Assessment
          </Text>
          <Text style={{ fontSize: 8, color: '#14b8a6', lineHeight: 1.5 }}>
            The PCA (Personal Characteristics Assessment) is based on the DISC behavioral model and 
            measures natural and adapted behavioral tendencies. This report provides insights into 
            personality preferences and is intended for personal and professional development purposes.
          </Text>
        </View>

        <ReportFooter />
      </Page>
    </Document>
  );
};

export default PCAReportPDF;
