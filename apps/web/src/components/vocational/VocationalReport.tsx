"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  recompute360, recomputeIntegrated,
  type VocationalScoreOutcome, type IntegratedOutcome,
} from "@/services/vocationalReportService";
import { ReadinessChecklist } from "./_components/ReadinessChecklist";
import { IntegratedHeadline } from "./_components/IntegratedHeadline";
import { DimensionBreakdown } from "./_components/DimensionBreakdown";
import { RankingsPanel } from "./_components/RankingsPanel";

export function VocationalReport({ evaluatedUserId, selfView }: { evaluatedUserId: string; selfView?: boolean }) {
  const [score, setScore] = useState<VocationalScoreOutcome | null>(null);
  const [integrated, setIntegrated] = useState<IntegratedOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const s = await recompute360(evaluatedUserId);   // 360 first (integrated reads the persisted 360)
      const i = await recomputeIntegrated(evaluatedUserId);
      setScore(s); setIntegrated(i);
    } catch { setError(true); } finally { setLoading(false); }
  }, [evaluatedUserId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="space-y-4" role="status"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  }
  if (error || !score || !integrated) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center" role="alert">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-gray-700 font-medium mb-4">Couldn&apos;t load this report.</p>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: "#065292" }}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const ready360 = score.status === "ready" ? score : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{selfView ? "My Vocational 360 Report" : "Vocational 360 Report"}</h1>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      <ReadinessChecklist score={score} integrated={integrated} />
      <IntegratedHeadline integrated={integrated} />
      {ready360
        ? (<><DimensionBreakdown dimensions={ready360.dimensionScores} /><RankingsPanel rankings={ready360.rankings} /></>)
        : (<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-sm text-gray-500">The 360 evaluation isn&apos;t ready yet — it needs the student plus at least one other evaluator.</div>)}
    </div>
  );
}

export default VocationalReport;
