"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UrgentAction {
  title: string;
  description: string;
  impact: string;
}

interface AIBriefingCardProps {
  briefing: string | undefined;
  urgentActions: UrgentAction[] | undefined;
  isLoading: boolean;
  updatedAt: number;
  onRefresh: () => void;
}

export function AIBriefingCard({ briefing, urgentActions, isLoading, updatedAt, onRefresh }: AIBriefingCardProps) {
  const { t } = useTranslation("counselor");
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.17 }}
    >
      <Card className="dash-card overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-indigo-300" />
              </div>
              <h3 className="text-sm font-semibold text-white tracking-tight">{t("ai.dailyBriefing", "AI Daily Briefing")}</h3>
            </div>
            <div className="flex items-center gap-2">
              {updatedAt > 0 && (
                <span className="text-[10px] text-slate-400">
                  {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-slate-300 hover:text-white hover:bg-white/10"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span className="ml-1 text-xs">{t("ai.regenerate", "Regenerate")}</span>
              </Button>
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/10" />
              <Skeleton className="h-4 w-3/4 bg-white/10" />
              <Skeleton className="h-4 w-1/2 bg-white/10" />
            </div>
          ) : (
            <p className="text-sm text-slate-200 leading-relaxed">
              {briefing ?? t("ai.noBriefing", "No briefing available yet.")}
            </p>
          )}
        </div>
        {/* Urgent Action Items */}
        {!isLoading && (urgentActions?.length ?? 0) > 0 && (
          <div className="border-t border-slate-200 divide-y divide-slate-100">
            {urgentActions!.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-0.5">
                  <AlertTriangle className={`h-3.5 w-3.5 ${
                    item.impact === "high" ? "text-red-500" : item.impact === "medium" ? "text-amber-500" : "text-blue-500"
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <Badge className={`shrink-0 text-[10px] font-semibold ${
                  item.impact === "high"
                    ? "bg-red-100 text-red-700 border-red-200"
                    : item.impact === "medium"
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-blue-100 text-blue-700 border-blue-200"
                }`}>
                  {item.impact}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
