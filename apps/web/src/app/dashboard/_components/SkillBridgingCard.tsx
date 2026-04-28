"use client";

import { useMemo } from "react";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BridgingGap {
  skill: string;
  detail: string;
  recommendedPath: string;
}

function parseBridgingReason(reason: string): {
  skill: string;
  detail: string;
} {
  const match = reason.match(/^(\w+)\((.+)\)$/);
  if (match) return { skill: match[1], detail: match[2] };
  return { skill: reason, detail: "" };
}

export function SkillBridgingCard({ className }: { className?: string }) {
  const { data: timsData, isLoading, hasAssessments } = useTimsCareerScoring();

  const gaps = useMemo<BridgingGap[]>(() => {
    const careers = timsData?.data?.careers ?? [];
    const top5 = careers.slice(0, 5);

    const seen = new Set<string>();
    const result: BridgingGap[] = [];

    for (const career of top5) {
      if (!career.needsBridging) continue;
      const paths = career.bridgingPaths
        ? career.bridgingPaths.split(";").map((p) => p.trim())
        : [];

      for (const reason of career.bridgingReasons) {
        const parsed = parseBridgingReason(reason);
        if (seen.has(parsed.skill)) continue;
        seen.add(parsed.skill);
        result.push({
          skill: parsed.skill,
          detail: reason,
          recommendedPath: paths[0] || "",
        });
      }
    }

    return result.slice(0, 4);
  }, [timsData]);

  if (isLoading) {
    return (
      <Card className={cn("p-6", className)}>
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (!hasAssessments) return null;

  return (
    <Card className={cn("p-6 flex flex-col rounded-2xl border-border", className)}>
      <h2 className="text-lg font-semibold text-foreground mb-4">
        Skills to Develop
      </h2>

      {gaps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
          <p className="text-sm font-medium text-emerald-700">
            You&apos;re on track!
          </p>
          <p className="text-xs text-slate-500 mt-1">
            No skill gaps detected in your top matches.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          {gaps.map((gap) => (
            <div
              key={gap.skill}
              className="flex items-start gap-3 rounded-lg bg-amber-50/60 border border-amber-100 p-3"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {gap.skill}
                </p>
                <p className="text-xs text-slate-500 truncate">{gap.detail}</p>
                {gap.recommendedPath && (
                  <p className="text-xs text-blue-600 mt-1">
                    {gap.recommendedPath}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <Link
          href="/dashboard/career-paths"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-4"
        >
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </Card>
  );
}
