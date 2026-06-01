"use client";

import React from "react";
import { Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PieData } from "@/services/benchmarkService";
import { DynamicPieChart } from "@/lib/dynamic-imports";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkModeChartProps {
  data?: PieData[];
  isLoading: boolean;
}

export default function WorkModeChart({ data, isLoading }: WorkModeChartProps) {
  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-lg" />;
  }

  const COLORS = ['#10b981', '#065292', '#f59e0b'];

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <DynamicPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data?.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend verticalAlign="bottom" height={36} />
        </DynamicPieChart>
      </ResponsiveContainer>
    </div>
  );
}
