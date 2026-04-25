// ============================================
// Data Mapping Types (SCRUM-142)
// ============================================

export type MappingSource = "manual" | "ai_suggested";
export type MappingStatus = "pending" | "approved" | "rejected";
export type ExternalSource = "iSAMS" | "CSV" | "manual" | "other";

export interface DataMapping {
  id: string;
  externalCode: string;
  externalName?: string;
  externalSource: ExternalSource;
  internalCourseId: string;
  internalCode: string;
  internalName: string;
  confidence?: number;
  source: MappingSource;
  status: MappingStatus;
  approvedBy?: string;
  approvedAt?: string;
}

export interface DataMappingPayload {
  externalCode: string;
  externalName?: string;
  externalSource: ExternalSource;
  internalCourseId: string;
}

export interface AIMappingSuggestion {
  externalCode: string;
  externalName: string;
  suggestedInternalCourseId: string;
  suggestedInternalCode: string;
  suggestedInternalName: string;
  confidence: number;
  reasoning: string;
}

export interface AIMappingSuggestPayload {
  unmappedCodes: { externalCode: string; externalName: string }[];
}

export interface DataMappingsResponse {
  data: DataMapping[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
