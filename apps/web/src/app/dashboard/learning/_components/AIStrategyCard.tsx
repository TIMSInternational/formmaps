
"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Lightbulb, Zap } from "lucide-react";
import { SkillGapData } from "@/services/benchmarkService";

interface AIStrategyCardProps {
  gaps: SkillGapData[];
  activeGapIds: Set<string>;
}

export default function AIStrategyCard({ gaps, activeGapIds }: AIStrategyCardProps) {
  const activeGaps = gaps.filter((g) => activeGapIds.has(g.skill));

  const strategy = useMemo(() => {
    if (activeGaps.length === 0) {
      return {
        title: "No Skills Selected",
        message: "Select skill gaps to generate a personalized strategy.",
        icon: Lightbulb,
        color: "text-slate-500",
        bg: "bg-slate-50",
      };
    }

    // Find "Quick Win" (High ROI / Low Time)
    const quickWin = activeGaps.reduce((prev, curr) => {
      const prevRatio = prev.marketValueBoost / prev.estimatedWeeks;
      const currRatio = curr.marketValueBoost / curr.estimatedWeeks;
      return currRatio > prevRatio ? curr : prev;
    }, activeGaps[0]);

    // Find "Big Bet" (Max ROI)
    const bigBet = activeGaps.reduce((prev, curr) => 
       curr.marketValueBoost > prev.marketValueBoost ? curr : prev
    , activeGaps[0]);

    if (quickWin.skill === bigBet.skill) {
       return {
         title: "Focused Strategy",
         message: `Your clear priority is **${quickWin.skill}**. It offers the highest ROI efficiency ($${Math.round(quickWin.marketValueBoost/quickWin.estimatedWeeks).toLocaleString()}/week) and total value. Start here to maximize immediate impact.`,
         icon: Sparkles,
         color: "text-amber-600",
         bg: "bg-amber-50"
       };
    }

    return {
      title: "Balanced Attack Strategy",
      message: `I recommend starting with **${quickWin.skill}** for a quick win (high value per week). Once secured, tackle **${bigBet.skill}** for the massive long-term salary boost of $${bigBet.marketValueBoost.toLocaleString()}.`,
      icon: Zap,
      color: "text-indigo-600",
      bg: "bg-indigo-50"
    };

  }, [activeGaps]);

  const Icon = strategy.icon;

  return (
    <Card className={`border-none ${strategy.bg} shadow-sm transition-all duration-300`}>
      <CardContent className="p-5 flex gap-4">
        <div className={`p-3 rounded-xl bg-white shadow-sm h-fit ${strategy.color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <h4 className={`font-semibold text-lg mb-1 ${strategy.color}`}>
             AI Advisor: {strategy.title}
          </h4>
          <p className="text-slate-600 text-sm leading-relaxed">
            {strategy.message.split(/\*\*(.*?)\*\*/).map((part, i) =>
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
