"use client";

import React from "react";
import { X, Filter, Calendar, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import type {
  TimelineFilters as TimelineFiltersType,
  TimelineFiltersProps,
  AssessmentType,
  TimelineEventStatus,
} from "@/types/timeline";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useGlobalStore } from "@/store/useGlobalStore";
import { motion, AnimatePresence } from "motion/react";
import { DateRange } from "react-day-picker";

/**
 * Assessment type options
 */
const assessmentTypes: {
  value: AssessmentType;
  label: { en: string; sp: string };
  color: string;
  activeColor: string;
}[] = [
  {
    value: "pca",
    label: { en: "PCA", sp: "PCA" },
    color: "text-violet-600 border-violet-200 hover:bg-violet-50",
    activeColor: "bg-violet-50 text-violet-700 border-violet-200 ring-1 ring-violet-200",
  },
  {
    value: "mil",
    label: { en: "LIA", sp: "LIA" },
    color: "text-cyan-600 border-cyan-200 hover:bg-cyan-50",
    activeColor: "bg-cyan-50 text-cyan-700 border-cyan-200 ring-1 ring-cyan-200",
  },
  {
    value: "evaluation",
    label: { en: "360°", sp: "360°" },
    color: "text-orange-600 border-orange-200 hover:bg-orange-50",
    activeColor: "bg-orange-50 text-orange-700 border-orange-200 ring-1 ring-orange-200",
  },
  {
    value: "course",
    label: { en: "Courses", sp: "Cursos" },
    color: "text-teal-600 border-teal-200 hover:bg-teal-50",
    activeColor: "bg-teal-50 text-teal-700 border-teal-200 ring-1 ring-teal-200",
  },
];

/**
 * Status options
 */
const statusOptions: {
  value: TimelineEventStatus;
  label: { en: string; sp: string };
  color: string;
  activeColor: string;
}[] = [
  {
    value: "completed",
    label: { en: "Completed", sp: "Completado" },
    color: "text-emerald-600 border-emerald-200 hover:bg-emerald-50",
    activeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200",
  },
  {
    value: "in_progress",
    label: { en: "In Progress", sp: "En Progreso" },
    color: "text-blue-600 border-blue-200 hover:bg-blue-50",
    activeColor: "bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-200",
  },
  {
    value: "not_started",
    label: { en: "Not Started", sp: "No Iniciado" },
    color: "text-gray-600 border-gray-200 hover:bg-gray-50",
    activeColor: "bg-gray-100 text-gray-700 border-gray-200 ring-1 ring-gray-200",
  },
];

/**
 * Filter chip component
 */
interface FilterChipProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  color: string;
  activeColor: string;
}

function FilterChip({ label, isActive, onClick, color, activeColor }: FilterChipProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border",
        isActive
          ? activeColor
          : cn("bg-white", color)
      )}
    >
      {label}
      {isActive && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
        >
          <X className="h-3 w-3 ml-0.5" />
        </motion.span>
      )}
    </motion.button>
  );
}

/**
 * Timeline Filters Component
 */
export function TimelineFilters({
  filters,
  onFiltersChange,
}: TimelineFiltersProps) {
  const { language } = useGlobalStore();
  const langKey = language === "spanish" ? "sp" : "en";
  const locale = language === "spanish" ? es : enUS;

  const [searchValue, setSearchValue] = React.useState(filters.search || "");
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: filters.dateRange?.startDate
      ? new Date(filters.dateRange.startDate)
      : undefined,
    to: filters.dateRange?.endDate
      ? new Date(filters.dateRange.endDate)
      : undefined,
  });

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, search: searchValue || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Toggle assessment type
  const toggleType = (type: AssessmentType) => {
    const currentTypes = filters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    onFiltersChange({
      ...filters,
      types: newTypes.length > 0 ? newTypes : undefined,
    });
  };

  // Toggle status
  const toggleStatus = (status: TimelineEventStatus) => {
    const currentStatus = filters.status || [];
    const newStatus = currentStatus.includes(status)
      ? currentStatus.filter((s) => s !== status)
      : [...currentStatus, status];
    onFiltersChange({
      ...filters,
      status: newStatus.length > 0 ? newStatus : undefined,
    });
  };

  // Update date range
  const updateDateRange = (range: DateRange | undefined) => {
    setDate(range);
    onFiltersChange({
      ...filters,
      dateRange:
        range?.from || range?.to
          ? {
              startDate: range.from?.toISOString(),
              endDate: range.to?.toISOString(),
            }
          : undefined,
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchValue("");
    setDate(undefined);
    onFiltersChange({});
  };

  // Check if any filters are active
  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.status && filters.status.length > 0) ||
    filters.dateRange?.startDate ||
    filters.dateRange?.endDate ||
    filters.search;

  return (
    <div className="space-y-6">
      {/* Search and Date Range Row */}
      <div className="flex flex-col gap-4">
        {/* Search Input */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-hover:text-[#2E9098] transition-colors" />
          <Input
            placeholder={
              language === "spanish" ? "Buscar eventos..." : "Search events..."
            }
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 h-10 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-[#2E9098] transition-all rounded-lg"
          />
        </div>

        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-between px-3 h-10 font-normal border-gray-200 hover:bg-gray-50 hover:text-[#2E9098] transition-colors rounded-lg",
                (date?.from || date?.to) && "bg-[#2E9098]/10 text-[#2E9098] border-[#2E9098]/30"
              )}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 opacity-70" />
                {date?.from ? (
                  <span className="text-sm font-medium">
                    {format(date.from, "MMM d", { locale })}
                    {date.to ? ` - ${format(date.to, "MMM d", { locale })}` : ""}
                  </span>
                ) : (
                  <span className="text-gray-500">
                    {language === "spanish" ? "Seleccionar fechas" : "Select dates"}
                  </span>
                )}
              </div>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="hidden sm:block">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={updateDateRange}
                numberOfMonths={2}
                locale={locale}
                className="rounded-md border shadow-sm"
              />
            </div>
            <div className="sm:hidden">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={updateDateRange}
                numberOfMonths={1}
                locale={locale}
                className="rounded-md border shadow-sm"
              />
            </div>
            {(date?.from || date?.to) && (
              <div className="p-3 border-t bg-gray-50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => updateDateRange(undefined)}
                >
                  {language === "spanish" ? "Limpiar fechas" : "Clear dates"}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-5">
        {/* Assessment Type Filters */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {language === "spanish" ? "Tipo" : "Type"}
            </p>
            {filters.types && filters.types.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
                {filters.types.length}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {assessmentTypes.map((type) => (
              <FilterChip
                key={type.value}
                label={type.label[langKey]}
                isActive={filters.types?.includes(type.value) || false}
                onClick={() => toggleType(type.value)}
                color={type.color}
                activeColor={type.activeColor}
              />
            ))}
          </div>
        </div>

        {/* Status Filters */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {language === "spanish" ? "Estado" : "Status"}
            </p>
            {filters.status && filters.status.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
                {filters.status.length}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <FilterChip
                key={status.value}
                label={status.label[langKey]}
                isActive={filters.status?.includes(status.value) || false}
                onClick={() => toggleStatus(status.value)}
                color={status.color}
                activeColor={status.activeColor}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact filter bar for mobile/smaller screens
 */
export function TimelineFiltersCompact({
  filters,
  onFiltersChange,
}: TimelineFiltersProps) {
  const { language } = useGlobalStore();
  const [isOpen, setIsOpen] = React.useState(false);

  const activeFilterCount =
    (filters.types?.length || 0) +
    (filters.status?.length || 0) +
    (filters.dateRange?.startDate ? 1 : 0) +
    (filters.search ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "gap-2 transition-colors",
            isOpen ? "bg-gray-100 text-gray-900" : "bg-white text-gray-600"
          )}
        >
          <Filter className="h-4 w-4" />
          {language === "spanish" ? "Filtros" : "Filters"}
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2E9098] text-xs text-white font-bold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>

        {/* Quick search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={language === "spanish" ? "Buscar..." : "Search..."}
            value={filters.search || ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                search: e.target.value || undefined,
              })
            }
            className="pl-9 h-9 bg-white border-gray-200 focus:border-[#2E9098] rounded-lg"
          />
        </div>
      </div>

      {/* Expandable Filter Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm mt-2">
              <TimelineFilters
                filters={filters}
                onFiltersChange={onFiltersChange}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TimelineFilters;
