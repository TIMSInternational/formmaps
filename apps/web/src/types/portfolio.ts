// ============================================
// Student Portfolio Types (EPIC 6)
// ============================================

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
  totalHours?: number;
  achievements?: string[];
  attachments: PortfolioAttachment[];
  createdAt: string;
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
