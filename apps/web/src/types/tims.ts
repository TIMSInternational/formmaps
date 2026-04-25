// ── Request Types ──────────────────────────────────────────

export interface DISCScores {
  d: number;
  i: number;
  s: number;
  c: number;
}

export interface MILScores {
  subtestName: string; // e.g., "Pattern Recognition"
  score: number;       // 0-100
}

export interface ScoreCareersRequest {
  userId: string;
  discScores: DISCScores;
  milScores: MILScores[];
  interests: string[];
  motivators: string[];
}

// ── Response Types (matches actual API) ────────────────────

export interface CareerFitBreakdown {
  discScore: number;        // 0-100
  milScore: number;         // 0-100
  interestsScore: number;   // 0-100
  motivatorsScore: number;  // 0-100
}

export interface ScoredCareer {
  programId: string;           // e.g. "SOC-021"
  programTitle: string;        // e.g. "Sociology"
  cluster: string;             // e.g. "Social_and_Behavioral_Sciences"
  totalScore: number;          // 0-100
  breakdown: CareerFitBreakdown;
  needsBridging: boolean;
  bridgingReasons: string[];   // e.g. ["Reasoning(0%<50%)"]
  bridgingPaths: string;       // semicolon-separated, e.g. "Research methods; Statistics"
}

/** API returns { data: { careers: [...] } } — apiRequest strips the outer axios wrapper */
export interface ScoreCareersResponse {
  data: {
    careers: ScoredCareer[];
  };
}

