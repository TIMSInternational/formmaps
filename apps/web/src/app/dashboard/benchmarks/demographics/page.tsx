"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Laptop, HeartHandshake } from "lucide-react";
import WorkModeChart from "../_components/WorkModeChart";
import DiversityChart from "../_components/DiversityChart";
import { useTranslation } from "react-i18next";
import {
  getWorkModeDistribution,
  getDiversityData,
  PieData,
} from "@/services/benchmarkService";

export default function DemographicsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const career = searchParams.get("career") || "Software Engineer";

  const [workMode, setWorkMode] = useState<PieData[]>([]);
  const [diversity, setDiversity] = useState<PieData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [wm, div] = await Promise.all([
          getWorkModeDistribution(career),
          getDiversityData(career),
        ]);
        setWorkMode(wm);
        setDiversity(div);
      } catch (error) {
        console.error("Failed to fetch demographics data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [career]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {t("dashboard.benchmarks.demographics.title")}
          </h2>
          <p className="text-slate-500 mt-1">
            {t("dashboard.benchmarks.demographics.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Work Mode Section */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-blue-500" />
                {t("dashboard.benchmarks.demographics.workModeTitle")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.benchmarks.demographics.workModeDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkModeChart data={workMode} isLoading={loading} />

              <div className="mt-8 grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h4 className="text-2xl font-bold text-slate-900">35%</h4>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    {t("dashboard.benchmarks.demographics.remote")}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h4 className="text-2xl font-bold text-slate-900">45%</h4>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    {t("dashboard.benchmarks.demographics.hybrid")}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h4 className="text-2xl font-bold text-slate-900">20%</h4>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    {t("dashboard.benchmarks.demographics.onsite")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Diversity Section */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                {t("dashboard.benchmarks.demographics.genderDiversityTitle")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.benchmarks.demographics.genderDiversityDesc", {
                  career,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DiversityChart data={diversity} isLoading={loading} />
            </CardContent>
          </Card>

          {/* Culture/Checklist Mock */}
          <Card className="shadow-sm border-slate-200 bg-slate-900 text-white">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-pink-400" />
                {t("dashboard.benchmarks.demographics.inclusivityTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-5xl font-bold">8.4</span>
                <span className="text-slate-400 mb-1">/ 10</span>
              </div>
              <p className="text-sm text-slate-300">
                {t("dashboard.benchmarks.demographics.inclusivityDesc")}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {t("dashboard.benchmarks.demographics.badges.parentalLeave")}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {t("dashboard.benchmarks.demographics.badges.flexHours")}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {t("dashboard.benchmarks.demographics.badges.wellness")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Banner */}
      <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white rounded-full shadow-sm">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900">
              {t("dashboard.benchmarks.demographics.enterpriseTrendTitle")}
            </h3>
            <p className="text-sm text-blue-700">
              {t("dashboard.benchmarks.demographics.enterpriseTrendDesc")}
            </p>
          </div>
        </div>
        <Badge className="bg-blue-600 hover:bg-blue-700">
          {t("dashboard.benchmarks.demographics.readReport")}
        </Badge>
      </div>
    </div>
  );
}
