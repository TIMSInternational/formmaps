"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Search,
  TrendingDown,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  Target,
  BarChart3,
  Users,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers
} from "lucide-react";
import {
  useAcademicGapSummary,
  useStudentAcademicGaps,
  useStudentCourseRecommendations,
} from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function AcademicGapsPage() {
  const { t } = useTranslation();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [tab, setTab] = useState("gaps");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: summary, isLoading: summaryLoading } = useAcademicGapSummary({ limit: 50 });
  const { data: gaps, isLoading: gapsLoading } = useStudentAcademicGaps(selectedStudentId);
  const { data: recs, isLoading: recsLoading } = useStudentCourseRecommendations(selectedStudentId);

  const priorityColor = (level: string) => {
    if (level === "behind") return "bg-red-100 text-red-700 border-red-200";
    if (level === "at_risk") return "bg-orange-100 text-orange-700 border-orange-200";
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  };

  const filteredStudents = summary?.data?.filter((s: AcademicGapSummaryItem) =>
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-80 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100/50 mb-3 shadow-sm">
          <TrendingDown className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-teal-700">Analytics & Interventions</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 drop-shadow-sm">
          {t("schoolAdmin.gaps.title", "Academic Gap Analysis")}
        </h1>
        <p className="text-lg text-gray-500 font-medium mt-3 max-w-2xl leading-relaxed">
          {t("schoolAdmin.gaps.subtitle", "Identify students off-track, review personalized credit analysis, and provide AI-generated course remediation plans.")}
        </p>
      </motion.div>

      {/* Premium Summary Stat Cards */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6"
        >
          {/* Total Students */}
          <Card className="border border-white/40 shadow-xl shadow-black/[0.03] bg-white/60 backdrop-blur-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-2xl overflow-hidden relative group">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <Users className="h-6 w-6" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-gray-900 tracking-tight">
                  {summary.summary?.totalStudents ?? 0}
                </p>
                <p className="text-sm font-semibold text-gray-500 mt-1">Total Students</p>
              </div>
            </CardContent>
          </Card>

          {/* Behind */}
          <Card className="border border-white/40 shadow-xl shadow-black/[0.03] bg-white/60 backdrop-blur-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-2xl overflow-hidden relative group">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-400 to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
                  <AlertCircle className="h-6 w-6" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-red-600 tracking-tight drop-shadow-sm">
                  {summary.summary?.behind ?? 0}
                </p>
                <p className="text-sm font-semibold text-gray-500 mt-1">Behind</p>
              </div>
            </CardContent>
          </Card>

          {/* At Risk */}
          <Card className="border border-white/40 shadow-xl shadow-black/[0.03] bg-white/60 backdrop-blur-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-2xl overflow-hidden relative group">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-orange-600 tracking-tight drop-shadow-sm">
                  {summary.summary?.atRisk ?? 0}
                </p>
                <p className="text-sm font-semibold text-gray-500 mt-1">At Risk</p>
              </div>
            </CardContent>
          </Card>

          {/* On Track */}
          <Card className="border border-white/40 shadow-xl shadow-black/[0.03] bg-white/60 backdrop-blur-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-2xl overflow-hidden relative group">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-emerald-600 tracking-tight drop-shadow-sm">
                  {summary.summary?.onTrack ?? 0}
                </p>
                <p className="text-sm font-semibold text-gray-500 mt-1">On Track</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Analysis Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8"
      >
        {/* Left Col: Target Selectors (1/3 width) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border border-gray-100 shadow-xl shadow-black/[0.02] bg-white/80 backdrop-blur-md rounded-2xl sticky top-24 overflow-hidden flex flex-col max-h-[700px]">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                {t("schoolAdmin.gaps.studentListHeader", "Needs Review")}
              </h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Select a student to view their detailed gap analysis.</p>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder={t("common.search", "Search students...")}
                  className="pl-9 bg-white border-gray-200 focus:border-indigo-300 focus:ring-indigo-100 rounded-xl h-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <AnimatePresence>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s: AcademicGapSummaryItem, index: number) => {
                    const isSelected = selectedStudentId === s.studentId;
                    return (
                      <motion.button
                        key={s.studentId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => setSelectedStudentId(s.studentId)}
                        className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-center gap-3 ${isSelected
                            ? "bg-indigo-50 border border-indigo-100 shadow-sm"
                            : "bg-transparent border border-transparent hover:bg-gray-50"
                          }`}
                      >
                        <Avatar className="h-10 w-10 border shadow-sm">
                          <AvatarFallback className={isSelected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}>
                            {s.studentName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold text-sm truncate ${isSelected ? "text-indigo-900" : "text-gray-900"}`}>
                            {s.studentName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 -ml-1">
                            <Badge variant="outline" className={`px-2 py-0 text-[10px] uppercase font-bold tracking-wider ${priorityColor(s.overallStatus)}`}>
                              {s.overallStatus.replace("_", " ")}
                            </Badge>
                            {s.missingRequiredCourses > 0 && (
                              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                {s.missingRequiredCourses} missing
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-1.5 h-8 bg-indigo-500 rounded-full shrink-0" />
                        )}
                      </motion.button>
                    );
                  })
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 px-4">
                    <div className="bg-gray-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-semibold">{t("common.noResults", "No students found")}</p>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your search query.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* Right Col: Detail View (2/3 width) */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {!selectedStudentId ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[500px]"
              >
                <Card className="border-2 border-dashed border-gray-200 bg-gray-50/50 shadow-none h-full flex items-center justify-center rounded-2xl">
                  <CardContent className="text-center py-24 max-w-sm mx-auto">
                    <div className="w-24 h-24 bg-white shadow-xl shadow-indigo-100/50 rounded-full flex items-center justify-center mx-auto mb-6 transform -rotate-6">
                      <Target className="h-10 w-10 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Select a Student</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      Choose a student from the list to dive deep into their academic gaps, credit standing, and personalized AI course recommendations.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                  {/* Custom Tab List */}
                  <div className="bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 shadow-sm inline-flex mb-6 max-w-full overflow-x-auto gap-1">
                    <TabsList className="bg-transparent space-x-1 h-auto p-0">
                      <TabsTrigger
                        value="gaps"
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100`}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Analysis & Gaps
                      </TabsTrigger>
                      <TabsTrigger
                        value="recommendations"
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100`}
                      >
                        <Lightbulb className="h-4 w-4 mr-2" />
                        AI Action Plan
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* ANALYSIS & GAPS TAB */}
                  <TabsContent value="gaps" className="mt-0 outline-none">
                    <Card className="border border-white/60 shadow-xl shadow-black/[0.03] bg-white/70 backdrop-blur-xl rounded-2xl overflow-hidden">
                      <CardHeader className="bg-gradient-to-br from-indigo-50/50 to-white border-b border-gray-100 p-6">
                        <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                          <Target className="h-6 w-6 text-indigo-500" />
                          Academic Deficiency Analysis
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-gray-500 mt-2">
                          Detailed breakdown of credit deficits, missing coursework, and career alignment issues.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-6 md:p-8 space-y-8">
                        {gapsLoading ? (
                          <div className="space-y-6">
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                          </div>
                        ) : gaps ? (
                          <div className="space-y-8">
                            {/* 1. Credit Gaps */}
                            {gaps.creditGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                                    <TrendingDown className="h-4 w-4 text-red-600" />
                                  </div>
                                  <h3 className="text-lg font-bold text-gray-900">Credit Deficiencies</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {gaps.creditGaps.map((g, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="p-5 rounded-2xl border border-red-100 bg-red-50/30 hover:bg-red-50/60 transition-colors shadow-sm relative overflow-hidden group"
                                    >
                                      <div className="absolute top-0 left-0 w-1 h-full bg-red-400" />
                                      <div className="flex justify-between items-start mb-3">
                                        <span className="font-bold text-gray-900">{g.category}</span>
                                        <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 font-bold px-2 py-0.5 shadow-sm">
                                          -{g.deficit} credits
                                        </Badge>
                                      </div>
                                      <Progress
                                        value={(g.creditsEarned / g.creditsRequired) * 100}
                                        className="h-2.5 bg-red-100 mb-2 [&>div]:bg-red-500"
                                      />
                                      <p className="text-xs font-semibold text-gray-600 flex justify-between">
                                        <span>Earned: {g.creditsEarned}</span>
                                        <span>Required: {g.creditsRequired}</span>
                                      </p>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}

                            {/* 2. Course Gaps */}
                            {gaps.courseGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                                    <BookOpen className="h-4 w-4 text-orange-600" />
                                  </div>
                                  <h3 className="text-lg font-bold text-gray-900">Missing Required Courses</h3>
                                </div>
                                <div className="p-5 rounded-2xl border border-orange-100 bg-orange-50/30 shadow-sm relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-400" />
                                  <div className="flex flex-wrap gap-2.5">
                                    {gaps.courseGaps.map((g, i) => (
                                      <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                                        key={i}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-orange-200 shadow-sm"
                                      >
                                        <span className="font-semibold text-gray-800 text-sm">{g.courseName}</span>
                                        <span className="text-xs font-mono text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{g.courseCode}</span>
                                      </motion.div>
                                    ))}
                                  </div>
                                </div>
                              </section>
                            )}

                            {/* 3. Career Gaps */}
                            {gaps.careerGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <Briefcase className="h-4 w-4 text-purple-600" />
                                  </div>
                                  <h3 className="text-lg font-bold text-gray-900">Career Alignment Warnings</h3>
                                </div>
                                <div className="space-y-3">
                                  {gaps.careerGaps.map((g, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="p-5 rounded-2xl border border-purple-100 bg-purple-50/30 hover:bg-purple-50/60 transition-colors shadow-sm relative overflow-hidden flex items-start gap-4"
                                    >
                                      <div className="absolute top-0 left-0 w-1 h-full bg-purple-400" />
                                      <Target className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-gray-900 shrink-0 text-base">{g.careerPath}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          {g.missingSkills.map((skill, idx) => (
                                            <span key={idx} className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                                              {skill}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}

                            {/* All Good State */}
                            {gaps.creditGaps.length === 0 && gaps.courseGaps.length === 0 && gaps.careerGaps.length === 0 && (
                              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-8 rounded-2xl bg-emerald-50 border border-emerald-100 text-center shadow-inner">
                                <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-bold text-emerald-900 mb-2">Student is On Track!</h3>
                                <p className="text-emerald-700 font-medium max-w-md mx-auto">
                                  No academic gaps, missing requirements, or career alignment issues detected. They are proceeding perfectly according to plan.
                                </p>
                              </motion.div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">Unable to load gap data securely.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* RECOMMENDATIONS TAB */}
                  <TabsContent value="recommendations" className="mt-0 outline-none">
                    <Card className="border border-white/60 shadow-xl shadow-black/[0.03] bg-white/70 backdrop-blur-xl rounded-2xl overflow-hidden relative">
                      {/* Decorative AI Glow */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-300/10 rounded-full blur-[80px] -z-10" />

                      <CardHeader className="bg-gradient-to-br from-emerald-50/50 to-white border-b border-gray-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <Lightbulb className="h-6 w-6 text-emerald-500 fill-emerald-500/20" />
                            AI Action Plan
                          </CardTitle>
                          <CardDescription className="text-sm font-medium text-gray-500 mt-2 max-w-lg">
                            Smart, personalized course recommendations to resolve existing gaps and keep the student aligned with their career ambitions.
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm w-fit font-bold tracking-wide flex gap-1.5 items-center">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          AI GENERATED
                        </Badge>
                      </CardHeader>

                      <CardContent className="p-6 md:p-8">
                        {recsLoading ? (
                          <div className="space-y-4">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
                          </div>
                        ) : (recs?.nextSemester?.length || recs?.longTerm?.length) ? (
                          <div className="space-y-10">
                            {/* Reasoning Banner */}
                            {recs.reasoning && (
                              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-gradient-to-r from-gray-900 to-indigo-900 text-white shadow-lg relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
                                <div className="relative z-10">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1 flex items-center gap-1.5">
                                    <Target className="h-3.5 w-3.5" /> Core Strategy
                                  </h4>
                                  <p className="text-sm md:text-base font-medium leading-relaxed opacity-90">{recs.reasoning}</p>
                                </div>
                              </motion.div>
                            )}

                            {/* Next Semester */}
                            {recs.nextSemester.length > 0 && (
                              <section>
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  Immediate Requirements (Next Semester)
                                </h3>
                                <div className="grid gap-4">
                                  {recs.nextSemester.map((r, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group"
                                    >
                                      {r.priority === "high" && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />}
                                      {(r.priority === "medium" || !r.priority) && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />}

                                      <div className="pl-2">
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                                          <div>
                                            <h4 className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{r.courseName}</h4>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                              <Badge variant="outline" className="font-mono bg-gray-50">{r.courseCode}</Badge>
                                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold">{r.credits} Credits</Badge>
                                              <Badge className={`uppercase text-[10px] font-bold tracking-wider ${r.priority === 'high' ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                                                }`}>
                                                {r.priority} Priority
                                              </Badge>
                                            </div>
                                          </div>
                                          <div className="shrink-0 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 text-center">
                                            <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Source</p>
                                            <p className="text-sm font-semibold text-gray-800 capitalize">{r.source.replace("_", " ")}</p>
                                          </div>
                                        </div>
                                        <div className="bg-gray-50/80 p-3 rounded-xl mt-3 border border-gray-100/50">
                                          <p className="text-sm text-gray-600 font-medium">
                                            <span className="font-bold text-gray-800 mr-2">Why:</span>
                                            {r.reason}
                                          </p>
                                        </div>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}

                            {/* Long Term */}
                            {recs.longTerm.length > 0 && (
                              <section>
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  Long Term Path
                                </h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                  {recs.longTerm.map((r, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 + 0.3 }}
                                      key={i}
                                      className="p-5 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white transition-all shadow-sm relative overflow-hidden"
                                    >
                                      <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-300" />
                                      <div className="pl-2">
                                        <div className="flex justify-between items-start mb-2">
                                          <div>
                                            <h4 className="font-bold text-gray-900">{r.courseName}</h4>
                                            <p className="text-sm text-gray-500 font-mono mt-0.5">{r.courseCode}</p>
                                          </div>
                                          <Badge variant="outline">{r.credits} CR</Badge>
                                        </div>
                                        <p className="text-sm text-gray-600 leading-relaxed mt-2">{r.reason}</p>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                              <Lightbulb className="h-8 w-8 text-gray-300" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">No Recommendations Available</h3>
                            <p className="text-gray-500 max-w-sm">The AI has not detected any required remediation or course path modifications at this time.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
