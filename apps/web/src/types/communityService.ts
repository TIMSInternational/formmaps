// ============================================
// Community Service Hours Types
// ============================================

export type CommunityServiceStatus = "pending" | "verified" | "rejected";

export interface CommunityServiceEntry {
  id: string;
  organization: string;
  description: string;
  hours: number;
  date: string;
  supervisorName?: string;
  supervisorEmail?: string;
  status: CommunityServiceStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  note?: string;
  createdAt: string;
}

export interface CommunityServiceSummary {
  totalHoursRequired: number;
  totalHoursLogged: number;
  totalHoursVerified: number;
  entries: CommunityServiceEntry[];
}

export interface CommunityServicePayload {
  organization: string;
  description: string;
  hours: number;
  date: string;
  supervisorName?: string;
  supervisorEmail?: string;
}

export interface CommunityServiceUpdatePayload {
  organization?: string;
  description?: string;
  hours?: number;
  date?: string;
  supervisorName?: string;
  supervisorEmail?: string;
}

export interface CommunityServiceVerifyPayload {
  status: "verified" | "rejected";
  note?: string;
}
