"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecommendations, type VocationalRecommendations } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

export function RecommendationsPanel({ evaluatedUserId }: { evaluatedUserId: string }) {
  const [data, setData] = useState<VocationalRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setData(await getRecommendations(evaluatedUserId)); }
    catch { setError(true); } finally { setLoading(false); }
  }, [evaluatedUserId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton className="h-48 rounded-xl" />;
  if (error || !data) return <div className={CARD}><p className="text-sm text-gray-500">Couldn&apos;t load recommendations.</p></div>;
  if (data.locked) {
    return <div className={CARD}><p className="text-sm font-semibold text-gray-900 mb-1">Recommendations</p>
      <p className="text-sm text-gray-500">Complete all three assessments (360, PCA, MIL) to see your career recommendations.</p></div>;
  }

  const { guidance, careerMatches, industries } = data;
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-3">Recommendations</p>
      <p className="text-sm text-gray-700 mb-4">{guidance.summary}</p>

      {guidance.recommendedPaths.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Suggested directions</p>
          <ul className="space-y-2">
            {guidance.recommendedPaths.map((p, i) => (
              <li key={i} className="text-sm text-gray-700"><span className="font-medium">{p.title}</span> — {p.why}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Strengths</p>
          <ul className="space-y-1">{guidance.strengths.map((s, i) => <li key={i} className="text-sm text-gray-700">{s}</li>)}{guidance.strengths.length === 0 && <li className="text-sm text-gray-400">—</li>}</ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Growth areas</p>
          <ul className="space-y-1">{guidance.growthAreas.map((s, i) => <li key={i} className="text-sm text-gray-700">{s}</li>)}{guidance.growthAreas.length === 0 && <li className="text-sm text-gray-400">—</li>}</ul>
        </div>
      </div>

      {careerMatches.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top career matches</p>
          <ul className="space-y-1">
            {careerMatches.map((c) => (
              <li key={c.programId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{c.programTitle} <span className="text-gray-400">· {c.cluster}</span></span>
                <span className="font-semibold" style={{ color: "#065292" }}>{Math.round(c.totalScore)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {industries.length > 0 && (
        <p className="text-sm text-gray-700 mb-4"><span className="font-medium">Industries to explore:</span> {industries.slice(0, 5).map((i) => i.value).join(", ")}</p>
      )}

      {guidance.nextSteps.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Next steps</p>
          <ul className="space-y-1 list-disc list-inside">{guidance.nextSteps.map((s, i) => <li key={i} className="text-sm text-gray-700">{s}</li>)}</ul>
        </div>
      )}

      <Link href="/dashboard/university" className="text-sm font-medium" style={{ color: "#065292" }}>Explore matching universities →</Link>
    </div>
  );
}

export default RecommendationsPanel;
