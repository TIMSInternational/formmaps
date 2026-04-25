"use client";

import React from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { useTranslation } from "react-i18next";
import { BenchmarkData } from "@/services/benchmarkService";
import { DynamicLineChart } from "@/lib/dynamic-imports";
import { Skeleton } from "@/components/ui/skeleton";

interface YouthEmploymentChartProps {
  data?: BenchmarkData[];
  isLoading: boolean;
}

export default function YouthEmploymentChart({ data, isLoading }: YouthEmploymentChartProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-lg" />;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <DynamicLineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
            unit="%"
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }}
            name={t("benchmarks.employmentRate")}
          />
        </DynamicLineChart>
      </ResponsiveContainer>
    </div>
  );
}
