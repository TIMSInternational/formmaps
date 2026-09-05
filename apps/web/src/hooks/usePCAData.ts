import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkPCAStatus,
  getPCAResultByUserId,
  getPCACompetencesByUserId,
} from "@/services/pcaService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";

export interface PCAResults {
  data?: {
    pcaD1?: number;
    pcaI1?: number;
    pcaS1?: number;
    pcaC1?: number;
    [key: string]: unknown;
  };
  overallScore?: number;
  totalScore?: number;
  score?: number;
  [key: string]: unknown;
}

export interface PCACompetences {
  [key: string]: unknown;
}

export interface PCAData {
  pcaCod: string;
  results?: PCAResults | null;
  competences?: PCACompetences | null;
  lastUpdated?: string;
  isCompleted: boolean;
  status?: "not_started" | "in_progress" | "completed" | "not_found";
  overallScore?: number;
  totalScore?: number;
  score?: number;
}

type Language = "english" | "spanish";

// Shared with checkPCAStatus, which reads this key as its own fast path.
const cacheKey = (userId: string) => `pcaData_${userId}`;

export const pcaDataQueryKey = (userId: string, language: Language) =>
  ["pca", "data", userId, language] as const;

function readCache(userId: string): PCAData | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as PCAData) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, data: PCAData | null) {
  try {
    if (data) localStorage.setItem(cacheKey(userId), JSON.stringify(data));
    else localStorage.removeItem(cacheKey(userId));
  } catch {
    // Storage may be unavailable (private mode, quota); the query cache still has it.
  }
}

/**
 * One fetch of the signed-in student's PCA state: status (server verdict first, then
 * TIMS), and — once completed — the DISC results and competences from TIMS.
 */
export async function fetchPCAData(userId: string, language: Language): Promise<PCAData | null> {
  const statusData = await checkPCAStatus(userId, language);
  if (statusData.status === "not_started") return null;

  let results: PCAResults | null = null;
  let competences: PCACompetences | null = null;

  if (statusData.hasResults) {
    // Both are optional decorations of a status the server already settled: a TIMS
    // hiccup leaves them null and the card still reads "completed".
    const [rawResults, rawCompetences] = await Promise.all([
      getPCAResultByUserId(userId, language).catch(() => null),
      getPCACompetencesByUserId(userId, "1", language).catch(() => null),
    ]);
    results = rawResults as PCAResults | null;
    competences = rawCompetences as PCACompetences | null;
  }

  const overallScore = results?.data
    ? (() => {
        const rd = results.data!;
        const scores = [rd.pcaD1 || 0, rd.pcaI1 || 0, rd.pcaS1 || 0, rd.pcaC1 || 0].filter(
          (score) => score > 0
        );
        return scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;
      })()
    : ((results?.overallScore || results?.totalScore || results?.score || 0) as number);

  return {
    pcaCod: statusData.pcaCod || "unknown",
    results,
    competences,
    lastUpdated: statusData.lastActivity || new Date().toISOString(),
    isCompleted: statusData.status === "completed",
    status: statusData.status,
    overallScore,
    totalScore: results?.totalScore as number | undefined,
    score: results?.score as number | undefined,
  };
}

/**
 * The student's PCA state, shared across every component that asks for it.
 *
 * This used to be a per-component useEffect + useState fetch. The dashboard mounts it
 * from StatCards, CareerMatchHub and SkillBridgingCard at once, StrictMode double-runs
 * the effect in dev, and each run fired two TIMS-backed POSTs that apiRequest retried —
 * one page load became dozens of get-result/get-competences calls. react-query
 * deduplicates concurrent mounts into one in-flight request and one cache entry.
 *
 * The localStorage copy is kept: checkPCAStatus reads it as a fast path, and it seeds
 * the query (stale on arrival, so it is refreshed in the background exactly as before).
 */
export function usePCAData() {
  const { user, language } = useGlobalStore();
  const queryClient = useQueryClient();
  const userId = user?.id || "";
  const enabled = !!userId && normalizeRole(user.role) === Roles.STUDENT;
  const key = pcaDataQueryKey(userId, language);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await fetchPCAData(userId, language);
      writeCache(userId, data);
      return data;
    },
    enabled,
    initialData: () => (enabled ? readCache(userId) : null),
    initialDataUpdatedAt: 0, // cached copy is a placeholder: always refresh it on mount
    staleTime: 60 * 1000,
    retry: false, // the reads decide their own retry policy in pcaService
  });

  const pcaData = query.data ?? null;

  const loadPCAData = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const savePCACode = useCallback(
    (pcaCod: string) => {
      if (!userId) return;
      const data: PCAData = { pcaCod, isCompleted: false, status: "in_progress" };
      writeCache(userId, data);
      queryClient.setQueryData(key, data);
    },
    [userId, key, queryClient]
  );

  const clearPCAData = useCallback(() => {
    if (!userId) return;
    writeCache(userId, null);
    queryClient.setQueryData(key, null);
  }, [userId, key, queryClient]);

  return {
    pcaData,
    // Only true while there is nothing to show at all — a cached copy renders immediately.
    loading: enabled && query.isLoading,
    error: query.error ? (query.error as Error).message || "Failed to load PCA data" : null,
    loadPCAData,
    savePCACode,
    clearPCAData,
    refreshPCAData: loadPCAData,
    hasPCA: !!pcaData?.pcaCod,
    isCompleted: pcaData?.isCompleted || false,
  };
}
