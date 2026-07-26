"use client";

import React, { useState } from "react";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import type { ScoredCareer } from "@/types/tims";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state/EmptyState";

function formatCluster(cluster: string): string {
  return cluster.replace(/_/g, " ").replace(/And/g, "&");
}

function parseBridgingReason(reason: string): {
  skill: string;
  detail: string;
} {
  const match = reason.match(/^(\w+)\((.+)\)$/);
  if (match) return { skill: match[1], detail: match[2] };
  return { skill: reason, detail: "" };
}

interface CareerMatchHubProps {
  aiSummary?: string;
}

export const CareerMatchHub = React.memo(function CareerMatchHub({ aiSummary }: CareerMatchHubProps) {
  const { data: timsData, isLoading, hasAssessments } = useTimsCareerScoring();
  const [selectedCareer, setSelectedCareer] = useState<ScoredCareer | null>(
    null,
  );
  const [aiExpanded, setAiExpanded] = useState(false);

  const careers = timsData?.data?.careers ?? [];
  const topCareers = careers.slice(0, 5);

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  // No data state — show empty only if we truly have no career results
  if (topCareers.length === 0) {
    return (
      <Card className="p-0 rounded-2xl border-border overflow-hidden">
        <EmptyState
          type="not_started"
          title="Your Career Matches"
          description="Complete your assessments to discover personalized career matches"
          icon={Sparkles}
          actionLabel="Start Assessments"
          actionHref="/dashboard/assessments"
        />
      </Card>
    );
  }

  const remaining = careers.length - 5;

  return (
    <>
      <Card className="p-6 rounded-2xl border-border">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Your Career Matches
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Powered by your PCA + LIA assessment results
            </p>
          </div>
          <Link
            href="/dashboard/career-paths"
            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Career Cards */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          {topCareers.map((career) => (
            <button
              key={career.programId}
              onClick={() => setSelectedCareer(career)}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center",
                "bg-card hover:bg-secondary border-border hover:border-primary/20",
                "transition-all duration-200 cursor-pointer",
              )}
            >
              {/* Score ring */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    className="stroke-border"
                    strokeWidth="4"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke={career.needsBridging ? "#f59e0b" : "#10b981"}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(career.totalScore / 100) * 150.8} 150.8`}
                  />
                </svg>
                <span className="absolute text-sm font-bold text-foreground">
                  {Math.round(career.totalScore)}%
                </span>
              </div>

              <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
                {career.programTitle}
              </span>

              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-2 py-0",
                  career.needsBridging
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                )}
              >
                {career.needsBridging ? "Needs Bridging" : "Ready"}
              </Badge>
            </button>
          ))}

          {remaining > 0 && (
            <Link
              href="/dashboard/career-paths"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <span className="text-2xl font-semibold">+{remaining}</span>
              <span className="text-xs">more</span>
            </Link>
          )}
        </div>

      </Card>

      {/* Detail Sheet */}
      <Sheet
        open={!!selectedCareer}
        onOpenChange={(open) => !open && setSelectedCareer(null)}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedCareer && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-xl">
                  {selectedCareer.programTitle}
                </SheetTitle>
                <Badge variant="outline" className="w-fit text-xs">
                  {formatCluster(selectedCareer.cluster)}
                </Badge>
              </SheetHeader>

              <div className="space-y-6">
                {/* Overall Score */}
                <div className="text-center py-4">
                  <div className="text-4xl font-bold text-foreground">
                    {Math.round(selectedCareer.totalScore)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Overall Match Score
                  </p>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Score Breakdown
                  </h3>
                  {[
                    {
                      label: "PCA Personality",
                      value: selectedCareer.breakdown.discScore,
                    },
                    {
                      label: "MIL",
                      value: selectedCareer.breakdown.milScore,
                    },
                    {
                      label: "Interests",
                      value: selectedCareer.breakdown.interestsScore,
                    },
                    {
                      label: "Motivators",
                      value: selectedCareer.breakdown.motivatorsScore,
                    },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">
                          {Math.round(item.value)}%
                        </span>
                      </div>
                      <Progress value={item.value} className="h-2" />
                    </div>
                  ))}
                </div>

                {/* Bridging Warnings */}
                {selectedCareer.needsBridging &&
                  selectedCareer.bridgingReasons.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-amber-300">
                        Skill Gaps
                      </h3>
                      {selectedCareer.bridgingReasons.map((reason, i) => {
                        const parsed = parseBridgingReason(reason);
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3"
                          >
                            <span className="text-amber-400 text-sm mt-0.5">
                              !
                            </span>
                            <div>
                              <span className="text-sm font-medium text-amber-300">
                                {parsed.skill}
                              </span>
                              {parsed.detail && (
                                <span className="text-xs text-amber-400/70 ml-1">
                                  ({parsed.detail})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* Bridging Paths */}
                {selectedCareer.bridgingPaths && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Recommended Skills/Courses
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedCareer.bridgingPaths
                        .split(";")
                        .map((path) => path.trim())
                        .filter(Boolean)
                        .map((path, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-xs"
                          >
                            {path}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                <Link
                  href="/dashboard/career-paths"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#2E9098] hover:text-[#2E9098]/80 mt-4"
                >
                  View in Career Explorer <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
});
