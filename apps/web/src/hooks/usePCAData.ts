import { useState, useEffect } from "react";
import {
  getPCAResult,
  getPCACompetences,
  checkPCAStatus,
  getPCAResultByUserId,
  getPCACompetencesByUserId,
} from "@/services/pcaService";
import { useGlobalStore } from "@/store/useGlobalStore";

export interface PCAData {
  pcaCod: string;
  results?: any;
  competences?: any;
  lastUpdated?: string;
  isCompleted: boolean;
  status?: "not_started" | "in_progress" | "completed" | "not_found";
  overallScore?: number;
  totalScore?: number;
  score?: number;
}

export function usePCAData() {
  const { user, language } = useGlobalStore();
  const [pcaData, setPcaData] = useState<PCAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPCAData = async (forcePcaCod?: string) => {
    if (!user?.id && !forcePcaCod) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check PCA status using the new backend API
      const statusData = await checkPCAStatus(user?.id || "unknown", language);

      if (statusData.status === "not_started") {
        setPcaData(null);
        setLoading(false);
        return;
      }

      // If user has PCA evaluation, try to get results and competences
      let results = null;
      let competences = null;

      if (statusData.hasResults && user?.id) {
        try {
          [results, competences] = await Promise.all([
            getPCAResultByUserId(user.id, language).catch(() => null),
            getPCACompetencesByUserId(user.id, "1", language).catch(() => null),
          ]);
        } catch (err) {
      // error handled silently
    }
      }

      const data: PCAData = {
        pcaCod: statusData.pcaCod || "unknown",
        results,
        competences,
        lastUpdated: statusData.lastActivity || new Date().toISOString(),
        isCompleted: statusData.status === "completed",
        status: statusData.status,
        // Calculate overall score from PCA dimensions if available
        overallScore: results?.data
          ? (() => {
              const d = results.data.pcaD1 || 0;
              const i = results.data.pcaI1 || 0;
              const s = results.data.pcaS1 || 0;
              const c = results.data.pcaC1 || 0;
              const scores = [d, i, s, c].filter((score) => score > 0);
              return scores.length > 0
                ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                : 0;
            })()
          : results?.overallScore || results?.totalScore || results?.score || 0,
        totalScore: results?.totalScore,
        score: results?.score,
      };

      setPcaData(data);

      // Cache the data with user ID as key
      if (user?.id) {
        localStorage.setItem(`pcaData_${user.id}`, JSON.stringify(data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PCA data");
    } finally {
      setLoading(false);
    }
  };

  const savePCACode = (pcaCod: string) => {
    if (!user?.id) return;

    const data: PCAData = {
      pcaCod,
      isCompleted: false,
      status: "in_progress",
    };

    setPcaData(data);
    localStorage.setItem(`pcaData_${user.id}`, JSON.stringify(data));
  };

  const clearPCAData = () => {
    if (!user?.id) return;

    localStorage.removeItem(`pcaData_${user.id}`);
    setPcaData(null);
  };

  const refreshPCAData = () => {
    if (!user?.id) {
      loadPCAData();
      return;
    }

    const cachedData = localStorage.getItem(`pcaData_${user.id}`);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setPcaData(parsed);
        // Refresh from API in background
        loadPCAData();
      } catch (e) {
        // Invalid cached data, reload from API
        loadPCAData();
      }
    } else {
      loadPCAData();
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    // Try to load cached data first
    const cachedData = localStorage.getItem(`pcaData_${user.id}`);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setPcaData(parsed);
        setLoading(false);

        // Refresh from API in background
        loadPCAData();
      } catch (e) {
        // Invalid cached data, load from API
        loadPCAData();
      }
    } else {
      loadPCAData();
    }
  }, [user?.id]);

  return {
    pcaData,
    loading,
    error,
    loadPCAData,
    savePCACode,
    clearPCAData,
    refreshPCAData,
    hasPCA: !!pcaData?.pcaCod,
    isCompleted: pcaData?.isCompleted || false,
  };
}
