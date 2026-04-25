
export interface ReportCandidate {
  name: string;
  assessmentDate: string;
  profileImage?: string;
}

export interface ExecutiveSummaryStep {
  number: number;
  text: string;
}

export interface ExecutiveSummary {
  text: string;
  summaryTitle?: string; // e.g. "Influence / Technical precision"
  steps: ExecutiveSummaryStep[];
}

export interface LiaSubtest {
  title: string;
  description: string;
  iconType: 'glasses' | 'gears' | 'math' | 'puzzle' | 'timer' | string;
}

export interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

export interface DiagnosisLegendItem {
  label: string;
  title: string;
  description: string;
  bg: string;
  borderColor: string;
}

export interface MajorItem {
  id?: number;
  title: string; // or name
  description?: string; // or desc
  extra?: string;
}

export interface IntegratedDiagnosis {
  chartData: ChartSegment[];
  legend: DiagnosisLegendItem[];
  majors: {
    perfectFit: MajorItem[];
    highlyRecommended: MajorItem[];
    complementary: string[];
  };
}

export interface NotRecommendedItem {
  category: string; // bold text
  reason: string;   // italic text
}

export interface TimelinePhase {
  phase: string;
  title?: string;
  activities?: string; // text description
  kpi?: string;
  kpiLabel?: string; // "KPI:" or "Request feedback:"
}

export interface OperationalPlanPhase {
  phase: string;
  text: string; // The main description
}

export interface IndicatorItem {
  label: string;
  text: string;
  bold?: string;
  extra?: string;
  boldEnd?: string;
}

export interface TrainingItem {
  label: string;
  text: string;
}

export interface UniversityRow {
  country: 'IT' | 'ES' | 'CO' | string;
  code: string;
  uni: string;
  prog: string;
  type: string;
  req: string;
  high: string;
}

export interface Conclusion {
  text: string;
  nextSteps: string[];
}

export interface AssessmentReportData {
  candidate: ReportCandidate;
  executiveSummary: ExecutiveSummary;
  liaSubtests: LiaSubtest[];
  integratedDiagnosis: IntegratedDiagnosis;
  notRecommended: NotRecommendedItem[];
  explorationPlan: TimelinePhase[];
  operationalPlan: OperationalPlanPhase[];
  indicators: IndicatorItem[];
  training: TrainingItem[];
  universityMapping: UniversityRow[];
  conclusion: Conclusion;
}
