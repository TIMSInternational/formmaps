import { motion } from "motion/react";
import { dashboardData } from "./data";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";

interface CompetencyChartProps {
  className?: string;
}

export function CompetencyChart({ className }: CompetencyChartProps) {
  const { competencyPlan } = dashboardData;
  const { t } = useTranslation();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
      aria-labelledby="competency-chart-title"
    >
      <Card className={cn("p-6 h-full glass-card", className)}>
        {/* Header */}
        <div className="flex items-start justify-between mb-8 border-b border-slate-100/50 pb-6">
          <div>
            <h2
              id="competency-chart-title"
              className="text-xl font-serif font-semibold text-slate-900 mb-1"
            >
              {competencyPlan.title}
            </h2>
            <p className="text-sm text-slate-500">{competencyPlan.date}</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-slate-500">
              {t("dashboard.allCategories")}
            </span>
            <span className="text-sm text-slate-500">{t("common.today")}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {/* Chart Container */}
          <div className="flex-1">
            <div className="relative w-64 h-64 mx-auto">
              {/* SVG Doughnut Chart with accessibility */}
              <svg
                width="256"
                height="256"
                className="transform -rotate-90"
                role="img"
                aria-labelledby="chart-title chart-desc"
              >
                <title id="chart-title">{t("dashboard.competencyChart")}</title>
                <desc id="chart-desc">
                  {competencyPlan.categories
                    .map((cat) => `${cat.name}: ${cat.percentage}%`)
                    .join(", ")}
                </desc>
                <circle
                  cx="128"
                  cy="128"
                  r="100"
                  fill="transparent"
                  stroke="#f8fafc"
                  strokeWidth="24"
                />

                {/* Render each category as arc */}
                {competencyPlan.categories.map((category, index) => {
                  const circumference = 2 * Math.PI * 100;
                  const offset = competencyPlan.categories
                    .slice(0, index)
                    .reduce(
                      (acc, cat) =>
                        acc + (cat.percentage / 100) * circumference,
                      0,
                    );
                  const strokeDasharray =
                    (category.percentage / 100) * circumference;

                  return (
                    <motion.circle
                      key={`${category.name}-${index}`}
                      cx="128"
                      cy="128"
                      r="100"
                      fill="transparent"
                      stroke={category.color}
                      strokeWidth="24"
                      strokeDasharray={`${strokeDasharray} ${circumference}`}
                      strokeDashoffset={-offset}
                      initial={{ strokeDasharray: `0 ${circumference}` }}
                      animate={{
                        strokeDasharray: `${strokeDasharray} ${circumference}`,
                      }}
                      transition={{ delay: index * 0.2, duration: 1 }}
                    />
                  );
                })}
              </svg>

              {/* Center Text */}
              <div
                className="absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="text-sm text-slate-600">
                  {t("dashboard.allCategories")}
                </span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <ul className="space-y-4" aria-label="Chart legend">
            {competencyPlan.categories.map((category, index) => (
              <li
                key={`${category.name}-${index}`}
                className="flex items-center space-x-4"
              >
                <div
                  className="w-3 h-3 rounded flex-shrink-0"
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-slate-700 min-w-[120px]">
                  {category.name}
                </span>
                <span className="text-sm font-bold text-slate-900 w-12 text-right">
                  {category.percentage}%
                </span>
                <span
                  className={cn(
                    "text-xs font-bold w-6",
                    category.trend === "up"
                      ? "text-emerald-600"
                      : "text-rose-600",
                  )}
                  aria-label={
                    category.trend === "up" ? "Trending up" : "Trending down"
                  }
                >
                  {category.trend === "up" ? "↑" : "↓"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </motion.section>
  );
}
