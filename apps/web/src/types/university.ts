// University types and interfaces for University Suggestions module

/**
 * Localized text for bilingual support
 */
export interface LocalizedText {
  en: string;
  es: string;
}

/**
 * University type classification
 */
export type UniversityType = "public" | "private" | "community";

/**
 * Campus size classification
 */
export type CampusSize = "small" | "medium" | "large";

/**
 * Campus setting classification
 */
export type CampusSetting = "urban" | "suburban" | "rural";

/**
 * Degree levels offered
 */
export type DegreeLevel =
  | "Associate"
  | "Bachelor"
  | "Master"
  | "Doctorate"
  | "Certificate";

/**
 * Fields of study
 */
export type FieldOfStudy =
  | "Technology"
  | "Engineering"
  | "Business"
  | "Medicine"
  | "Arts"
  | "Science"
  | "Law"
  | "Education"
  | "Social Sciences"
  | "Humanities";

/**
 * University ranking information
 */
export interface UniversityRanking {
  global?: number;
  national?: number;
  byField?: Record<string, number>;
  source?: string;
  year?: number;
}

/**
 * Tuition information
 */
export interface UniversityTuition {
  inState?: number;
  outOfState?: number;
  international?: number;
  currency: string;
  period: "year" | "semester" | "credit";
}

/**
 * Financial aid information
 */
export interface FinancialAid {
  scholarshipsAvailable: boolean;
  averageAid?: number;
  percentReceivingAid?: number;
  needBased?: boolean;
  meritBased?: boolean;
}

/**
 * Geographic coordinates
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * University program/major
 */
export interface UniversityProgram {
  id: string;
  name: string;
  nameEs?: string;
  degree: DegreeLevel;
  field: FieldOfStudy;
  duration: number; // in years
  credits?: number;
  description?: string;
  descriptionEs?: string;
  careerOutcomes?: string[];
  requiredCompetencies?: string[];
  matchingPersonalityTraits?: ("D" | "I" | "S" | "C")[];
  academicRigorLevel?: number; // 1-10 scale
  isPopular?: boolean;
}

/**
 * Main University entity
 */
export interface University {
  id: string;
  name: string;
  nameEs?: string;
  shortName?: string;
  logo: string;
  coverImage?: string;
  type: UniversityType;

  // Location
  country: string;
  countryName?: LocalizedText;
  state?: string;
  city: string;
  address?: string;
  coordinates?: Coordinates;

  // Rankings & Stats
  ranking: UniversityRanking;
  acceptanceRate?: number;
  graduationRate?: number;
  studentCount?: number;
  facultyCount?: number;
  studentFacultyRatio?: number;
  employmentRate?: number;

  // Academics
  programs: UniversityProgram[];
  majors: string[];
  researchAreas?: string[];
  accreditations?: string[];

  // Financial
  tuition: UniversityTuition;
  financialAid?: FinancialAid;

  // Campus Life
  campusSize?: CampusSize;
  setting?: CampusSetting;
  housing?: boolean;
  athletics?: boolean;
  internationalStudents?: number; // percentage

  // Contact & Links
  website: string;
  admissionsUrl?: string;
  email?: string;
  phone?: string;

  // Metadata
  description: string;
  descriptionEs?: string;
  highlights?: string[];
  highlightsEs?: string[];
  tags?: string[];
  isActive: boolean;
  isFeatured?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Match breakdown for recommendations
 */
export interface MatchBreakdown {
  personalityMatch: number; // PCA-based (0-100)
  academicMatch: number; // MIL-based (0-100)
  careerAlignment: number; // Career goals (0-100)
  preferencesMatch: number; // User preferences (0-100)
}

/**
 * University recommendation with match details
 */
export interface UniversityRecommendation {
  university: University;
  matchScore: number; // 0-100
  matchBreakdown: MatchBreakdown;
  matchReasons: LocalizedText;
  matchReasonsArray: {
    en: string[];
    es: string[];
  };
  recommendedPrograms: (UniversityProgram & { matchScore: number })[];
  rank: number;
}

/**
 * University search/filter parameters
 */
export interface UniversityFilters {
  search?: string;
  countries?: string[];
  types?: UniversityType[];
  degrees?: DegreeLevel[];
  fields?: FieldOfStudy[];
  tuitionMin?: number;
  tuitionMax?: number;
  rankingMax?: number;
  acceptanceRateMin?: number;
  campusSizes?: CampusSize[];
  settings?: CampusSetting[];
  hasFinancialAid?: boolean;
  hasHousing?: boolean;
  sort?: UniversitySortOption;
  lang?: "en" | "es";
}

/**
 * Sort options for university list
 */
export type UniversitySortOption =
  | "recommended"
  | "ranking"
  | "name"
  | "tuition_asc"
  | "tuition_desc"
  | "acceptance"
  | "match_score";

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Pagination response
 */
export interface PaginationResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * University list response
 */
export interface UniversityListResponse {
  universities: University[];
  pagination: PaginationResponse;
  filters?: {
    availableCountries: { code: string; name: string; count: number }[];
    availableFields: string[];
    tuitionRange: { min: number; max: number };
  };
}

/**
 * Recommendations response
 */
export interface UniversityRecommendationsResponse {
  recommendations: UniversityRecommendation[];
  meta: {
    totalMatches: number;
    generatedAt: string;
    basedOn: {
      pcaCompleted: boolean;
      milCompleted: boolean;
      careerPreferences: string[];
      targetDegree?: DegreeLevel;
    };
  };
}

/**
 * Recommendation statistics
 */
export interface UniversityRecommendationStats {
  overview: {
    totalMatches: number;
    excellentMatches: number;
    goodMatches: number;
    averageMatchScore: number;
    topMatchScore: number;
  };
  byDegree: Record<DegreeLevel, { count: number; avgScore: number }>;
  byField: Record<string, { count: number; avgScore: number }>;
  byCountry: Record<string, { count: number; avgScore: number }>;
  topRecommendedFields: { field: string; matchScore: number }[];
  assessmentInsights: {
    strengthsApplied: string[];
    suggestedImprovements: string[];
  };
}

/**
 * User's favorite university
 */
export interface UniversityFavorite {
  universityId: string;
  university: University;
  favoritedAt: string;
  matchScore?: number;
  notes?: string;
}

/**
 * University comparison result
 */
export interface UniversityComparison {
  universities: (University & { matchScore: number })[];
  comparisonFields: string[];
  recommendation: {
    bestOverall: string;
    bestValue: string;
    bestAcademics: string;
  };
}

/**
 * Filter options response
 */
export interface UniversityFilterOptions {
  countries: { code: string; name: string; nameEs?: string; count: number }[];
  types: {
    value: UniversityType;
    label: string;
    labelEs: string;
    count: number;
  }[];
  degrees: {
    value: DegreeLevel;
    label: string;
    labelEs: string;
    count: number;
  }[];
  fields: {
    value: FieldOfStudy;
    label: string;
    labelEs: string;
    count: number;
  }[];
  campusSizes: {
    value: CampusSize;
    label: string;
    labelEs: string;
    count: number;
  }[];
  settings: {
    value: CampusSetting;
    label: string;
    labelEs: string;
    count: number;
  }[];
  tuitionRange: { min: number; max: number; currency: string };
  rankingRange: { min: number; max: number };
}

// ============= Component Props =============

/**
 * UniversityCard component props
 */
export interface UniversityCardProps {
  university: University;
  matchScore?: number;
  matchReasons?: string[];
  isFavorite?: boolean;
  onFavoriteToggle?: (id: string) => void;
  onViewDetails?: (university: University) => void;
  onCompare?: (university: University) => void;
  isCompareSelected?: boolean;
  variant?: "default" | "compact" | "featured";
}

/**
 * UniversityFilters component props
 */
export interface UniversityFiltersProps {
  filters: UniversityFilters;
  onFiltersChange: (filters: UniversityFilters) => void;
  filterOptions?: UniversityFilterOptions;
  isLoading?: boolean;
}

/**
 * UniversityDetailsModal component props
 */
export interface UniversityDetailsModalProps {
  university: University | null;
  isOpen: boolean;
  onClose: () => void;
  matchScore?: number;
  matchBreakdown?: MatchBreakdown;
  matchReasons?: string[];
  recommendedPrograms?: (UniversityProgram & { matchScore: number })[];
  isFavorite?: boolean;
  onFavoriteToggle?: (id: string) => void;
}

/**
 * UniversityStats component props
 */
export interface UniversityStatsProps {
  stats?: UniversityRecommendationStats;
  isLoading?: boolean;
}

/**
 * UniversityGrid component props
 */
export interface UniversityGridProps {
  universities: University[];
  recommendations?: Map<string, UniversityRecommendation>;
  favorites: Set<string>;
  onFavoriteToggle: (id: string) => void;
  onViewDetails: (university: University) => void;
  compareSelected: Set<string>;
  onCompareToggle: (university: University) => void;
  isLoading?: boolean;
  viewMode?: "grid" | "list";
}

/**
 * UniversityCompareModal component props
 */
export interface UniversityCompareModalProps {
  universities: University[];
  isOpen: boolean;
  onClose: () => void;
  comparison?: UniversityComparison;
}
