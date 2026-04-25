"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseFilter, CourseSortOption } from "@/types/course";
import { useTranslation } from "react-i18next";
import { Search, Filter, X, ChevronDown } from "lucide-react";
import Fuse from "fuse.js";
import { Course } from "@/types/course";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface CourseFiltersProps {
  filters: CourseFilter;
  sortBy: CourseSortOption;
  onFiltersChange: (filters: CourseFilter) => void;
  onSortChange: (sort: CourseSortOption) => void;
  onClearFilters: () => void;
  availableFilters: {
    categories: string[];
    languages: string[];
    difficulties: string[];
    countries: string[];
    regions: string[];
    candidates?: Course[];
  };
  searchCandidates?: Course[];
}

export function CourseFilters({
  filters,
  sortBy,
  onFiltersChange,
  onSortChange,
  onClearFilters,
  availableFilters,
  searchCandidates,
}: CourseFiltersProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<Course[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });

    // fuzzy suggestions
    if (searchCandidates && value.trim().length > 1) {
      const fuse = new Fuse(searchCandidates, {
        keys: ["title", "shortDescription", "provider"],
        threshold: 0.35,
      });

      const results = fuse
        .search(value)
        .slice(0, 5)
        .map((r) => r.item);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  };

  const handleFilterChange = (key: keyof CourseFilter, value: string) => {
    const currentValues = (filters[key] as string[]) || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];
    
    onFiltersChange({
      ...filters,
      [key]: newValues.length > 0 ? newValues : undefined,
    });
  };

  const hasActiveFilters =
    filters.search ||
    (filters.category && filters.category.length > 0) ||
    (filters.language && filters.language.length > 0) ||
    (filters.difficulty && filters.difficulty.length > 0) ||
    (filters.country && filters.country.length > 0) ||
    (filters.region && filters.region.length > 0);

  const FilterDropdown = ({ 
    title, 
    options, 
    selectedValues, 
    filterKey 
  }: { 
    title: string; 
    options: string[]; 
    selectedValues?: string[]; 
    filterKey: keyof CourseFilter;
  }) => {
    const count = selectedValues?.length || 0;
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={`h-[50px] rounded-xl border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 justify-between min-w-[160px] ${count > 0 ? 'border-blue-200 bg-blue-50/50 text-blue-700' : ''}`}>
            <span className="flex items-center gap-2">
              {title}
              {count > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 h-5 px-1.5 text-[10px]">
                  {count}
                </Badge>
              )}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-3" align="start">
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded-lg transition-colors">
                <Checkbox 
                  id={`${filterKey}-${option}`} 
                  checked={selectedValues?.includes(option)}
                  onCheckedChange={() => handleFilterChange(filterKey, option)}
                  className="border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label
                  htmlFor={`${filterKey}-${option}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 py-1"
                >
                  {filterKey === 'difficulty' 
                    ? t(`courses.difficulty.${option.toLowerCase()}`)
                    : filterKey === 'category'
                    ? t(`courses.categories.${option.toLowerCase()}`)
                    : filterKey === 'language'
                    ? t(`courses.languages.${option.toLowerCase()}`)
                    : filterKey === 'country'
                    ? t(`courses.countries.${option.toLowerCase()}`)
                    : filterKey === 'region'
                    ? t(`courses.regions.${option.toLowerCase()}`)
                    : option}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Search Bar */}
          <div className="flex-1 relative group z-20">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder={t("courses.searchCourses")}
              className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-base"
              value={filters.search || ""}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white shadow-xl rounded-xl border border-gray-100 overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200">
                {suggestions.map((s, i) => (
                  <button
                    key={s.id}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                      i === selectedIndex ? "bg-gray-50" : ""
                    }`}
                    onClick={() => {
                      onFiltersChange({ ...filters, search: s.title });
                      setSuggestions([]);
                      setSelectedIndex(-1);
                    }}
                  >
                    <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.provider}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="min-w-[200px]">
            <Select value={sortBy} onValueChange={onSortChange}>
              <SelectTrigger className="w-full h-[50px] rounded-xl border-gray-200 bg-white text-gray-700 font-medium focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50">
                <SelectValue placeholder={t("courses.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">{t("courses.sort.recommended")}</SelectItem>
                <SelectItem value="rating">{t("courses.sort.rating")}</SelectItem>
                <SelectItem value="enrollment">{t("courses.sort.enrollment")}</SelectItem>
                <SelectItem value="newest">{t("courses.sort.newest")}</SelectItem>
                <SelectItem value="duration">{t("courses.sort.duration")}</SelectItem>
                <SelectItem value="title">{t("courses.sort.title")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterDropdown 
            title={t("courses.category")} 
            options={availableFilters.categories} 
            selectedValues={filters.category} 
            filterKey="category"
          />
          
          <FilterDropdown 
            title={t("courses.difficulty.label")} 
            options={availableFilters.difficulties} 
            selectedValues={filters.difficulty} 
            filterKey="difficulty"
          />

          <FilterDropdown 
            title={t("courses.language")} 
            options={availableFilters.languages} 
            selectedValues={filters.language} 
            filterKey="language"
          />

          <FilterDropdown 
            title={t("courses.country")} 
            options={availableFilters.countries} 
            selectedValues={filters.country} 
            filterKey="country"
          />

          {hasActiveFilters && (
            <Button
              variant="ghost"
              onClick={onClearFilters}
              className="h-[50px] px-4 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl ml-auto"
            >
              <X className="w-4 h-4 mr-2" />
              {t("courses.clearFilters")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
