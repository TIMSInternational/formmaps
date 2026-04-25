"use client";

import React from "react";
import AnimatedCounter from "./AnimatedCounter";
import { TrendingUp, DollarSign, Clock, Target, ArrowUpRight, Zap } from "lucide-react";
import { ROIData } from "@/services/benchmarkService";
import { motion } from "framer-motion";

interface StatsCardsProps {
  roiData: ROIData;
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      type: "spring" as const,
      stiffness: 100,
      damping: 20
    }
  })
};

export default function StatsCards({ roiData }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      
      {/* Large Hero Card: Potential Salary */}
      <motion.div 
        custom={0}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="md:col-span-2 group relative overflow-hidden bg-white p-6 rounded-3xl border border-slate-200 hover:border-emerald-500 transition-colors duration-300"
      >
        <div className="absolute right-0 top-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <DollarSign className="w-32 h-32 text-emerald-600" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-start justify-between">
                <div className="p-2 bg-emerald-100/50 rounded-lg text-emerald-700">
                    <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                    +32% Boost
                    <TrendingUp className="w-3 h-3" />
                </div>
            </div>
            <div>
                <p className="text-slate-500 font-medium text-sm mb-1">Potential Annual Salary</p>
                <div className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                    $<AnimatedCounter value={roiData.potentialSalary} />
                </div>
            </div>
        </div>
      </motion.div>

      {/* Employability Score */}
      <motion.div 
        custom={1}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="md:col-span-1 group relative bg-white p-6 rounded-3xl border border-slate-200 hover:border-indigo-500 transition-colors duration-300"
      >
        <div className="h-full flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Target className="w-5 h-5" />
                </div>
            </div>
            <div>
                <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                        <AnimatedCounter value={roiData.potentialEmployability} />
                    </span>
                    <span className="text-sm font-semibold text-slate-400">/100</span>
                </div>
                <p className="text-slate-500 text-sm font-medium">Employability Score</p>
                <div className="w-full bg-slate-100 h-1.5 mt-3 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${roiData.potentialEmployability}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-indigo-600 rounded-full"
                    />
                </div>
            </div>
        </div>
      </motion.div>

       {/* Time Investment */}
       <motion.div 
         custom={2}
         initial="hidden"
         animate="visible"
         variants={cardVariants}
         className="md:col-span-1 group relative bg-slate-900 p-6 rounded-3xl border border-slate-800 hover:border-slate-700 transition-colors duration-300"
       >
        <div className="h-full flex flex-col justify-between text-white">
             <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                    <Clock className="w-5 h-5" />
                </div>
                <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-900">
                    TARGET
                </div>
            </div>
            <div>
                <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-extrabold text-white">
                        <AnimatedCounter value={roiData.timeToROIWeeks} />
                    </span>
                    <span className="text-sm font-medium text-slate-400">Weeks</span>
                </div>
                <p className="text-slate-400 text-sm font-medium">Time to ROI</p>
            </div>
        </div>
      </motion.div>
    </div>
  );
}
