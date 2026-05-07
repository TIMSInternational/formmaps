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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get token
const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

// Helper for headers
const getHeaders = (isMultipart = false) => {
  const headers: HeadersInit = {
    Authorization: `Bearer ${getToken()}`,
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

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

  // Arrays need specific handling usually, but URLSearchParams handles multiple keys
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

  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch universities");
  const json = await response.json();
  return json.data;
}

export async function fetchUniversityById(
  id: string,
  params?: { lang?: string; includePrograms?: boolean }
): Promise<University | null> {
  const query = new URLSearchParams();
  if (params?.lang) query.append("lang", params.lang);
  if (params?.includePrograms !== undefined)
    query.append("includePrograms", params.includePrograms.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities/${id}?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Failed to fetch university details");
  }
  const json = await response.json();
  return json.data.university;
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

  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities/recommendations?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch recommendations");
  const json = await response.json();
  return json.data;
}

export async function fetchUniversityRecommendationStats(
  userId: string,
  lang?: string
): Promise<UniversityRecommendationStats> {
  const query = new URLSearchParams();
  if (lang) query.append("lang", lang);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities/recommendations/stats?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch recommendation stats");
  const json = await response.json();
  return json.data;
}

export async function toggleUniversityFavorite(
  universityId: string,
  action: "save" | "unsave"
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities/${universityId}/favorite`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ action }),
    }
  );

  if (!response.ok) throw new Error("Failed to update favorite status");
}

export async function fetchUniversityFavorites(
  userId: string,
  params?: { page?: number; limit?: number; lang?: string }
): Promise<UniversityFavorite[]> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.lang) query.append("lang", params.lang);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/universities/favorites?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch favorites");
  const json = await response.json();
  return json.data?.favorites || json.data?.data || [];
}

export async function compareUniversities(
  ids: string[],
  lang?: string
): Promise<UniversityComparison> {
  const response = await fetch(`${API_BASE_URL}/api/v1/universities/compare`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ universityIds: ids, lang }),
  });

  if (!response.ok) throw new Error("Failed to compare universities");
  const json = await response.json();
  return json.data;
}

export async function fetchUniversityFilterOptions(): Promise<UniversityFilterOptions> {
  const response = await fetch(`${API_BASE_URL}/api/v1/universities/filters`, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error("Failed to fetch filter options");
  const json = await response.json();
  return json.data;
}
