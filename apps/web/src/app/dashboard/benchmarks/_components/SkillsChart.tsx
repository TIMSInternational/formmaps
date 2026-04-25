"use client";

import React from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { useTranslation } from "react-i18next";
import { SkillData } from "@/services/benchmarkService";
import { DynamicBarChart } from "@/lib/dynamic-imports";
import { Skeleton } from "@/components/ui/skeleton";


interface SkillsChartProps {
  data?: SkillData[];
  isLoading: boolean;
}

export default function SkillsChart({ data, isLoading }: SkillsChartProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-lg" />;
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

  return (
    <div className="h-[600px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <DynamicBarChart
          layout="vertical"
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 40,
            bottom: 5,
          }}
          barSize={20}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis
            dataKey="skill"
            type="category"
            width={100}
            tick={{ fill: '#475569', fontSize: 13, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => [`${value}% ${t("benchmarks.demand") || "demand"}`, ` ${t("benchmarks.popularity") || "Popularity"}`]}
          />
          <Bar dataKey="popularity" radius={[0, 4, 4, 0]}>
            {data?.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </DynamicBarChart>
      </ResponsiveContainer>
    </div>
  );
}
