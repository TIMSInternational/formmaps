"use client";

import React from "react";
import { useTranslation } from "react-i18next";

import { IndexData } from "@/services/benchmarkService";
import { DollarSign, Home, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CostOfLivingProps {
  data?: IndexData;
  isLoading: boolean;
}

export default function CostOfLiving({ data, isLoading }: CostOfLivingProps) {
  const { t } = useTranslation();

  if (isLoading || !data) {
    return (
      <Skeleton className="h-[200px] w-full rounded-lg" />
    );
  }

  const getColor = (val: number) => {
    if (val < 40) return "text-emerald-500";
    if (val < 70) return "text-amber-500";
    return "text-rose-500";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-md shadow-sm">
            <DollarSign className="h-5 w-5 text-slate-500" />
          </div>
          <span className="text-sm font-medium text-slate-600">{t("benchmarks.costOfLivingIndex")}</span>
        </div>
        <span className={`text-xl font-bold ${getColor(data.costOfLiving)}`}>
          {data.costOfLiving.toFixed(1)}
        </span>
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-md shadow-sm">
            <Home className="h-5 w-5 text-slate-500" />
          </div>
          <span className="text-sm font-medium text-slate-600">{t("benchmarks.rentIndex")}</span>
        </div>
        <span className={`text-xl font-bold ${getColor(data.rentIndex)}`}>
          {data.rentIndex.toFixed(1)}
        </span>
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-md shadow-sm">
            <ShoppingBag className="h-5 w-5 text-slate-500" />
          </div>
          <span className="text-sm font-medium text-slate-600">{t("benchmarks.purchasingPower")}</span>
        </div>
        <span className={`text-xl font-bold ${getColor(100 - data.purchasingPower)}`}>
          {data.purchasingPower.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
