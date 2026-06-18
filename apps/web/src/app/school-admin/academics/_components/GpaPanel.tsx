"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Settings, Save, Trophy, Loader2, BookOpen } from "lucide-react";
import { getGpaConfig, updateGpaConfig, computeClassRanks, GpaConfig } from "@/services/transcriptService";
import { AdminTabBar } from "../../_components/AdminTabBar";
import { GradebookTab } from "./GradebookTab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_MAP_4: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};
const DEFAULT_MAP_5: Record<string, number> = {
  "A+": 5.0, "A": 5.0, "A-": 4.7, "B+": 4.3, "B": 4.0, "B-": 3.7,
  "C+": 3.3, "C": 3.0, "C-": 2.7, "D+": 2.3, "D": 2.0, "D-": 1.7, "F": 0.0,
};
const DEFAULT_BONUSES: Record<string, number> = { HONORS: 0.5, AP: 1.0, IB: 1.0 };
const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

// ─── CLASS RANKINGS TAB ───
function ClassRankingsTab() {
  const [computing, setComputing] = useState(false);
  const queryClient = useQueryClient();

  const { data: rankData, isLoading } = useQuery({
    queryKey: ["class-rankings"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/class-ranks");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const handleCompute = async () => {
    setComputing(true);
    try {
      await computeClassRanks();
      toast.success("Class ranks computed");
      queryClient.invalidateQueries({ queryKey: ["class-rankings"] });
    } catch { toast.error("Failed to compute ranks"); }
    setComputing(false);
  };

  const students = Array.isArray(rankData) ? rankData : rankData?.rankings || rankData?.data || [];

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Class Rankings</h2>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Student GPA rankings based on your grading configuration</p>
        </div>
        <button onClick={handleCompute} disabled={computing} style={{
          height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer",
          opacity: computing ? 0.7 : 1,
        }}>
          {computing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trophy style={{ width: 14, height: 14 }} />}
          {computing ? "Computing..." : "Compute Ranks"}
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[300px]" style={{ background: "var(--admin-bg-hover)" }} />
      ) : students.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Trophy style={{ width: 40, height: 40, color: "var(--admin-font-light)", margin: "0 auto 16px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No rankings yet. Import grades first, then click "Compute Ranks".</p>
        </div>
      ) : (
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                {["Rank", "Student", "Grade", "GPA", "Weighted GPA", "Percentile"].map(h => (
                  <TableHead key={h} className="py-3 px-4" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s: any, i: number) => {
                const gpa = s.gpa ?? s.unweightedGpa ?? 0;
                const wgpa = s.weightedGpa ?? gpa;
                const pct = s.percentile ?? 0;
                return (
                  <TableRow key={s.studentId || i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 700, color: i < 3 ? "#f59e0b" : "var(--admin-font-primary)" }}>#{s.rank || i + 1}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName || s.name || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                      {s.gradeLevel ? `Gr. ${s.gradeLevel}` : "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{Number(gpa).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 600, color: wgpa > gpa ? "#8b5cf6" : "var(--admin-font-primary)" }}>{Number(wgpa).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden", maxWidth: 80 }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct >= 90 ? "#10b981" : pct >= 75 ? "#065292" : pct >= 50 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── GPA CONFIG TAB (existing, simplified) ───
function GpaConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scale, setScale] = useState<4 | 5>(4);
  const [gradeMap, setGradeMap] = useState<Record<string, number>>({ ...DEFAULT_MAP_4 });
  const [bonuses, setBonuses] = useState<Record<string, number>>({ ...DEFAULT_BONUSES });

  useEffect(() => {
    (async () => {
      try {
        const config = await getGpaConfig();
        if (config) {
          const s = config.scale === 5 ? 5 : 4;
          setScale(s);
          setGradeMap(Object.keys(config.unweightedMap).length > 0 ? { ...config.unweightedMap } : s === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 });
          setBonuses(Object.keys(config.weightBonuses).length > 0 ? { ...config.weightBonuses } : { ...DEFAULT_BONUSES });
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGpaConfig({ scale, unweightedMap: gradeMap, weightBonuses: bonuses } as Partial<GpaConfig>);
      toast.success("GPA configuration saved");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 48 }}><Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: "var(--admin-font-tertiary)" }} /></div>;

  return (
    <div className="space-y-5">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} disabled={saving} style={{
          height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--admin-accent-blue, #065292)", color: "#fff", border: "none", cursor: "pointer",
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {/* Scale + Grade Map */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)" }}>
          <Settings className="h-4 w-4" style={{ color: "#065292" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Grading Scale</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Set point values for each letter grade</div>
          </div>
        </div>
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>Scale:</span>
            {([4, 5] as const).map(s => (
              <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: scale === s ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)", fontWeight: scale === s ? 600 : 400 }}>
                <input type="radio" checked={scale === s} onChange={() => { setScale(s); setGradeMap(s === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 }); }}
                  style={{ accentColor: "#065292", width: 15, height: 15 }} />
                {s}.0
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
            {GRADE_ORDER.map(letter => (
              <div key={letter} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, width: 28, color: letter === "F" ? "#ef4444" : letter.startsWith("A") ? "#10b981" : letter.startsWith("B") ? "#065292" : letter.startsWith("C") ? "#f59e0b" : "var(--admin-font-secondary)" }}>{letter}</span>
                <input type="number" min={0} max={scale} step={0.1} value={gradeMap[letter] ?? 0}
                  onChange={(e) => setGradeMap(prev => ({ ...prev, [letter]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 60, height: 28, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", fontSize: 12, padding: "0 6px" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bonuses */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)" }}>
          <Trophy className="h-4 w-4" style={{ color: "#065292" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Weight Bonuses</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Extra points for Honors/AP/IB courses</div>
          </div>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { key: "HONORS", label: "Honors", color: "#8b5cf6" },
            { key: "AP", label: "AP", color: "#065292" },
            { key: "IB", label: "IB", color: "#10b981" },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ padding: 12, borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>+</span>
                <input type="number" min={0} max={2} step={0.1} value={bonuses[key] ?? 0}
                  onChange={(e) => setBonuses(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 60, height: 30, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 13, fontWeight: 600, padding: "0 8px" }} />
                <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PANEL ───
export function GpaPanel() {
  const [activeTab, setActiveTab] = useState("gradebook");

  return (
    <div className="space-y-6">
      <AdminTabBar
        tabs={[
          { key: "gradebook", label: "Gradebook", icon: BookOpen },
          { key: "config", label: "GPA Configuration", icon: Settings },
          { key: "rankings", label: "Class Rankings", icon: Trophy },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "gradebook" && <GradebookTab />}
      {activeTab === "config" && <GpaConfigTab />}
      {activeTab === "rankings" && <ClassRankingsTab />}
    </div>
  );
}
