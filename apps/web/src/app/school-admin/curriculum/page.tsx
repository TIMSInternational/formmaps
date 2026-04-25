"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen, Search, Settings2, Hash, Layers, GraduationCap, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useFrameworks,
  useUpdateFrameworks,
  useFrameworkCourses,
} from "@/hooks/useCurriculumQueries";
import type { CurriculumFramework, FrameworkType } from "@/types/curriculum";

export default function CurriculumPage() {
  const { t } = useTranslation();
  const { data: frameworks, isLoading } = useFrameworks();
  const updateFrameworks = useUpdateFrameworks();
  const [selectedType, setSelectedType] = useState<FrameworkType | "">("");
  const [courseSearch, setCourseSearch] = useState("");
  const [coursePage, setCoursePage] = useState(1);

  // Auto-select first framework if none is selected
  useEffect(() => {
    if (frameworks && frameworks.length > 0 && !selectedType) {
      setSelectedType(frameworks[0].type);
    }
  }, [frameworks, selectedType]);

  // Keep pagination stable
  const { data: courses, isLoading: coursesLoading } = useFrameworkCourses(
    selectedType as string,
    { page: coursePage, limit: 10, search: courseSearch || undefined }
  );

  const handleToggle = (framework: CurriculumFramework) => {
    if (!frameworks) return;
    const updated = frameworks.map((f) =>
      f.type === framework.type ? { type: f.type, enabled: !f.enabled } : { type: f.type, enabled: f.enabled }
    );
    updateFrameworks.mutate(
      { frameworks: updated },
      {
        onSuccess: () => toast.success("Framework configuration updated successfully."),
        onError: () => toast.error("Failed to update framework configuration."),
      }
    );
  };

  // Generate page numbers for better pagination visibility
  const getPageNumbers = () => {
    if (!courses) return [];
    const totalPages = courses.totalPages;
    const current = coursePage;
    const pages: (number | string)[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
        pages.push(i);
      } else if (i === current - 2 || i === current + 2) {
        pages.push("...");
      }
    }

    return pages.filter((item, index) => item !== "..." || pages[index - 1] !== "...");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.curriculum.title", "Curriculum Frameworks")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.curriculum.subtitle", "Enable and instantly configure AP, IB, National, or custom curricular frameworks for your entire institution.")}
        </p>
      </motion.div>

      {/* Framework Toggles */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border-b border-gray-100 pb-5">
            <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-blue-100/50">
                <Settings2 className="h-5 w-5 text-blue-600" />
              </div>
              {t("schoolAdmin.curriculum.frameworksTitle", "Active Framework Configurations")}
            </CardTitle>
            <CardDescription className="text-base mt-1 text-gray-600">
              {t("schoolAdmin.curriculum.frameworksDesc", "Toggle the overarching systems your school employs to populate the course registry.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {frameworks?.map((fw) => (
                <div
                  key={fw.type}
                  className={`relative flex flex-col justify-between p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden group ${selectedType === fw.type ? "ring-4 ring-blue-50/50 border-blue-500 scale-[1.02] shadow-md bg-white" :
                      fw.enabled ? "border-blue-200 bg-gradient-to-br from-blue-50/30 to-white hover:border-blue-300 hover:shadow-md" :
                        "border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 opacity-80 hover:opacity-100"
                    }`}
                  onClick={() => {
                    setSelectedType(fw.type);
                    setCoursePage(1);
                    setCourseSearch("");
                  }}
                >
                  {selectedType === fw.type && (
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full pointer-events-none -z-10 transition-transform group-hover:scale-110" />
                  )}

                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${fw.enabled ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                      <Layers className="w-5 h-5" />
                    </div>
                    <Switch
                      className="data-[state=checked]:bg-blue-500"
                      checked={fw.enabled}
                      onCheckedChange={() => handleToggle(fw)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <p className={`font-bold text-lg mb-1 ${fw.enabled ? "text-gray-900" : "text-gray-600"}`}>{fw.label}</p>
                    <p className={`text-sm font-medium ${fw.enabled ? "text-blue-600" : "text-gray-400"}`}>
                      {fw.courseCount} connected courses
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Framework Courses */}
      <AnimatePresence mode="wait">
        {selectedType && (
          <motion.div
            key={selectedType}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl flex flex-col min-h-[500px]">
              <CardHeader className="bg-gradient-to-r from-teal-50/80 to-cyan-50/80 border-b border-gray-100 pb-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                      <div className="p-2 bg-white rounded-xl shadow-sm border border-teal-100/50">
                        <BookOpen className="h-5 w-5 text-teal-600" />
                      </div>
                      <span className="text-teal-700 mx-1">{frameworks?.find(f => f.type === selectedType)?.label}</span>
                      {t("schoolAdmin.curriculum.courses", "Course Repository")}
                    </CardTitle>
                    <CardDescription className="text-sm mt-2 font-medium">Browse and modify the catalogue specifically mapped to this framework.</CardDescription>
                  </div>

                  <div className="relative w-full md:w-[320px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={t("schoolAdmin.curriculum.searchCourses", "Search by code or title...")}
                      value={courseSearch}
                      onChange={(e) => { setCourseSearch(e.target.value); setCoursePage(1); }}
                      className="pl-11 rounded-2xl bg-white/80 border-transparent focus:bg-white focus:border-teal-300 shadow-sm transition-all h-11"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-gray-50/50 border-b border-gray-100">
                      <TableRow className="hover:bg-transparent border-gray-100">
                        <TableHead className="font-semibold text-gray-700 w-32 py-4 pl-6 flex items-center gap-1.5"><Hash className="w-4 h-4 text-gray-400" /> Code</TableHead>
                        <TableHead className="font-semibold text-gray-700 w-1/3">Course Title</TableHead>
                        <TableHead className="font-semibold text-gray-700 hidden sm:table-cell">Department Field</TableHead>
                        <TableHead className="font-semibold text-gray-700 text-center">Credit Vol.</TableHead>
                        <TableHead className="font-semibold text-gray-700 pr-6">Eligible Grades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coursesLoading && !courses ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-64 text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          <AnimatePresence mode="popLayout">
                            {courses?.data?.map((c) => (
                              <motion.tr
                                key={c.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="group hover:bg-teal-50/30 transition-colors border-b border-gray-50 cursor-pointer"
                              >
                                <TableCell className="font-mono text-sm font-semibold text-gray-500 pl-6 py-4">{c.code}</TableCell>
                                <TableCell>
                                  <div className="font-medium text-gray-900 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {c.name}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <Badge variant="outline" className="bg-white text-gray-600 border-gray-200">
                                    {c.department}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center font-semibold text-gray-700">{c.credits}</TableCell>
                                <TableCell className="pr-6">
                                  <div className="flex flex-wrap gap-1">
                                    {c.gradeLevel.map((g) => (
                                      <span key={g} className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        Gr. {g}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                          {(!courses?.data || courses.data.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={5} className="h-64 text-center border-b-0">
                                <div className="flex flex-col items-center justify-center space-y-3 text-gray-400">
                                  <div className="p-4 bg-gray-50 rounded-full">
                                    <GraduationCap className="h-8 w-8 text-gray-400" />
                                  </div>
                                  <p className="text-lg font-medium text-gray-900">No catalogue entries found.</p>
                                  <p className="text-sm max-w-sm">Try adjusting your search terminology or switch to an alternate active framework.</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>

              {/* Refined Pagination Footer */}
              {courses && courses.totalPages > 1 && (
                <CardFooter className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-4 mt-auto">
                  <div className="text-sm text-gray-500 hidden sm:block">
                    Displaying <span className="font-medium text-gray-900">{((coursePage - 1) * 10) + (courses.data.length > 0 ? 1 : 0)}</span> – <span className="font-medium text-gray-900">{Math.min(coursePage * 10, courses.total)}</span> of <span className="font-medium text-gray-900">{courses.total}</span> courses
                  </div>
                  <div className="flex items-center gap-1 w-full justify-center sm:w-auto sm:justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg border-gray-200 bg-white"
                      disabled={coursePage <= 1}
                      onClick={() => setCoursePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 text-gray-600" />
                    </Button>

                    {getPageNumbers().map((pageNum, idx) => (
                      pageNum === "..." ? (
                        <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                      ) : (
                        <Button
                          key={`page-${pageNum}`}
                          variant={coursePage === pageNum ? "default" : "outline"}
                          size="sm"
                          className={`h-8 w-8 rounded-lg ${coursePage === pageNum ? 'bg-teal-600 hover:bg-teal-700 shadow-sm text-white border-transparent' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                          onClick={() => setCoursePage(pageNum as number)}
                        >
                          {pageNum}
                        </Button>
                      )
                    ))}

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg border-gray-200 bg-white"
                      disabled={coursePage >= courses.totalPages}
                      onClick={() => setCoursePage((p) => Math.min(courses.totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4 text-gray-600" />
                    </Button>
                  </div>
                </CardFooter>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
