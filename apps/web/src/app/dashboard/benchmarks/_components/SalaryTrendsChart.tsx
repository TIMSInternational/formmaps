"use client";

import React from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { useTranslation } from "react-i18next";
import { SalaryData } from "@/services/benchmarkService";
import { DynamicBarChart } from "@/lib/dynamic-imports";
import { Skeleton } from "@/components/ui/skeleton";


interface SalaryTrendsChartProps {
  data?: SalaryData[];
  isLoading: boolean;
}

export default function SalaryTrendsChart({ data, isLoading }: SalaryTrendsChartProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton className="h-[350px] w-full rounded-lg" />;
  }

  // Calculate dynamic domain
  const maxVal = Math.max(...(data?.map(d => d.max) || [0]));
  const domainMax = Math.ceil(maxVal * 1.1);

  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <DynamicBarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 10,
            bottom: 5,
          }}
          barSize={48}
          barGap={2}
        >
          <defs>
            <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.9} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1e293b" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#1e293b" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="role"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(value) => `$${value / 1000}k`}
            domain={[0, domainMax]}
          />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              padding: '12px'
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
            labelStyle={{ fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
          <Bar dataKey="min" fill="url(#colorMin)" name={t("benchmarks.minSalary")} radius={[6, 6, 0, 0]} />
          <Bar dataKey="avg" fill="url(#colorAvg)" name={t("benchmarks.averageSalary")} radius={[6, 6, 0, 0]} />
          <Bar dataKey="max" fill="url(#colorMax)" name={t("benchmarks.maxSalary")} radius={[6, 6, 0, 0]} />
        </DynamicBarChart>
      </ResponsiveContainer>
    </div>
  );
}
