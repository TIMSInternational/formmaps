"use client";

// School-Admin view of Academic Gap Analysis — shows ALL school students (counselor view shows only assigned).
// Re-uses the same hooks from useAcademicGapQueries.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, TrendingDown, BookOpen, Lightbulb, AlertTriangle, Target, BarChart3, ChevronRight, GraduationCap, MapPin, Share2, Sparkles, Filter, CheckCircle } from "lucide-react";
import {
  useAcademicGapSummary,
  useStudentAcademicGaps,
  useStudentCourseRecommendations,
} from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";

export default function SchoolAdminAcademicGapsPage() {
  const { t } = useTranslation();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: summaryLoading } = useAcademicGapSummary({ limit: 100 });
  const { data: gaps, isLoading: gapsLoading } = useStudentAcademicGaps(selectedStudentId);
  const { data: recs, isLoading: recsLoading } = useStudentCourseRecommendations(selectedStudentId);

  const filteredStudents = (summary?.data ?? []).filter((s: AcademicGapSummaryItem) =>
    !search || s.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const priorityColor = (level: string) => {
    if (level === "behind") return { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: "text-red-500", shadow: "shadow-red-900/5" };
    if (level === "at_risk") return { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: "text-orange-500", shadow: "shadow-orange-900/5" };
    return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-500", shadow: "shadow-emerald-900/5" };
  };

  const getInitials = (name: string) => {
    if (!name) return "ST";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const selectedStudent = summary?.data?.find((s: AcademicGapSummaryItem) => s.studentId === selectedStudentId);

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
        </div>
        <Skeleton className="h-[500px] w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.gaps.title", "Academic Gap Analysis")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.gaps.subtitle", "School-wide view of academic trajectories, credit deficits, and AI-powered intervention recommendations.")}
        </p>
      </motion.div>

      {/* Summary Stats */}
      {summary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            <Card className="border-0 shadow-lg bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-blue-100 flex items-center justify-center mb-4">
                    <BarChart3 className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="text-4xl font-black text-gray-900 tracking-tight">{summary.summary?.totalStudents ?? 0}</p>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">Total Monitored</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.summary?.behind ?? 0}</p>
                  <p className="text-sm font-bold text-red-100 uppercase tracking-wider mt-1">Behind Track</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-400 to-amber-500 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.summary?.atRisk ?? 0}</p>
                  <p className="text-sm font-bold text-orange-100 uppercase tracking-wider mt-1">At Risk</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-400 to-teal-500 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.summary?.onTrack ?? 0}</p>
                  <p className="text-sm font-bold text-emerald-100 uppercase tracking-wider mt-1">On Track</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-white/60 backdrop-blur-xl border border-gray-200/50 p-1.5 rounded-2xl shadow-sm mb-6 inline-flex">
            <TabsTrigger
              value="overview"
              className="rounded-xl px-6 py-2.5 text-sm font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-md"
            >
              Master Roster
            </TabsTrigger>
            <TabsTrigger
              value="detail"
              disabled={!selectedStudentId}
              className="rounded-xl px-6 py-2.5 text-sm font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-md data-[disabled]:opacity-40"
            >
              {selectedStudent ? `${selectedStudent.studentName.split(' ')[0]}'s Profile` : 'Student Profile'}
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {tab === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="border-0 shadow-xl rounded-3xl bg-white/80 backdrop-blur-xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-gray-50/80 to-white py-5 px-6 border-b border-gray-100 sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                          <GraduationCap className="h-5 w-5 text-indigo-600" />
                        </div>
                        Student Trajectories
                      </CardTitle>
                      <CardDescription className="text-sm mt-1">
                        Identify students needing intervention across the entire institution.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search students..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-11 rounded-full bg-white border-gray-200 focus:bg-white focus:border-indigo-400 shadow-sm transition-all h-10"
                        />
                      </div>
                      <Button variant="outline" size="icon" className="rounded-full shrink-0 h-10 w-10 border-gray-200 bg-white">
                        <Filter className="h-4 w-4 text-gray-500" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-100/50">
                      {filteredStudents.length === 0 ? (
                        <div className="text-center py-24 bg-gray-50/30">
                          <TrendingDown className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-xl font-bold text-gray-900 mb-2">No Students Found</h3>
                          <p className="text-gray-500 max-w-sm mx-auto">
                            {search ? "Try fundamentally adjusting your search criteria." : "There is no academic trajectory data available yet."}
                          </p>
                        </div>
                      ) : (
                        filteredStudents.map((s: AcademicGapSummaryItem) => {
                          const colors = priorityColor(s.overallStatus);
                          return (
                            <div
                              key={s.studentId}
                              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-gradient-to-r hover:from-indigo-50/40 hover:to-transparent cursor-pointer transition-all duration-300"
                              onClick={() => { setSelectedStudentId(s.studentId); setTab("detail"); }}
                            >
                              <div className="flex items-center gap-4 min-w-0 flex-1">
                                <Avatar className="h-12 w-12 ring-2 ring-white shadow-sm shrink-0">
                                  <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 font-bold border border-indigo-200">
                                    {getInitials(s.studentName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-lg text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                                      {s.studentName}
                                    </h4>
                                    <Badge className={`${colors.bg} ${colors.text} ${colors.border} shadow-none rounded-md px-2 py-0.5 text-xs font-bold border capitalize shrink-0`}>
                                      {s.overallStatus?.replace("_", " ")}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-gray-500 font-medium">
                                    <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /> {s.missingRequiredCourses} required missing</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-orange-400" /> {s.creditDeficit} credit deficit</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-1/3 shrink-0">
                                <div className="hidden md:block text-right">
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Primary Gap</p>
                                  <p className="text-sm font-semibold text-gray-700 truncate max-w-[200px]">{s.topGap || "None detected"}</p>
                                </div>
                                <Button
                                  size="sm"
                                  className="bg-white border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 shadow-sm rounded-xl font-bold group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all ml-auto"
                                >
                                  Examine <ChevronRight className="h-4 w-4 ml-1 opacity-50 group-hover:opacity-100" />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {tab === "detail" && (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Header Strip for Student Detail */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/60 backdrop-blur-xl p-4 md:px-6 rounded-3xl border border-gray-200/60 shadow-sm">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-50 text-gray-500"
                      onClick={() => { setTab("overview"); setSelectedStudentId(""); }}
                    >
                      <ChevronRight className="h-5 w-5 rotate-180" />
                    </Button>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {selectedStudent?.studentName}
                      </h2>
                      {selectedStudent && (
                        <p className="text-sm font-medium text-gray-500 mt-0.5">
                          Currently marked as <span className="font-bold text-gray-700 capitalize">{selectedStudent.overallStatus?.replace("_", " ")}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl border-gray-200 bg-white">
                      <Share2 className="h-4 w-4 mr-2 text-gray-500" /> Share Report
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gaps Column */}
                  <Card className="border-0 shadow-xl rounded-3xl bg-white/80 backdrop-blur-xl overflow-hidden flex flex-col">
                    <CardHeader className="bg-gradient-to-r from-red-50/80 to-rose-50/80 border-b border-gray-100/50 pb-5">
                      <CardTitle className="flex items-center gap-2 text-xl font-bold text-red-900">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-red-100">
                          <TrendingDown className="h-5 w-5 text-red-600" />
                        </div>
                        Identified Academic Gaps
                      </CardTitle>
                      <CardDescription className="text-sm font-medium text-red-700/70 mt-1">
                        Credit deficiencies and missing core requirements.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 flex-1 bg-white/40">
                      {gapsLoading ? (
                        <div className="space-y-4">
                          <Skeleton className="h-24 w-full rounded-2xl" />
                          <Skeleton className="h-24 w-full rounded-2xl" />
                        </div>
                      ) : gaps?.creditGaps?.length ? (
                        <div className="space-y-4">
                          {gaps.creditGaps.map((g: any, i: number) => (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                              key={i}
                              className="relative flex items-start gap-4 p-5 bg-white rounded-2xl border border-red-100 shadow-sm shadow-red-900/5 overflow-hidden group"
                            >
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400 group-hover:bg-red-500 transition-colors" />
                              <div className="p-2 bg-red-50 rounded-xl shrink-0 border border-red-100/50">
                                <AlertTriangle className="h-5 w-5 text-red-500" />
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-start mb-1">
                                  <p className="text-base font-bold text-gray-900">{g.category}</p>
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold whitespace-nowrap">
                                    -{g.deficit} credits
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-600 font-medium bg-red-50/30 p-2 rounded-lg mt-2 border border-red-50">
                                  <span className="font-bold text-red-800 mr-1">Fix:</span>
                                  {g.recommendation}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col justify-center items-center h-full min-h-[300px] text-center">
                          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 text-emerald-500">
                            <BookOpen className="h-8 w-8" />
                          </div>
                          <p className="text-lg font-bold text-gray-900">No Deficiencies</p>
                          <p className="text-sm text-gray-500 mt-1 max-w-xs">This student is completely on track with their current academic framework.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* AI Recommendations Column */}
                  <Card className="border-0 shadow-xl rounded-3xl bg-white/80 backdrop-blur-xl overflow-hidden flex flex-col">
                    <CardHeader className="bg-gradient-to-r from-amber-50/80 to-yellow-50/80 border-b border-gray-100/50 pb-5">
                      <CardTitle className="flex items-center gap-2 text-xl font-bold text-amber-900">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-amber-100">
                          <Lightbulb className="h-5 w-5 text-amber-500" />
                        </div>
                        AI Recommendations
                      </CardTitle>
                      <CardDescription className="text-sm font-medium text-amber-900/60 mt-1">
                        Intelligent course targeting to repair trajectories.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 flex-1 bg-white/40">
                      {recsLoading ? (
                        <div className="space-y-4">
                          <Skeleton className="h-24 w-full rounded-2xl" />
                          <Skeleton className="h-24 w-full rounded-2xl" />
                        </div>
                      ) : recs?.nextSemester?.length || recs?.longTerm?.length ? (
                        <div className="space-y-4">
                          {[...(recs.nextSemester ?? []), ...(recs.longTerm ?? [])].map((r: any, i: number) => (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.15 }}
                              key={i}
                              className="group flex flex-col gap-3 p-5 bg-white rounded-2xl border border-amber-200/60 shadow-sm shadow-amber-900/5 hover:border-amber-400 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-1.5 bg-amber-50 rounded-lg shrink-0">
                                    <Sparkles className="h-4 w-4 text-amber-500" />
                                  </div>
                                  <p className="text-base font-bold text-gray-900 leading-tight">{r.courseName}</p>
                                </div>
                                <Badge variant="secondary" className="bg-amber-100/50 text-amber-800 hover:bg-amber-100 font-bold border-none shrink-0">
                                  Recommend
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 font-medium pl-10 border-l-2 border-amber-100 py-1 ml-2">
                                {r.reason}
                              </p>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col justify-center items-center h-full min-h-[300px] text-center">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-lg font-bold text-gray-900">No Recs Needed</p>
                          <p className="text-sm text-gray-500 mt-1 max-w-xs">No specific remedial interventions are prescribed at this time.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Tabs>
      </motion.div>
    </div>
  );
}
