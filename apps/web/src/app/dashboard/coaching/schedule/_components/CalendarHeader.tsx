import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CalendarHeaderProps {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: "month" | "week";
  onViewChange: (view: "month" | "week") => void;
}

export function CalendarHeader({
  currentDate,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900 capitalize">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center border border-gray-200 rounded-lg ml-4 bg-white shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            className="h-9 w-9 text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-gray-200" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onToday}
            className="h-9 px-3 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Today
          </Button>
          <div className="w-px h-6 bg-gray-200" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            className="h-9 w-9 text-gray-600 hover:text-gray-900"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="bg-gray-100 p-1 rounded-lg flex items-center">
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === "month"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
              }`}
            onClick={() => onViewChange("month")}
          >
            Month
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === "week"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
              }`}
            onClick={() => onViewChange("week")}
          >
            Week
          </button>
        </div>
      </div>
    </div>
  );
}
