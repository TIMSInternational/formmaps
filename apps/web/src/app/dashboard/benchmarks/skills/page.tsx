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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Award, Zap, Target } from "lucide-react";
import SkillsChart from "../_components/SkillsChart";
import { useTranslation } from "react-i18next";
import CertificationsList from "../_components/CertificationsList";
import {
  getTopSkills,
  getRecommendedCertifications,
  SkillData,
  CertData,
} from "@/services/benchmarkService";

export default function SkillsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const career = searchParams.get("career") || "Software Engineer";

  const [skills, setSkills] = useState<SkillData[]>([]);
  const [certs, setCerts] = useState<CertData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [s, c] = await Promise.all([
          getTopSkills(career),
          getRecommendedCertifications(career),
        ]);
        setSkills(s);
        setCerts(c);
      } catch (error) {
        console.error("Failed to fetch skills data", error);
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
            {t("dashboard.benchmarks.skills.title")}
          </h2>
          <p className="text-slate-500 mt-1">
            {t("dashboard.benchmarks.skills.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Skills */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                {t("dashboard.benchmarks.skills.mostInDemand")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.benchmarks.skills.cardDescription", { career })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkillsChart data={skills} isLoading={loading} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 bg-amber-50 border-amber-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <Target className="w-5 h-5" />
                {t("dashboard.benchmarks.skills.emergingTechWatch")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-amber-800 mb-4">
                {t("dashboard.benchmarks.skills.emergingDesc")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="bg-white border-amber-200 text-amber-900"
                >
                  Generative AI
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-white border-amber-200 text-amber-900"
                >
                  Rust
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-white border-amber-200 text-amber-900"
                >
                  Edge Computing
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Certifications */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-violet-500" />
                {t("dashboard.benchmarks.skills.topCertifications")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.benchmarks.skills.certificationsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <CertificationsList data={certs} isLoading={loading} />

              <div className="pt-6 border-t border-slate-100">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  Recommended Learning Paths
                </h4>
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer flex justify-between items-center group">
                    <div>
                      <p className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                        Senior Engineer Fast-Track
                      </p>
                      <p className="text-xs text-slate-500">
                        System Design, Leadership, Cloud Arch
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 group-hover:text-blue-500"
                    >
                      {t("common.start")}
                    </Button>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer flex justify-between items-center group">
                    <div>
                      <p className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                        Data Science for Devs
                      </p>
                      <p className="text-xs text-slate-500">
                        Python, Pandas, ML Basics
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 group-hover:text-blue-500"
                    >
                      {t("common.start")}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
