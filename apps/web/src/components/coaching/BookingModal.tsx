"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Coach, DaySchedule, TimeSlot } from "@/types/coach";
import { toast } from "sonner";
import { format, getDay } from "date-fns";
import {
  Clock,
  Video,
  Globe,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { parseYmdLocal } from "@/lib/dateUtils";

interface BookingModalProps {
  coach: Coach | null;
  isOpen: boolean;
  onClose: () => void;
  mode?: "book" | "reschedule";
  bookingId?: string;
  initialTopic?: string;
  initialNotes?: string;
  onRescheduleSuccess?: () => void;
}

// Default fallback time slots removed

// Day name mapping
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Generate 30-min slots from a time range
function generateSlotsFromRange(start: string, end: string): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = start.split(":").map(Number);
  const [endHour, endMin] = end.split(":").map(Number);

  let currentHour = startHour;
  let currentMin = startMin;

  while (
    currentHour < endHour ||
    (currentHour === endHour && currentMin < endMin)
  ) {
    const hour12 = currentHour % 12 || 12;
    const meridian = currentHour < 12 ? "am" : "pm";
    const timeStr = `${hour12.toString().padStart(2, "0")}:${currentMin
      .toString()
      .padStart(2, "0")}${meridian}`;
    slots.push(timeStr);

    currentMin += 30;
    if (currentMin >= 60) {
      currentMin = 0;
      currentHour++;
    }
  }

  return slots;
}

import { getCoachAvailableSlots, bookSession } from "@/services/coachService";
import { CoachSlotsResponse } from "@/types/coach";
import { useGlobalStore } from "@/store/useGlobalStore";
import { redirectToStripeCheckout } from "@/services/paymentService";
import { telemetry } from "@/services/telemetryService";

export function BookingModal({
  coach,
  isOpen,
  onClose,
  mode = "book",
  bookingId,
  initialTopic = "",
  initialNotes = "",
  onRescheduleSuccess,
}: BookingModalProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"date-time" | "details">("date-time");
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // API State
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [slotsData, setSlotsData] = useState<CoachSlotsResponse | null>(null);
  const [timezone, setTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const { user } = useGlobalStore();
  const { t } = useTranslation();

  // Fetch slots from API
  useEffect(() => {
    const fetchSlots = async () => {
      if (!date || !coach?.id) return;

      setIsLoadingSlots(true);
      try {
        const formattedDate = format(date, "yyyy-MM-dd");
        const data = await getCoachAvailableSlots(
          coach.id,
          formattedDate,
          timezone
        );
        setSlotsData(data);
      } catch (error) {
        toast.error("Could not load available times");
      } finally {
        setIsLoadingSlots(false);
      }
    };

    if (isOpen) {
      fetchSlots();
    }
  }, [date, coach?.id, timezone, isOpen]);

  const availableTimeSlots = useMemo(() => {
    if (!slotsData) return [];

    // API returns ISO strings or time strings. If ISO, we might need to format them.
    // Based on the spec, it returns full ISO strings e.g., "2024-12-25T09:00:00+05:30".
    // We want to display them as "09:00am".

    return slotsData.slots.map((slotIso) => {
      try {
        // Build a date object from the ISO string
        const d = new Date(slotIso);
        // Format to local time string matching the modal's expected format "hh:mma"
        return format(d, "hh:mma").toLowerCase();
      } catch (e) {
        // Fallback if it's already a simple time string like "09:00am" (though spec says ISO)
        return slotIso;
      }
    });
  }, [slotsData]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("date-time");
      setSelectedTime(null);
      setTopic(initialTopic);
      setNotes(initialNotes);
      setDate(new Date());
      setCurrentMonth(new Date());
    }
  }, [isOpen, initialTopic, initialNotes]);

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setStep("details");
  };

  const handleBook = async () => {
    if (!date || !selectedTime || !topic || !coach) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      // Map the selected visible time back to the full ISO string if possible,
      // or construct it carefully. Since we mapped FROM ISO to display, we should find the matching ISO.
      // However, if we just formatted it for display, we might have lost the exact original string if there were duplicates (unlikely in time slots).

      // Better approach: Find the original slot ISO string from `slotsData.slots` that matches the selectedTime display.
      const originalSlotIso = slotsData?.slots.find((slotIso) => {
        try {
          return (
            format(new Date(slotIso), "hh:mma").toLowerCase() === selectedTime
          );
        } catch {
          return false;
        }
      });

      if (!originalSlotIso) {
        // Fallback logic if we can't match (shouldn't happen with correct API)
        // Construct date from 'date' + 'selectedTime'
        toast.error("Invalid time slot. Please try refreshing.");
        return;
      }

      // Show loading
      setIsBooking(true);

      // Calculate end time based on session duration
      const startDate = new Date(originalSlotIso);
      const durationMinutes = slotsData?.sessionDurationMinutes || 60;
      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

      // 1. Create Booking or Reschedule
      let response;
      if (mode === "reschedule" && bookingId) {
        const { rescheduleSession } = await import("@/services/coachService");
        response = await rescheduleSession(bookingId, {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });
        toast.success("Session rescheduled successfully");
        // Track session reschedule (treated as cancel + book)
        telemetry.trackSession("cancel", bookingId, undefined, undefined, undefined, "rescheduled");
        telemetry.trackSession("book", response.id, coach.id, topic);
        onRescheduleSuccess?.();
      } else {
        response = await bookSession({
          coachId: coach.id,
          slot: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          topic,
          notes: notes,
        });
        // Track session booking
        telemetry.trackSession("book", response.id, coach.id, topic);
      }

      // 2. Payment — all coaching is paid, so every new booking must complete
      // checkout before the slot is held/confirmed (no free-booking path).
      if (mode === "book") {
        if (!user.id) {
          toast.error("User not identified. Please log in.");
          setIsBooking(false);
          return;
        }

        const amountInCents = Math.round((slotsData?.price?.amount ?? 0) * 100);
        if (amountInCents <= 0) {
          // Defensive: the API rejects coaches with no rate, so we shouldn't get here.
          toast.error("This coach hasn't set a session rate yet.");
          onClose();
          return;
        }

        try {
          toast.loading("Redirecting to payment...");
          await redirectToStripeCheckout(
            amountInCents,
            `Coaching Session: ${topic}`,
            user.id,
            { bookingId: response.id }
          );
          // Redirecting...
        } catch (paymentError) {
          toast.error("Booking created but payment failed to initialize.");
          onClose();
        }
      } else {
        // Reschedule already handled above.
        onClose();
      }
    } catch (error) {
      toast.error("Failed to book session. Please try again.");
    } finally {
      setIsBooking(false);
    }
  };

  if (!coach) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[1000px] w-full p-0 overflow-hidden gap-0 bg-white text-gray-900 border-gray-200 shadow-2xl rounded-xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Book a Session</DialogTitle>
        <div className="flex flex-col md:flex-row min-h-[550px]">
          {/* Column 1: Coach Info (Sidebar) */}
          <div className="w-full md:w-[280px] p-6 border-r border-gray-100 flex flex-col bg-white">
            <div className="mb-8">
              {step === "details" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("date-time")}
                  className="mb-4 -ml-2 text-gray-500 hover:text-gray-900"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
              <Avatar className="h-14 w-14 mb-4 border border-gray-100 shadow-sm">
                <AvatarImage src={coach.image} alt={coach.name} />
                <AvatarFallback>{coach.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="text-gray-500 text-sm font-medium mb-1">Coach</p>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {coach.name}
              </h3>
              <p className="text-gray-900 font-semibold text-xl mb-6">
                {mode === "reschedule"
                  ? "Reschedule Session"
                  : slotsData?.price && slotsData.price.amount > 0
                    ? `${slotsData.price.currency} ${slotsData.price.amount}`
                    : "1 Hour Session"}
              </p>

              <div className="space-y-4 text-gray-600 text-sm">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-3 text-gray-400" aria-hidden="true" />
                  <span className="font-medium">
                    {slotsData?.sessionDurationMinutes
                      ? `${slotsData.sessionDurationMinutes} min`
                      : "1 hour"}
                  </span>
                </div>
                <div className="flex items-center">
                  <Video className="h-4 w-4 mr-3 text-gray-400" aria-hidden="true" />
                  <span className="font-medium">Google Meet</span>
                </div>
                <div className="flex items-center">
                  <Globe className="h-4 w-4 mr-3 text-gray-400" aria-hidden="true" />
                  <span className="font-medium">{slotsData?.timezone || timezone}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col md:flex-row">
            {step === "date-time" ? (
              <>
                {/* Column 2: Calendar */}
                <div className="flex-1 p-6 border-r border-gray-100 flex flex-col">
                  <h2 className="text-lg font-semibold mb-4 text-gray-900">
                    {t('booking.selectDateTime')}
                  </h2>

                  {/* Custom Calendar Header */}
                  <div className="flex items-center justify-between mb-4 px-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-gray-100"
                      onClick={() => {
                        const newMonth = new Date(currentMonth);
                        newMonth.setMonth(newMonth.getMonth() - 1);
                        setCurrentMonth(newMonth);
                      }}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="text-base font-semibold text-gray-900" id="calendar-month-label">
                      {format(currentMonth, "MMMM yyyy")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-gray-100"
                      onClick={() => {
                        const newMonth = new Date(currentMonth);
                        newMonth.setMonth(newMonth.getMonth() + 1);
                        setCurrentMonth(newMonth);
                      }}
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => {
                      setDate(newDate);
                      setSelectedTime(null); // Reset time when date changes
                    }}
                    month={currentMonth}
                    onMonthChange={setCurrentMonth}
                    className="p-0 mx-auto"
                    showOutsideDays={false}
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-2",
                      caption: "hidden", // Hide default caption since we use custom
                      nav: "hidden", // Hide default nav
                      month_grid: "w-full border-collapse",
                      weekdays: "flex justify-around mb-2",
                      weekday:
                        "text-gray-400 font-medium text-xs uppercase w-10 text-center",
                      week: "flex justify-around w-full",
                      day: cn(
                        "h-10 w-10 text-center text-sm relative flex items-center justify-center",
                        "[&:has([aria-selected])]:bg-transparent"
                      ),
                      day_button: cn(
                        "h-10 w-10 p-0 font-normal rounded-full transition-all duration-200",
                        "hover:bg-[#2E9098]/10 hover:text-[#2E9098]",
                        "focus:outline-none focus:ring-2 focus:ring-[#2E9098] focus:ring-offset-2"
                      ),
                      selected: cn(
                        "!bg-[#2E9098] !text-white font-semibold",
                        "hover:!bg-[#2E9098] hover:!text-white",
                        "shadow-md"
                      ),
                      today: "bg-gray-100 text-gray-900 font-semibold",
                      outside: "text-gray-300 opacity-50 pointer-events-none",
                      disabled: "text-gray-300 opacity-50 cursor-not-allowed",
                      hidden: "invisible",
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date < today;
                    }}
                  />

                  {/* Coach Timezone Info */}
                  <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {t('booking.timesShownIn', { timezone: slotsData?.timezone || timezone })}
                      </span>
                    </div>
                    {/* Timezone Helper Text */}
                    {slotsData?.timezone && slotsData.timezone !== timezone && (
                      <p className="text-xs text-[#2E9098]">
                        {t('booking.convertedToLocal', { timezone })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Column 3: Time Slots */}
                <div className="w-full md:w-[260px] p-5 bg-gray-50/50 flex flex-col h-[550px]">
                  <div className="mb-4">
                    <h4 className="text-base font-semibold text-gray-900">
                      {date ? format(date, "EEEE, MMM d") : t('booking.selectDate')}
                    </h4>
                    {isLoadingSlots ? (
                      <div className="flex items-center text-sm text-gray-500 mt-1" role="status">
                        <Loader2 className="h-3 w-3 animate-spin mr-2" aria-hidden="true" />
                        {t('booking.checkingAvailability')}
                      </div>
                    ) : (
                      date &&
                      availableTimeSlots.length > 0 && (
                        <p className="text-sm text-gray-500 mt-1">
                          {t('booking.slotsAvailable', { count: availableTimeSlots.length })}
                        </p>
                      )
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    {!date ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                        <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
                        <p>{t('booking.selectDateToSee')}</p>
                      </div>
                    ) : isLoadingSlots ? (
                      <div className="grid grid-cols-2 gap-2" role="status">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <Skeleton key={i} className="h-11 w-full rounded-lg" />
                        ))}
                      </div>
                    ) : availableTimeSlots.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm text-center px-4">
                        <Clock className="h-12 w-12 mb-3 opacity-30" />
                        <p className="font-medium text-gray-600">
                          {t('booking.noAvailability')}
                        </p>
                        <p className="mt-1 mb-4">
                          {t('booking.coachNotAvailable')}
                        </p>

                        {slotsData?.nextAvailableDate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (slotsData.nextAvailableDate) {
                                const nextDate = parseYmdLocal(
                                  slotsData.nextAvailableDate
                                );
                                setDate(nextDate);
                                setCurrentMonth(nextDate);
                              }
                            }}
                          >
                            Jump to{" "}
                            {format(
                              parseYmdLocal(slotsData.nextAvailableDate),
                              "MMM d"
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      availableTimeSlots.map((time) => {
                        const isSelected = selectedTime === time;

                        return (
                          <Button
                            key={time}
                            // Past check is handled by API mostly, but keeping UI check is fine
                            // though confusing if we mix timezones.
                            // Since API returns valid future slots, we can rely on it primarily.
                            variant={isSelected ? "default" : "outline"}
                            className={cn(
                              "w-full justify-center font-medium h-11 transition-all rounded-lg",
                              isSelected
                                ? "bg-[#2E9098] text-white border-[#2E9098] hover:bg-[#2E9098] shadow-md"
                                : "border-gray-200 text-[#2E9098] hover:bg-[#2E9098]/10 hover:border-[#2E9098] hover:text-[#2E9098]"
                            )}
                            onClick={() => handleTimeSelect(time)}
                          >
                            {time}
                          </Button>
                        );
                      })
                    )}
                  </div>

                  {/* Continue Button */}
                  {selectedTime && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <Button
                        className="w-full bg-[#2E9098] hover:bg-[#2E9098] text-white h-11 font-medium"
                        onClick={() => setStep("details")}
                      >
                        {t('booking.continue')}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Details Step
              <div className="flex-1 p-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-gray-900 mb-6">{t('booking.enterDetailsTitle')}</h2>
                <div className="max-w-md space-y-6">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="topic"
                      className="text-gray-700 font-medium"
                    >
                      {t('booking.topicLabel')}
                    </Label>
                    <Select onValueChange={setTopic} value={topic}>
                      <SelectTrigger className="h-11 border-gray-300 focus:ring-black focus:ring-offset-0">
                        <SelectValue placeholder={t('booking.selectTopic')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="career-guidance">{t('booking.topics.careerGuidance')}</SelectItem>
                        <SelectItem value="interview-prep">{t('booking.topics.interviewPrep')}</SelectItem>
                        <SelectItem value="resume-review">{t('booking.topics.resumeReview')}</SelectItem>
                        <SelectItem value="skill-development">{t('booking.topics.skillDevelopment')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label
                      htmlFor="notes"
                      className="text-gray-700 font-medium"
                    >
                      {t('booking.notesLabel')}
                    </Label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="flex min-h-[120px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      placeholder={t('booking.prepNotesPlaceholder')}
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep("date-time")}
                      className="h-11 px-6 border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      className="h-11 px-8 bg-gray-900 text-white hover:bg-gray-800"
                      onClick={handleBook}
                      disabled={isBooking}
                    >
                      {isBooking ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          {t('booking.processing')}
                        </>
                      ) : mode === "reschedule" ? (
                        t('booking.rescheduleSession')
                      ) : slotsData?.price && slotsData.price.amount > 0 ? (
                        t('booking.bookAndPay')
                      ) : (
                        t('booking.scheduleEvent')
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
