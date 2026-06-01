"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  getSkillGaps,
  getROIAnalysis,
  SkillGapData,
  ROIData
} from "@/services/benchmarkService";
import SkillGapCard from "../_components/SkillGapCard";
import ROICalculator from "../_components/ROICalculator";
import CourseRecommendations from "../_components/CourseRecomendation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, TrendingUp, BookOpen, Layers, Zap } from "lucide-react";
import Link from "next/link";

import StatsCards from "../_components/StatsCards";
import AIStrategyCard from "../_components/AIStrategyCard";
import LearningTimeline from "../_components/LearningTimeline";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100 } }
};

export default function SmartGapsPage() {
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<SkillGapData[]>([]);
  const [baseRoiData, setBaseRoiData] = useState<ROIData | null>(null);
  const [calculatedRoi, setCalculatedRoi] = useState<ROIData | null>(null);
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [activeGapIds, setActiveGapIds] = useState<Set<string>>(new Set());

  // Derive ROI based on selection
  useEffect(() => {
    if (!baseRoiData) return;

    const activeGapsList = gaps.filter(gap => activeGapIds.has(gap.skill));

    // Summing boosts
    const additionalSalary = activeGapsList.reduce((acc, curr) => acc + curr.marketValueBoost, 0);
    const additionalEmployability = activeGapsList.reduce((acc, curr) => acc + curr.employabilityBoost, 0);
    const addedTime = activeGapsList.reduce((acc, curr) => acc + (curr.estimatedWeeks || 0), 0);

    setCalculatedRoi({
        ...baseRoiData,
        potentialSalary: baseRoiData.currentSalary + additionalSalary,
        potentialEmployability: Math.min(100, baseRoiData.currentEmployability + additionalEmployability),
        timeToROIWeeks: addedTime
    });

  }, [activeGapIds, baseRoiData, gaps]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [gapsData, roi] = await Promise.all([
          getSkillGaps("current-user"),
          getROIAnalysis("current-user"),
        ]);
        setGaps(gapsData);
        setBaseRoiData(roi);

        const allIds = new Set(gapsData.map(g => g.skill));
        setActiveGapIds(allIds);

        if (gapsData.length > 0) {
            setSelectedGap(gapsData[0].skill);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleToggleGap = (skill: string, checked: boolean) => {
      const next = new Set(activeGapIds);
      if (checked) {
          next.add(skill);
      } else {
          next.delete(skill);
      }
      setActiveGapIds(next);
  };

  // Prepare Radar Data
  const radarData = gaps.map(gap => {
     // Mock levels to numbers
     const currentScore = gap.currentLevel === "None" ? 20 : gap.currentLevel === "Beginner" ? 40 : 60;
     const potentialScore = activeGapIds.has(gap.skill)
        ? (gap.requiredLevel === "Expert" ? 100 : 80)
        : currentScore; // If not selected, no gain

     return {
        subject: gap.skill,
        A: currentScore, // Current
        B: potentialScore, // Potential
        fullMark: 100
     };
  });

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">
      <div className="space-y-10">

        {/* Header */}
        <div className="space-y-6">
          <Link
            href="/dashboard/learning"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="p-1.5 rounded-lg bg-card border border-border mr-2 group-hover:border-foreground/20 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </div>
            Back to Learning
          </Link>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
                AI-Powered Analysis
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                Skill Gaps Analysis
              </h1>
              <p className="text-muted-foreground">
                We've identified <span className="font-semibold text-foreground">{gaps.length} critical skill gaps</span> preventing you from reaching your next major milestone.
              </p>
            </div>

            <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-xl active:scale-95 transition-all">
              <Sparkles className="w-4 h-4 mr-2" />
              Refresh Analysis
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-8 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-xl border border-border" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 h-96 bg-card rounded-xl border border-border" />
              <div className="lg:col-span-4 h-96 bg-card rounded-xl border border-border" />
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-10"
          >
            {/* Top Stats Cards */}
            <motion.div variants={itemVariants}>
              {calculatedRoi && <StatsCards roiData={calculatedRoi} />}
            </motion.div>

            {/* AI Strategy Advisor */}
            {gaps.length > 0 && (
              <motion.div variants={itemVariants}>
                <AIStrategyCard gaps={gaps} activeGapIds={activeGapIds} />
              </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Interactive Gaps List & Course Recs */}
              <div className="lg:col-span-7 space-y-8">

                {/* Skill Gaps Selection */}
                <motion.div variants={itemVariants} className="dash-card p-5 md:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-2xl font-bold text-foreground flex items-center gap-3">
                        <Layers className="w-6 h-6 text-indigo-500" />
                        Skill Gaps
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">Select skills to simulate your ROI</p>
                    </div>
                    <div className="text-xs font-bold text-indigo-600 bg-indigo-500/10 px-4 py-2 rounded-full">
                      {activeGapIds.size} Active
                    </div>
                  </div>

                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 gap-4"
                  >
                    <AnimatePresence mode="popLayout">
                      {gaps.map((gap) => (
                        <motion.div key={gap.skill} variants={itemVariants} layoutId={gap.skill}>
                          <SkillGapCard
                            gap={gap}
                            onSelect={setSelectedGap}
                            onToggle={handleToggleGap}
                            isSelected={selectedGap === gap.skill}
                            isIncluded={activeGapIds.has(gap.skill)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>

                {/* Course Recommendations */}
                <motion.div variants={itemVariants} className="dash-card p-5 md:p-8 overflow-hidden">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-secondary text-foreground rounded-2xl">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-xl">Recommended Courses</h3>
                      <p className="text-muted-foreground text-sm">
                        tailored for <span className="font-semibold text-foreground">{selectedGap || "improvement"}</span>
                      </p>
                    </div>
                  </div>

                  {selectedGap ? (
                    <CourseRecommendations skills={[selectedGap]} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-4 border-2 border-dashed border-border rounded-xl">
                      <Layers className="w-12 h-12" />
                      <p className="font-medium text-muted-foreground">Select a skill gap above to view courses</p>
                    </div>
                  )}
                </motion.div>

              </div>

              {/* Right Column: Visualization & Timeline (Sticky) */}
              <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-8">

                {/* ROI Radar Chart */}
                <motion.div variants={itemVariants}>
                  {calculatedRoi && <ROICalculator data={calculatedRoi} radarData={radarData} />}
                </motion.div>

                {/* Timeline */}
                <motion.div variants={itemVariants}>
                  <LearningTimeline gaps={gaps} activeGapIds={activeGapIds} />
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
