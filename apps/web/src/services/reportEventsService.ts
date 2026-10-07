import { apiRequest } from "@/lib/api/apiClient";

/** Resources whose download is recorded (the refund policy turns on "a full report was downloaded"). */
export type ReportResource = "pca-report-pdf" | "career-informe-pdf";

/**
 * Best-effort record that the student downloaded a FULL report: POST /api/v1/user/report-events
 * (Node API; reaches it through the /api/:path* catch-all rewrite). Never blocks or breaks the
 * download: no retries, no error toast, every failure swallowed.
 */
export async function trackReportDownloaded(resource: ReportResource): Promise<void> {
  try {
    await apiRequest("/api/v1/user/report-events", {
      method: "POST",
      data: { eventType: "report_downloaded", resource },
      retries: 0,
      showErrorToast: false,
    });
  } catch {
    // Intentionally ignored: telemetry for refund eligibility must never affect the user.
  }
}
