import { CareerRole } from "@/types/career";
import { apiRequest } from "@/lib/api/apiClient";

// --- API-backed career operations ---

export async function listCareers(query?: {
  search?: string;
  industry?: string;
  interest?: string;
  education?: string;
  location?: string;
  sort?: "recommended" | "match" | "title" | "demand";
}) {
  try {
    const params = new URLSearchParams();
    if (query?.search) params.set("search", query.search);
    if (query?.industry) params.set("industry", query.industry);
    if (query?.education) params.set("education", query.education);
    if (query?.location) params.set("location", query.location);
    if (query?.sort) params.set("sort", query.sort);

    const qs = params.toString();
    const res = await apiRequest<{ data: { careers: CareerRole[]; meta: any } }>(
      `/api/v1/careers${qs ? `?${qs}` : ""}`
    );
    return res.data;
  } catch {
    // Fallback: return empty list if backend unavailable
    return { careers: [] as CareerRole[], meta: { total: 0, page: 1, pageSize: 20 } };
  }
}

export async function getCareerById(id: string): Promise<CareerRole | null> {
  try {
    const res = await apiRequest<{ data: CareerRole }>(`/api/v1/careers/${id}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function getCareerFamilies() {
  try {
    const res = await apiRequest<{ data: any[] }>("/api/v1/careers/families");
    return res.data;
  } catch {
    return [];
  }
}

// Admin operations
export async function adminListCareers() {
  const res = await apiRequest<{ data: CareerRole[] }>("/api/v1/careers/admin");
  return res.data;
}

export async function adminCreateCareer(payload: CareerRole) {
  const res = await apiRequest<{ data: CareerRole }>("/api/v1/careers", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export async function adminUpdateCareer(id: string, payload: Partial<CareerRole>) {
  const res = await apiRequest<{ data: CareerRole }>(`/api/v1/careers/${id}`, {
    method: "PUT",
    data: payload,
  });
  return res.data;
}

export async function adminDeleteCareer(id: string) {
  const res = await apiRequest<{ data: boolean }>(`/api/v1/careers/${id}`, {
    method: "DELETE",
  });
  return res.data;
}

export async function recommendCareers(payload: {
  userId: string;
  context?: any;
}) {
  try {
    const res = await apiRequest<{ data: any }>("/api/v1/careers/score", {
      method: "POST",
      data: payload,
    });
    return res.data;
  } catch {
    return { recommendations: [] };
  }
}

// Favorites (stored server-side)
export async function getFavoritesForUser(userId: string) {
  try {
    const res = await apiRequest<{ data: { favorites: string[] } }>(
      `/api/v1/careers/favorites/${userId}`
    );
    return res.data;
  } catch {
    return { favorites: [] as string[] };
  }
}

export async function addFavorite(userId: string, careerId: string) {
  try {
    const res = await apiRequest<{ data: { success: boolean; favorites: string[] } }>(
      `/api/v1/careers/favorites/${userId}/${careerId}`,
      { method: "POST" }
    );
    return res.data;
  } catch {
    return { success: false, favorites: [] as string[] };
  }
}

export async function removeFavorite(userId: string, careerId: string) {
  try {
    const res = await apiRequest<{ data: { success: boolean; favorites: string[] } }>(
      `/api/v1/careers/favorites/${userId}/${careerId}`,
      { method: "DELETE" }
    );
    return res.data;
  } catch {
    return { success: false, favorites: [] as string[] };
  }
}
