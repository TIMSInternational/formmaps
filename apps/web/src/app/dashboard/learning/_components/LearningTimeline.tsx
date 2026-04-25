"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { SkillGapData } from "@/services/benchmarkService";

interface LearningTimelineProps {
  gaps: SkillGapData[];
  activeGapIds: Set<string>;
}

export default function LearningTimeline({ gaps, activeGapIds }: LearningTimelineProps) {
  const activeGaps = gaps.filter((g) => activeGapIds.has(g.skill));
  
  // Sort by priority/efficiency (mock logic: high priority first)
  const sortedGaps = [...activeGaps].sort((a,b) => {
     if (a.priority === "High" && b.priority !== "High") return -1;
     if (a.priority !== "High" && b.priority === "High") return 1;
     return 0;
  });

  let currentWeekOffset = 0;
  const today = new Date();

  return (
    <Card className="border border-slate-200 shadow-none bg-white">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-500" />
          Time-to-Mastery Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeGaps.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
                Select skills to generate a timeline.
            </div>
        ) : (
            <div className="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
            {sortedGaps.map((gap, index) => {
                const startParams = { week: currentWeekOffset };
                currentWeekOffset += gap.estimatedWeeks;
                
                // Calculate dates
                const startDate = new Date(today);
                startDate.setDate(today.getDate() + (startParams.week * 7));
                const endDate = new Date(today);
                endDate.setDate(today.getDate() + (currentWeekOffset * 7.5)); // slight buffer

                return (
                <div key={gap.skill} className="relative flex gap-6 group">
                    {/* Circle Indicator */}
                    <div className={`
                        relative z-10 w-10 h-10 rounded-full border bg-white flex items-center justify-center shrink-0
                        transition-colors duration-300
                        ${index === 0 ? 'border-amber-400 text-amber-500' : 'border-slate-200 text-slate-400 group-hover:border-indigo-400 group-hover:text-indigo-500'}
                    `}>
                         <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-slate-200 group-hover:bg-indigo-400'}`} />
                    </div>

                    <div className="flex-1 pb-6">
                        <div className="flex justify-between items-start mb-2">
                           <div>
                               <h5 className="font-semibold text-slate-900">{gap.skill}</h5>
                               <span className="text-xs text-slate-500">
                                   {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                               </span>
                           </div>
                           <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded text-slate-600">
                               {gap.estimatedWeeks} Weeks
                           </span>
                        </div>
                        
                        {/* Progress Bar within card implies duration */}
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full opacity-80 ${
                                    index === 0 ? 'bg-amber-400 w-1/3' : 'bg-indigo-500 w-0 group-hover:w-full transition-all duration-700'
                                }`} 
                            />
                        </div>
                    </div>
                </div>
                );
            })}
            
            {/* Completion Flag */}
            <div className="relative flex gap-6">
                 <div className="relative z-10 w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                     </svg>
                 </div>
                 <div className="pt-2">
                     <h5 className="font-bold text-emerald-700">Projected Market Ready</h5>
                     <p className="text-xs text-emerald-600">
                         {new Date(today.getTime() + (currentWeekOffset * 7 * 24 * 60 * 60 * 1000)).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                     </p>
                 </div>
            </div>

            </div>
        )}
      </CardContent>
    </Card>
  );
}
