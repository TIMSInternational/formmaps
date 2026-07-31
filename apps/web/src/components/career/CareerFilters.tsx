"use client";

import React from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchTracking } from "@/hooks/useTrackingHooks";

export function CareerFilters({
  filters,
  onChange,
}: {
  filters: {
    search?: string;
    industry?: string;
    education?: string;
    sort?: string;
  };
  onChange: (newFilters: any) => void;
}) {
  const { language } = useGlobalStore();
  const { t } = useTranslation();
  const trackSearch = useSearchTracking("careers", "/careers");

  const handleChange = (key: string, value: string) => {
    onChange({ ...filters, [key]: value === "all" ? undefined : value });
    // Track search queries
    if (key === "search" && value.length >= 2) {
      trackSearch(value);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Search Bar */}
        <div className="flex-1 relative group">
          <label htmlFor="career-search-input" className="sr-only">{t("career.search_placeholder", "Search for careers, skills, or keywords...")}</label>
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" aria-hidden="true" />
          </div>
          <input
            id="career-search-input"
            type="text"
            placeholder={t("career.search_placeholder", "Search for careers, skills, or keywords...")}
            className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-base"
            value={filters.search || ""}
            onChange={(e) => handleChange("search", e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
          <div className="min-w-[160px] flex-1 md:flex-none">
            <Select
              value={filters.industry || "all"}
              onValueChange={(value) => handleChange("industry", value)}
            >
              <SelectTrigger className="w-full h-[50px] rounded-xl border-gray-200 bg-white text-gray-700 font-medium focus:ring-indigo-500/20 focus:border-indigo-500 hover:bg-gray-50" aria-label={t("career.all_industries", "All Industries")}>
                <SelectValue placeholder={t("career.all_industries", "All Industries")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("career.all_industries", "All Industries")}</SelectItem>
                <SelectItem value="Technology">Technology</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Retail">Retail</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px] flex-1 md:flex-none">
            <Select
              value={filters.education || "all"}
              onValueChange={(value) => handleChange("education", value)}
            >
              <SelectTrigger className="w-full h-[50px] rounded-xl border-gray-200 bg-white text-gray-700 font-medium focus:ring-indigo-500/20 focus:border-indigo-500 hover:bg-gray-50" aria-label={t("career.all_education", "Education")}>
                <SelectValue placeholder={t("career.all_education", "Education")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("career.all_education", "Any Education")}</SelectItem>
                <SelectItem value="HighSchool">High School</SelectItem>
                <SelectItem value="Associate">Associate</SelectItem>
                <SelectItem value="Bachelors">Bachelors</SelectItem>
                <SelectItem value="Masters">Masters</SelectItem>
                <SelectItem value="PhD">PhD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px] flex-1 md:flex-none">
            <Select
              value={filters.sort || "all"}
              onValueChange={(value) => handleChange("sort", value)}
            >
              <SelectTrigger className="w-full h-[50px] rounded-xl border-gray-200 bg-white text-gray-700 font-medium focus:ring-indigo-500/20 focus:border-indigo-500 hover:bg-gray-50" aria-label={t("career.sort_default", "Sort By")}>
                <SelectValue placeholder={t("career.sort_default", "Sort By")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("career.sort_default", "Default Sort")}</SelectItem>
                <SelectItem value="recommended">{t("career.sort_recommended", "Recommended")}</SelectItem>
                <SelectItem value="match">{t("career.sort_match", "Match Score")}</SelectItem>
                <SelectItem value="title">{t("career.sort_title", "Name (A-Z)")}</SelectItem>
                <SelectItem value="demand">{t("career.sort_demand", "High Demand")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
