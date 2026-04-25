"use client";

import React from "react";
import { useCareersStore } from "@/store/useCareersStore";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

export default function CareerCompareBar() {
  const { compareList, clearCompare } = useCareersStore();
  const router = useRouter();
  const { t } = useTranslation();

  if (!compareList || compareList.length === 0) return null;

  return (
    <div 
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white shadow-lg rounded-lg px-6 py-3 flex items-center space-x-4 z-50"
      role="status"
      aria-label="Comparison selection"
    >
      <div className="text-sm text-gray-700">
        {t("compare.selectedCount", { count: compareList.length })}
      </div>
      <button
        onClick={() => router.push("/careers/compare")}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        aria-label={`Compare ${compareList.length} selected careers`}
      >
        {t("compare.compareButton")}
      </button>
      <button
        onClick={clearCompare}
        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 rounded"
        aria-label="Clear all selected comparisons"
      >
        Clear
      </button>
    </div>
  );
}
