// Timeline types and interfaces for assessment progress tracking

/**
 * Assessment types that can appear in the timeline
 */
export type AssessmentType = "pca" | "mil" | "evaluation" | "course";

/**
 * Status values for timeline events
 */
export type TimelineEventStatus = "not_started" | "in_progress" | "completed";

/**
 * Specific event types for each assessment category
 */
export type PCAEventType = "created" | "in_progress" | "completed";
export type MILEventType = "started" | "completed" | "time_expired";
export type EvaluationEventType =
  | "group_created"
  | "invitation_sent"
  | "response_received"
  | "completed";
export type CourseEventType =
  | "enrolled"
  | "progress_updated"
  | "module_completed"
  | "completed"
  | "dropped";

export type TimelineEventType =
  | PCAEventType
  | MILEventType
  | EvaluationEventType
  | CourseEventType;

/**
 * Icon names used in the timeline
 */
export type TimelineIcon =
  | "clipboard-check"
  | "brain"
  | "users"
  | "book-open"
  | "play"
  | "check"
  | "clock"
  | "mail"
  | "user-plus"
  | "graduation-cap";

/**
 * Color variants for timeline events
 */
export type TimelineColor =
  | "green"
  | "blue"
  | "yellow"
  | "red"
  | "gray"
  | "purple";

/**
 * Metadata specific to PCA events
 */
export interface PCAEventMetadata {
  pcaCod?: string;
  overallScore?: number;
  scores?: {
    dominance: number;
    influence: number;
    steadiness: number;
    conscientiousness: number;
  };
}

/**
 * Metadata specific to MIL/LIA events
 */
export interface MILEventMetadata {
  examId: string;
  examName: string;
  examType: number;
  scorePercentage?: number;
  accuracyPercentage?: number;
  totalQuestions?: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
  timeSpent?: string;
  isTimeExpired?: boolean;
}

/**
 * Metadata specific to 360° Evaluation events
 */
export interface EvaluationEventMetadata {
  groupId: string;
  groupType: "Parent" | "Teacher" | "SiblingFriend" | "Self";
  evaluatorName?: string;
  evaluatorEmail?: string;
  relation?: string;
  isCompleted?: boolean;
}

/**
 * Metadata specific to Course events
 */
export interface CourseEventMetadata {
  enrollmentId?: string;
  courseId: string;
  courseTitle: string;
  courseThumbnail?: string;
  progress?: number;
  completedModules?: number;
  totalModules?: number;
}

/**
 * Union type for all event metadata
 */
export type TimelineEventMetadata =
  | PCAEventMetadata
  | MILEventMetadata
  | EvaluationEventMetadata
  | CourseEventMetadata;

/**
 * Main timeline event interface
 */
export interface TimelineEvent {
  id: string;
  type: AssessmentType;
  eventType: TimelineEventType;
  title: string;
  description: string;
  timestamp: string; // ISO 8601 date string
  status: TimelineEventStatus;
  metadata: TimelineEventMetadata;
  icon: TimelineIcon;
  color: TimelineColor;
}

/**
 * Filter options for timeline
 */
export interface TimelineFilters {
  types?: AssessmentType[];
  status?: TimelineEventStatus[];
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  search?: string;
}

/**
 * Summary statistics for timeline
 */
export interface TimelineSummary {
  totalEvents: number;
  byType: Record<AssessmentType, number>;
  byStatus: Record<TimelineEventStatus, number>;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

/**
 * Pagination info for timeline
 */
export interface TimelinePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response structure for timeline events
 */
export interface TimelineEventsResponse {
  events: TimelineEvent[];
  summary: TimelineSummary;
  pagination: TimelinePagination;
}

/**
 * Export configuration
 */
export interface TimelineExportConfig {
  format: "pdf" | "csv";
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  filterTypes?: AssessmentType[];
  filterStatus?: TimelineEventStatus[];
  includeDetails?: boolean;
  language?: "en" | "sp";
}

/**
 * Statistics for timeline header
 */
export interface TimelineStats {
  overallCompletion: {
    percentage: number;
    completedAssessments: number;
    totalAssessments: number;
  };
  recentActivity: {
    lastActivityDate: string | null;
    eventsThisWeek: number;
    eventsThisMonth: number;
  };
  assessmentBreakdown: {
    pca: {
      status: TimelineEventStatus;
      completedAt?: string;
      score?: number;
    };
    mil: {
      status: TimelineEventStatus;
      completedSubtests: number;
      totalSubtests: number;
      averageScore?: number;
    };
    evaluation: {
      status: TimelineEventStatus;
      completedEvaluations: number;
      totalEvaluators: number;
    };
    courses: {
      enrolled: number;
      inProgress: number;
      completed: number;
      averageProgress: number;
    };
  };
}

/**
 * Props for timeline components
 */
export interface TimelineViewProps {
  events: TimelineEvent[];
  isLoading?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}

export interface TimelineFiltersProps {
  filters: TimelineFilters;
  onFiltersChange: (filters: TimelineFilters) => void;
  availableTypes?: AssessmentType[];
}

export interface TimelineExportProps {
  events: TimelineEvent[];
  filters: TimelineFilters;
  onExport: (config: TimelineExportConfig) => Promise<void>;
  isExporting?: boolean;
}

export interface TimelineEventCardProps {
  event: TimelineEvent;
  onClick?: () => void;
  isExpanded?: boolean;
}
