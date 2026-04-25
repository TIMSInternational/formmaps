'use client';

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  G,
  Line,
} from '@react-pdf/renderer';
import {
  modernStyles,
  modernColors,
  ModernCoverPage,
  TechProgressBar,
  HolographicGauge,
  GenericPageLayout,
  CleanEditorialLayout,
  DarkEditorialLayout,
  InfoCard,
  SectionTitle,
  StatCard,
  SpeedAccuracyVisual,
  StressPulseVisual,
  FocusRingVisual,
  LogicFlowVisual,
  ToggleControl,
  NetworkNode,
  SignalBars,
  PowerGauge,
  TechCard,
  MatchDial,
  BentoCard,
} from './ModernPDFComponents';

// Refined Styles for Dense Magazine Layout
const styles = StyleSheet.create({
  // ...modernStyles is imported but we add specific text styles
  sectionHeader: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: modernColors.primary,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: modernColors.gridLines,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subHeader: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: modernColors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 9,
    color: modernColors.textSecondary,
    lineHeight: 1.5,
    marginBottom: 8,
    textAlign: 'justify',
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingRight: 8,
  },
  bulletPoint: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: modernColors.primary,
    marginTop: 4,
    marginRight: 6,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  compactCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    minWidth: '45%',
  },
});

// Import shared data interface and dummy data (re-declaring for self-containment in this step, 
// usually would import but staying safe with file-write)
export interface LIAReportData {
    user: { id: string; name: string; email: string; };
    reportDate: string;
    overallScore: { percentage: number; percentileRank: number; classification: string; };
    executiveSummary: { highlights: string[]; developmentAreas: string[]; strategicImplications: string; };
    subtests: { name: string; score: number; percentile: number; timeSpent: string; accuracy: number; interpretation: string; }[];
    cognitiveSynergy: string;
    behavioralObservations: { speedAccuracyBalance: string; attentionPattern: string; problemSolvingApproach: string; stressResponse: string; };
    workStyleAnalysis: { workPreference: string; decisionMaking: string; communicationStyle: string; leadershipPotential: string; teamDynamics: string; };
    environmentalFit: string;
    careerRecommendations: { roles: { title: string; matchScore: number; description: string; }[]; industries: string[]; skillsGap: string[]; motivators: string[]; };
    learningDevelopment: { learningStyle: string; agilityScore: number; recommendedCourses: string[]; actionPlan: { period: string; action: string; }[]; coachingRecommended: boolean; };
    summary: { keyTakeaways: string[]; successFactors: string[]; riskFactors: string[]; nextAssessmentDate: string; methodology: string; };
}

export const dummyLIAData: LIAReportData = {
    user: { id: 'USR-2026-0107', name: 'Alex Johnson', email: 'alex.johnson@example.com' },
    reportDate: new Date().toISOString(),
    overallScore: { percentage: 78.5, percentileRank: 82, classification: 'High Potential' },
    executiveSummary: {
      highlights: [
        'Exceptional processing speed (Top 15%) indicates an ability to handle high-velocity data streams and make rapid preliminary judgments.', 
        'Strong pattern recognition ideal for analytics, suggesting a natural aptitude for identifying market trends or systemic anomalies.', 
        'Robust working memory capacity allows for the simultaneous manipulation of multiple complex variables without cognitive overload.'
      ],
      developmentAreas: [
        'Spatial reasoning requires targeted practice; 3D visualization tasks may initially take longer to process.', 
        'Verbal logic consistency under pressure drops slightly, suggesting a need for structured communication frameworks during crisis moments.'
      ],
      strategicImplications: "Alex's profile suggests a candidate who is ready for high-impact individual contributor roles in data-heavy domains. While their raw cognitive throughput is elite, their influence skills and strategic communication will be the primary lever for career advancement. Organizations should position Alex in roles where 'getting the right answer' is more critical than 'selling the answer' in the short term, while providing mentorship on soft-skill influence."
    },
    subtests: [
      { name: 'Feature Detection', score: 85, percentile: 88, timeSpent: '04:32', accuracy: 90, interpretation: 'Rapid anomaly identification capabilities. Best utilized in quality assurance, fraud detection, or systems monitoring roles where vigilance is key.' },
      { name: 'Verbal Reasoning', score: 75, percentile: 72, timeSpent: '08:45', accuracy: 80, interpretation: 'Strong logical argument evaluation. Can deconstruct complex texts effectively, though may benefit from "bottom-line-up-front" training.' },
      { name: 'Working Memory', score: 82, percentile: 80, timeSpent: '06:20', accuracy: 85, interpretation: 'High information retention. Capable of mental math and holding multi-step instructions without written reference.' },
      { name: 'Numeric Speed', score: 88, percentile: 91, timeSpent: '05:15', accuracy: 92, interpretation: 'Precise quantitative processing. Demonstrates natural affinity for financial modeling and statistical analysis.' },
      { name: 'Spatial Orientation', score: 72, percentile: 68, timeSpent: '09:50', accuracy: 75, interpretation: 'Moderate 3D visualization skills. May require digital tools or physical models to visualize complex architectural or mechanical structures.' },
    ],
    cognitiveSynergy: "The combination of high 'Numeric Speed' and 'Working Memory' creates a powerful 'Real-time Analyst' profile. This synergy allows Alex to not only crunch numbers quickly but also contextually store intermediate results to form a coherent bigger picture. This is rarely seen in candidates who specialize only in one or the other.",
    behavioralObservations: {
      speedAccuracyBalance: 'Prioritizes accuracy slightly over speed, ensuring high-quality output. Very deliberate interaction style. In scenarios requiring "80/20" decisions, Alex may struggle to let go of perfectionism.',
      attentionPattern: 'Sustained focus maintained throughout 45-minute session without performance dips. This indicates high mental stamina and suitability for long, deep-work sessions (e.g., coding, auditing).',
      problemSolvingApproach: 'Methodical decomposition of complex problems rather than intuitive leaps. Alex breaks down challenges into constituent parts, solves them serially, and reconstructs the solution.',
      stressResponse: 'Maintains composure; response time increases slightly but error rate remains stable under time pressure. Likely to become quieter and more focused during crises rather than agitated.'
    },
    workStyleAnalysis: {
      workPreference: 'Thrives in structured, data-rich environments. Prefers clear objectives over ambiguity. Struggles in "blank slate" creative roles without defined constraints.',
      decisionMaking: 'Evidence-based. Likely to delay decisions to gather complete data sets. May need a "bias for action" nudge in low-stakes situations.',
      communicationStyle: 'Concise and factual. May need encouragement to share speculative ideas or brainstorm. Tends to communicate in bullet points and data tables.',
      leadershipPotential: 'Leading by example through technical competence. Potential for operational leadership. Will command respect through subject matter expertise rather than charisma.',
      teamDynamics: 'Steadying influence in chaotic teams. Provides structure and rigorous validation. Often plays the role of the "Devil\'s Advocate" to ground overly optimistic plans.'
    },
    environmentalFit: "Ideal fit for mature organizations with established processes or R&D departments. May experience friction in early-stage startups where 'chaos engineering' is the norm. Best managed by setting clear KPIs and allowing autonomy in execution.",
    careerRecommendations: {
      roles: [
        { title: 'Data Scientist', matchScore: 94, description: 'Perfect alignment with pattern recognition and numeric speed. The role rewards the exact mix of accuracy and memory Alex possesses.' },
        { title: 'Systems Analyst', matchScore: 89, description: 'Leverages systematic problem-solving approach to audit and improve complex technical workflows.' },
        { title: 'Financial Modeler', matchScore: 86, description: 'Utilizes high accuracy and working memory to construct and maintain error-free financial projections.' },
        { title: 'Quality Assurance Lead', matchScore: 83, description: 'Benefit from attention to detail and anomaly detection. A natural fit for finding the "needle in the haystack".' },
        { title: 'Logistics Coordinator', matchScore: 80, description: 'Requires rapid processing and organizational skills to manage complex, moving supply chains.' },
      ],
      industries: ['FinTech', 'Cybersecurity', 'Logistics', 'Biotech', 'Actuarial Science'],
      skillsGap: ['Strategic storytelling (translating data to vision)', 'Cross-functional negotiation', 'Abstract creative thinking without constraints'],
      motivators: ['Technical Mastery', 'Order & Stability', 'Measurable Impact', 'Clear Progression Metrics']
    },
    learningDevelopment: {
      learningStyle: 'Logical-Mathematical: Learns best through classifying, categorizing, and thinking abstractly about patterns. Prefer case studies and data sets over theoretical lectures.',
      agilityScore: 82,
      recommendedCourses: ['Advanced Predictive Modeling (Coursera)', 'Strategic Communication for Analysts (Harvard)', 'Agile Project Management (PMI)'],
      actionPlan: [
        { period: 'Month 1: Foundation', action: 'Complete "Spatial Reasoning" module to address gap. focus on mental rotation exercises. Establish baseline metrics for current role.' },
        { period: 'Month 2: Application', action: 'Lead a small data-cleanup project to apply precision skills. Present findings to a non-technical stakeholder to practice translation.' },
        { period: 'Month 3: Expansion', action: 'Mentor a junior peer to develop communication softness. Take ownership of one "ambiguous" project to stretch comfort zone.' }
      ],
      coachingRecommended: true
    },
    summary: {
      keyTakeaways: ['High analytical potential confirmed.', 'Ready for specialist individual contributor roles.', 'Leadership path requires soft-skills focus.'],
      successFactors: ['Technical precision', 'Reliability under pressure', 'Deep focus capacity'],
      riskFactors: ['Analysis paralysis', 'Resistance to rapid, ambiguous change'],
      nextAssessmentDate: 'July 2026',
      methodology: "This assessment utilizes the TIMCARE Cognitive Battery (TCB-v4), comprised of adaptive subtests normalized against a global cohort of 50,000 professionals. Reliability coefficient: 0.92. Validity coefficient: 0.88."
    }
};

// Radar Chart
const RadarChart = ({ data }: { data: any[] }) => {
  const size = 160; // Increased size
  const center = size / 2;
  const radius = 60; // Increased radius
  const stats = data.map(d => d.score);
  
  const getPoint = (value: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = (value / 100) * radius;
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  };
  const points = stats.map((val, i) => getPoint(val, i, stats.length)).join(' ');
  const fullPoints = stats.map((_, i) => getPoint(100, i, stats.length)).join(' ');

  return (
    <Svg width={size} height={size}>
      {/* Background Web */}
      <Path d={`M${fullPoints} Z`} stroke={modernColors.gridLines} strokeWidth="1" fill="#f8fafc" />
      <Path d={`M${stats.map((_, i) => getPoint(75, i, stats.length)).join(' ')} Z`} stroke={modernColors.gridLines} strokeWidth="0.5" strokeDasharray="3 3" fill="none" />
      <Path d={`M${stats.map((_, i) => getPoint(50, i, stats.length)).join(' ')} Z`} stroke={modernColors.gridLines} strokeWidth="0.5" strokeDasharray="3 3" fill="none" />
      <Path d={`M${stats.map((_, i) => getPoint(25, i, stats.length)).join(' ')} Z`} stroke={modernColors.gridLines} strokeWidth="0.5" strokeDasharray="3 3" fill="none" />
      
      {/* Data Shape */}
      <Path d={`M${points} Z`} stroke={modernColors.primary} strokeWidth="2" fill={modernColors.primary} opacity={0.15} />
      <Path d={`M${points} Z`} stroke={modernColors.primary} strokeWidth="2" fill="none" />
      
      {/* Data Points */}
      {stats.map((val, i) => {
        const [cx, cy] = getPoint(val, i, stats.length).split(',');
        return <Circle key={i} cx={cx} cy={cy} r="3" fill={i % 2 === 0 ? modernColors.primary : modernColors.secondary} stroke="#fff" strokeWidth="1" />;
      })}
    </Svg>
  );
};

// Sidebar Content Component
const SidebarContent = ({ title, summary }: { title: string; summary?: string }) => (
    <View>
        <Text style={modernStyles.heading2}>{title}</Text>
        {summary && <Text style={{ ...modernStyles.paragraph, color: modernColors.textMutedOnDark }}>{summary}</Text>}
        
        <View style={{ marginTop: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
           <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.primary, marginBottom: 6, letterSpacing: 1 }}>QUICK INSIGHT</Text>
           <Text style={{ fontSize: 10, color: modernColors.textOnDark, fontStyle: 'italic', lineHeight: 1.4 }}>
             "Consistency is the hallmark of professional excellence."
           </Text>
        </View>
    </View>
);

const LIAReportPDF: React.FC<{ data?: LIAReportData }> = ({ data = dummyLIAData }) => {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document>
      {/* 1. Cover Page (Full bleed) */}
      <Page size="A4" style={{ backgroundColor: modernColors.headerBg }}>
        <ModernCoverPage
          title="Labor Intelligence Analysis"
          subtitle="TIMCARE ANALYTICS"
          userName={data.user.name}
          date={formatDate(data.reportDate)}
        />
      </Page>

      {/* 2. Executive Summary - The Clean Dossier Layout */}
      <CleanEditorialLayout 
        title="Executive Summary"
        pageNum={2} 
        totalPages={8}
      >
        {/* Hero Section: Score & Classification */}
        <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 9, color: modernColors.primary, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>Performance Classification</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                 <View>
                    <Text style={{ fontSize: 36, fontFamily: 'Helvetica-Bold', color: modernColors.dark, letterSpacing: -1, lineHeight: 1 }}>{data.overallScore.classification.toUpperCase()}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: modernColors.success }} />
                        <Text style={{ fontSize: 11, color: modernColors.textSecondary }}>Top {100 - data.overallScore.percentileRank}% of Global Tech Cohort</Text>
                    </View>
                 </View>
                 {/* Optional: Add the numeric score as a large ghost stamp? Or keep it clean. Let's keep it clean. */}
            </View>
        </View>

            {/* Stat Cards */}
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 32 }}>
                <StatCard label="Percentile" value={`${data.overallScore.percentileRank}th`} subtext="Global Cohort" color={modernColors.primary} variant="light" progress={data.overallScore.percentileRank} />
                <StatCard label="Accuracy" value="92%" subtext="High Precision" color={modernColors.secondary} variant="light" progress={92} />
                <StatCard label="Speed" value="88" subtext="Fast Processing" color={modernColors.accent} variant="light" progress={88} />
            </View>

        {/* Highlights Section */}
        <SectionTitle title="Executive Highlights" />
        <View style={{ marginBottom: 24, padding: 16, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
            {data.executiveSummary.highlights.map((h, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: 12 }}>
                    <Text style={{ color: modernColors.primary, marginRight: 12, fontSize: 12 }}>•</Text>
                    <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.6, flex: 1 }}>{h}</Text>
                </View>
            ))}
        </View>

        {/* Strategy & Growth Split */}
        <View style={{ flexDirection: 'row', gap: 24 }}>
            <View style={{ flex: 1 }}>
                <SectionTitle title="Strategic Analysis" />
                <Text style={{ fontSize: 10, color: modernColors.textSecondary, lineHeight: 1.6, textAlign: 'justify' }}>
                    {data.executiveSummary.strategicImplications}
                </Text>
            </View>

            <View style={{ flex: 1 }}>
                <SectionTitle title="Growth Areas" />
                <View>
                  {data.executiveSummary.developmentAreas.map((h, i) => (
                     <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                         <Text style={{ color: '#fbbf24', marginRight: 12, fontSize: 10 }}>→</Text>
                         <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.4, flex: 1 }}>{h}</Text>
                     </View>
                 ))}
                </View>
            </View>
        </View>
      </CleanEditorialLayout>

      {/* 3. Cognitive Profile */}
      <CleanEditorialLayout
         pageNum={3}
         totalPages={8}
         title="Cognitive Profile"
      >
          {/* Top Section: Chart & Narrative */}
          <View style={{ flexDirection: 'row', gap: 32, marginBottom: 32, alignItems: 'center' }}>
               {/* Chart Container - Centered Visualization */}
               <View style={{ width: 150, alignItems: 'center', justifyContent: 'center' }}>
                   <RadarChart data={data.subtests} />
                   <Text style={{ fontSize: 9, color: modernColors.textSecondary, marginTop: 12, letterSpacing: 1 }}>PROFILE SHAPE</Text>
               </View>

               {/* Summary Narrative */}
               <View style={{ flex: 1 }}>
                   <SectionTitle title="Cognitive Synergy" />
                   <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.6, textAlign: 'justify' }}>
                       {data.cognitiveSynergy}
                   </Text>
                   <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
                       <View>
                           <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: modernColors.dark }}>{data.subtests.length}</Text>
                           <Text style={{ fontSize: 8, color: modernColors.textSecondary, textTransform: 'uppercase' }}>Dimensions</Text>
                       </View>
                       <View>
                           <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: modernColors.primary }}>{Math.max(...data.subtests.map(s => s.percentile))}th</Text>
                           <Text style={{ fontSize: 8, color: modernColors.textSecondary, textTransform: 'uppercase' }}>Peak %</Text>
                       </View>
                   </View>
               </View>
          </View>

          {/* Detailed Dimensions List - 2 Column Grid */}
          <SectionTitle title="Detailed Dimensions" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
               {data.subtests.map((sub, i) => (
                   <View key={i} style={{ 
                       width: '48%', 
                       padding: 12, 
                       borderWidth: 1, 
                       borderColor: '#e2e8f0', 
                       borderRadius: 8,
                       backgroundColor: '#f8fafc'
                   }}>
                       {/* Header: Name & Score */}
                       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                           <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.dark, flex: 1, paddingRight: 8 }}>{sub.name}</Text>
                           <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: i % 2 === 0 ? modernColors.primary : modernColors.secondary }}>{sub.score}</Text>
                       </View>
                       
                       {/* Progress Bar */}
                       <View style={{ height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
                           <View style={{ width: `${sub.score}%`, height: '100%', backgroundColor: i % 2 === 0 ? modernColors.primary : modernColors.secondary }} />
                       </View>

                       {/* Footer: Interpretation & Percentile tag */}
                       <View style={{ gap: 4 }}>
                           <Text style={{ fontSize: 8, color: modernColors.textSecondary, lineHeight: 1.4, marginBottom: 4 }}>{sub.interpretation}</Text>
                           <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                                <View style={{ backgroundColor: i % 2 === 0 ? 'rgba(79, 70, 229, 0.1)' : 'rgba(236, 72, 153, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 8, color: i % 2 === 0 ? modernColors.primary : modernColors.secondary, fontFamily: 'Helvetica-Bold' }}>Top {sub.percentile}%</Text>
                                </View>
                           </View>
                       </View>
                   </View>
               ))}
          </View>
      </CleanEditorialLayout>

      {/* 4. Behavioral Observations */}
      <CleanEditorialLayout
        pageNum={4}
        totalPages={8}
        title="Behavioral Insights"
      >
         <View style={{ marginBottom: 24 }}>
             <SectionTitle title="Behavioral Patterns" />
             <Text style={{ fontSize: 10, color: modernColors.textSecondary, lineHeight: 1.6 }}>
                 Observed behaviors during the assessment provide a window into real-world work habits.
             </Text>
         </View>
         
         {/* 2x2 Grid of Observations */}
         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
             {/* Card 1: Speed vs Accuracy */}
             <View style={{ width: '48%', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' }}>
                 <View style={{ marginBottom: 12 }}>
                    <SpeedAccuracyVisual color={modernColors.primary} />
                 </View>
                 <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.primary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Speed vs Accuracy</Text>
                 <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.5 }}>
                    {data.behavioralObservations.speedAccuracyBalance}
                 </Text>
             </View>

             {/* Card 2: Stress Response */}
             <View style={{ width: '48%', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' }}>
                 <View style={{ marginBottom: 12 }}>
                    <StressPulseVisual color={modernColors.secondary} />
                 </View>
                 <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Stress Response</Text>
                 <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.5 }}>
                    {data.behavioralObservations.stressResponse}
                 </Text>
             </View>

             {/* Card 3: Attention Span */}
             <View style={{ width: '48%', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' }}>
                 <View style={{ marginBottom: 12 }}>
                    <FocusRingVisual color={modernColors.accent} />
                 </View>
                 <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Attention Span</Text>
                 <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.5 }}>
                    {data.behavioralObservations.attentionPattern}
                 </Text>
             </View>
             
             {/* Card 4: Problem Solving */}
             <View style={{ width: '48%', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' }}>
                 <View style={{ marginBottom: 12 }}>
                    <LogicFlowVisual color={modernColors.dark} />
                 </View>
                 <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.dark, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Problem Solving</Text>
                 <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.5 }}>
                    {data.behavioralObservations.problemSolvingApproach}
                 </Text>
             </View>
         </View>

         {/* Workplace Implication - High Contrast Insight Card */}
         <View style={{ marginTop: 24, borderRadius: 16, backgroundColor: modernColors.primary, position: 'relative', overflow: 'hidden' }}>
             {/* Background Pattern - Explicit Opacity on Elements */}
             <Svg style={{ position: 'absolute', right: -30, bottom: -30 }} width="150" height="150" viewBox="0 0 100 100">
                 <Circle cx="50" cy="50" r="40" stroke="#ffffff" strokeWidth="10" fill="none" strokeOpacity={0.1} />
                 <Circle cx="80" cy="20" r="10" fill="#ffffff" fillOpacity={0.1} />
                 <Path d="M 0,100 L 100,0" stroke="#ffffff" strokeWidth="2" strokeOpacity={0.1} />
             </Svg>

             <View style={{ padding: 24, flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
                 {/* Icon */}
                 <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                      <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                          <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                 </View>
                 
                 {/* Text - Width Constrained to prevent overlap */}
                 <View style={{ width: '75%' }}>
                     <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.9)', marginBottom: 8, letterSpacing: 2, textTransform: 'uppercase' }}>STRATEGIC IMPLICATION</Text>
                     <Text style={{ fontSize: 11, color: '#ffffff', lineHeight: 1.7 }}>
                        These patterns suggest a candidate who will prioritize quality over quantity. They are unlikely to cut corners even when pressured, which is a significant asset in compliance or safety-critical roles, but may require management intervention during 'crunch' periods where speed is paramount.
                     </Text>
                 </View>
             </View>
         </View>
      </CleanEditorialLayout>

      {/* 5. Work Style Analysis */}
      <CleanEditorialLayout
        pageNum={5}
        totalPages={8}
        title="Professional Operating System"
      >
          <SectionTitle title="Operating Protocols" />
          
          <View style={{ flexDirection: 'row', gap: 16 }}>
              {/* Card 1: Work Environment */}
              <TechCard title="Environment" style={{ flex: 1 }}>
                  <View style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                      <ToggleControl label="Collaborative Spaces" active={true} />
                      <ToggleControl label="Remote Ready" active={true} />
                  </View>
                  <Text style={{ fontSize: 10, color: modernColors.textPrimary }}>{data.workStyleAnalysis.workPreference}</Text>
              </TechCard>

              {/* Card 2: Decision Making */}
              <TechCard title="Decision Logic" style={{ flex: 1 }}>
                   <View style={{ marginBottom: 12 }}>
                       <View style={{ width: '100%', height: 4, backgroundColor: '#e2e8f0', borderRadius: 2 }}>
                           <View style={{ width: '70%', height: 4, backgroundColor: modernColors.secondary, borderRadius: 2 }} />
                       </View>
                       <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                           <Text style={{ fontSize: 8, color: '#94a3b8' }}>Intuitive</Text>
                           <Text style={{ fontSize: 8, color: '#94a3b8' }}>Analytical</Text>
                       </View>
                   </View>
                   <Text style={{ fontSize: 10, color: modernColors.textPrimary }}>{data.workStyleAnalysis.decisionMaking}</Text>
              </TechCard>
          </View>

          {/* Connection Wires */}
          <View style={{ height: 24, justifyContent: 'center' }}>
             <Svg width="100%" height="24">
                 <Line x1="140" y1="0" x2="140" y2="24" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
                 <Line x1="400" y1="0" x2="400" y2="24" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
                 <Circle cx="140" cy="12" r="3" fill="#cbd5e1" />
                 <Circle cx="400" cy="12" r="3" fill="#cbd5e1" />
             </Svg>
          </View>

          <SectionTitle title="Interaction Network" />
          
          <View style={{ flexDirection: 'row', gap: 16 }}>
                {/* Team Dynamics */}
               <TechCard title="Team Role" style={{ flex: 1 }}>
                    <NetworkNode color={modernColors.primary} />
                    <Text style={{ fontSize: 10, color: modernColors.textPrimary, marginTop: 8 }}>{data.workStyleAnalysis.teamDynamics}</Text>
               </TechCard>

               {/* Communication */}
               <TechCard title="Signal Strength" style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                         <View />
                         <SignalBars strength={4} color={modernColors.accent} />
                    </View>
                    <Text style={{ fontSize: 10, color: modernColors.textPrimary }}>{data.workStyleAnalysis.communicationStyle}</Text>
               </TechCard>
          </View>
          
          {/* Connection Wires */}
          <View style={{ height: 24, justifyContent: 'center' }}>
             <Svg width="100%" height="24">
                 <Line x1="140" y1="0" x2="140" y2="24" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
                 <Line x1="400" y1="0" x2="400" y2="24" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
             </Svg>
          </View>

          <SectionTitle title="Command Capabilities" />

          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
               {/* Leadership Gauge */}
               <View style={{ width: '30%', alignItems: 'center', justifyContent: 'center' }}>
                    <PowerGauge value={85} label="Leadership Potential" color={modernColors.primary} />
               </View>
               
               {/* Environment Fit List */}
               <TechCard title="Optimal Environment Fit" style={{ flex: 1, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <Text style={{ fontSize: 10, color: '#15803d', lineHeight: 1.6 }}>{data.environmentalFit}</Text>
               </TechCard>
          </View>

      </CleanEditorialLayout>

       {/* 6. Career Recommendations */}
      <CleanEditorialLayout
         pageNum={6}
         totalPages={8}
         title="Career Alignment"
         subtitle="Strategic role positioning based on cognitive architecture."
      >
          {/* Row 1: Hero & Score */}
          <View style={{ flexDirection: 'row', gap: 16, height: 160 }}>
              {/* Hero Card: Top Recommendation */}
              <BentoCard flex={2} variant="highlight" style={{ justifyContent: 'space-between' }}>
                  <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#15803d', borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: 'white', letterSpacing: 1 }}>PRIMARY MATCH</Text>
                          </View>
                      </View>
                      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#15803d', marginBottom: 8 }}>
                          {data.careerRecommendations.roles[0].title}
                      </Text>
                      <Text style={{ fontSize: 10, color: modernColors.textSecondary, lineHeight: 1.5 }}>
                          {data.careerRecommendations.roles[0].description}
                      </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#15803d', marginRight: 8 }}>COMPATIBILITY VECTOR</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#bbf7d0' }} />
                  </View>
              </BentoCard>

              {/* Score Card */}
              <BentoCard flex={1} style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8, color: modernColors.textSecondary, letterSpacing: 2, marginBottom: 8 }}>MATCH INDEX</Text>
                  <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width="80" height="80" viewBox="0 0 100 100">
                          <Circle cx="50" cy="50" r="45" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                          <Circle 
                              cx="50" 
                              cy="50" 
                              r="45" 
                              stroke={modernColors.primary} 
                              strokeWidth="8" 
                              fill="none" 
                              strokeLinecap="round" 
                              transform="rotate(-90 50 50)"
                              style={{ strokeDasharray: 283, strokeDashoffset: 283 - (283 * (data.careerRecommendations.roles[0].matchScore / 100)) } as any}
                           />
                      </Svg>
                      <View style={{ position: 'absolute', alignItems: 'center' }}>
                          <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: modernColors.primary }}>{data.careerRecommendations.roles[0].matchScore}</Text>
                      </View>
                  </View>
              </BentoCard>
          </View>

          {/* Row 2: Secondary Options */}
          <View style={{ marginTop: 16 }}>
              <BentoCard title="Alternative Pathways" style={{ padding: 16 }}>
                  <View style={{ gap: 12 }}>
                      {data.careerRecommendations.roles.slice(1).map((role, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i === data.careerRecommendations.roles.length - 2 ? 0 : 12, borderBottomWidth: i === data.careerRecommendations.roles.length - 2 ? 0 : 1, borderBottomColor: '#f1f5f9' }}>
                              <View>
                                  <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: modernColors.textPrimary }}>{role.title}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: modernColors.textSecondary }}>{role.matchScore}%</Text>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === 0 ? modernColors.primary : '#cbd5e1' }} />
                              </View>
                          </View>
                      ))}
                  </View>
              </BentoCard>
          </View>

          {/* Row 3: Parameters & Growth */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
              <BentoCard flex={1} title="Search Parameters">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {data.careerRecommendations.industries.map((ind, i) => (
                          <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f1f5f9', borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, color: modernColors.textSecondary }}>{ind}</Text>
                          </View>
                      ))}
                      {data.careerRecommendations.motivators.map((mot, i) => (
                          <View key={i + 10} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f0f9ff', borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, color: modernColors.primary }}>{mot}</Text>
                          </View>
                      ))}
                  </View>
              </BentoCard>

              <BentoCard flex={1} variant="warning" title="Growth Vector">
                  <View style={{ gap: 6 }}>
                      {data.careerRecommendations.skillsGap.map((s, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={{ fontSize: 10, color: '#be123c', marginRight: 6 }}>•</Text>
                              <Text style={{ fontSize: 9, color: '#be123c' }}>{s}</Text>
                          </View>
                      ))}
                  </View>
              </BentoCard>
          </View>

      </CleanEditorialLayout>

      {/* 7. Learning Plan */}
      <CleanEditorialLayout
         pageNum={7}
         totalPages={8}
         title="Learning Roadmap"
         subtitle="Neural plasticity and skill acquisition protocols."
      >
           {/* Top Section: System Metrics */}
           <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                <View style={{ width: '40%', padding: 16, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: modernColors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 48, fontFamily: 'Helvetica-Bold', color: modernColors.primary, letterSpacing: -2 }}>
                        {data.learningDevelopment.agilityScore}
                    </Text>
                    <Text style={{ fontSize: 7, color: modernColors.textSecondary, letterSpacing: 2, marginTop: 4 }}>AGILITY INDEX</Text>
                    
                    <View style={{ width: '60%', height: 2, backgroundColor: '#e2e8f0', marginTop: 12 }}>
                        <View style={{ width: '85%', height: '100%', backgroundColor: modernColors.primary }} />
                    </View>
                </View>
                
                <View style={{ flex: 1, padding: 16, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center' }}>
                     <Text style={{ fontSize: 8, color: modernColors.accent, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Absorption Style</Text>
                     <Text style={{ fontSize: 10, color: modernColors.textPrimary, lineHeight: 1.6 }}>
                         {data.learningDevelopment.learningStyle}
                     </Text>
                </View>
           </View>

           <SectionTitle title="Upgrade Sequence" />
           
           <View style={{ marginTop: 8, paddingLeft: 8 }}>
                {data.learningDevelopment.actionPlan.map((plan, i) => (
                    <View key={i} style={{ flexDirection: 'row', marginBottom: 0 }}>
                         {/* PCB Trace Visual */}
                         <View style={{ width: 32, alignItems: 'center' }}>
                              <View style={{ width: 2, height: '100%', backgroundColor: i === 2 ? 'transparent' : modernColors.primary, opacity: 0.3 }} />
                              <View style={{ 
                                  width: 12, 
                                  height: 12, 
                                  borderRadius: 6, 
                                  backgroundColor: modernColors.primary, 
                                  position: 'absolute', 
                                  top: 14,
                                  borderWidth: 2,
                                  borderColor: 'white'
                              }} />
                         </View>
                         
                         {/* Content Chip */}
                         <View style={{ flex: 1, paddingBottom: 24 }}>
                              <View style={{ 
                                  backgroundColor: 'white', 
                                  borderWidth: 1, 
                                  borderColor: '#e2e8f0', 
                                  borderRadius: 6, 
                                  padding: 12,
                                  borderLeftWidth: 4,
                                  borderLeftColor: i===0?modernColors.primary:i===1?modernColors.primary:modernColors.primary,
                                  marginLeft: 8
                              }}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.primary }}>PHASE 0{i+1}</Text>
                                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.textSecondary }}>{plan.period}</Text>
                                  </View>
                                  <Text style={{ fontSize: 10, color: modernColors.textSecondary, lineHeight: 1.5 }}>
                                      {plan.action}
                                  </Text>
                              </View>
                         </View>
                    </View>
                ))}
           </View>
           
           <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 16 }}>
               <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
               <Text style={{ fontSize: 8, color: '#94a3b8', marginHorizontal: 12, letterSpacing: 1 }}>DATA INGESTION</Text>
               <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
           </View>
           
           <View style={{ gap: 8 }}>
               {data.learningDevelopment.recommendedCourses.map((c, i) => (
                   <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f9ff' , padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#bae6fd' }}>
                       <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0284c7', marginRight: 8, opacity: 0.7 }}>[SOURCE_{i+1}]</Text>
                       <Text style={{ fontSize: 10, color: '#0369a1', fontFamily: 'Courier' }}>{c}</Text>
                   </View>
               ))}
           </View>

      </CleanEditorialLayout>
      
      {/* 8. Summary */}
      <CleanEditorialLayout
         pageNum={8}
         totalPages={8}
         title="Assessment Verdict"
         subtitle="Final synthesis and forward projections."
      >
           <SectionTitle title="Executive Synthesis" />
           
           <View style={{ gap: 8 }}>
               {data.summary.keyTakeaways.map((t, i) => (
                   <View key={i} style={{ 
                       padding: 12, 
                       borderLeftWidth: 3, 
                       borderLeftColor: modernColors.primary, 
                       backgroundColor: '#f8fafc', 
                       borderWidth: 1, 
                       borderColor: '#e2e8f0', 
                       borderRadius: 4 
                   }}>
                       <Text style={{ fontSize: 9, color: modernColors.textPrimary, lineHeight: 1.5, fontFamily: 'Courier' }}>
                           {'>'} {t}
                       </Text>
                   </View>
               ))}
           </View>
            
           <SectionTitle title="Predictive Analysis" />
           
           <View style={{ flexDirection: 'row', gap: 16 }}>
               {/* Success Panel */}
               <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#bbf7d0', paddingBottom: 8 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#15803d', letterSpacing: 1 }}>SUCCESS MULTIPLIERS</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                        {data.summary.successFactors.map((s, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <View style={{ marginTop: 3 }}>
                                    <SignalBars strength={3} color="#15803d" />
                                </View>
                                <Text style={{ fontSize: 9, color: modernColors.textSecondary, lineHeight: 1.4, flex: 1, marginLeft: 8 }}>{s}</Text>
                            </View>
                        ))}
                    </View>
               </View>

               {/* Risk Panel */}
               <View style={{ flex: 1, backgroundColor: '#fff1f2', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#fecdd3' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#fecdd3', paddingBottom: 8 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#be123c', letterSpacing: 1 }}>RISK FACTORS</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                        {data.summary.riskFactors.map((s, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <View style={{ marginTop: 3 }}>
                                    <View style={{ flexDirection: 'row', gap: 2 }}>
                                        <View style={{ width: 4, height: 10, backgroundColor: '#be123c', opacity: 0.8 }} />
                                        <View style={{ width: 4, height: 10, backgroundColor: '#be123c', opacity: 0.5 }} />
                                        <View style={{ width: 4, height: 10, backgroundColor: '#be123c', opacity: 0.2 }} />
                                    </View>
                                </View>
                                <Text style={{ fontSize: 9, color: modernColors.textSecondary, lineHeight: 1.4, flex: 1, marginLeft: 8 }}>{s}</Text>
                            </View>
                        ))}
                    </View>
               </View>
           </View>

           <View style={{ marginTop: 24 }}>
               <TechCard title="Recalibration Schedule">
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Text style={{ fontSize: 8, color: modernColors.textSecondary, letterSpacing: 1 }}>NEXT EVALUATION DATE</Text>
                            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: modernColors.primary, marginTop: 4 }}>{data.summary.nextAssessmentDate}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 9, color: modernColors.textSecondary, fontStyle: 'italic', marginBottom: 4 }}>
                               Scheduled for performance recalibration.
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: modernColors.success }} />
                                <Text style={{ fontSize: 8, color: modernColors.success, fontFamily: 'Helvetica-Bold' }}>ACTIVE</Text>
                            </View>
                        </View>
                    </View>
               </TechCard>
           </View>
           
           <View style={{ marginTop: 'auto', paddingTop: 24, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
               <Text style={{ fontSize: 6, color: '#94a3b8', textAlign: 'justify', lineHeight: 1.4, marginBottom: 8 }}>
                   {data.summary.methodology}
               </Text>
               <Text style={{ fontSize: 6, color: '#94a3b8', textAlign: 'center' }}>© 2026 TimCare AI Analytics. All rights reserved.</Text>
           </View>
      </CleanEditorialLayout>
    </Document>
  );
};

export default LIAReportPDF;
