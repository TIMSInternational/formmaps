import { apiClient } from "@/lib/api/apiClient";

export async function getCareerInformeBlob(
  studentId: string,
  lang: "es" | "en",
): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url: `/api/v1/career-informe/${studentId}/pdf?lang=${lang}`,
    method: "GET",
    responseType: "blob",
  });
  return response.data;
}
