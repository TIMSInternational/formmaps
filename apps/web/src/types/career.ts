export type LocalizedText = { en?: string; es?: string };

export interface Skill {
  skillId: string;
  name: LocalizedText;
  levelRequired?: "beginner" | "intermediate" | "advanced";
}

export interface SalaryRange {
  min?: number;
  median?: number;
  max?: number;
  currency?: string;
}

export interface DemandStats {
  jobCount?: number;
  postedLast30Days?: number;
  growthPercent?: number;
}

export interface CareerRole {
  id: string;
  familyId: string;
  slug: string;
  title: LocalizedText;
  shortDescription: LocalizedText;
  longDescription?: LocalizedText;
  responsibilities?: LocalizedText[];
  skills?: Skill[];
  educationLevel?: string;
  salaryRange?: SalaryRange;
  demandStats?: DemandStats;
  industries?: string[];
  locationSupport?: string[]; // array of country/state
  iconUrl?: string;
  matchScore?: number;
  published?: boolean;
  remoteEligible?: boolean;
  // TIMS Integration fields
  needsBridging?: boolean;
  bridgingReasons?: string[];
  bridgingPaths?: any[]; // Defined in tims.ts but kept loose here or import it
}
