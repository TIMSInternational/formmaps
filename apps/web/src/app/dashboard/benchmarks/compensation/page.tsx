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
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Home,
  ShoppingBag,
  CreditCard,
} from "lucide-react";
import SalaryTrendsChart from "../_components/SalaryTrendsChart";
import CostOfLiving from "../_components/CostOfLiving";
import {
  getSalaryTrends,
  getCostOfLiving,
  SalaryData,
  IndexData,
} from "@/services/benchmarkService";
import { useTranslation } from "react-i18next";

export default function CompensationPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const country = searchParams.get("country") || "USA";
  const career = searchParams.get("career") || "Software Engineer";

  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [colData, setColData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [salary, col] = await Promise.all([
          getSalaryTrends(country, career),
          getCostOfLiving(country),
        ]);
        setSalaryData(salary);
        setColData(col);
      } catch (error) {
        console.error("Failed to fetch compensation data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [country, career]);

  // Calculated metrics (mocked logic for display)
  const averageSalary =
    salaryData.find((s) => s.role === "Mid-Level")?.avg || 0;
  const growthRate = 8.5; // Mocked YoY growth

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-100 font-medium text-sm">
                  {t("dashboard.benchmarks.compensation.avgAnnualSalary")}
                </p>
                <h3 className="text-3xl font-bold mt-2">
                  {loading ? "..." : `$${(averageSalary / 1000).toFixed(1)}k`}
                </h3>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-emerald-100 text-sm">
              <TrendingUp className="w-4 h-4 mr-1" />
              <span className="font-semibold mr-1">+{growthRate}%</span>{" "}
              {t("dashboard.benchmarks.compensation.sinceLastYear")}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-medium text-sm">
                  {t("dashboard.benchmarks.compensation.purchasePowerIndex")}
                </p>
                <h3 className="text-3xl font-bold mt-2 text-slate-900">
                  {loading || !colData
                    ? "..."
                    : (100 - colData.purchasingPower).toFixed(1)}
                </h3>
              </div>
              <div className="p-2 bg-slate-100 rounded-lg">
                <ShoppingBag className="w-6 h-6 text-slate-600" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              {t("dashboard.benchmarks.compensation.relativeToNYC")}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-medium text-sm">
                  {t("dashboard.benchmarks.compensation.estimatedTakeHome")}
                </p>
                <h3 className="text-3xl font-bold mt-2 text-slate-900">
                  {loading
                    ? "..."
                    : `$${((averageSalary * 0.72) / 1000).toFixed(1)}k`}
                </h3>
              </div>
              <div className="p-2 bg-slate-100 rounded-lg">
                <CreditCard className="w-6 h-6 text-slate-600" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              {t("dashboard.benchmarks.compensation.afterEstimatedTaxes")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Section */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle>
                {t("dashboard.benchmarks.compensation.detailedSalaryTitle")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.benchmarks.compensation.cardDescription", {
                  career,
                  country,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SalaryTrendsChart data={salaryData} isLoading={loading} />

              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-500" />
                  {t("dashboard.benchmarks.compensation.keyObservation")}
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t("dashboard.benchmarks.compensation.keyObservationDesc", {
                    career,
                    country,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost of Living Section */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5 text-amber-500" />
                Cost of Living Analysis
              </CardTitle>
              <CardDescription>
                Economic impact on real earnings
              </CardDescription>
            </CardHeader>
            <CardContent>
              {colData && <CostOfLiving data={colData} isLoading={loading} />}

              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Rent Burden</span>
                    <span className="font-medium text-slate-900">Moderate</span>
                  </div>
                  <Progress value={65} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Groceries</span>
                    <span className="font-medium text-slate-900">High</span>
                  </div>
                  <Progress value={82} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
