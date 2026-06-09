import { apiClient } from "@/lib/api/apiClient";

export async function getPcaChartBlob(pcaCod: string): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url: `/api/pcaapi/img-report?pcaCod=${encodeURIComponent(pcaCod)}`,
    method: "GET",
    responseType: "blob",
  });
  return response.data;
}
