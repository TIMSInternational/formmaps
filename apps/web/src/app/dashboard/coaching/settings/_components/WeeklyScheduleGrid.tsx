"use client";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  day: string;
  enabled: boolean;
  timeSlots: TimeSlot[];
}

interface WeeklyScheduleGridProps {
  schedule: DaySchedule[];
  onDayToggle: (dayIndex: number) => void;
  onAddTimeSlot: (dayIndex: number) => void;
  onRemoveTimeSlot: (dayIndex: number, slotIndex: number) => void;
  onTimeChange: (dayIndex: number, slotIndex: number, field: "start" | "end", value: string) => void;
}

export function WeeklyScheduleGrid({
  schedule,
  onDayToggle,
  onAddTimeSlot,
  onRemoveTimeSlot,
  onTimeChange,
}: WeeklyScheduleGridProps) {
  return (
    <div className="space-y-4 border rounded-2xl border-gray-200 bg-white overflow-hidden shadow-sm">
      {schedule.map((day, dayIndex) => (
        <div
          key={day.day}
          className={`flex flex-col sm:flex-row gap-4 p-4 transition-colors border-b border-gray-50 last:border-0 items-center ${day.enabled ? "bg-white" : "bg-gray-50/30"
            }`}
        >
          <div className="flex items-center justify-between w-full sm:w-48">
            <div
              className={`font-semibold text-sm ${day.enabled ? "text-gray-900" : "text-gray-400"}`}
            >
              {day.day}
            </div>
            <Switch
              checked={day.enabled}
              onCheckedChange={() => onDayToggle(dayIndex)}
              className="scale-90"
            />
          </div>

          {day.enabled ? (
            <div className="flex-1 w-full sm:w-auto space-y-2">
              {day.timeSlots.map((slot, slotIndex) => (
                <div
                  key={slotIndex}
                  className="flex items-center gap-3 animate-in fade-in duration-300"
                >
                  <div className="flex items-center gap-2 bg-gray-50 rounded-md p-1 border border-gray-200 hover:border-gray-300 transition-colors">
                    <input
                      type="time"
                      value={slot.start}
                      onChange={(e) =>
                        onTimeChange(
                          dayIndex,
                          slotIndex,
                          "start",
                          e.target.value,
                        )
                      }
                      className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 p-0 w-20 text-center cursor-pointer outline-none h-8"
                    />
                    <span className="text-gray-300 text-xs px-1">|</span>
                    <input
                      type="time"
                      value={slot.end}
                      onChange={(e) =>
                        onTimeChange(
                          dayIndex,
                          slotIndex,
                          "end",
                          e.target.value,
                        )
                      }
                      className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 p-0 w-20 text-center cursor-pointer outline-none h-8"
                    />
                  </div>
                  {day.timeSlots.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        onRemoveTimeSlot(dayIndex, slotIndex)
                      }
                      className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddTimeSlot(dayIndex)}
                className="text-[#2E9098] hover:text-[#2E9098] hover:bg-[#2E9098]/10 font-medium text-xs h-8 px-2"
              >
                <Plus className="h-3 w-3 mr-1.5" />
                Add Interval
              </Button>
            </div>
          ) : (
            <div className="flex items-center h-10">
              <Badge
                variant="outline"
                className="text-gray-400 border-gray-100 font-normal bg-transparent"
              >
                Unavailable
              </Badge>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
