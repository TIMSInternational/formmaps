// ============================================
// Alert Types (SCRUM-146, SCRUM-151)
// ============================================

export type AlertType =
  | "grade_drop"
  | "missing_assessment"
  | "credit_gap"
  | "no_career_path"
  | "inactive";

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
  byType: Record<AlertType, number>;
  byPriority: Record<AlertPriority, number>;
  newSinceLastLogin: number;
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
  page?: number;
  limit?: number;
}
