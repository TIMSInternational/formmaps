import { apiClient } from "@/lib/api/apiClient";

export async function getPcaChartBlob(pcaCod: string): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url: `/api/pcaapi/img-report?pcaCod=${encodeURIComponent(pcaCod)}`,
    method: "GET",
    responseType: "blob",
  });
  return response.data;
}

/** Curated TIMS PCA report types exposed for download (see pcaReportService). */
export type PcaReportType = "pca" | "gd" | "coaching";

/**
 * Fetch a full PCA report PDF (Informe PCA / Guía de Desarrollo / Coaching)
 * from TIMS via our backend proxy, as a Blob ready to download.
 */
export async function getPcaReportBlob(
  pcaCod: string,
  type: PcaReportType,
  lang: "es" | "en",
): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url: `/api/pcaapi/report-pdf?pcaCod=${encodeURIComponent(pcaCod)}&type=${encodeURIComponent(type)}&lang=${encodeURIComponent(lang)}`,
    method: "GET",
    responseType: "blob",
  });
  return response.data;
}
