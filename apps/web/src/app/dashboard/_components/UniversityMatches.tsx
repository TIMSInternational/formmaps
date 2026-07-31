"use client";

import { useGlobalStore } from "@/store/useGlobalStore";
import { useUniversityRecommendations } from "@/hooks/useUniversityQueries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export function UniversityMatches() {
  const { user } = useGlobalStore();
  const { data, isLoading, isError } = useUniversityRecommendations(
    user?.id || null,
  );

  const recommendations = data?.recommendations ?? [];
  const top3 = recommendations.slice(0, 3);

  if (isLoading) {
    return (
      <Card className="p-5 flex flex-col rounded-2xl border-border">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (isError || top3.length === 0) {
    return (
      <Card className="p-5 flex flex-col rounded-2xl border-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Universities
        </h2>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
          <GraduationCap className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            Complete assessments to see matches
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 flex flex-col rounded-2xl border-border">
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Universities
      </h2>

      <div className="space-y-2 flex-1">
        {top3.map((rec) => (
          <div
            key={rec.university.id}
            className="flex items-center gap-3 rounded-lg p-2.5 border border-border hover:bg-secondary transition-colors"
          >
            {rec.university.logo ? (
              <Image
                src={rec.university.logo}
                alt={rec.university.name}
                width={28}
                height={28}
                className="rounded object-contain shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-xs shrink-0">
                <GraduationCap className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-medium text-foreground flex-1 truncate">
              {rec.university.name}
            </span>
            <span className="text-sm font-bold text-primary tabular-nums shrink-0">
              {Math.round(rec.matchScore)}%
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/university"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 mt-3"
      >
        Explore All <ArrowRight className="w-3 h-3" />
      </Link>
    </Card>
  );
}
