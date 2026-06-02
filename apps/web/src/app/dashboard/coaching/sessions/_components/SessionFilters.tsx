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
  return (
    <div className="dash-card p-4 flex flex-col xl:flex-row gap-4 justify-between">
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="w-full xl:w-auto overflow-x-auto no-scrollbar"
      >
        <TabsList className="p-1 rounded-xl flex w-full xl:w-auto min-w-max h-auto">
          {["all", "upcoming", "past", "cancelled"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all capitalize flex-1 xl:flex-none"
            >
              {tab} ({counts[tab as keyof typeof counts]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
        <div className="relative flex-1 sm:min-w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search student, topic..."
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
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="confirmed">Upcoming</SelectItem>
              <SelectItem value="rescheduled">Rescheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming First</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
