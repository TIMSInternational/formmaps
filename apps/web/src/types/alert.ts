// ============================================
// Alert Types (SCRUM-146, SCRUM-151)
// ============================================

// The types the alert generator actually writes (api alertGenerationService GENERATED_TYPES).
// The old list (grade_drop, credit_gap, …) matched nothing, so the type filter returned no
// rows and every alert rendered as "General".
export type AlertType =
  | "low_gpa"
  | "credit_deficit"
  | "stalled_assessments"
  | "overdue_followup";

export const ALERT_TYPES: AlertType[] = ["low_gpa", "credit_deficit", "stalled_assessments", "overdue_followup"];

export type AlertPriority = "critical" | "high" | "medium" | "low";
export type AlertStatus = "active" | "acknowledged" | "dismissed";

export interface Alert {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  data: Record<string, unknown>;
  status: AlertStatus;
  notes?: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unread: number;
  byPriority: Record<AlertPriority, number>;
}

export interface AlertUpdatePayload {
  status: AlertStatus;
  notes?: string;
}

export interface AlertBulkActionPayload {
  alertIds: string[];
  action: "acknowledge" | "dismiss";
  notes?: string;
}

export interface AlertsResponse {
  data: Alert[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AlertsQueryParams {
  type?: AlertType;
  priority?: AlertPriority;
  status?: AlertStatus;
  studentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}
