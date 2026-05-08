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
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Analytics & Interventions</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
          {t("schoolAdmin.gaps.title", "Academic Gap Analysis")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {t("schoolAdmin.gaps.subtitle", "Identify students off-track, review personalized credit analysis, and provide AI-generated course remediation plans.")}
        </p>
      </motion.div>

      {/* Summary Stat Cards */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: "Total Students", value: summary.summary?.totalStudents ?? 0, icon: Users, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10" },
            { label: "Behind", value: summary.summary?.behind ?? 0, icon: AlertCircle, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
            { label: "At Risk", value: summary.summary?.atRisk ?? 0, icon: AlertTriangle, iconColor: "text-orange-500", iconBg: "bg-orange-500/10" },
            { label: "On Track", value: summary.summary?.onTrack ?? 0, icon: CheckCircle2, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="dash-card p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Main Analysis Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* Left Col: Student List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="dash-card sticky top-24 overflow-hidden flex flex-col max-h-[700px]">
            <div className="p-5 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                {t("schoolAdmin.gaps.studentListHeader", "Needs Review")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Select a student to view their detailed gap analysis.</p>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("common.search", "Search students...")}
                  className="pl-9 h-10"
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
                            ? "bg-indigo-500/10 border border-indigo-500/20"
                            : "bg-transparent border border-transparent hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))]"
                          }`}
                      >
                        <Avatar className="h-10 w-10 border">
                          <AvatarFallback className={isSelected ? "bg-indigo-600 text-white" : "bg-[var(--admin-bg-hover)] text-foreground"}>
                            {s.studentName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold text-sm truncate ${isSelected ? "text-indigo-600" : "text-foreground"}`}>
                            {s.studentName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 -ml-1">
                            <Badge variant="outline" className={`px-2 py-0 text-[10px] uppercase font-bold tracking-wider ${priorityColor(s.overallStatus)}`}>
                              {s.overallStatus.replace("_", " ")}
                            </Badge>
                            {s.missingRequiredCourses > 0 && (
                              <span className="text-xs font-medium text-muted-foreground bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-1.5 py-0.5 rounded-md">
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
                    <Search className="h-6 w-6 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-foreground font-semibold">{t("common.noResults", "No students found")}</p>
                    <p className="text-sm text-muted-foreground mt-1">Try adjusting your search query.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right Col: Detail View */}
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
                <div className="dash-card border-dashed h-full flex items-center justify-center">
                  <div className="text-center py-24 max-w-sm mx-auto">
                    <Target className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <h3 className="text-lg font-bold text-foreground mb-2">Select a Student</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Choose a student from the list to dive deep into their academic gaps, credit standing, and personalized AI course recommendations.
                    </p>
                  </div>
                </div>
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
                  <div className="dash-card p-1.5 inline-flex mb-6 gap-1">
                    <TabsList className="bg-transparent space-x-1 h-auto p-0">
                      <TabsTrigger
                        value="gaps"
                        className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-[var(--admin-bg-hover)]"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Analysis & Gaps
                      </TabsTrigger>
                      <TabsTrigger
                        value="recommendations"
                        className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-[var(--admin-bg-hover)]"
                      >
                        <Lightbulb className="h-4 w-4 mr-2" />
                        AI Action Plan
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* ANALYSIS & GAPS TAB */}
                  <TabsContent value="gaps" className="mt-0 outline-none">
                    <div className="dash-card overflow-hidden">
                      <div className="p-6 border-b border-[var(--border)]">
                        <h2 className="text-lg font-bold text-foreground flex items-center gap-3">
                          <Target className="h-5 w-5 text-indigo-500" />
                          Academic Deficiency Analysis
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Detailed breakdown of credit deficits, missing coursework, and career alignment issues.
                        </p>
                      </div>
                      <div className="p-6 space-y-8">
                        {gapsLoading ? (
                          <div className="space-y-6">
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                          </div>
                        ) : gaps ? (
                          <div className="space-y-8">
                            {/* Credit Gaps */}
                            {gaps.creditGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                  </div>
                                  <h3 className="text-base font-bold text-foreground">Credit Deficiencies</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {gaps.creditGaps.map((g, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="p-5 rounded-xl border border-red-200 bg-red-50/30 relative overflow-hidden"
                                    >
                                      <div className="absolute top-0 left-0 w-1 h-full bg-red-400" />
                                      <div className="flex justify-between items-start mb-3">
                                        <span className="font-bold text-foreground">{g.category}</span>
                                        <Badge variant="destructive" className="font-bold px-2 py-0.5">
                                          -{g.deficit} credits
                                        </Badge>
                                      </div>
                                      <Progress
                                        value={(g.creditsEarned / g.creditsRequired) * 100}
                                        className="h-2.5 bg-red-100 mb-2 [&>div]:bg-red-500"
                                      />
                                      <p className="text-xs font-semibold text-muted-foreground flex justify-between">
                                        <span>Earned: {g.creditsEarned}</span>
                                        <span>Required: {g.creditsRequired}</span>
                                      </p>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}

                            {/* Course Gaps */}
                            {gaps.courseGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                    <BookOpen className="h-4 w-4 text-orange-500" />
                                  </div>
                                  <h3 className="text-base font-bold text-foreground">Missing Required Courses</h3>
                                </div>
                                <div className="p-5 rounded-xl border border-orange-200 bg-orange-50/30 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-400" />
                                  <div className="flex flex-wrap gap-2.5">
                                    {gaps.courseGaps.map((g, i) => (
                                      <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                                        key={i}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg dash-card"
                                      >
                                        <span className="font-semibold text-foreground text-sm">{g.courseName}</span>
                                        <span className="text-xs font-mono text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{g.courseCode}</span>
                                      </motion.div>
                                    ))}
                                  </div>
                                </div>
                              </section>
                            )}

                            {/* Career Gaps */}
                            {gaps.careerGaps.length > 0 && (
                              <section>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <Briefcase className="h-4 w-4 text-purple-500" />
                                  </div>
                                  <h3 className="text-base font-bold text-foreground">Career Alignment Warnings</h3>
                                </div>
                                <div className="space-y-3">
                                  {gaps.careerGaps.map((g, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="p-5 rounded-xl border border-purple-200 bg-purple-50/30 relative overflow-hidden flex items-start gap-4"
                                    >
                                      <div className="absolute top-0 left-0 w-1 h-full bg-purple-400" />
                                      <Target className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-foreground text-base">{g.careerPath}</p>
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

                            {/* All Good */}
                            {gaps.creditGaps.length === 0 && gaps.courseGaps.length === 0 && gaps.careerGaps.length === 0 && (
                              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-8 rounded-xl bg-emerald-50/50 border border-emerald-200 text-center">
                                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-foreground mb-2">Student is On Track!</h3>
                                <p className="text-muted-foreground max-w-md mx-auto text-sm">
                                  No academic gaps, missing requirements, or career alignment issues detected.
                                </p>
                              </motion.div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <AlertCircle className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                            <p className="text-muted-foreground font-medium">Unable to load gap data.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* RECOMMENDATIONS TAB */}
                  <TabsContent value="recommendations" className="mt-0 outline-none">
                    <div className="dash-card overflow-hidden">
                      <div className="p-6 border-b border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-foreground flex items-center gap-3">
                            <Lightbulb className="h-5 w-5 text-emerald-500" />
                            AI Action Plan
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                            Smart, personalized course recommendations to resolve existing gaps.
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200 w-fit font-bold tracking-wide flex gap-1.5 items-center">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          AI GENERATED
                        </Badge>
                      </div>

                      <div className="p-6">
                        {recsLoading ? (
                          <div className="space-y-4">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
                          </div>
                        ) : (recs?.nextSemester?.length || recs?.longTerm?.length) ? (
                          <div className="space-y-10">
                            {recs.reasoning && (
                              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-gradient-to-r from-gray-900 to-indigo-900 text-white shadow-lg relative overflow-hidden">
                                <div className="relative z-10">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1 flex items-center gap-1.5">
                                    <Target className="h-3.5 w-3.5" /> Core Strategy
                                  </h4>
                                  <p className="text-sm font-medium leading-relaxed opacity-90">{recs.reasoning}</p>
                                </div>
                              </motion.div>
                            )}

                            {recs.nextSemester.length > 0 && (
                              <section>
                                <h3 className="text-base font-bold text-foreground mb-4">Immediate Requirements (Next Semester)</h3>
                                <div className="grid gap-4">
                                  {recs.nextSemester.map((r, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                      key={i}
                                      className="dash-card p-5 relative overflow-hidden"
                                    >
                                      {r.priority === "high" && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />}
                                      {(r.priority === "medium" || !r.priority) && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />}
                                      <div className="pl-2">
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                                          <div>
                                            <h4 className="text-base font-bold text-foreground">{r.courseName}</h4>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                              <Badge variant="outline" className="font-mono">{r.courseCode}</Badge>
                                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold">{r.credits} Credits</Badge>
                                              <Badge className={`uppercase text-[10px] font-bold tracking-wider ${r.priority === 'high' ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-amber-100 text-amber-700 hover:bg-amber-100'}`}>
                                                {r.priority} Priority
                                              </Badge>
                                            </div>
                                          </div>
                                          <div className="shrink-0 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg text-center">
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Source</p>
                                            <p className="text-sm font-semibold text-foreground capitalize">{r.source.replace("_", " ")}</p>
                                          </div>
                                        </div>
                                        <div className="bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] p-3 rounded-xl mt-3">
                                          <p className="text-sm text-muted-foreground">
                                            <span className="font-bold text-foreground mr-2">Why:</span>
                                            {r.reason}
                                          </p>
                                        </div>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}

                            {recs.longTerm.length > 0 && (
                              <section>
                                <h3 className="text-base font-bold text-foreground mb-4">Long Term Path</h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                  {recs.longTerm.map((r, i) => (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 + 0.3 }}
                                      key={i}
                                      className="dash-card p-5 relative overflow-hidden"
                                    >
                                      <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-300" />
                                      <div className="pl-2">
                                        <div className="flex justify-between items-start mb-2">
                                          <div>
                                            <h4 className="font-bold text-foreground">{r.courseName}</h4>
                                            <p className="text-sm text-muted-foreground font-mono mt-0.5">{r.courseCode}</p>
                                          </div>
                                          <Badge variant="outline">{r.credits} CR</Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed mt-2">{r.reason}</p>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Lightbulb className="h-8 w-8 text-muted-foreground mb-4 opacity-40" />
                            <h3 className="text-base font-bold text-foreground mb-1">No Recommendations Available</h3>
                            <p className="text-muted-foreground max-w-sm text-sm">The AI has not detected any required remediation at this time.</p>
                          </div>
                        )}
                      </div>
                    </div>
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
