"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  recompute360, recomputeIntegrated, getDimensionNamesEn, getOptionLabels,
  type VocationalScoreOutcome, type IntegratedOutcome,
} from "@/services/vocationalReportService";
import { ReadinessChecklist } from "./_components/ReadinessChecklist";
import { IntegratedHeadline } from "./_components/IntegratedHeadline";
import { DimensionBreakdown } from "./_components/DimensionBreakdown";
import { RankingsPanel } from "./_components/RankingsPanel";
import { RecommendationsPanel } from "./_components/RecommendationsPanel";
import { isPaymentRequiredError } from "@/lib/api/apiClient";
import { ResultsLockedState } from "@/components/independent-student/ResultsLockedState";

// Audit F: both recompute POSTs used to run on EVERY view (each re-scores and re-persists). The result is
// kept per student for a few minutes in this browser tab; Refresh / Try again always recompute.
const REPORT_CACHE_MS = 5 * 60 * 1000;
const reportCache = new Map<string, { at: number; score: VocationalScoreOutcome; integrated: IntegratedOutcome }>();
/** Test hook: forget every cached report. */
export function resetVocationalReportCache() { reportCache.clear(); }

export function VocationalReport({ evaluatedUserId, selfView }: { evaluatedUserId: string; selfView?: boolean }) {
  const { t, i18n } = useTranslation();
  const isEnglish = !(i18n?.language ?? "").toLowerCase().startsWith("es");
  const [score, setScore] = useState<VocationalScoreOutcome | null>(null);
  const [namesEn, setNamesEn] = useState<Record<string, string>>({});
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>({});
  const [integrated, setIntegrated] = useState<IntegratedOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // audit 2026-10-09 C18: 402 = paywall (student without paid results) — an unlock state, not "try again".
  const [locked, setLocked] = useState(false);

  const load = useCallback(async (force = false) => {
    const cached = reportCache.get(evaluatedUserId);
    if (!force && cached && Date.now() - cached.at < REPORT_CACHE_MS) {
      setScore(cached.score); setIntegrated(cached.integrated); setError(false); setLocked(false); setLoading(false);
      return;
    }
    setLoading(true); setError(false); setLocked(false);
    try {
      const s = await recompute360(evaluatedUserId);   // 360 first (integrated reads the persisted 360)
      const i = await recomputeIntegrated(evaluatedUserId);
      setScore(s); setIntegrated(i);
      reportCache.set(evaluatedUserId, { at: Date.now(), score: s, integrated: i });
    } catch (err) {
      // Only successes are cached: a paywall (402) or a failure is asked again next time.
      if (isPaymentRequiredError(err)) setLocked(true); else setError(true);
    } finally { setLoading(false); }
  }, [evaluatedUserId]);

  useEffect(() => { load(); }, [load]);

  // English dimension names come from the instrument catalog (stored scores carry only nameEs). Best-effort:
  // on failure the report simply keeps the Spanish names.
  useEffect(() => {
    if (!isEnglish) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => getDimensionNamesEn())
      .then((names) => { if (!cancelled && names) setNamesEn(names); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isEnglish]);

  // Option labels for the rankings (best-effort: on failure the panel shows the raw values).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getOptionLabels(isEnglish ? "en" : "es"))
      .then((labels) => { if (!cancelled && labels) setOptionLabels(labels); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isEnglish]);

  if (loading) {
    return <div className="space-y-4" role="status"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  }
  if (locked) {
    return <ResultsLockedState />;
  }
  if (error || !score || !integrated) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center" role="alert">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-gray-700 font-medium mb-4">{t("evaluation.vocational.report.loadError")}</p>
        <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: "#102B47" }}>
          <RefreshCw className="h-4 w-4" /> {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  const ready360 = score.status === "ready" ? score : null;
  const dimensions = (ready360?.dimensionScores ?? []).map((d) => ({ ...d, nameEn: d.nameEn ?? namesEn[d.key] ?? null }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{selfView ? t("evaluation.vocational.report.titleMine") : t("evaluation.vocational.report.title")}</h1>
        <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="h-4 w-4" /> {t("common.refresh")}
        </button>
      </div>
      <ReadinessChecklist score={score} integrated={integrated} />
      <IntegratedHeadline integrated={integrated} />
      {ready360
        ? (<><DimensionBreakdown dimensions={dimensions} /><RankingsPanel rankings={ready360.rankings} labels={optionLabels} /></>)
        : (<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-sm text-gray-500">{t("evaluation.vocational.report.notReady360")}</div>)}
      <RecommendationsPanel evaluatedUserId={evaluatedUserId} />
    </div>
  );
}

export default VocationalReport;
