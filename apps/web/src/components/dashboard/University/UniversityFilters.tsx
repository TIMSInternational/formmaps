"use client";

import React from "react";
import {
  SlidersHorizontal,
  Globe2,
  DollarSign,
  GraduationCap,
  X,
  Search,
} from "lucide-react";
import {
  UniversityFiltersProps,
  DegreeLevel,
  FieldOfStudy,
} from "@/types/university";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGlobalStore } from "@/store/useGlobalStore";
import { motion } from "motion/react";

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
        active
          ? "border-[#2E9098]/30 bg-[#2E9098]/10 text-[#2E9098] shadow-sm ring-1 ring-[#2E9098]/30"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300"
      )}
    >
      {label}
      {active && <X className="ml-1.5 h-3 w-3 opacity-60" />}
    </motion.button>
  );
}

export function UniversityFilters({
  filters,
  onFiltersChange,
  filterOptions,
  isLoading,
}: UniversityFiltersProps) {
  const { language } = useGlobalStore();
  const [search, setSearch] = React.useState(filters.search ?? "");

  React.useEffect(() => {
    const t = setTimeout(() => {
      onFiltersChange({ ...filters, search: search || undefined });
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const toggleDegree = (degree: DegreeLevel) => {
    const current = new Set(filters.degrees ?? []);
    if (current.has(degree)) {
      current.delete(degree);
    } else {
      current.add(degree);
    }
    const next = Array.from(current);
    onFiltersChange({ ...filters, degrees: next.length ? next : undefined });
  };

  const toggleField = (field: FieldOfStudy) => {
    const current = new Set(filters.fields ?? []);
    if (current.has(field)) {
      current.delete(field);
    } else {
      current.add(field);
    }
    const next = Array.from(current);
    onFiltersChange({ ...filters, fields: next.length ? next : undefined });
  };

  const tuitionMin = filters.tuitionMin ?? filterOptions?.tuitionRange.min ?? 0;
  const tuitionMax =
    filters.tuitionMax ?? filterOptions?.tuitionRange.max ?? 80000;

  const handleTuitionChange = (value: number, type: "min" | "max") => {
    const clamped = Math.min(
      Math.max(value, filterOptions?.tuitionRange.min ?? 0),
      filterOptions?.tuitionRange.max ?? 80000
    );
    const nextMin = type === "min" ? clamped : tuitionMin;
    const nextMax = type === "max" ? clamped : tuitionMax;
    onFiltersChange({
      ...filters,
      tuitionMin: nextMin,
      tuitionMax: Math.max(nextMin, nextMax),
    });
  };

  const resetAll = () => {
    setSearch("");
    onFiltersChange({});
  };

  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-900" />
          <h3 className="text-sm font-bold text-gray-900">{t("Filters", "Filtros")}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50"
          onClick={resetAll}
        >
          {t("Reset", "Limpiar")}
        </Button>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder={t(
              "Search universities...",
              "Buscar universidades..."
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs bg-gray-50 border-gray-200 focus:bg-white focus:border-[#2E9098] transition-all rounded-lg"
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <Globe2 className="h-3 w-3" />
          <span>{t("Location", "Ubicación")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterOptions?.countries.slice(0, 6).map((c, i) => (
            <Chip
              key={`${c.code}-${i}`}
              label={c.code}
              active={filters.countries?.includes(c.code) ?? false}
              onClick={() => {
                const current = new Set(filters.countries ?? []);
                if (current.has(c.code)) {
                  current.delete(c.code);
                } else {
                  current.add(c.code);
                }
                const next = Array.from(current);
                onFiltersChange({
                  ...filters,
                  countries: next.length ? next : undefined,
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* Degree levels */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <GraduationCap className="h-3 w-3" />
          <span>{t("Degree", "Grado")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            ["Associate", "Bachelor", "Master", "Doctorate"] as DegreeLevel[]
          ).map((deg) => (
            <Chip
              key={deg}
              label={deg}
              active={filters.degrees?.includes(deg) ?? false}
              onClick={() => toggleDegree(deg)}
            />
          ))}
        </div>
      </div>

      {/* Fields of study */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {t("Field of study", "Área de estudio")}
        </p>
        <div className="flex flex-wrap gap-2">
          {(filterOptions?.fields || []).slice(0, 8).map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              active={filters.fields?.includes(f.value) ?? false}
              onClick={() => toggleField(f.value as FieldOfStudy)}
            />
          ))}
        </div>
      </div>

      {/* Tuition slider */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <DollarSign className="h-3 w-3" />
          <span>{t("Tuition / Year", "Matrícula / Año")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">$</span>
            <Input
              type="number"
              className="h-8 pl-6 pr-2 text-xs bg-white border-gray-200 focus:border-[#2E9098] rounded-lg"
              value={tuitionMin}
              onChange={(e) =>
                handleTuitionChange(Number(e.target.value) || 0, "min")
              }
            />
          </div>
          <span className="text-[10px] text-gray-300">—</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">$</span>
            <Input
              type="number"
              className="h-8 pl-6 pr-2 text-xs bg-white border-gray-200 focus:border-[#2E9098] rounded-lg"
              value={tuitionMax}
              onChange={(e) =>
                handleTuitionChange(Number(e.target.value) || 0, "max")
              }
            />
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-700">
              {t("Financial aid", "Ayuda financiera")}
            </p>
          </div>
          <Switch
            checked={!!filters.hasFinancialAid}
            onCheckedChange={(val) =>
              onFiltersChange({ ...filters, hasFinancialAid: val || undefined })
            }
            className="scale-75 data-[state=checked]:bg-[#2E9098]"
          />
        </div>
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-700">
              {t("On-campus housing", "Residencias")}
            </p>
          </div>
          <Switch
            checked={!!filters.hasHousing}
            onCheckedChange={(val) =>
              onFiltersChange({ ...filters, hasHousing: val || undefined })
            }
            className="scale-75 data-[state=checked]:bg-[#2E9098]"
          />
        </div>
      </div>
    </div>
  );
}

export default UniversityFilters;
