"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import { SkillGapData } from "@/services/benchmarkService";
import { motion } from "framer-motion";

interface SkillGapCardProps {
  gap: SkillGapData;
  onSelect: (skill: string) => void;
  onToggle: (skill: string, checked: boolean) => void;
  isSelected?: boolean;
  isIncluded?: boolean;
}

export default function SkillGapCard({ gap, onSelect, onToggle, isSelected, isIncluded }: SkillGapCardProps) {
  // Visual level mapping
  const levelMap = { "None": 0, "Beginner": 1, "Intermediate": 2, "Advanced": 3, "Expert": 4 };
  const currentLvl = levelMap[gap.currentLevel] || 0;
  const targetLvl = levelMap[gap.requiredLevel] || 3;
  const totalLevels = 4;

  const handleClick = () => {
      // Toggle selection logic could be combined or separate. 
      // For now, selecting the card selects it for view.
      onSelect(gap.skill);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(gap.skill, !isIncluded);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative w-full p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
        isSelected
          ? "bg-indigo-50/50 border-indigo-600"
          : "bg-white border-slate-200 hover:border-slate-300"
      } ${!isIncluded ? "opacity-70 grayscale-[0.5]" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        
        {/* Left: Indicator & Info */}
        <div className="flex items-center gap-4">
            {/* Custom Toggle Button */}
            <div 
                onClick={handleToggleClick}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                    isIncluded 
                    ? "bg-slate-900 border-slate-900 text-white" 
                    : "bg-white border-slate-300 text-slate-300 hover:border-slate-400"
                }`}
            >
                {isIncluded && <Check className="w-5 h-5" />}
            </div>

            <div>
                <h4 className={`text-base font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>{gap.skill}</h4>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{gap.currentLevel}</span>
                    <div className="h-0.5 w-4 bg-slate-300 rounded-full" />
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{gap.requiredLevel}</span>
                </div>
            </div>
        </div>

        {/* Right: Metrics & Chevron */}
        <div className="flex items-center gap-6">
             <div className="hidden sm:flex items-center gap-4 text-right">
                <div>
                     <div className="flex items-center justify-end gap-1 text-emerald-600 font-bold text-sm">
                        <TrendingUp className="w-3.5 h-3.5" />
                        +${(gap.marketValueBoost / 1000).toFixed(1)}k
                     </div>
                     <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Value</p>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div>
                     <div className="text-indigo-600 font-bold text-sm">
                        {gap.estimatedWeeks}w
                     </div>
                     <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Time</p>
                </div>
             </div>
             
             <div className={`p-2 rounded-full transition-colors ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100'}`}>
                <ChevronRight className="w-4 h-4" />
             </div>
        </div>
      </div>
      
      {/* Bottom Progress Bar integrated into card */}
      <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-slate-100 overflow-hidden rounded-full mb-[-1px]">
          <div 
            className="h-full bg-indigo-500 opacity-20" 
            style={{ width: `${((currentLvl + 1) / 5) * 100}%` }} 
          />
      </div>
    </div>
  );
}
