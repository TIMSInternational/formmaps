import { apiRequest } from "@/lib/api/apiClient";
import {
  University,
  UniversityFilters,
  UniversityListResponse,
  UniversityRecommendationsResponse,
  UniversityRecommendationStats,
  UniversityFavorite,
  UniversityComparison,
  UniversityFilterOptions,
} from "@/types/university";

export async function fetchUniversities(
  filters: UniversityFilters,
  page = 1,
  limit = 20
): Promise<UniversityListResponse> {
  const query = new URLSearchParams();
  query.append("page", page.toString());
  query.append("limit", limit.toString());

  if (filters.search) query.append("search", filters.search);
  if (filters.sort) query.append("sort", filters.sort);
  if (filters.lang) query.append("lang", filters.lang);

  if (filters.countries)
    filters.countries.forEach((c) => query.append("country", c));
  if (filters.types) filters.types.forEach((t) => query.append("type", t));
  if (filters.degrees)
    filters.degrees.forEach((d) => query.append("degree", d));
  if (filters.fields) filters.fields.forEach((f) => query.append("field", f));
  if (filters.campusSizes)
    filters.campusSizes.forEach((s) => query.append("campusSize", s));
  if (filters.settings)
    filters.settings.forEach((s) => query.append("setting", s));

  if (filters.tuitionMin != null)
    query.append("tuitionMin", filters.tuitionMin.toString());
  if (filters.tuitionMax != null)
    query.append("tuitionMax", filters.tuitionMax.toString());
  if (filters.rankingMax != null)
    query.append("rankingMax", filters.rankingMax.toString());
  if (filters.acceptanceRateMin != null)
    query.append("acceptanceRateMin", filters.acceptanceRateMin.toString());

  const json = await apiRequest(`/api/v1/universities?${query.toString()}`);
  const d = json.data || json;
  return {
    universities: d.universities || d.data || [],
    pagination: { total: d.total || 0, page: d.page || 1, limit: d.limit || 20, totalPages: d.totalPages || 1 },
  };
}

export async function fetchUniversityById(
  id: string,
  params?: { lang?: string; includePrograms?: boolean }
): Promise<University | null> {
  const query = new URLSearchParams();
  if (params?.lang) query.append("lang", params.lang);
  if (params?.includePrograms !== undefined)
    query.append("includePrograms", params.includePrograms.toString());

  try {
    const json = await apiRequest(
      `/api/v1/universities/${id}?${query.toString()}`
    );
    return json.data.university;
  } catch (error) {
    if ((error as any)?.response?.status === 404) return null;
    throw error;
  }
}

export async function fetchUniversityRecommendations(
  userId: string, // Kept for interface compatibility, but token determines user
  params?: {
    limit?: number;
    degree?: string[];
    field?: string[];
    country?: string[];
    includeReasons?: boolean;
    lang?: string;
  }
): Promise<UniversityRecommendationsResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.includeReasons !== undefined)
    query.append("includeReasons", params.includeReasons.toString());
  if (params?.lang) query.append("lang", params.lang);

  if (params?.degree) params.degree.forEach((d) => query.append("degree", d));
  if (params?.field) params.field.forEach((f) => query.append("field", f));
  if (params?.country) params.country.forEach((c) => query.append("country", c));

  const json = await apiRequest(
    `/api/v1/universities/recommendations?${query.toString()}`
  );
  return json.data;
}

export async function fetchUniversityRecommendationStats(
  userId: string,
  lang?: string
): Promise<UniversityRecommendationStats> {
  const query = new URLSearchParams();
  if (lang) query.append("lang", lang);

  const json = await apiRequest(
    `/api/v1/universities/recommendations/stats?${query.toString()}`
  );
  return json.data;
}

export async function toggleUniversityFavorite(
  universityId: string,
  action: "save" | "unsave"
): Promise<void> {
  await apiRequest(`/api/v1/universities/${universityId}/favorite`, {
    method: "POST",
    data: { action },
  });
}

export async function fetchUniversityFavorites(
  userId: string,
  params?: { page?: number; limit?: number; lang?: string }
): Promise<UniversityFavorite[]> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.lang) query.append("lang", params.lang);

  const json = await apiRequest(
    `/api/v1/universities/favorites?${query.toString()}`
  );
  return json.data?.favorites || json.data?.data || [];
}

export async function compareUniversities(
  ids: string[],
  lang?: string
): Promise<UniversityComparison> {
  const json = await apiRequest(`/api/v1/universities/compare`, {
    method: "POST",
    data: { universityIds: ids, lang },
  });
  return json.data;
}

export async function fetchUniversityFilterOptions(): Promise<UniversityFilterOptions> {
  const json = await apiRequest(`/api/v1/universities/filters`);
  return json.data;
}
