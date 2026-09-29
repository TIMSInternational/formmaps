"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Users, Search, Plus, Trash2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CollegeCard } from "./_components/CollegeCard";

interface Student { id: string; name: string; email: string; }

interface CollegeSearchResult {
  id: string; name: string; city: string; state: string;
  acceptanceRate: number | null; satRange: string | null; tuition: number | null;
}

interface CollegeListItem {
  id: string; collegeId: string; collegeName: string; city: string; state: string;
  acceptanceRate: number | null; satRange: string | null; tuition: number | null;
  classification: "reach" | "match" | "safety";
}

interface BatchPrediction {
  collegeName: string; universityId?: string; percentageDisplay: number;
  classification: string; confidence: "high" | "medium" | "low";
  strengths: string[]; weaknesses: string[];
  predictionSource?: "rule_based" | "ml_logistic" | "ml_ensemble";
  modelMetrics?: { accuracy: number; auc: number; trainedOn: number };
}

interface CollegeSearchRaw {
  id: string; name: string; city?: string; state?: string;
  acceptanceRate?: string | number; satMath25?: string | number; satMath75?: string | number;
  satReading25?: string | number; satReading75?: string | number; satAverage?: string | number;
  tuition?: string | number;
}

interface CollegeListRaw {
  id: string; universityId: string; collegeName?: string; fitClassification?: string;
  university?: {
    name?: string; city?: string; state?: string;
    acceptanceRate?: string | number; satMath25?: string | number; satMath75?: string | number;
    satReading25?: string | number; satReading75?: string | number; tuitionInState?: string | number;
  };
}

const CLASS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; border: string }> = {
  reach: { labelKey: "ui.collegePrep.fit.reach", color: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.2)" },
  match: { labelKey: "ui.collegePrep.fit.match", color: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)" },
  safety: { labelKey: "ui.collegePrep.fit.safety", color: "#10b981", bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.2)" },
};

function classificationToFit(classification: string): "safety" | "match" | "reach" {
  if (classification === "safety" || classification === "likely") return "safety";
  if (classification === "match") return "match";
  return "reach";
}

export default function CollegeListPage() {
  const { t } = useTranslation("counselor");
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addClassification, setAddClassification] = useState<Record<string, string>>({});

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(items) ? items : [];
    },
  });
  const students: Student[] = studentsData ?? [];

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["college-search", searchQuery],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/search?q=${encodeURIComponent(searchQuery)}`);
      const raw = res?.data ?? [];
      return (Array.isArray(raw) ? raw : []).map((c: CollegeSearchRaw) => ({
        id: c.id, name: c.name, city: c.city || "", state: c.state || "",
        acceptanceRate: c.acceptanceRate ? Number(c.acceptanceRate) : null,
        satRange: c.satMath25 && c.satMath75
          ? `${Number(c.satMath25) + Number(c.satReading25 || 0)}-${Number(c.satMath75) + Number(c.satReading75 || 0)}`
          : c.satAverage ? `~${c.satAverage}` : null,
        tuition: c.tuition ? Number(c.tuition) : null,
      }));
    },
    enabled: searchQuery.length >= 2,
  });
  const colleges: CollegeSearchResult[] = searchResults ?? [];

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["student-college-list", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/list`);
      const raw = res?.data ?? [];
      return (Array.isArray(raw) ? raw : []).map((item: CollegeListRaw) => ({
        id: item.id, collegeId: item.universityId,
        collegeName: item.university?.name || item.collegeName || "Unknown",
        city: item.university?.city || "", state: item.university?.state || "",
        acceptanceRate: item.university?.acceptanceRate ? Number(item.university.acceptanceRate) : null,
        satRange: item.university?.satMath25 && item.university?.satMath75
          ? `${Number(item.university.satMath25) + Number(item.university.satReading25 || 0)}-${Number(item.university.satMath75) + Number(item.university.satReading75 || 0)}`
          : null,
        tuition: item.university?.tuitionInState ? Number(item.university.tuitionInState) : null,
        classification: (item.fitClassification || "match") as "reach" | "match" | "safety",
      }));
    },
    enabled: !!selectedStudentId,
  });
  const collegeList: CollegeListItem[] = listData ?? [];

  const { data: predictionsData } = useQuery({
    queryKey: ["student-predictions", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/predict-batch`);
      return (res?.data ?? []) as BatchPrediction[];
    },
    enabled: !!selectedStudentId, staleTime: 10 * 60 * 1000,
  });
  const predictions: BatchPrediction[] = predictionsData ?? [];

  const predictionMap = new Map<string, BatchPrediction>();
  for (const p of predictions) {
    predictionMap.set(p.collegeName.toLowerCase(), p);
    if (p.universityId) predictionMap.set(p.universityId, p);
  }
  function findPrediction(collegeName: string, collegeId?: string): BatchPrediction | undefined {
    if (collegeId && predictionMap.has(collegeId)) return predictionMap.get(collegeId);
    return predictionMap.get(collegeName.toLowerCase());
  }

  const addToList = useMutation({
    mutationFn: async ({ collegeId, classification }: { collegeId: string; classification: string }) =>
      apiRequest(`/api/v1/college/students/${selectedStudentId}/list`, { method: "POST", data: { collegeId, classification } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-college-list", selectedStudentId] }); toast.success(t("ui.collegeList.toast.added")); },
    onError: () => toast.error(t("ui.collegeList.toast.addFailed")),
  });

  const removeFromList = useMutation({
    mutationFn: async (itemId: string) => apiRequest(`/api/v1/college/list/${itemId}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-college-list", selectedStudentId] }); toast.success(t("ui.collegeList.toast.removed")); },
    onError: () => toast.error(t("ui.collegeList.toast.removeFailed")),
  });

  const reclassify = useMutation({
    mutationFn: async ({ itemId, classification }: { itemId: string; classification: string }) =>
      apiRequest(`/api/v1/college/list/${itemId}`, { method: "PUT", data: { classification } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-college-list", selectedStudentId] }); toast.success(t("ui.collegeList.toast.reclassified")); },
    onError: () => toast.error(t("ui.collegeList.toast.reclassifyFailed")),
  });

  const grouped = {
    reach: collegeList.filter((c) => c.classification === "reach"),
    match: collegeList.filter((c) => c.classification === "match"),
    safety: collegeList.filter((c) => c.classification === "safety"),
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>{t("nav.collegePrep")}</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>{t("ui.collegeList.title")}</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>{t("ui.collegeList.subtitle")}</p>
      </motion.div>

      {/* Student Selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("ui.collegePrep.studentLabel")}</span>
        </div>
        <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}
          style={{ height: 36, borderRadius: 8, padding: "0 12px", fontSize: 13, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none", minWidth: 240, fontFamily: "inherit" }}>
          <option value="">{t("ui.collegePrep.selectStudent")}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {studentsLoading && <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />}
      </motion.div>

      {selectedStudentId && (
        <>
          {/* Search & Add */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>{t("ui.collegeList.searchAndAdd")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", marginBottom: 12 }}>
              <Search style={{ width: 14, height: 14, color: "var(--admin-font-light)", flexShrink: 0 }} />
              <input placeholder={t("ui.collegeList.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
              {searchLoading && <Loader2 style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />}
            </div>
            {searchQuery.length >= 2 && colleges.length === 0 && !searchLoading && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("ui.collegeList.noResults", { query: searchQuery })}</p>
              </div>
            )}
            {colleges.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
                {colleges.map((c) => {
                  const alreadyAdded = collegeList.some((item) => item.collegeId === c.id);
                  const pred = findPrediction(c.name, c.id);
                  const suggestedFit = pred ? classificationToFit(pred.classification) : "match";
                  const effectiveClassification = addClassification[c.id] || suggestedFit;
                  return (
                    <CollegeCard key={c.id} college={c} prediction={pred}
                      actions={alreadyAdded ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981", padding: "4px 10px", borderRadius: 6, background: "rgba(16,185,129,0.1)" }}>{t("ui.collegeList.added")}</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <select value={effectiveClassification} onChange={(e) => setAddClassification({ ...addClassification, [c.id]: e.target.value })}
                            style={{ height: 28, borderRadius: 5, padding: "0 6px", fontSize: 11, fontWeight: 600, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                            <option value="reach">{t("ui.collegePrep.fit.reach")}</option><option value="match">{t("ui.collegePrep.fit.match")}</option><option value="safety">{t("ui.collegePrep.fit.safety")}</option>
                          </select>
                          <button onClick={() => addToList.mutate({ collegeId: c.id, classification: effectiveClassification })} disabled={addToList.isPending}
                            style={{ height: 28, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, background: "#102B47", color: "#fff", border: "none", cursor: "pointer" }}>
                            <Plus style={{ width: 12, height: 12 }} /> {t("ui.collegeList.add")}
                          </button>
                        </div>
                      )} />
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* College List */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>
              {t("ui.collegeList.listTitle", { name: students.find((s) => s.id === selectedStudentId)?.name || t("ui.collegeList.studentFallback"), count: collegeList.length })}
            </div>
            {listLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...Array(3)].map((_, i) => <div key={i} style={{ height: 80, borderRadius: 8, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : collegeList.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <Building2 style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{t("ui.collegeList.empty")}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(["reach", "match", "safety"] as const).map((cls) => {
                  const items = grouped[cls];
                  if (items.length === 0) return null;
                  const cfg = CLASS_CONFIG[cls];
                  return (
                    <div key={cls}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t(cfg.labelKey)}</span>
                        <span style={{ fontSize: 11, color: cfg.color, opacity: 0.7 }}>({items.length})</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {items.map((item) => (
                          <CollegeCard key={item.id} college={item} prediction={findPrediction(item.collegeName, item.collegeId)}
                            actions={
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <select value={item.classification} onChange={(e) => reclassify.mutate({ itemId: item.id, classification: e.target.value })}
                                  style={{ height: 28, borderRadius: 5, padding: "0 6px", fontSize: 11, fontWeight: 600, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                  <option value="reach">{t("ui.collegePrep.fit.reach")}</option><option value="match">{t("ui.collegePrep.fit.match")}</option><option value="safety">{t("ui.collegePrep.fit.safety")}</option>
                                </select>
                                <button onClick={() => removeFromList.mutate(item.id)} disabled={removeFromList.isPending} title={t("ui.collegeList.removeFromList")}
                                  style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                                </button>
                              </div>
                            } />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </>
      )}

      {!selectedStudentId && !studentsLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <Users style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{t("ui.collegeList.selectStudentPrompt")}</p>
        </motion.div>
      )}
    </div>
  );
}
