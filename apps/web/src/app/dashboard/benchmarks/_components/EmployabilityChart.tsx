"use client";

import React from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area
} from "recharts";
import { useTranslation } from "react-i18next";
import { BenchmarkData } from "@/services/benchmarkService";
import { DynamicAreaChart } from "@/lib/dynamic-imports";
import { Skeleton } from "@/components/ui/skeleton";

interface EmployabilityChartProps {
  data?: BenchmarkData[];
  isLoading: boolean;
}

export default function EmployabilityChart({ data, isLoading }: EmployabilityChartProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-lg" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center bg-slate-50 rounded-lg">
        <span className="text-slate-400 font-medium">{t("benchmarks.noDataAvailable")}</span>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <DynamicAreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="year"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorValue)"
            name={t("benchmarks.employabilityScore")}
          />
        </DynamicAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
