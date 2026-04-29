"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Trash2, CalendarDays, BookOpenCheck, SunMedium, Calendar, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useAcademicYears,
  useCreateAcademicYear,
  useDeleteAcademicYear,
  useAssessmentPeriods,
  useCreateAssessmentPeriod,
  useDeleteAssessmentPeriod,
  useHolidays,
  useCreateHolidays,
  useDeleteHoliday,
} from "@/hooks/useCalendarQueries";
import type { AcademicYearPayload, AssessmentPeriodPayload, AssessmentType } from "@/types/calendar";

export default function CalendarPage() {
  const { t } = useTranslation();

  // Data hooks
  const { data: years, isLoading: yearsLoading } = useAcademicYears();
  const { data: periods, isLoading: periodsLoading } = useAssessmentPeriods();
  const { data: holidays, isLoading: holidaysLoading } = useHolidays();
  const createYear = useCreateAcademicYear();
  const deleteYear = useDeleteAcademicYear();
  const createPeriod = useCreateAssessmentPeriod();
  const deletePeriod = useDeleteAssessmentPeriod();
  const createHoliday = useCreateHolidays();
  const deleteHolidayMut = useDeleteHoliday();

  // Dialogs
  const [yearOpen, setYearOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);

  // Year form
  const [yearForm, setYearForm] = useState<AcademicYearPayload>({
    name: "", startDate: "", endDate: "",
    terms: [{ name: "Semester 1", startDate: "", endDate: "" }],
  });

  // Period form
  const [periodForm, setPeriodForm] = useState<AssessmentPeriodPayload>({
    name: "", termId: "", startDate: "", endDate: "", assessmentTypes: ["MIL"],
  });

  // Holiday form
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState<"national" | "school" | "custom">("school");

  const handleCreateYear = () => {
    if (!yearForm.name || !yearForm.startDate || !yearForm.endDate) {
      toast.error("Please fill out all fields");
      return;
    }

    const payload = {
      ...yearForm,
      terms: [
        {
          name: "Semester 1",
          startDate: yearForm.startDate,
          endDate: yearForm.endDate,
        },
      ],
    };

    createYear.mutate(payload, {
      onSuccess: () => { toast.success("Academic year created"); setYearOpen(false); },
      onError: () => toast.error("Failed to create"),
    });
  };

  const handleCreatePeriod = () => {
    if (!periodForm.name || !periodForm.startDate || !periodForm.endDate || !periodForm.termId) {
      toast.error("Please fill out all required fields");
      return;
    }
    createPeriod.mutate(periodForm, {
      onSuccess: () => { toast.success("Assessment period created"); setPeriodOpen(false); },
      onError: () => toast.error("Failed to create"),
    });
  };

  const handleCreateHoliday = () => {
    if (!holidayName || !holidayDate) {
      toast.error("Please fill out holiday name and date");
      return;
    }
    createHoliday.mutate(
      { holidays: [{ name: holidayName, date: holidayDate, type: holidayType }] },
      {
        onSuccess: () => { toast.success("Holiday added"); setHolidayOpen(false); setHolidayName(""); setHolidayDate(""); },
        onError: () => toast.error("Failed to add holiday"),
      }
    );
  };

  const isLoading = yearsLoading || periodsLoading || holidaysLoading;
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[300px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full rounded-2xl" />
          <Skeleton className="h-[400px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const safeYears = Array.isArray(years) ? years : [];
  const safePeriods = Array.isArray(periods) ? periods : [];
  const safeHolidays = Array.isArray(holidays) ? holidays : [];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.calendar.title", "Academic Calendar")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.calendar.subtitle", "Sculpt your institution’s temporal rhythm. Manage years, assessment windows, and holidays globally.")}
        </p>
      </motion.div>

      {/* Academic Years */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl">
          <CardHeader className="bg-gradient-to-r from-teal-50/80 to-cyan-50/80 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-teal-100/50">
                  <CalendarDays className="h-6 w-6 text-teal-600" />
                </div>
                Academic Years
              </CardTitle>
              <CardDescription className="text-base mt-2">Define the macro-structure of your educational timeline.</CardDescription>
            </div>
            <Dialog open={yearOpen} onOpenChange={setYearOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all">
                  <Plus className="h-5 w-5 mr-2" />Initialize New Year
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl pt-2">Create Academic Year</DialogTitle>
                  <DialogDescription>Setup the core start and end dates for a new academic cycle.</DialogDescription>
                </DialogHeader>
                <div className="space-y-5 py-6">
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Year Outline Name</Label>
                    <Input className="rounded-xl bg-gray-50 focus:bg-white" value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} placeholder="E.g., 2025-2026 Academic Cycle" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">Commencement</Label>
                      <Input type="date" className="rounded-xl bg-gray-50 focus:bg-white" value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">Conclusion</Label>
                      <Input type="date" className="rounded-xl bg-gray-50 focus:bg-white" value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-3 sm:gap-0">
                  <Button variant="ghost" className="rounded-xl" onClick={() => setYearOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateYear} disabled={createYear.isPending} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-6">
                    {createYear.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Year
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AnimatePresence>
                {safeYears.map((y, i) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.05 }}
                    key={y.id}
                    className={`relative p-6 rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden group ${y.isCurrent ? "border-teal-200 bg-gradient-to-br from-teal-50/50 to-white" : "border-gray-200 bg-white hover:border-teal-200"}`}
                  >
                    {y.isCurrent && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-teal-500 rounded-l-2xl" />
                    )}
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-bold text-gray-900 leading-none">{y.name}</h3>
                          {y.isCurrent && <Badge className="bg-teal-100 text-teal-800 border-teal-200 px-2 py-0.5 text-xs uppercase tracking-wider font-bold"><Sparkles className="w-3 h-3 mr-1 inline-block text-teal-500" />Active Year</Badge>}
                        </div>
                        <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {new Date(y.startDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} — {new Date(y.endDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" onClick={() => deleteYear.mutate(y.id, { onSuccess: () => toast.success("Year deleted") })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {y.terms.length > 0 && (
                      <div className="mt-5 space-y-2.5">
                        {y.terms.map((term) => (
                          <div key={term.id} className="text-sm bg-white/80 border border-gray-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2.5 font-medium text-gray-700">
                              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                              {term.name}
                            </div>
                            <span className="text-gray-500 text-xs font-semibold tracking-wide">
                              {new Date(term.startDate).toLocaleDateString()} — {new Date(term.endDate).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {safeYears.length === 0 && (
                <div className="col-span-1 lg:col-span-2 py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                    <CalendarDays className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-xl font-semibold text-gray-900 mb-2">No Academic Years Yet</p>
                  <p className="text-gray-500 max-w-sm mb-6">Create your first academic year to establish the baseline for all assessments and scheduling.</p>
                  <Button variant="outline" onClick={() => setYearOpen(true)} className="rounded-xl border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100">
                    <Plus className="w-4 h-4 mr-2" /> Add Your First Year
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Assessment Periods */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="h-full">
          <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl h-full flex flex-col">
            <CardHeader className="bg-gradient-to-r from-violet-50/80 to-purple-50/80 border-b border-gray-100 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-violet-100/50">
                      <BookOpenCheck className="h-5 w-5 text-violet-600" />
                    </div>
                    Assessment Windows
                  </CardTitle>
                  <CardDescription className="text-sm mt-2">Active periods for test taking.</CardDescription>
                </div>
                <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
                  <DialogTrigger asChild>
                    <Button size="icon" className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-md h-10 w-10 flex-shrink-0">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-2xl pt-2">Create Assessment Period</DialogTitle>
                      <DialogDescription>Define when students and staff can participate in evaluations.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-6">
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">Window Designation</Label>
                        <Input className="rounded-xl bg-gray-50 focus:bg-white" value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder="E.g., Mid-Term Checkpoint" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">Assessment Type</Label>
                        <Select value={periodForm.assessmentTypes[0]} onValueChange={(v) => setPeriodForm({ ...periodForm, assessmentTypes: [v as AssessmentType] })}>
                          <SelectTrigger className="rounded-xl bg-gray-50 focus:bg-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MIL">Mantra Immersive Learning (MIL)</SelectItem>
                            <SelectItem value="PCA">Personality & Cognitive (PCA)</SelectItem>
                            <SelectItem value="360">360° Evaluation</SelectItem>
                            <SelectItem value="TIMS">Teacher Impact (TIMS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">Opens</Label>
                          <Input type="date" className="rounded-xl bg-gray-50 focus:bg-white" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">Closes</Label>
                          <Input type="date" className="rounded-xl bg-gray-50 focus:bg-white" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                        </div>
                      </div>
                      {safeYears.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">Associated Academic Term</Label>
                          <Select value={periodForm.termId} onValueChange={(v) => setPeriodForm({ ...periodForm, termId: v })}>
                            <SelectTrigger className="rounded-xl bg-gray-50 focus:bg-white"><SelectValue placeholder="Select relevant term" /></SelectTrigger>
                            <SelectContent>{safeYears.flatMap((y) => y.terms).map((term) => <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <DialogFooter className="gap-3 sm:gap-0">
                      <Button variant="ghost" className="rounded-xl" onClick={() => setPeriodOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreatePeriod} disabled={createPeriod.isPending} className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-6">
                        {createPeriod.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Establish Window
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex-1 bg-gray-50/30">
              <div className="grid grid-cols-1 gap-4">
                <AnimatePresence>
                  {safePeriods.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.assessmentTypes.map((at) => (
                            <Badge key={at} variant="secondary" className="bg-violet-100 text-violet-700 hover:bg-violet-200 border-none px-2 rounded-md">
                              {at}
                            </Badge>
                          ))}
                          <span className="font-bold text-gray-900 ml-1">{p.name}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center text-sm font-medium text-gray-500">
                          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-emerald-500" /> {new Date(p.startDate).toLocaleDateString()}</span>
                          <span className="hidden sm:inline-block text-gray-300">→</span>
                          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-rose-400" /> {new Date(p.endDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-10 w-10 sm:self-center shrink-0 rounded-xl bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-100 transition-colors" onClick={() => deletePeriod.mutate(p.id, { onSuccess: () => toast.success("Window deleted") })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {safePeriods.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-violet-50 rounded-full flex items-center justify-center mb-3">
                      <BookOpenCheck className="w-5 h-5 text-violet-300" />
                    </div>
                    <p className="font-medium text-gray-900">No Active Windows</p>
                    <p className="text-sm text-gray-500">Add an assessment period to begin.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Holidays */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
          <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl h-full flex flex-col">
            <CardHeader className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 border-b border-gray-100 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-amber-100/50">
                      <SunMedium className="h-5 w-5 text-amber-500" />
                    </div>
                    School Holidays
                  </CardTitle>
                  <CardDescription className="text-sm mt-2">Designate non-instructional break days.</CardDescription>
                </div>
                <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
                  <DialogTrigger asChild>
                    <Button size="icon" className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md h-10 w-10 flex-shrink-0">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-2xl pt-2">Mark a Holiday</DialogTitle>
                      <DialogDescription>Add to the global school exclusion calendar.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-6">
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">Holiday Celebration Name</Label>
                        <Input className="rounded-xl bg-gray-50 focus:bg-white" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="E.g., Winter Recess" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">Observation Date</Label>
                        <Input type="date" className="rounded-xl bg-gray-50 focus:bg-white" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">Classification Type</Label>
                        <Select value={holidayType} onValueChange={(v) => setHolidayType(v as "national" | "school" | "custom")}>
                          <SelectTrigger className="rounded-xl bg-gray-50 focus:bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="national">National Holiday</SelectItem>
                            <SelectItem value="school">School-Specific Break</SelectItem>
                            <SelectItem value="custom">Custom Exclusion</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter className="gap-3 sm:gap-0">
                      <Button variant="ghost" className="rounded-xl" onClick={() => setHolidayOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateHoliday} disabled={createHoliday.isPending} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-6">
                        {createHoliday.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Holiday
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex-1 bg-gray-50/30">
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {safeHolidays.map((h, i) => (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.05 }}
                      className="group flex flex-row items-center justify-between p-3.5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-amber-200 transition-all"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`w-2.5 h-10 rounded-full ${h.type === 'national' ? "bg-red-400" :
                            h.type === 'school' ? "bg-blue-400" : "bg-emerald-400"
                          }`} />
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-sm">{h.name}</span>
                          <span className="font-semibold tracking-wide text-xs text-amber-600/80 uppercase mt-0.5">{new Date(h.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl hover:bg-red-50 border border-transparent hover:border-red-100 text-red-400 hover:text-red-500"
                        onClick={() => deleteHolidayMut.mutate(h.id, { onSuccess: () => toast.success("Holiday removed") })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {safeHolidays.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                      <SunMedium className="w-5 h-5 text-amber-300" />
                    </div>
                    <p className="font-medium text-gray-900">No Holidays Set</p>
                    <p className="text-sm text-gray-500">Days listed here are omitted from logic.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
