// Timeline Service - Aggregates assessment events from all sources
import {
  TimelineEvent,
  TimelineFilters,
  TimelineEventsResponse,
  TimelineSummary,
  TimelineStats,
  TimelineExportConfig,
  AssessmentType,
  TimelineEventStatus,
  MILEventMetadata,
  PCAEventMetadata,
} from "@/types/timeline";
import { getUserExamHistory, EnhancedUserExamHistory } from "./milService";
import {
  getUserEvaluationGroups,
  EvaluationGroupWithId,
} from "./evaluationService";
import { checkPCAStatus, getPCAResultByUserId } from "./pcaService";

/**
 * MIL Exam type to readable name mapping
 */
const MIL_EXAM_NAMES: Record<number, { en: string; sp: string }> = {
  0: { en: "Pattern Recognition", sp: "Reconocimiento de Patrones" },
  1: { en: "Verbal Reasoning", sp: "Razonamiento Verbal" },
  2: { en: "Working Memory", sp: "Memoria de Trabajo" },
  3: { en: "Numeric Velocity", sp: "Velocidad Numérica" },
  4: { en: "Visual Rotation", sp: "Rotación Visual" },
};

/**
 * Get icon for assessment type
 */
function getIconForType(
  type: AssessmentType,
  eventType?: string
): TimelineEvent["icon"] {
  switch (type) {
    case "pca":
      return "clipboard-check";
    case "mil":
      return "brain";
    case "evaluation":
      return eventType === "invitation_sent" ? "mail" : "users";
    case "course":
      return eventType === "completed" ? "graduation-cap" : "book-open";
    default:
      return "check";
  }
}

/**
 * Get color for status
 */
function getColorForStatus(
  status: TimelineEventStatus
): TimelineEvent["color"] {
  switch (status) {
    case "completed":
      return "green";
    case "in_progress":
      return "blue";
    case "not_started":
      return "gray";
    default:
      return "gray";
  }
}

/**
 * Transform MIL exam data to timeline events
 */
function transformMILToEvents(
  milData: EnhancedUserExamHistory | null,
  language: "en" | "sp" = "en"
): TimelineEvent[] {
  if (!milData || !milData.examStatus) return [];

  const events: TimelineEvent[] = [];

  milData.examStatus.forEach((exam) => {
    // Only include exams that have been started or completed
    if (exam.status === "not_started") return;

    const examName = MIL_EXAM_NAMES[exam.examType]?.[language] || exam.examName;

    // Add completion event if completed
    if (exam.status === "completed" && exam.completionDate) {
      events.push({
        id: `mil_completed_${exam.examId}_${exam.completionDate}`,
        type: "mil",
        eventType: exam.isTimeExpired ? "time_expired" : "completed",
        title:
          language === "sp"
            ? `${examName} Completado`
            : `${examName} Completed`,
        description:
          language === "sp"
            ? `Subtest completado exitosamente`
            : `Subtest completed successfully`,
        timestamp: exam.completionDate,
        status: "completed",
        metadata: {
          examId: exam.examId,
          examName: examName,
          examType: exam.examType,
          scorePercentage: exam.scorePercentage,
          accuracyPercentage: exam.accuracyPercentage,
          totalQuestions: exam.totalQuestions,
          correctAnswers: exam.correctAnswers,
          incorrectAnswers: exam.incorrectAnswers,
          timeSpent: exam.totalTimeSpent,
          isTimeExpired: exam.isTimeExpired,
        },
        icon: "brain",
        color: "green",
      });
    }

    // Add start event if has start date
    if (exam.startDate) {
      events.push({
        id: `mil_started_${exam.examId}_${exam.startDate}`,
        type: "mil",
        eventType: "started",
        title:
          language === "sp" ? `${examName} Iniciado` : `${examName} Started`,
        description:
          language === "sp"
            ? `Comenzaste el subtest de ${examName}`
            : `Started the ${examName} subtest`,
        timestamp: exam.startDate,
        status: exam.status === "completed" ? "completed" : "in_progress",
        metadata: {
          examId: exam.examId,
          examName: examName,
          examType: exam.examType,
          totalQuestions: exam.totalQuestions,
        },
        icon: "play",
        color: exam.status === "completed" ? "green" : "blue",
      });
    }
  });

  return events;
}

/**
 * Transform Evaluation groups to timeline events
 */
function transformEvaluationToEvents(
  evalGroups: EvaluationGroupWithId[],
  language: "en" | "sp" = "en"
): TimelineEvent[] {
  if (!evalGroups || !evalGroups.length) return [];

  const events: TimelineEvent[] = [];
  const groupTypeLabels: Record<string, { en: string; sp: string }> = {
    Parent: { en: "Parent", sp: "Padre/Madre" },
    Teacher: { en: "Teacher", sp: "Profesor" },
    SiblingFriend: { en: "Sibling/Friend", sp: "Hermano/Amigo" },
    Self: { en: "Self", sp: "Autoevaluación" },
  };

  evalGroups.forEach((group) => {
    const groupLabel =
      groupTypeLabels[group.groupType]?.[language] || group.groupType;

    // Group created event
    if (group.createdAt) {
      events.push({
        id: `eval_created_${group.id}_${group.createdAt}`,
        type: "evaluation",
        eventType: "group_created",
        title: language === "sp" ? `Evaluador Agregado` : `Evaluator Added`,
        description:
          language === "sp"
            ? `${group.evaluatorName} (${groupLabel}) agregado como evaluador`
            : `${group.evaluatorName} (${groupLabel}) added as evaluator`,
        timestamp: group.createdAt,
        status: group.isEvaluationCompleted ? "completed" : "in_progress",
        metadata: {
          groupId: group.id,
          groupType: group.groupType,
          evaluatorName: group.evaluatorName,
          evaluatorEmail: group.evaluatorEmail,
          relation: group.relation,
          isCompleted: group.isEvaluationCompleted,
        },
        icon: "user-plus",
        color: group.isEvaluationCompleted ? "green" : "blue",
      });
    }

    // Response received event
    if (group.isEvaluationCompleted && group.createdAt) {
      // Use a slightly later timestamp for completion (estimate)
      const completionDate = new Date(group.createdAt);
      completionDate.setHours(completionDate.getHours() + 1);

      events.push({
        id: `eval_completed_${group.id}`,
        type: "evaluation",
        eventType: "response_received",
        title:
          language === "sp" ? `Evaluación Recibida` : `Evaluation Received`,
        description:
          language === "sp"
            ? `${group.evaluatorName} completó la evaluación 360°`
            : `${group.evaluatorName} completed the 360° evaluation`,
        timestamp: completionDate.toISOString(),
        status: "completed",
        metadata: {
          groupId: group.id,
          groupType: group.groupType,
          evaluatorName: group.evaluatorName,
          evaluatorEmail: group.evaluatorEmail,
          relation: group.relation,
          isCompleted: true,
        },
        icon: "check",
        color: "green",
      });
    }
  });

  return events;
}

/**
 * Transform PCA data to timeline events
 */
async function transformPCAToEvents(
  userId: string,
  language: "en" | "sp" = "en"
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  try {
    const pcaStatus = await checkPCAStatus(
      userId,
      language === "sp" ? "spanish" : "english"
    );

    if (pcaStatus.status === "not_started") {
      return events;
    }

    // PCA started/created event
    if (pcaStatus.lastActivity) {
      events.push({
        id: `pca_started_${pcaStatus.pcaCod || userId}`,
        type: "pca",
        eventType:
          pcaStatus.status === "completed" ? "completed" : "in_progress",
        title:
          language === "sp"
            ? pcaStatus.status === "completed"
              ? "PCA Completado"
              : "PCA En Progreso"
            : pcaStatus.status === "completed"
            ? "PCA Completed"
            : "PCA In Progress",
        description:
          language === "sp"
            ? pcaStatus.status === "completed"
              ? "Análisis de Competencias Personales completado"
              : "Análisis de Competencias Personales en progreso"
            : pcaStatus.status === "completed"
            ? "Personal Competence Analysis completed"
            : "Personal Competence Analysis in progress",
        timestamp: pcaStatus.lastActivity,
        status: pcaStatus.status,
        metadata: {
          pcaCod: pcaStatus.pcaCod,
        },
        icon: "clipboard-check",
        color: getColorForStatus(pcaStatus.status),
      });
    }

    // Results data not injected into timeline — scores are only shown on dedicated results pages
  } catch (error) {
      // error handled silently
    }

  return events;
}

/**
 * Apply filters to timeline events
 */
function applyFilters(
  events: TimelineEvent[],
  filters: TimelineFilters
): TimelineEvent[] {
  let filtered = [...events];

  // Filter by types
  if (filters.types && filters.types.length > 0) {
    filtered = filtered.filter((e) => filters.types!.includes(e.type));
  }

  // Filter by status
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((e) => filters.status!.includes(e.status));
  }

  // Filter by date range
  if (filters.dateRange) {
    if (filters.dateRange.startDate) {
      const startDate = new Date(filters.dateRange.startDate);
      filtered = filtered.filter((e) => new Date(e.timestamp) >= startDate);
    }
    if (filters.dateRange.endDate) {
      const endDate = new Date(filters.dateRange.endDate);
      filtered = filtered.filter((e) => new Date(e.timestamp) <= endDate);
    }
  }

  // Filter by search term
  if (filters.search && filters.search.trim()) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(searchLower) ||
        e.description.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(events: TimelineEvent[]): TimelineSummary {
  const byType: Record<AssessmentType, number> = {
    pca: 0,
    mil: 0,
    evaluation: 0,
    course: 0,
  };

  const byStatus: Record<TimelineEventStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
  };

  let earliest: string | null = null;
  let latest: string | null = null;

  events.forEach((event) => {
    byType[event.type]++;
    byStatus[event.status]++;

    const eventDate = new Date(event.timestamp);
    if (!earliest || eventDate < new Date(earliest)) {
      earliest = event.timestamp;
    }
    if (!latest || eventDate > new Date(latest)) {
      latest = event.timestamp;
    }
  });

  return {
    totalEvents: events.length,
    byType,
    byStatus,
    dateRange: { earliest, latest },
  };
}

/**
 * Main function to get timeline events
 */
export async function getTimelineEvents(
  userId: string,
  filters: TimelineFilters = {},
  language: "en" | "sp" = "en"
): Promise<TimelineEventsResponse> {
  try {
    // Fetch data from all sources in parallel
    const [milData, evalGroups, pcaEvents] = await Promise.all([
      getUserExamHistory(
        userId,
        language === "sp" ? "spanish" : "english"
      ).catch((err) => {
        return null;
      }),
      getUserEvaluationGroups(
        userId,
        language === "sp" ? "spanish" : "english"
      ).catch((err) => {
        return [];
      }),
      transformPCAToEvents(userId, language),
    ]);

    // Transform all data to timeline events
    const milEvents = transformMILToEvents(milData, language);
    const evalEvents = transformEvaluationToEvents(evalGroups, language);

    // Combine all events
    const allEvents: TimelineEvent[] = [
      ...milEvents,
      ...evalEvents,
      ...pcaEvents,
    ];

    // Sort by timestamp (newest first)
    allEvents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply filters
    const filteredEvents = applyFilters(allEvents, filters);

    // Calculate summary (before pagination)
    const summary = calculateSummary(filteredEvents);

    // Apply pagination (if needed)
    const page = 1;
    const limit = 100;
    const paginatedEvents = filteredEvents.slice(
      (page - 1) * limit,
      page * limit
    );

    return {
      events: paginatedEvents,
      summary,
      pagination: {
        page,
        limit,
        total: filteredEvents.length,
        totalPages: Math.ceil(filteredEvents.length / limit),
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get timeline statistics for the stats header
 */
export async function getTimelineStats(
  userId: string,
  language: "en" | "sp" = "en"
): Promise<TimelineStats> {
  try {
    const { events, summary } = await getTimelineEvents(userId, {}, language);

    // Calculate recent activity
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const eventsThisWeek = events.filter(
      (e) => new Date(e.timestamp) >= oneWeekAgo
    ).length;
    const eventsThisMonth = events.filter(
      (e) => new Date(e.timestamp) >= oneMonthAgo
    ).length;

    // Get assessment-specific data
    const pcaEvents = events.filter((e) => e.type === "pca");
    const milEvents = events.filter((e) => e.type === "mil");
    const evalEvents = events.filter((e) => e.type === "evaluation");

    // Calculate MIL stats
    const completedMILEvents = milEvents.filter(
      (e) => e.eventType === "completed"
    );
    const milScores = completedMILEvents
      .map((e) => (e.metadata as MILEventMetadata)?.scorePercentage)
      .filter((s): s is number => typeof s === "number");
    const avgMILScore =
      milScores.length > 0
        ? milScores.reduce((a, b) => a + b, 0) / milScores.length
        : undefined;

    // Use assessmentProgressService for accurate completion data
    let assessmentProgress;
    try {
      const { getUserAssessmentProgress } = await import("./assessmentProgressService");
      assessmentProgress = await getUserAssessmentProgress(userId, language === "sp" ? "spanish" : "english");
    } catch {
      // Fallback if import fails
    }

    const pcaStatus = assessmentProgress?.pcaAssessment?.status || (pcaEvents.some((e) => e.status === "completed") ? "completed" : pcaEvents.length > 0 ? "in_progress" : "not_started");
    const milStatus = assessmentProgress?.milAssessment?.status || (completedMILEvents.length >= 5 ? "completed" : completedMILEvents.length > 0 ? "in_progress" : "not_started");
    const evalStatus = assessmentProgress?.evaluationAssessment?.status || "not_started";
    const evalCompletedCount = assessmentProgress?.evaluationAssessment?.progress?.completedEvaluations ?? 0;
    const evalTotalCount = assessmentProgress?.evaluationAssessment?.progress?.totalGroups ?? 0;

    let completedAssessments = 0;
    if (pcaStatus === "completed") completedAssessments++;
    if (milStatus === "completed") completedAssessments++;
    if (evalStatus === "completed") completedAssessments++;

    return {
      overallCompletion: {
        percentage: Math.round((completedAssessments / 3) * 100),
        completedAssessments,
        totalAssessments: 3,
      },
      recentActivity: {
        lastActivityDate: summary.dateRange.latest,
        eventsThisWeek,
        eventsThisMonth,
      },
      assessmentBreakdown: {
        pca: {
          status: pcaStatus,
          completedAt: pcaEvents.find((e) => e.status === "completed")?.timestamp,
        },
        mil: {
          status: milStatus,
          completedSubtests: assessmentProgress?.milAssessment?.progress?.completedExams ?? completedMILEvents.length,
          totalSubtests: 5,
          averageScore: undefined,
        },
        evaluation: {
          status: evalStatus,
          completedEvaluations: evalCompletedCount,
          totalEvaluators: evalTotalCount,
        },
        courses: {
          enrolled: 0,
          inProgress: 0,
          completed: 0,
          averageProgress: 0,
        },
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Prepare data for CSV export
 */
export function prepareCSVExport(
  events: TimelineEvent[],
  language: "en" | "sp" = "en"
): string {
  const headers =
    language === "sp"
      ? [
          "Fecha",
          "Tipo",
          "Evento",
          "Título",
          "Descripción",
          "Estado",
          "Puntuación",
        ]
      : ["Date", "Type", "Event", "Title", "Description", "Status", "Score"];

  const rows = events.map((event) => {
    const score =
      (event.metadata as MILEventMetadata)?.scorePercentage ||
      (event.metadata as PCAEventMetadata)?.overallScore ||
      "";

    return [
      new Date(event.timestamp).toISOString(),
      event.type.toUpperCase(),
      event.eventType,
      `"${event.title.replace(/"/g, '""')}"`,
      `"${event.description.replace(/"/g, '""')}"`,
      event.status,
      score,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Trigger file download in browser
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export timeline data
 */
export async function exportTimeline(
  userId: string,
  config: TimelineExportConfig
): Promise<void> {
  const language = config.language || "en";

  // Fetch events with filters
  const filters: TimelineFilters = {
    types: config.filterTypes,
    status: config.filterStatus,
    dateRange: config.dateRange,
  };

  const { events } = await getTimelineEvents(userId, filters, language);

  if (config.format === "csv") {
    const csvContent = prepareCSVExport(events, language);
    const filename = `assessment_timeline_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
  } else if (config.format === "pdf") {
    // For PDF, we'll need a backend route or client-side PDF generation
    // For now, trigger CSV download with a note
    const csvContent = prepareCSVExport(events, language);
    const filename = `assessment_timeline_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
  }
}
