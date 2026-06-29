"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  GraduationCap,
  ChevronRight,
  Users,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useParentProfile } from "@/hooks/useParentPortalQueries";
import type { ParentChildLink } from "@/types/parentPortal";
import { cn } from "@/lib/utils";

const RELATIONSHIP_COLORS: Record<string, string> = {
  mother: "bg-pink-100 text-pink-700",
  father: "bg-blue-100 text-blue-700",
  sibling: "bg-purple-100 text-purple-700",
  guardian: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

export default function ParentChildrenPage() {
  const { t } = useTranslation("parent");
  const router = useRouter();
  const { data: profile, isLoading } = useParentProfile();
  const children: ParentChildLink[] = profile?.children || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("children.badge")}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          {t("children.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("children.subtitle")}
        </p>
      </motion.div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-indigo-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("children.totalChildren")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{isLoading ? "…" : children.length}</p>
        </div>
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("children.enrolled")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{isLoading ? "…" : children.length}</p>
        </div>
      </div>

      {/* Children Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <div className="text-center py-20 dash-card border-dashed">
          <Users className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground">
            {t("children.none")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("children.noneDesc")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map((child, idx) => {
            const initials = (child.studentName || "?")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <motion.div
                key={child.studentId}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
              >
                <div className="dash-card group cursor-pointer">
                  <div className="p-5 pb-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 border-2 border-[var(--border)] shadow">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-semibold text-foreground">{child.studentName}</p>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "capitalize text-xs",
                              RELATIONSHIP_COLORS[child.relationship] || "bg-muted text-muted-foreground"
                            )}
                          >
                            {child.relationship}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                          <GraduationCap className="h-3.5 w-3.5" />
                          <span>{t("children.grade")} {child.gradeLevel}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-5 space-y-4">
                    {/* Placeholder progress until real data loads */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{t("children.graduationProgress")}</span>
                        <span>—</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>

                    <Button
                      className="w-full gap-2"
                      variant="outline"
                      onClick={() =>
                        router.push(`/parent/children/${child.studentId}`)
                      }
                    >
                      {t("children.viewAcademicProgress")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
