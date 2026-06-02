import { useRef, useEffect } from "react";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  differenceInMinutes,
  startOfDay,
  addHours,
} from "date-fns";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  startTime: Date | string | null;
  endTime?: Date | string | null;
  studentName?: string;
  status: string;
  topic?: string;
  [key: string]: unknown;
}

interface WeekViewProps {
  currentDate: Date;
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

export function WeekView({ currentDate, sessions, onSessionClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(weekStart);

  const days = eachDayOfInterval({
    start: weekStart,
    end: weekEnd,
  });

  const hours = Array.from({ length: 24 }).map((_, i) => i);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to 8 AM by default on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const eightAM = 8 * 60; // 8 AM in minutes
      // 1 hour = 60px height (assumed)
      scrollContainerRef.current.scrollTop = eightAM * 1; // if 1px per minute
      // Logic adjusted below: height is 64px per hour.
      // So 8 * 64 = 512px
      scrollContainerRef.current.scrollTop = 512;
    }
  }, []);

  const getSessionsForDay = (day: Date) => {
    return sessions.filter(s => {
      try {
        if (!s.startTime) return false;
        return isSameDay(day, new Date(s.startTime as string | Date));
      } catch { return false; }
    });
  };

  const getPositionStyles = (session: Session) => {
    try {
      if (!session.startTime) return { top: 0, height: 64 };
      const start = new Date(session.startTime as string | Date);
      const dayStart = startOfDay(start);
      const minutesFromStart = differenceInMinutes(start, dayStart);

      let duration = 60; // default 60 min
      if (session.endTime) {
        duration = differenceInMinutes(new Date(session.endTime as string | Date), start);
      }

      // 1 hour = 64px height
      // 1 minute = 64/60 = 1.066px
      const top = (minutesFromStart / 60) * 64;
      const height = (duration / 60) * 64;

      return {
        top: `${top}px`,
        height: `${Math.max(height, 30)}px`, // Min height 30px
      };
    } catch (e) {
      return { top: '0px', height: '60px' };
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex border-b border-gray-200">
        <div className="w-16 flex-shrink-0 border-r border-gray-100 bg-gray-50/50" />
        <div className="flex-1 grid grid-cols-7 bg-gray-50/50">
          {days.map((day) => {
            const isDayToday = isToday(day);
            return (
              <div key={day.toString()} className="py-3 text-center border-r border-gray-100 last:border-r-0">
                <p className={cn("text-xs font-semibold uppercase tracking-wider", isDayToday ? "text-indigo-600" : "text-gray-500")}>
                  {format(day, "EEE")}
                </p>
                <p className={cn(
                  "mt-1 text-lg font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full",
                  isDayToday ? "bg-indigo-600 text-white" : "text-gray-900"
                )}>
                  {format(day, "d")}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable Grid */}
      <div className="flex flex-1 overflow-y-auto relative" ref={scrollContainerRef}>
        {/* Time Column */}
        <div className="w-16 flex-shrink-0 border-r border-gray-100 bg-white">
          {hours.map(hour => (
            <div key={hour} className="h-16 border-b border-gray-50 text-right pr-2 text-xs text-gray-400 relative">
              <span className="absolute -top-2 right-2 bg-white px-1">
                {format(addHours(startOfDay(currentDate), hour), "h a")}
              </span>
            </div>
          ))}
        </div>

        {/* Days Columns */}
        <div className="flex-1 grid grid-cols-7 bg-white relative">
          {/* Grid Lines */}
          {hours.map(hour => (
            <div key={`line-${hour}`} className="absolute w-full border-b border-gray-50 h-[1px]" style={{ top: `${hour * 64}px` }} />
          ))}

          {/* Day Columns */}
          {days.map((day, i) => (
            <div key={`col-${day}`} className="border-r border-gray-50 h-[1536px] relative last:border-r-0">
              {/* Sessions */}
              {getSessionsForDay(day).map(session => (
                <button
                  key={session.id}
                  onClick={() => onSessionClick(session)}
                  className={cn(
                    "absolute left-1 right-1 rounded-md p-2 text-xs text-left transition-all hover:brightness-95 border overflow-hidden",
                    session.status === 'confirmed' ? "bg-indigo-100 border-indigo-200 text-indigo-800" :
                      session.status === 'completed' ? "bg-emerald-100 border-emerald-200 text-emerald-800" :
                        "bg-gray-100 border-gray-200 text-gray-700"
                  )}
                  style={getPositionStyles(session)}
                >
                  <div className="font-semibold truncate">
                    {session.studentName || "Student"}
                  </div>
                  <div className="truncate opacity-80">
                    {session.startTime ? format(new Date(session.startTime as string | Date), "HH:mm") : "TBD"} - {session.endTime ? format(new Date(session.endTime as string | Date), "HH:mm") : '1h'}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
