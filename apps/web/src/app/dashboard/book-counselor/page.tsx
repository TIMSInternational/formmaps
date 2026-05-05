"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { format, addDays, isSameDay, startOfDay } from "date-fns";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2,
  Loader2,
  FileText,
  Video,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getCounselorSlots, bookCounselorSession, getSchoolCounselors } from "@/services/counselorSessionService";
import type { TimeSlot } from "@/services/counselorSessionService";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOPICS = [
  "Academic Planning",
  "Course Selection",
  "College Applications",
  "Career Guidance",
  "Personal Development",
  "Graduation Requirements",
  "Scholarship Information",
  "Other",
];

export default function BookCounselorPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useGlobalStore();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(startOfDay(new Date()));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [notes, setNotes] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [booked, setBooked] = useState(false);

  const [counselors, setCounselors] = useState<{ id: string; name: string; email: string; avatar?: string }[]>([]);
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>("");
  const [loadingCounselors, setLoadingCounselors] = useState(true);

  useEffect(() => {
    async function fetchCounselors() {
      try {
        const data = await getSchoolCounselors();
        setCounselors(data);
        if (data.length > 0) {
          // If the user happens to have an assigned counselor, prefer them. Otherwise pick the first.
          const assignedId = (user as any)?.counselorId || (user as any)?.assignedCounselorId;
          const assignedOpt = data.find(c => c.id === assignedId);
          if (assignedOpt) {
             setSelectedCounselorId(assignedOpt.id);
          } else {
             setSelectedCounselorId(data[0].id);
          }
        }
      } catch (err) {
      // error handled silently
    } finally {
        setLoadingCounselors(false);
      }
    }
    fetchCounselors();
  }, [user]);

  useEffect(() => {
    if (!selectedCounselorId) return;
    fetchSlots(selectedDate);
  }, [selectedDate, selectedCounselorId]);

  const fetchSlots = async (date: Date) => {
    if (!selectedCounselorId) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      // Format using UTC date parts so the date string always matches the server's UTC-based slot generation,
      // regardless of the student's local browser timezone.
      const utcYear = date.getUTCFullYear();
      const utcMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
      const utcDay = String(date.getUTCDate()).padStart(2, "0");
      const dateStr = `${utcYear}-${utcMonth}-${utcDay}`;
      const result = await getCounselorSlots(selectedCounselorId, dateStr);
      setSlots(result.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(calendarWeekStart, i));

  const handleBook = async () => {
    if (!selectedSlot || !selectedCounselorId) return;
    setIsBooking(true);
    try {
      await bookCounselorSession(selectedCounselorId, {
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        topic,
        notes,
        meetingLink,
      });
      setBooked(true);
      toast.success("Session booked successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to book session");
    } finally {
      setIsBooking(false);
    }
  };

  if (loadingCounselors) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (counselors.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="h-8 w-8 text-indigo-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Counselors Available</h2>
            <p className="text-gray-500 text-sm mb-6">
              There are no counselors available at your school right now. Please contact your school administrator.
            </p>
            <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (booked) {
    return (
      <div className="flex items-center justify-center py-24">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md w-full text-center">
            <CardContent className="pt-10 pb-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.15 }}>
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <Badge className="bg-green-100 text-green-700 border-0 mb-4">FREE Session</Badge>
              <h2 className="text-2xl font-bold text-foreground mb-2">Session Booked!</h2>
              <p className="text-gray-500 text-sm mb-1 font-medium">
                {selectedSlot && format(new Date(selectedSlot.start), "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-gray-500 text-sm mb-6">
                {selectedSlot && `${format(new Date(selectedSlot.start), "h:mm a")} – ${format(new Date(selectedSlot.end), "h:mm a")}`}
              </p>
              <p className="text-gray-500 text-sm mb-8">Topic: <span className="font-medium text-gray-700">{topic}</span></p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => router.push("/dashboard/my-sessions")}>
                  View My Sessions
                </Button>
                <Button
                  className="bg-foreground text-background"
                  onClick={() => { setBooked(false); setSelectedSlot(null); fetchSlots(selectedDate); }}
                >
                  Book Another
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-xl">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("counselorBooking.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("counselorBooking.subtitle")}</p>
          </div>
          <Badge className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2.5 py-1">{t("counselorBooking.free")}</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Calendar + Slots */}
          <div className="lg:col-span-3 space-y-5">
            {/* Counselor Selector */}
            {counselors.length > 1 && (
              <Card className="dash-card border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-indigo-500" />
                    {t("counselorBooking.selectCounselor")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedCounselorId} onValueChange={setSelectedCounselorId}>
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Select a counselor" />
                    </SelectTrigger>
                    <SelectContent>
                      {counselors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.email ? `(${c.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {/* Week Picker */}
            <Card className="dash-card border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    {t("counselorBooking.selectDate")}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                      onClick={() => setCalendarWeekStart(d => addDays(d, -7))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium text-gray-600 min-w-[120px] text-center">
                      {format(calendarWeekStart, "MMM d")} – {format(addDays(calendarWeekStart, 6), "MMM d, yyyy")}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                      onClick={() => setCalendarWeekStart(d => addDays(d, 7))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isPast = day < startOfDay(new Date());
                    return (
                      <button
                        key={day.toISOString()}
                        disabled={isPast}
                        onClick={() => setSelectedDate(day)}
                        className={`flex flex-col items-center py-2.5 rounded-xl text-xs font-medium transition-all
                          ${isSelected ? "bg-indigo-600 text-white shadow-md" : ""}
                          ${!isSelected && !isPast ? "hover:bg-indigo-50 text-gray-700" : ""}
                          ${isPast ? "text-gray-300 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span className="text-[10px] uppercase tracking-wide mb-1">
                          {format(day, "EEE")}
                        </span>
                        <span className="text-base font-bold">{format(day, "d")}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Slots */}
            <Card className="dash-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  {t("counselorBooking.availableTimes")} — {format(selectedDate, "EEEE, MMMM d")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                  </div>
                ) : slots.filter(s => s.available).length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">{t("counselorBooking.noSlots")}</p>
                    <p className="text-xs mt-1">{t("counselorBooking.tryAnotherDate")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <AnimatePresence>
                      {slots.filter(s => s.available).map((slot, i) => {
                        const isSelected = selectedSlot?.start === slot.start;
                        return (
                          <motion.button
                            key={slot.start}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-2 rounded-xl text-sm font-medium border transition-all
                              ${isSelected
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                                : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"}`}
                          >
                            {format(new Date(slot.start), "h:mm a")}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Booking Form */}
          <div className="lg:col-span-2">
            <Card className="dash-card border sticky top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">{t("counselorBooking.sessionDetails")}</CardTitle>
                <CardDescription>{t("counselorBooking.fillDetails")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSlot && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <p className="text-sm font-semibold text-indigo-700">{format(new Date(selectedSlot.start), "EEEE, MMMM d, yyyy")}</p>
                    <p className="text-sm text-indigo-600">
                      {format(new Date(selectedSlot.start), "h:mm a")} – {format(new Date(selectedSlot.end), "h:mm a")} (30 min)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="topic">{t("counselorBooking.topic")}</Label>
                  <select
                    id="topic"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-gray-400" />
                    {t("counselorBooking.notesLabel")}
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder={t("counselorBooking.notesPlaceholder")}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="resize-none border-gray-200 rounded-xl text-sm"
                  />
                </div>

                <div className="pt-2 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("counselorBooking.topic")}</span>
                    <Badge className="bg-green-100 text-green-700 border-0">{t("counselorBooking.free")}</Badge>
                  </div>
                  <Button
                    className="w-full bg-foreground text-background hover:bg-foreground/90 h-11 rounded-xl"
                    disabled={!selectedSlot || isBooking}
                    onClick={handleBook}
                  >
                    {isBooking ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("counselorBooking.booking")}</>
                    ) : selectedSlot ? (
                      <>{t("counselorBooking.bookSession")} — {format(new Date(selectedSlot.start), "h:mm a")}</>
                    ) : (
                      t("counselorBooking.selectSlotFirst")
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
