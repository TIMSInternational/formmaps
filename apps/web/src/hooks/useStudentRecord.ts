"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getStudentRecord,
  getAssessmentAnswers,
  type RecordLang,
  type StudentRecord,
  type AssessmentAnswers,
  type StudentRecordAssessmentKey,
  getStudentDirectory,
  getStudentNeighbors,
  type StudentDirectory,
  type StudentNeighbors,
} from "@/services/studentRecordService";
import { directoryParams, type DirectoryQuery } from "@/lib/studentDirectory";

export const studentRecordKeys = {
  record: (userId: string, lang: RecordLang) => ["student-record", userId, lang] as const,
  answers: (userId: string, key: StudentRecordAssessmentKey, lang: RecordLang) =>
    ["student-record", userId, "answers", key, lang] as const,
  directory: (q: DirectoryQuery) => ["student-record", "directory", directoryParams(q).toString()] as const,
  neighbors: (userId: string, q: DirectoryQuery) =>
    ["student-record", userId, "neighbors", directoryParams(q, { withPage: false }).toString()] as const,
};

/** The school's students with every assessment's status (keeps the previous page on screen while the next loads). */
export function useStudentDirectory(q: DirectoryQuery) {
  return useQuery<StudentDirectory>({
    queryKey: studentRecordKeys.directory(q),
    queryFn: () => getStudentDirectory(q),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    retry: false,
  });
}

/** Previous / next student in the list the page was opened from. Off when there is no school list (enabled=false). */
export function useStudentNeighbors(userId: string, q: DirectoryQuery, enabled = true) {
  return useQuery<StudentNeighbors>({
    queryKey: studentRecordKeys.neighbors(userId, q),
    queryFn: () => getStudentNeighbors(userId, q),
    enabled: enabled && !!userId,
    staleTime: 1000 * 60,
    retry: false,
  });
}

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
