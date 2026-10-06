"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listApplications, type TrackedApplication } from "@/services/applicationService";
import { getFavoritesForUser, listCareers } from "@/services/careerService";
import { listCourses } from "@/services/courseService";
import { careerKeys } from "@/hooks/useCareerQueries";
import { courseKeys } from "@/hooks/useCourseQueries";
import { timsKeys } from "@/hooks/useTimsQueries";
import type { CareerRole } from "@/types/career";
import type { Course } from "@/types/course";
import type { ScoreCareersResponse } from "@/types/tims";
import { matchesQuery } from "./search";

export type ContentGroup = "applications" | "careers" | "courses";

export interface ContentResult {
  key: string;
  group: ContentGroup;
  label: string;
  description?: string;
  href: string;
  /** careers only: is it one the student saved (vs. a computed match) */
  saved?: boolean;
}

const DEBOUNCE_MS = 200;
const MAX_PER_GROUP = 5;
const STALE_MS = 2 * 60 * 1000;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function localized(text: CareerRole["title"] | string | undefined, lang: "en" | "es"): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] || text.en || text.es || "";
}

/**
 * The student's own content for Cmd+K (#407): applications, saved/matched
 * careers and courses. Reads existing list endpoints only (lists are fetched
 * once the palette opens, then filtered client-side on the debounced query),
 * and the matched careers come from the scoring cache — the palette never
 * triggers a scoring run of its own.
 */
export function usePaletteContent({
  open,
  query,
  userId,
  enabled,
  language,
}: {
  open: boolean;
  query: string;
  userId: string;
  enabled: boolean;
  language: "en" | "es";
}): { results: ContentResult[]; isSearching: boolean } {
  const debouncedQuery = useDebounced(query, DEBOUNCE_MS);
  const active = open && enabled && !!userId;
  const queryClient = useQueryClient();

  const applications = useQuery({
    queryKey: ["applications", "list", userId],
    queryFn: listApplications,
    enabled: active,
    staleTime: STALE_MS,
  });
  const courses = useQuery({
    queryKey: courseKeys.list(),
    queryFn: () => listCourses(),
    enabled: active,
    staleTime: STALE_MS,
  });
  const catalog = useQuery({
    queryKey: careerKeys.list(undefined),
    queryFn: () => listCareers(undefined),
    enabled: active,
    staleTime: STALE_MS,
  });
  const favorites = useQuery({
    queryKey: ["careers", "favorites", userId],
    queryFn: () => getFavoritesForUser(userId),
    enabled: active,
    staleTime: STALE_MS,
  });

  const results = useMemo<ContentResult[]>(() => {
    if (!active || !debouncedQuery.trim()) return [];
    const out: ContentResult[] = [];

    const apps: TrackedApplication[] = Array.isArray(applications.data) ? applications.data : [];
    out.push(
      ...apps
        .filter((a) => matchesQuery(`${a.name} ${a.location ?? ""}`, debouncedQuery))
        .slice(0, MAX_PER_GROUP)
        .map((a) => ({
          key: `application:${a.id}`,
          group: "applications" as const,
          label: a.name,
          description: a.location,
          href: `/dashboard/applications/${a.id}`,
        })),
    );

    const careerList: CareerRole[] = catalog.data?.careers ?? [];
    const saved = new Set(favorites.data?.favorites ?? []);
    const scored = queryClient.getQueryData<ScoreCareersResponse>(timsKeys.scores(userId));
    const matched = scored?.data?.locked ? [] : scored?.data?.careers ?? [];
    const careers = new Map<string, ContentResult>();
    for (const c of careerList) {
      if (!saved.has(c.id)) continue;
      careers.set(c.id, { key: `career:${c.id}`, group: "careers", label: localized(c.title, language), href: `/careers/${c.id}`, saved: true });
    }
    for (const m of matched) {
      if (careers.has(m.programId)) continue;
      careers.set(m.programId, { key: `career:${m.programId}`, group: "careers", label: m.programTitle, href: `/careers/${m.programId}`, saved: saved.has(m.programId) });
    }
    out.push(
      ...[...careers.values()].filter((c) => c.label && matchesQuery(c.label, debouncedQuery)).slice(0, MAX_PER_GROUP),
    );

    const courseData = courses.data as { courses?: Course[]; Courses?: Course[] } | undefined;
    const courseList: Course[] = courseData?.courses ?? courseData?.Courses ?? [];
    out.push(
      ...courseList
        .filter((c) => matchesQuery(`${c.title} ${c.provider ?? ""}`, debouncedQuery))
        .slice(0, MAX_PER_GROUP)
        .map((c) => ({
          key: `course:${c.id}`,
          group: "courses" as const,
          label: c.title,
          description: c.provider,
          href: `/dashboard/learning/courses?course=${encodeURIComponent(c.id)}`,
        })),
    );
    return out;
  }, [active, debouncedQuery, applications.data, catalog.data, favorites.data, courses.data, queryClient, userId, language]);

  const isSearching =
    active &&
    !!query.trim() &&
    (query !== debouncedQuery || applications.isLoading || courses.isLoading || catalog.isLoading || favorites.isLoading);

  return { results, isSearching };
}
