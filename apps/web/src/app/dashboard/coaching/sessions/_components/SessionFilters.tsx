"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

interface SessionCounts {
  all: number;
  upcoming: number;
  past: number;
  cancelled: number;
}

interface SessionFiltersProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string | null;
  onStatusFilterChange: (status: string | null) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  counts: SessionCounts;
}

export function SessionFilters({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortChange,
  counts,
}: SessionFiltersProps) {
  const { t } = useTranslation();
  const tabs = ["all", "upcoming", "past", "cancelled"] as const;
  const tabLabels: Record<string, string> = {
    all: t("coach:sessionsPage.filters.tab.all"),
    upcoming: t("coach:sessionsPage.filters.tab.upcoming"),
    past: t("coach:sessionsPage.filters.tab.past"),
    cancelled: t("coach:sessionsPage.filters.tab.cancelled"),
  };

  return (
    <div className="dash-card p-4 flex flex-col xl:flex-row gap-4 justify-between">
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="w-full xl:w-auto overflow-x-auto no-scrollbar"
      >
        <TabsList className="p-1 rounded-xl flex w-full xl:w-auto min-w-max h-auto">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all capitalize flex-1 xl:flex-none"
            >
              {tabLabels[tab]} ({counts[tab as keyof typeof counts]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
        <div className="relative flex-1 sm:min-w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("coach:sessionsPage.filters.searchPlaceholder")}
            className="pl-10"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(v) => onStatusFilterChange(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder={t("coach:sessionsPage.filters.allStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("coach:sessionsPage.filters.allStatus")}</SelectItem>
              <SelectItem value="confirmed">{t("coach:sessionsPage.filters.tab.upcoming")}</SelectItem>
              <SelectItem value="rescheduled">{t("coach:sessionsPage.filters.rescheduled")}</SelectItem>
              <SelectItem value="completed">{t("coach:sessionsPage.statusBadge.completed")}</SelectItem>
              <SelectItem value="cancelled">{t("coach:sessionsPage.statusBadge.cancelled")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder={t("coach:sessionsPage.filters.upcomingFirst")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">{t("coach:sessionsPage.filters.upcomingFirst")}</SelectItem>
              <SelectItem value="newest">{t("coach:sessionsPage.filters.newestFirst")}</SelectItem>
              <SelectItem value="oldest">{t("coach:sessionsPage.filters.oldestFirst")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
