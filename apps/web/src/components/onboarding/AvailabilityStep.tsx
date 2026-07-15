import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoachOnboardingData, WeeklySchedule } from "./types";
import { Plus, Trash2, Copy, Clock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface AvailabilityStepProps {
  data: CoachOnboardingData["availability"];
  onNext: (data: CoachOnboardingData["availability"]) => void;
  onBack: () => void;
}

export function AvailabilityStep({ data, onNext, onBack }: AvailabilityStepProps) {
  const { t } = useTranslation();
  const [schedule, setSchedule] = React.useState<WeeklySchedule[]>(data.weeklySchedule);
  const [timezone, setTimezone] = React.useState(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const handleDayToggle = (dayIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].enabled = !newSchedule[dayIndex].enabled;
    setSchedule(newSchedule);
  };

  const handleAddTimeSlot = (dayIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots.push({ start: "09:00", end: "17:00" });
    setSchedule(newSchedule);
  };

  const handleRemoveTimeSlot = (dayIndex: number, slotIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots.splice(slotIndex, 1);
    setSchedule(newSchedule);
  };

  const handleTimeChange = (
    dayIndex: number,
    slotIndex: number,
    field: "start" | "end",
    value: string
  ) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots[slotIndex][field] = value;
    setSchedule(newSchedule);
  };

  const copyToAll = (dayIndex: number) => {
    const sourceSlots = schedule[dayIndex].timeSlots;
    const newSchedule = schedule.map((day) => ({
      ...day,
      enabled: true,
      timeSlots: [...sourceSlots.map(slot => ({ ...slot }))],
    }));
    setSchedule(newSchedule);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate time slots
    for (const day of schedule) {
      if (day.enabled) {
        for (const slot of day.timeSlots) {
          if (slot.start >= slot.end) {
            toast.error(t("onboarding.availability.invalidTimeRange", { day: day.day, defaultValue: `Invalid time range on ${day.day}: Start time must be before end time` }));
            return;
          }
        }
      }
    }

    onNext({ timezone, weeklySchedule: schedule });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="bg-[#2E9098]/10 p-6 rounded-xl border border-[#2E9098]/20 flex items-start gap-4">
        <div className="p-2 bg-[#2E9098]/10 rounded-lg text-[#2E9098]" aria-hidden="true">
          <Globe className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <Label htmlFor="timezone" className="text-[#102B47] font-semibold">{t("onboarding.availability.timezone", "Timezone")}</Label>
          <p className="text-sm text-[#102B47]/80 mb-3">{t("onboarding.availability.timezoneDesc", "Set your local timezone for accurate scheduling.")}</p>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="bg-white border-[#2E9098]/30 text-[#102B47] focus:ring-[#2E9098]/30">
              <SelectValue placeholder={t("onboarding.availability.selectTimezone", "Select timezone")} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">{t("onboarding.availability.weeklySchedule", "Weekly Schedule")}</h3>
          <span className="text-sm text-gray-500">{t("onboarding.availability.scheduleDesc", "Set your recurring availability")}</span>
        </div>
        
        <div className="space-y-3">
          {schedule.map((day, dayIndex) => (
            <motion.div 
              key={day.day}
              initial={false}
              animate={{ backgroundColor: day.enabled ? "white" : "#F9FAFB" }}
              className={cn(
                "border rounded-xl transition-all duration-200 overflow-hidden",
                day.enabled ? "border-gray-200 shadow-sm" : "border-gray-100 opacity-80"
              )}
            >
              <div className="p-4 flex flex-col sm:flex-row gap-4">
                <div className="w-32 flex items-center pt-1">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={() => handleDayToggle(dayIndex)}
                    id={`day-${dayIndex}`}
                    className="mr-3 data-[state=checked]:bg-black"
                  />
                  <Label 
                    htmlFor={`day-${dayIndex}`} 
                    className={cn(
                      "font-medium cursor-pointer transition-colors",
                      day.enabled ? "text-gray-900" : "text-gray-400"
                    )}
                  >
                    {t(`days.${day.day.toLowerCase()}`, day.day)}
                  </Label>
                </div>

                <div className="flex-1">
                  <AnimatePresence>
                    {!day.enabled ? (
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-gray-400 italic py-1"
                        role="status"
                        aria-label={t("onboarding.availability.unavailableLabel", "Unavailable on this day")}
                      >
                        {t("onboarding.availability.unavailable", "Unavailable")}
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3"
                      >
                        {day.timeSlots.map((slot, slotIndex) => (
                          <div key={slotIndex} className="flex items-center gap-3 group">
                            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-md border border-gray-200">
                              <Clock className="h-4 w-4 text-gray-400 ml-2" aria-hidden="true" />
                              <label htmlFor={`start-time-${dayIndex}-${slotIndex}`} className="sr-only">
                                {t("onboarding.availability.startTimeLabel", { index: slotIndex + 1, day: day.day, defaultValue: `Start time for period ${slotIndex + 1} on ${day.day}` })}
                              </label>
                              <input
                                id={`start-time-${dayIndex}-${slotIndex}`}
                                type="time"
                                value={slot.start}
                                onChange={(e) => handleTimeChange(dayIndex, slotIndex, "start", e.target.value)}
                                className="bg-transparent border-none text-sm font-medium text-gray-900 focus:ring-0 w-24 p-1"
                              />
                              <span className="text-gray-300" aria-hidden="true">|</span>
                              <label htmlFor={`end-time-${dayIndex}-${slotIndex}`} className="sr-only">
                                {t("onboarding.availability.endTimeLabel", { index: slotIndex + 1, day: day.day, defaultValue: `End time for period ${slotIndex + 1} on ${day.day}` })}
                              </label>
                              <input
                                id={`end-time-${dayIndex}-${slotIndex}`}
                                type="time"
                                value={slot.end}
                                onChange={(e) => handleTimeChange(dayIndex, slotIndex, "end", e.target.value)}
                                className="bg-transparent border-none text-sm font-medium text-gray-900 focus:ring-0 w-24 p-1"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveTimeSlot(dayIndex, slotIndex)}
                              className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                              aria-label={t("onboarding.availability.removeSlotLabel", { index: slotIndex + 1, day: day.day, defaultValue: `Remove time slot ${slotIndex + 1} for ${day.day}` })}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        ))}
                        
                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddTimeSlot(dayIndex)}
                            className="text-xs font-medium text-[#2E9098] hover:text-[#2E9098]/80 flex items-center transition-colors"
                          >
                            <Plus className="h-3 w-3 mr-1" aria-hidden="true" /> {t("onboarding.availability.addPeriod", "Add another period")}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToAll(dayIndex)}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center transition-colors"
                          >
                            <Copy className="h-3 w-3 mr-1" aria-hidden="true" /> {t("onboarding.availability.copyToAll", "Copy to all days")}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-gray-100">
        <Button type="button" variant="ghost" onClick={onBack} className="text-gray-500 hover:text-gray-900">
          {t("common.back", "Back")}
        </Button>
        <Button type="submit" className="bg-black text-white hover:bg-gray-800 px-8">
          {t("common.continue", "Continue")}
        </Button>
      </div>
    </form>
  );
}
