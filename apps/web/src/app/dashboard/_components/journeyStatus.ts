export interface StudentDashboardJourneyData {
  activeCourses?: number;
  portfolioItems?: number;
  careerProfileComplete?: boolean;
  aiSummary?: string | null;
  AiSummary?: string | null;
}

export function isCareerJourneyComplete(data: StudentDashboardJourneyData | null | undefined): boolean {
  return Boolean(data?.careerProfileComplete || data?.aiSummary || data?.AiSummary);
}
