import { CareerRole } from "@/types/career";
import { apiRequest } from "@/lib/api/apiClient";

// --- Career list/detail operations ---
// Career data is served from the TIMS scoring engine.
// The "list" endpoint returns the full catalog with scores via POST /api/v1/careers/score.
// Individual career detail can be extracted from the scored results.

export async function listCareers(query?: {
  search?: string;
  industry?: string;
  interest?: string;
  education?: string;
  location?: string;
  sort?: "recommended" | "match" | "title" | "demand";
}) {
  // Career listing is handled by the scoring engine — use useTimsCareerScoring hook
  // which calls POST /api/v1/careers/score and returns the full ranked list.
  // This function is kept for backward compatibility but callers should prefer the hook.
  try {
    const res = await apiRequest<any>("api/v1/careers/catalog", { method: "GET" });
    return { careers: (res.data?.careers || []) as CareerRole[], meta: { total: 0, page: 1, pageSize: 20 } };
  } catch {
    return { careers: [] as CareerRole[], meta: { total: 0, page: 1, pageSize: 20 } };
  }
}

export async function getCareerById(id: string): Promise<CareerRole | null> {
  try {
    const res = await apiRequest<any>(`api/v1/careers/${id}`, { method: "GET" });
    return (res.data?.career || res.data || null) as CareerRole | null;
  } catch {
    return null;
  }
}

export async function getCareerFamilies() {
  try {
    const res = await apiRequest<any>("api/v1/careers/clusters", { method: "GET" });
    return res.data?.clusters || res.data || [];
  } catch {
    return [];
  }
}

// --- Admin career operations ---

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

// --- Favorites ---

export async function getFavoritesForUser(userId: string) {
  try {
    const res = await apiRequest<any>(`/api/v1/careers/favorites`, { method: "GET" });
    return { favorites: (res.data?.favorites || []) as string[] };
  } catch {
    return { favorites: [] as string[] };
  }
}

export async function addFavorite(userId: string, careerId: string) {
  try {
    const res = await apiRequest<any>(`/api/v1/careers/favorites/${careerId}`, { method: "POST" });
    return { success: true, favorites: (res.data?.favorites || []) as string[] };
  } catch {
    return { success: false, favorites: [] as string[] };
  }
}

export async function removeFavorite(userId: string, careerId: string) {
  try {
    const res = await apiRequest<any>(`/api/v1/careers/favorites/${careerId}`, { method: "DELETE" });
    return { success: true, favorites: (res.data?.favorites || []) as string[] };
  } catch {
    return { success: false, favorites: [] as string[] };
  }
}
