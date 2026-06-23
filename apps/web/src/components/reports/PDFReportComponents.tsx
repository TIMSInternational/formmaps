'use client';

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';

// Note: Using built-in Helvetica font for compatibility
// Custom fonts can be added later by downloading .ttf files locally

// Shared styles for all reports
export const sharedStyles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  header: {
    marginBottom: 30,
  },
  logo: {
    width: 100,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    flexDirection: 'column',
  },
  text: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.5,
  },
  textSmall: {
    fontSize: 8,
    color: '#6b7280',
  },
  textBold: {
    fontWeight: 600,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 500,
  },
  badgeGreen: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  badgeYellow: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
  },
  badgeBlue: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  badgePurple: {
    backgroundColor: '#f3e8ff',
    color: '#6b21a8',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
  },
  pageNumber: {
    fontSize: 8,
    color: '#6b7280',
  },
});

// Color palette for charts
export const chartColors = {
  primary: '#065292',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#065292',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
  orange: '#f97316',
  // DISC colors — canonical TIMS PCA mapping: D red, I blue, S green, C gold
  dominance: '#ef4444',
  influence: '#065292',
  steadiness: '#22c55e',
  conscientiousness: '#eab308',
};

// Report Header Component
interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  userName: string;
  reportDate: string;
  accentColor?: string;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  title,
  subtitle,
  userName,
  reportDate,
  accentColor = '#065292',
}) => (
  <View style={sharedStyles.header}>
    <View style={{ marginBottom: 15 }}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: accentColor, marginBottom: 3 }}>
        TimCare
      </Text>
      <Text style={{ fontSize: 9, color: '#6b7280' }}>Career Development Platform</Text>
    </View>
    <Text style={sharedStyles.title}>{title}</Text>
    {subtitle && <Text style={sharedStyles.subtitle}>{subtitle}</Text>}
    <View style={{ ...sharedStyles.row, marginTop: 10, gap: 20 }}>
      <View>
        <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>PREPARED FOR</Text>
        <Text style={{ fontSize: 11, fontWeight: 500, color: '#1a1a2e' }}>{userName}</Text>
      </View>
      <View>
        <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>REPORT DATE</Text>
        <Text style={{ fontSize: 11, fontWeight: 500, color: '#1a1a2e' }}>{reportDate}</Text>
      </View>
    </View>
  </View>
);

// Report Footer Component
interface ReportFooterProps {
  pageNumber?: number;
  totalPages?: number;
}

export const ReportFooter: React.FC<ReportFooterProps> = ({ pageNumber, totalPages }) => (
  <View style={sharedStyles.footer} fixed>
    <Text style={sharedStyles.footerText}>
      TimCare Assessment Report • Confidential
    </Text>
    <Text style={sharedStyles.footerText}>
      Generated on {new Date().toLocaleDateString()}
    </Text>
    {pageNumber && totalPages && (
      <Text style={sharedStyles.pageNumber}>
        Page {pageNumber} of {totalPages}
      </Text>
    )}
  </View>
);

// Progress Bar Component for PDF
interface ProgressBarProps {
  value: number;
  maxValue?: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  maxValue = 100,
  color = chartColors.primary,
  height = 8,
  showLabel = true,
  label,
}) => {
  const percentage = Math.min((value / maxValue) * 100, 100);
  
  return (
    <View style={{ marginBottom: 8 }}>
      {label && (
        <View style={{ ...sharedStyles.row, justifyContent: 'space-between', marginBottom: 3 }}>
          <Text style={{ fontSize: 9, color: '#374151' }}>{label}</Text>
          {showLabel && (
            <Text style={{ fontSize: 9, fontWeight: 600, color: color }}>{value}%</Text>
          )}
        </View>
      )}
      <View style={{ 
        height, 
        backgroundColor: '#e5e7eb', 
        borderRadius: height / 2,
        overflow: 'hidden'
      }}>
        <View style={{ 
          height: '100%', 
          width: `${percentage}%`, 
          backgroundColor: color,
          borderRadius: height / 2,
        }} />
      </View>
    </View>
  );
};

// Circular Score Gauge Component
interface ScoreGaugeProps {
  score: number;
  maxScore?: number;
  size?: number;
  color?: string;
  label?: string;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  maxScore = 100,
  size = 80,
  color = chartColors.primary,
  label,
}) => {
  const percentage = Math.min((score / maxScore) * 100, 100);
  
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 6,
        borderColor: '#e5e7eb',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}>
        {/* Score text */}
        <Text style={{ fontSize: size * 0.25, fontWeight: 700, color }}>
          {Math.round(score)}%
        </Text>
      </View>
      {label && (
        <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 5, textAlign: 'center' }}>
          {label}
        </Text>
      )}
    </View>
  );
};

// Info Card Component
interface InfoCardProps {
  title: string;
  value: string;
  color?: string;
  icon?: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({
  title,
  value,
  color = chartColors.primary,
}) => (
  <View style={{
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: color,
    flex: 1,
    marginHorizontal: 4,
  }}>
    <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 3 }}>{title}</Text>
    <Text style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{value}</Text>
  </View>
);

// Section Divider
export const SectionDivider: React.FC = () => (
  <View style={{ 
    height: 1, 
    backgroundColor: '#e5e7eb', 
    marginVertical: 15 
  }} />
);

export default {
  sharedStyles,
  chartColors,
  ReportHeader,
  ReportFooter,
  ProgressBar,
  ScoreGauge,
  InfoCard,
  SectionDivider,
};
