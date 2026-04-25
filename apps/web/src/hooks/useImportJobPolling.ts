"use client";

import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGradeImportStatus,
  downloadGradeImportFailures,
  type GradeImportStatus,
} from "@/services/gradeImportService";
import {
  getCourseImportStatus,
  downloadCourseImportFailures,
  type CourseImportStatus,
} from "@/services/curriculumService";
import { toast } from "sonner";

type ImportJobStatus = GradeImportStatus | CourseImportStatus;
type ImportType = "grades" | "courses";

function isTerminal(status: string) {
  return status === "completed" || status === "failed";
}

import { useEffect } from "react";

import { curriculumKeys } from "./useCurriculumQueries";

/** Poll a grade or course import job until it reaches a terminal state. */
export function useImportJobPolling(
  type: ImportType,
  jobId: string | null | undefined
) {
  const qc = useQueryClient();

  const queryReq = useQuery<ImportJobStatus>({
    queryKey: ["import-job", type, jobId],
    queryFn: () =>
      type === "grades"
        ? getGradeImportStatus(jobId!)
        : getCourseImportStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as ImportJobStatus | undefined;
      if (!data) return 3000;
      return isTerminal(data.status) ? false : 3000;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (queryReq.data?.status === "completed") {
      if (type === "courses") {
        qc.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
      }
      if (type === "grades") {
        qc.invalidateQueries({ queryKey: ["school-admin", "results"] });
      }
    }
  }, [queryReq.data?.status, type, qc]);

  return queryReq;
}

/** Download the failure report CSV for a completed import job. */
export async function triggerFailureDownload(type: ImportType, jobId: string) {
  try {
    const blob =
      type === "grades"
        ? await downloadGradeImportFailures(jobId)
        : await downloadCourseImportFailures(jobId);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-failures-${type}-${jobId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Failed to download failure report");
  }
}
