"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadGrades } from "@/services/gradeImportService";

export function useGradeImport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ file, schoolId }: { file: File; schoolId: string }) => uploadGrades(file, schoolId),
    onSuccess: () => {
      // Invalidate relevant school-admin caches
      qc.invalidateQueries({ queryKey: ["school-admin", "results"] });
    },
  });
}
