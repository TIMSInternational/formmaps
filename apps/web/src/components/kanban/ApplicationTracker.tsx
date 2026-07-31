"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  X,
  GraduationCap,
  MapPin,
  Calendar,
  MoreHorizontal,
  Trash2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  TrackedApplication,
} from "@/services/applicationService";
import { toast } from "sonner";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";

type ColumnId = "researching" | "shortlisted" | "applying" | "applied" | "accepted";

interface Column {
  id: ColumnId;
  label: string;
  color: string;
  bgColor: string;
}

const COLUMNS: Column[] = [
  { id: "researching", label: "Researching", color: "var(--admin-font-tertiary)", bgColor: "transparent" },
  { id: "shortlisted", label: "Shortlisted", color: "var(--admin-accent-blue)", bgColor: "var(--admin-accent-bg-blue, rgba(59,130,246,0.1))" },
  { id: "applying", label: "Applying", color: "var(--admin-accent-amber)", bgColor: "var(--admin-accent-bg-amber, rgba(245,158,11,0.1))" },
  { id: "applied", label: "Applied", color: "var(--admin-accent-purple)", bgColor: "var(--admin-accent-bg-purple, rgba(139,92,246,0.1))" },
  { id: "accepted", label: "Accepted", color: "var(--admin-accent-green)", bgColor: "var(--admin-accent-bg-green, rgba(16,185,129,0.1))" },
];

export function ApplicationTracker() {
  const router = useRouter();
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [addingTo, setAddingTo] = useState<ColumnId | null>(null);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      const data = await listApplications();
      setApplications(data);
    } catch {
      setIsError(true);
      toast.error("Failed to load applications");
    } finally {
      setIsLoading(false);
    }
  };

  const addApplicationHandler = useCallback(async (column: ColumnId) => {
    if (!newName.trim()) return;
    try {
      const app = await createApplication({
        name: newName.trim(),
        type: "university",
        location: newLocation.trim() || undefined,
        deadline: newDeadline || undefined,
        column,
      });
      setApplications((prev) => [app, ...prev]);
      setNewName("");
      setNewLocation("");
      setNewDeadline("");
      setAddingTo(null);
    } catch {
      toast.error("Failed to add application");
    }
  }, [newName, newLocation, newDeadline]);

  const moveApplication = useCallback(async (id: string, direction: "left" | "right") => {
    const colIds = COLUMNS.map((c) => c.id);
    const app = applications.find((a) => a.id === id);
    if (!app) return;
    const idx = colIds.indexOf(app.column);
    const newIdx = direction === "right" ? Math.min(idx + 1, colIds.length - 1) : Math.max(idx - 1, 0);
    const newColumn = colIds[newIdx];

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, column: newColumn } : a))
    );
    setMenuOpen(null);

    try {
      await updateApplication(id, { column: newColumn });
    } catch {
      // Revert on failure
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, column: app.column } : a))
      );
      toast.error("Failed to move application");
    }
  }, [applications]);

  const removeApplication = useCallback(async (id: string) => {
    const prev = applications;
    setApplications((apps) => apps.filter((a) => a.id !== id));
    setMenuOpen(null);

    try {
      await deleteApplication(id);
    } catch {
      setApplications(prev);
      toast.error("Failed to delete application");
    }
  }, [applications]);

  return (
    <QueryStateBoundary isLoading={isLoading} isError={isError} onRetry={loadData}>
    <div className="space-y-4">
      {/* Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const colApps = applications.filter((a) => a.column === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col rounded-xl overflow-hidden"
              style={{
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
                minHeight: 200,
              }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2.5"
                style={{ borderBottom: "1px solid var(--admin-border-light)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: col.color }}
                  />
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--admin-font-tertiary)" }}
                  >
                    {col.label}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: "var(--admin-bg-hover)",
                      color: "var(--admin-font-tertiary)",
                    }}
                  >
                    {colApps.length}
                  </span>
                </div>
                <button
                  onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
                  className="p-0.5 rounded transition-colors"
                  style={{ color: "var(--admin-font-tertiary)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2">
                <AnimatePresence mode="popLayout">
                  {colApps.map((app) => (
                    <motion.div
                      key={app.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="relative rounded-lg p-3 cursor-pointer group"
                      style={{
                        background: "var(--admin-bg-hover)",
                        border: "1px solid var(--admin-border-light)",
                      }}
                      onClick={() => router.push(`/dashboard/applications/${app.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <GraduationCap
                            className="h-3.5 w-3.5 mt-0.5 shrink-0"
                            style={{ color: "var(--admin-font-tertiary)" }}
                          />
                          <div className="min-w-0">
                            <div
                              className="text-xs font-semibold line-clamp-1"
                              style={{ color: "var(--admin-font-primary)" }}
                            >
                              {app.name}
                            </div>
                            {app.location && (
                              <div
                                className="flex items-center gap-1 text-[10px] mt-0.5"
                                style={{ color: "var(--admin-font-tertiary)" }}
                              >
                                <MapPin className="h-2.5 w-2.5" />
                                {app.location}
                              </div>
                            )}
                            {app.deadline && (
                              <div
                                className="flex items-center gap-1 text-[10px] mt-0.5"
                                style={{ color: "var(--admin-accent-amber)" }}
                              >
                                <Calendar className="h-2.5 w-2.5" />
                                {app.deadline}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === app.id ? null : app.id); }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: "var(--admin-font-tertiary)" }}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {menuOpen === app.id && (
                            <div
                              className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-10 min-w-[120px]"
                              style={{
                                background: "var(--admin-bg-card)",
                                border: "1px solid var(--admin-border-default)",
                                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                              }}
                            >
                              {col.id !== "researching" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); moveApplication(app.id, "left"); }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-[11px] transition-colors"
                                  style={{ color: "var(--admin-font-secondary)" }}
                                >
                                  <ArrowLeft className="h-3 w-3" /> Move Left
                                </button>
                              )}
                              {col.id !== "accepted" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); moveApplication(app.id, "right"); }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-[11px] transition-colors"
                                  style={{ color: "var(--admin-font-secondary)" }}
                                >
                                  <ArrowRight className="h-3 w-3" /> Move Right
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); removeApplication(app.id); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-[11px] transition-colors"
                                style={{ color: "var(--admin-accent-red)" }}
                              >
                                <Trash2 className="h-3 w-3" /> Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* matchScore / Fit badge intentionally hidden — always empty until the admission engine is wired in sub-project B. */}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Add form */}
                {addingTo === col.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="rounded-lg p-2.5 space-y-2"
                    style={{
                      background: "var(--admin-bg-hover)",
                      border: "1px dashed var(--admin-border-default)",
                    }}
                  >
                    <input
                      autoFocus
                      placeholder="University name..."
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addApplicationHandler(col.id)}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none"
                      style={{
                        background: "var(--admin-bg-input)",
                        border: "1px solid var(--admin-border-default)",
                        color: "var(--admin-font-primary)",
                      }}
                    />
                    <input
                      placeholder="Location (optional)"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addApplicationHandler(col.id)}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none"
                      style={{
                        background: "var(--admin-bg-input)",
                        border: "1px solid var(--admin-border-default)",
                        color: "var(--admin-font-primary)",
                      }}
                    />
                    <input
                      type="date"
                      aria-label="Application deadline"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none"
                      style={{
                        background: "var(--admin-bg-input)",
                        border: "1px solid var(--admin-border-default)",
                        color: newDeadline ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)",
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => addApplicationHandler(col.id)}
                        disabled={!newName.trim()}
                        className="flex-1 px-2 py-1.5 rounded text-[11px] font-medium text-white disabled:opacity-40"
                        style={{ background: "var(--admin-accent-blue)" }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingTo(null); setNewName(""); setNewLocation(""); setNewDeadline(""); }}
                        className="px-2 py-1.5 rounded text-[11px]"
                        style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Empty state */}
                {colApps.length === 0 && addingTo !== col.id && (
                  <button
                    onClick={() => setAddingTo(col.id)}
                    className="w-full py-4 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      color: "var(--admin-font-light)",
                      border: "1px dashed var(--admin-border-default)",
                    }}
                  >
                    + Add application
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </QueryStateBoundary>
  );
}
