"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getStudentRecord,
  getAssessmentAnswers,
  type RecordLang,
  type StudentRecord,
  type AssessmentAnswers,
  type StudentRecordAssessmentKey,
} from "@/services/studentRecordService";

export const studentRecordKeys = {
  record: (userId: string, lang: RecordLang) => ["student-record", userId, lang] as const,
  answers: (userId: string, key: StudentRecordAssessmentKey, lang: RecordLang) =>
    ["student-record", userId, "answers", key, lang] as const,
};

export function useStudentRecord(userId: string, lang: RecordLang) {
  return useQuery<StudentRecord>({
    queryKey: studentRecordKeys.record(userId, lang),
    queryFn: () => getStudentRecord(userId, lang),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
    retry: false,
  });
}

export function useAssessmentAnswers(
  userId: string,
  key: StudentRecordAssessmentKey | null,
  lang: RecordLang,
) {
  return useQuery<AssessmentAnswers>({
    queryKey: studentRecordKeys.answers(userId, key ?? "lia", lang),
    queryFn: () => getAssessmentAnswers(userId, key as StudentRecordAssessmentKey, lang),
    enabled: !!userId && !!key,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
