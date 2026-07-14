"use client";

/**
 * Radar chart over the 4 personality dimensions — one spoke per dimension,
 * value = normalizedIntensity (0-100). Recharts, brand-blue fill.
 */
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { DimensionScore } from "@/services/personalityService";

export function PersonalityRadar({ dimensions }: { dimensions: DimensionScore[] }) {
  const data = dimensions.map((d) => ({
    dimension: d.dimension,
    value: d.normalizedIntensity,
  }));

  return (
    <div className="w-full" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "#475569", fontSize: 13, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "#94A3B8", fontSize: 10 }}
          />
          <Radar
            name="Intensity"
            dataKey="value"
            stroke="#065292"
            fill="#065292"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
