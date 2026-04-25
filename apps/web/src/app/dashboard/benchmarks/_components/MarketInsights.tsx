"use client";

import React from "react";
import { InsightData } from "@/services/benchmarkService";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface MarketInsightsProps {
  data?: InsightData[];
  isLoading: boolean;
}

export default function MarketInsights({ data, isLoading }: MarketInsightsProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const getTheme = (trend: "up" | "down" | "neutral", index: number) => {
    // Cycling colors for visual variety if neutral, otherwise semantic
    const colors = [
      { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", icon: "text-blue-500" },
      { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-100", icon: "text-violet-500" },
      { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100", icon: "text-amber-500" },
      { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", icon: "text-emerald-500" },
    ];

    if (trend === 'up') return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100", icon: "text-emerald-500" };
    if (trend === 'down') return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100", icon: "text-rose-500" };

    return colors[index % colors.length];
  };

  const getIcon = (trend: "up" | "down" | "neutral") => {
    switch (trend) {
      case "up": return <ArrowUpRight className="h-5 w-5" />;
      case "down": return <ArrowDownRight className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const translateInsight = (item: InsightData) => {
    const labelKey = item.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapping: Record<string, { label: string; desc: string }> = {
      demandgrowth: {
        label: t("dashboard.benchmarks.market.insights.demandGrowth"),
        desc: t("dashboard.benchmarks.market.insights.demandGrowthDesc")
      },
      talentsupply: {
        label: t("dashboard.benchmarks.market.insights.talentSupply"),
        desc: t("dashboard.benchmarks.market.insights.talentSupplyDesc")
      },
      remoteopportunity: {
        label: t("dashboard.benchmarks.market.insights.remoteOpportunity"),
        desc: t("dashboard.benchmarks.market.insights.remoteOpportunityDesc")
      },
      avgfilltime: {
        label: t("dashboard.benchmarks.market.insights.avgFillTime"),
        desc: t("dashboard.benchmarks.market.insights.avgFillTimeDesc")
      },
    };

    const localized = mapping[labelKey];
    if (!localized) return item;

    let localizedValue = item.value;
    if (item.value === "Moderate") localizedValue = t("benchmarks.moderate");
    if (item.value === "High") localizedValue = t("benchmarks.high");
    if (item.value === "Low") localizedValue = t("benchmarks.low");

    return {
      ...item,
      label: localized.label,
      description: localized.desc,
      value: localizedValue
    };
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {data?.map((rawItem, index) => {
        const item = translateInsight(rawItem);
        const theme = getTheme(item.trend, index);
        return (
          <Card
            key={index}
            className={`border shadow-sm hover:shadow-md transition-all duration-200 group overflow-hidden relative`}
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-transparent to-slate-50 opacity-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`} />

            <CardContent className="p-5 relative">
              <div className="flex justify-between items-start mb-3">
                <div className={`p-2 rounded-lg ${theme.bg} ${theme.icon} bg-opacity-80 backdrop-blur-sm`}>
                  {getIcon(item.trend)}
                </div>
                {item.trend !== 'neutral' && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${theme.bg} ${theme.text}`}>
                    {item.trend === 'up' ? t("benchmarks.rising") : t("benchmarks.falling")}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <h4 className="text-2xl font-bold text-slate-900 tracking-tight">{item.value}</h4>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-50">
                <p className="text-xs text-slate-400 line-clamp-1 group-hover:line-clamp-none transition-all">
                  {item.description}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
