import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal } from "lucide-react";

interface Session {
  id: string;
  startTime: Date | string | null;
  studentName?: string;
  status: string;
  topic?: string;
  [key: string]: unknown;
}

interface MonthViewProps {
  currentDate: Date;
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

export function MonthView({ currentDate, sessions, onSessionClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const getSessionsForDay = (day: Date) => {
    return sessions.filter((session) => {
      try {
        if (!session.startTime) return false;
        const sessionDate = new Date(session.startTime as string | Date);
        return isSameDay(day, sessionDate);
      } catch {
        return false;
      }
    });
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/50">
        {weekDays.map((day) => (
          <div key={day} className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-[120px]">
        {days.map((day, dayIdx) => {
          const daySessions = getSessionsForDay(day);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDayToday = isToday(day);

          return (
            <div
              key={day.toString()}
              className={cn(
                "border-b border-r border-gray-100 p-2 relative transition-colors hover:bg-gray-50/30",
                !isCurrentMonth && "bg-gray-50/30 text-gray-400",
                dayIdx % 7 === 6 && "border-r-0" // Remove right border for last column
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span
                  className={cn(
                    "text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full",
                    isDayToday
                      ? "bg-indigo-600 text-white"
                      : "text-gray-700"
                  )}
                >
                  {format(day, "d")}
                </span>
                {daySessions.length > 0 && (
                  <span className="text-xs text-gray-400 font-medium">
                    {daySessions.length} sessions
                  </span>
                )}
              </div>

              <div className="space-y-1 mt-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                {daySessions.slice(0, 3).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSessionClick(session)}
                    className={cn(
                      "w-full text-left px-2 py-1 rounded text-xs truncate flex items-center gap-1.5 transition-all hover:opacity-80",
                      session.status === 'confirmed' ? "bg-indigo-50 text-indigo-700 border border-indigo-100" :
                        session.status === 'completed' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                          "bg-gray-100 text-gray-600 border border-gray-200"
                    )}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full",
                      session.status === 'confirmed' ? "bg-indigo-500" :
                        session.status === 'completed' ? "bg-emerald-500" :
                          "bg-gray-400"
                    )} />
                    <span className="font-medium truncate">
                      {session.startTime ? format(new Date(session.startTime as string | Date), "HH:mm") : "TBD"} {session.studentName || "Student"}
                    </span>
                  </button>
                ))}
                {daySessions.length > 3 && (
                  <div className="text-xs text-gray-400 px-2 py-0.5 text-center">
                    + {daySessions.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
