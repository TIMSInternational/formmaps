import { useState } from "react";
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns";
import { CalendarHeader } from "./CalendarHeader";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

interface Session {
  id: string;
  startTime: string;
  studentName: string;
  status: string;
  topic?: string;
}

interface CalendarViewProps {
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

export function CalendarView({ sessions, onSessionClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");

  const handlePrev = () => {
    if (view === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subWeeks(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="space-y-4">
      <CalendarHeader
        currentDate={currentDate}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        view={view}
        onViewChange={setView}
      />

      {view === "month" ? (
        <MonthView
          currentDate={currentDate}
          sessions={sessions}
          onSessionClick={onSessionClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          sessions={sessions}
          onSessionClick={onSessionClick}
        />
      )}
    </div>
  );
}
