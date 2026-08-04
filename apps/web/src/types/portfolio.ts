// ============================================
// Student Portfolio Types (EPIC 6)
// ============================================

export type StudentActivityCategory =
  | "academic"
  | "athletic"
  | "arts"
  | "community_service"
  | "work"
  | "leadership"
  | "other";

export type PortfolioItemType =
  | "extracurricular"
  | "award"
  | "project"
  | "volunteer"
  | "work_experience"
  | "certification";

export interface PortfolioItem {
  id: string;
  studentId: string;
  type: PortfolioItemType;
  title: string;
  organization?: string;
  description: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  role?: string;
  hoursPerWeek?: number;
  weeksPerYear?: number;
  activityCategory?: StudentActivityCategory;
  totalHours?: number;
  achievements?: string[];
  attachments: PortfolioAttachment[];
  createdDate: string;
  updatedAt: string;
}

export interface PortfolioAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface PortfolioItemPayload {
  type: PortfolioItemType;
  title: string;
  organization?: string;
  description: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  role?: string;
  hoursPerWeek?: number;
  weeksPerYear?: number;
  activityCategory?: StudentActivityCategory;
  totalHours?: number;
  achievements?: string[];
}

export interface PortfolioSummary {
  totalItems: number;
  byType: Record<PortfolioItemType, number>;
  totalVolunteerHours: number;
  recentItems: PortfolioItem[];
}

export interface PortfolioResponse {
  data: PortfolioItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
