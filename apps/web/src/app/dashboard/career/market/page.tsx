"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { Globe, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { container } from "./_components/MarketData";
import {
  SalaryChartCard,
  HiringVolumeCard,
  TrendingSkillsCard,
  CareerPathCard,
  SidebarCards,
  RecentJobsCard,
  CTACard,
} from "./_components/MarketSections";

export default function JobMarketPulsePage() {
  const [hoveredRole, setHoveredRole] = useState<number | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-200/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-100/40 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative z-10">
        {/* Header */}
        <div className="space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
          >
            <div className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-200 mr-2 group-hover:border-indigo-200 transition-all shadow-sm">
              <ArrowLeft className="w-4 h-4" />
            </div>
            Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5" />
                Live Market Data
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500">Pulse</span>
              </h1>
              <p className="text-slate-500 text-lg">
                Real-time insights on salaries, hiring trends, and in-demand skills.
              </p>
            </div>
            <div className="flex items-center text-sm text-slate-600 gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Last updated: Just now
            </div>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-12 gap-6"
        >
          <SalaryChartCard />
          <HiringVolumeCard hoveredRole={hoveredRole} setHoveredRole={setHoveredRole} />
          <TrendingSkillsCard />
          <CareerPathCard />
          <SidebarCards />
          <RecentJobsCard />
          <CTACard />
        </motion.div>
      </div>
    </main>
  );
}
