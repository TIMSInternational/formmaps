"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Share2, Globe, Briefcase } from "lucide-react";
import { COUNTRIES, CAREERS } from "@/services/benchmarkService";
import { useTranslation } from "react-i18next";

interface BenchmarksHeaderProps {
  onExportCSV?: () => void;
  onExportImage?: () => void;
}

export default function BenchmarksHeader({
  onExportCSV,
  onExportImage,
}: BenchmarksHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Initialize state from URL params or defaults
  const [country, setCountry] = useState(
    searchParams.get("country") || COUNTRIES[0]
  );
  const [career, setCareer] = useState(
    searchParams.get("career") || CAREERS[0]
  );

  // Sync state to URL when changed
  const updateParams = (newCountry: string, newCareer: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("country", newCountry);
    params.set("career", newCareer);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleCountryChange = (val: string) => {
    setCountry(val);
    updateParams(val, career);
  };

  const handleCareerChange = (val: string) => {
    setCareer(val);
    updateParams(country, val);
  };

  return (
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 mb-10 pb-6 border-b border-slate-200">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t("dashboard.benchmarks.header.title")}
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl font-light">
          {t("dashboard.benchmarks.header.description")}
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full xl:w-auto">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
            <Select value={country} onValueChange={handleCountryChange}>
              <SelectTrigger className="w-full sm:w-[200px] pl-9 bg-white border-slate-200 shadow-sm rounded-lg hover:border-slate-300 transition-colors">
                <SelectValue
                  placeholder={t(
                    "dashboard.benchmarks.header.selectCountryPlaceholder"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
            <Select value={career} onValueChange={handleCareerChange}>
              <SelectTrigger className="w-full sm:w-[240px] pl-9 bg-white border-slate-200 shadow-sm rounded-lg hover:border-slate-300 transition-colors">
                <SelectValue
                  placeholder={t(
                    "dashboard.benchmarks.header.selectCareerPlaceholder"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {CAREERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 sm:ml-auto">
            {onExportCSV && (
              <Button
                variant="outline"
                onClick={onExportCSV}
                size="icon"
                className="bg-white hover:bg-slate-50 shadow-sm rounded-lg h-10 w-10"
              >
                <Download className="h-4 w-4 text-slate-600" />
              </Button>
            )}
            {onExportImage && (
              <Button
                onClick={onExportImage}
                className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm rounded-lg"
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t("dashboard.benchmarks.header.shareReport")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
