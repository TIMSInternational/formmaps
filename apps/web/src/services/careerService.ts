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
  // TODO: Backend GET /api/v1/careers endpoint not implemented yet.
  // Career data comes from the scoring engine (POST /api/v1/careers/score) via useTimsCareerScoring.
  return { careers: [] as CareerRole[], meta: { total: 0, page: 1, pageSize: 20 } };
}

export async function getCareerById(id: string): Promise<CareerRole | null> {
  // TODO: Backend GET /api/v1/careers/:id endpoint not implemented yet
  return null;
}

export async function getCareerFamilies() {
  // TODO: Backend endpoint not implemented yet
  return [];
}

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

export async function getFavoritesForUser(userId: string) {
  // TODO: Backend endpoint not implemented yet
  return { favorites: [] as string[] };
}

export async function addFavorite(userId: string, careerId: string) {
  // TODO: Backend endpoint not implemented yet
  return { success: false, favorites: [] as string[] };
}

export async function removeFavorite(userId: string, careerId: string) {
  // TODO: Backend endpoint not implemented yet
  return { success: false, favorites: [] as string[] };
}
