"use client";

import { useState } from "react";
import { Search, GraduationCap, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  useUniversityRecommendations,
  useUniversityList,
} from "@/hooks/useUniversityQueries";
import type { SetGraduationTargetPayload } from "@/types/graduationPlan";

interface TargetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: SetGraduationTargetPayload) => void;
  isSaving: boolean;
}

interface SelectedUniversity {
  id: string | null; // null = free-text university
  name: string;
}

export function TargetPickerDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
}: TargetPickerDialogProps) {
  const { user } = useGlobalStore();
  const [tab, setTab] = useState<"recommended" | "search">("recommended");
  const [selected, setSelected] = useState<SelectedUniversity | null>(null);
  const [major, setMajor] = useState("");
  const [search, setSearch] = useState("");

  const recoQuery = useUniversityRecommendations(open ? user?.id || null : null);
  const listQuery = useUniversityList({ search: search || undefined }, 1, 10);

  const recommendations = recoQuery.data?.recommendations ?? [];
  const searchResults = listQuery.data?.universities ?? [];

  const canSave = major.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      universityId: selected?.id ?? undefined,
      universityName: selected?.id ? undefined : selected?.name || undefined,
      major: major.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose your graduation goal</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-[var(--admin-bg-hover)] p-1">
          {([
            ["recommended", "Recommended for you"],
            ["search", "Search any university"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                tab === key
                  ? "bg-[#065292] text-white"
                  : "text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-panel)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Recommended tab */}
        {tab === "recommended" && (
          <div className="max-h-[260px] overflow-y-auto border rounded-lg divide-y">
            {recoQuery.isLoading ? (
              <p className="text-xs text-gray-400 text-center py-6">
                Loading your matches…
              </p>
            ) : recommendations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 px-4">
                No university matches yet — complete your assessments, or search
                any university instead.
              </p>
            ) : (
              recommendations.slice(0, 10).map((rec) => {
                const isSelected = selected?.id === rec.university.id;
                return (
                  <div key={rec.university.id} className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelected({ id: rec.university.id, name: rec.university.name })
                      }
                      className="w-full flex items-center justify-between text-left text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GraduationCap className="h-4 w-4 shrink-0 text-[#065292]" />
                        <div className="min-w-0">
                          <p className="font-medium truncate text-[var(--admin-font-primary)]">
                            {rec.university.name}
                          </p>
                          <p className="text-[10px] text-[var(--admin-font-tertiary)]">
                            {rec.matchScore}% match
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#065292]" />
                      )}
                    </button>
                    {isSelected && rec.recommendedPrograms?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rec.recommendedPrograms.slice(0, 4).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setMajor(p.name)}
                            className={cn(
                              "text-[10px] px-2 py-1 rounded-full border",
                              major === p.name
                                ? "bg-[#065292] text-white border-[#065292]"
                                : "border-[var(--admin-border-default)] text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-hover)]",
                            )}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Search-any tab */}
        {tab === "search" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search universities…"
                className="pl-9"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto border rounded-lg divide-y">
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6 px-4">
                  {search.trim()
                    ? "No universities found — you can still type your own below."
                    : "Type to search universities."}
                </p>
              ) : (
                searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelected({ id: u.id, name: u.name })}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left text-xs hover:bg-[var(--admin-bg-hover)]",
                      selected?.id === u.id && "bg-[var(--admin-bg-hover)]",
                    )}
                  >
                    <span className="font-medium truncate text-[var(--admin-font-primary)]">
                      {u.name}
                    </span>
                    {selected?.id === u.id && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#065292]" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Or type a university name</Label>
              <Input
                value={selected?.id === null ? selected.name : ""}
                onChange={(e) =>
                  setSelected(e.target.value ? { id: null, name: e.target.value } : null)
                }
                placeholder="e.g. Technical University of Munich"
              />
            </div>
          </div>
        )}

        {/* Major + selection summary */}
        <div className="space-y-1.5">
          <Label className="text-xs">Intended major *</Label>
          <Input
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="e.g. Computer Science"
            maxLength={200}
          />
          {selected && (
            <p className="text-[11px] text-[var(--admin-font-tertiary)]">
              Goal: {selected.name}
              {major.trim() ? ` · ${major.trim()}` : ""}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="bg-[#065292] hover:bg-[#054478] text-white gap-2"
          >
            {isSaving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Set as my goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
