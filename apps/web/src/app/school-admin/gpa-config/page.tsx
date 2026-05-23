"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Settings, Save, Trophy, Loader2 } from "lucide-react";
import { getGpaConfig, updateGpaConfig, computeClassRanks, GpaConfig } from "@/services/transcriptService";

// Default grade maps keyed by scale
const DEFAULT_MAP_4: Record<string, number> = {
  "A+": 4.0,
  "A":  4.0,
  "A-": 3.7,
  "B+": 3.3,
  "B":  3.0,
  "B-": 2.7,
  "C+": 2.3,
  "C":  2.0,
  "C-": 1.7,
  "D+": 1.3,
  "D":  1.0,
  "D-": 0.7,
  "F":  0.0,
};

const DEFAULT_MAP_5: Record<string, number> = {
  "A+": 5.0,
  "A":  5.0,
  "A-": 4.7,
  "B+": 4.3,
  "B":  4.0,
  "B-": 3.7,
  "C+": 3.3,
  "C":  3.0,
  "C-": 2.7,
  "D+": 2.3,
  "D":  2.0,
  "D-": 1.7,
  "F":  0.0,
};

const DEFAULT_BONUSES: Record<string, number> = {
  HONORS: 0.5,
  AP:     1.0,
  IB:     1.0,
};

const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

export default function GpaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computing, setComputing] = useState(false);

  const [scale, setScale] = useState<4 | 5>(4);
  const [gradeMap, setGradeMap] = useState<Record<string, number>>({ ...DEFAULT_MAP_4 });
  const [bonuses, setBonuses] = useState<Record<string, number>>({ ...DEFAULT_BONUSES });

  useEffect(() => {
    async function load() {
      try {
        const config = await getGpaConfig();
        if (config) {
          const s = config.scale === 5 ? 5 : 4;
          setScale(s);
          setGradeMap(Object.keys(config.unweightedMap).length > 0 ? { ...config.unweightedMap } : s === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 });
          setBonuses(Object.keys(config.weightBonuses).length > 0 ? { ...config.weightBonuses } : { ...DEFAULT_BONUSES });
        }
      } catch {
        // No config yet — use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleScaleChange(newScale: 4 | 5) {
    setScale(newScale);
    setGradeMap(newScale === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 });
  }

  function handleGradeChange(letter: string, raw: string) {
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      setGradeMap((prev) => ({ ...prev, [letter]: val }));
    } else {
      setGradeMap((prev) => ({ ...prev, [letter]: 0 }));
    }
  }

  function handleBonusChange(key: string, raw: string) {
    const val = parseFloat(raw);
    setBonuses((prev) => ({ ...prev, [key]: isNaN(val) ? 0 : val }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateGpaConfig({
        scale,
        unweightedMap: gradeMap,
        weightBonuses: bonuses,
      } as Partial<GpaConfig>);
      toast.success("GPA configuration saved successfully.");
    } catch {
      toast.error("Failed to save GPA configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleComputeRanks() {
    setComputing(true);
    try {
      const result = await computeClassRanks();
      toast.success(`Class ranks computed for ${result.updated} student${result.updated !== 1 ? "s" : ""}.`);
    } catch {
      toast.error("Failed to compute class ranks.");
    } finally {
      setComputing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            GPA Configuration
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Configure the grading scale and weight bonuses used to compute student GPAs and class ranks.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleComputeRanks}
            disabled={computing || loading}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent",
              color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)",
              cursor: computing || loading ? "not-allowed" : "pointer",
              opacity: computing || loading ? 0.6 : 1,
            }}
          >
            {computing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            {computing ? "Computing..." : "Compute Class Ranks"}
          </button>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
              border: "none",
              cursor: saving || loading ? "not-allowed" : "pointer",
              opacity: saving || loading ? 0.6 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </motion.div>

      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            borderRadius: 8,
            border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)",
            padding: 32,
            textAlign: "center",
          }}
        >
          <Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: "var(--admin-font-tertiary)" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 8 }}>Loading configuration...</p>
        </motion.div>
      ) : (
        <>
          {/* Grading Scale Section */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{
              borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              overflow: "hidden",
            }}
          >
            {/* Card header */}
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--admin-border-default)",
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--admin-bg-hover)",
            }}>
              <Settings className="h-4 w-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  Grading Scale
                </div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                  Select the maximum GPA scale and set point values for each letter grade
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 16px" }} className="space-y-5">
              {/* Scale selector */}
              <div className="flex items-center gap-4">
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", minWidth: 80 }}>
                  Scale
                </span>
                <div className="flex items-center gap-3">
                  {([4, 5] as const).map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2"
                      style={{ cursor: "pointer", fontSize: 13, color: scale === s ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)", fontWeight: scale === s ? 600 : 400 }}
                    >
                      <input
                        type="radio"
                        name="scale"
                        value={s}
                        checked={scale === s}
                        onChange={() => handleScaleChange(s)}
                        style={{ accentColor: "var(--admin-accent-blue, #3b82f6)", width: 15, height: 15 }}
                      />
                      {s}.0 Scale
                    </label>
                  ))}
                </div>
              </div>

              {/* Grade mapping table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                      <th style={{ padding: "6px 12px 8px 0", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", width: 100 }}>
                        Letter Grade
                      </th>
                      <th style={{ padding: "6px 12px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", width: 160 }}>
                        Point Value
                      </th>
                      <th style={{ padding: "6px 0 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Range Guide
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRADE_ORDER.map((letter) => {
                      const value = gradeMap[letter] ?? 0;
                      const isF = letter === "F";
                      return (
                        <tr
                          key={letter}
                          style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                        >
                          <td style={{ padding: "8px 12px 8px 0" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 36, height: 28, borderRadius: 6,
                              fontSize: 13, fontWeight: 700,
                              background: isF
                                ? "rgba(239,68,68,0.1)"
                                : letter.startsWith("A")
                                  ? "rgba(16,185,129,0.1)"
                                  : letter.startsWith("B")
                                    ? "rgba(59,130,246,0.1)"
                                    : letter.startsWith("C")
                                      ? "rgba(245,158,11,0.1)"
                                      : "rgba(156,163,175,0.1)",
                              color: isF
                                ? "#ef4444"
                                : letter.startsWith("A")
                                  ? "#10b981"
                                  : letter.startsWith("B")
                                    ? "var(--admin-accent-blue, #3b82f6)"
                                    : letter.startsWith("C")
                                      ? "#f59e0b"
                                      : "var(--admin-font-secondary)",
                            }}>
                              {letter}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <input
                              type="number"
                              min={0}
                              max={scale}
                              step={0.1}
                              value={value}
                              onChange={(e) => handleGradeChange(letter, e.target.value)}
                              style={{
                                width: 90,
                                height: 32,
                                borderRadius: 6,
                                border: "1px solid var(--admin-border-default)",
                                background: "var(--admin-bg-hover)",
                                color: "var(--admin-font-primary)",
                                fontSize: 13,
                                fontWeight: 500,
                                padding: "0 10px",
                                outline: "none",
                              }}
                            />
                          </td>
                          <td style={{ padding: "8px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                            {letter === "A+" && "97–100%"}
                            {letter === "A"  && "93–96%"}
                            {letter === "A-" && "90–92%"}
                            {letter === "B+" && "87–89%"}
                            {letter === "B"  && "83–86%"}
                            {letter === "B-" && "80–82%"}
                            {letter === "C+" && "77–79%"}
                            {letter === "C"  && "73–76%"}
                            {letter === "C-" && "70–72%"}
                            {letter === "D+" && "67–69%"}
                            {letter === "D"  && "63–66%"}
                            {letter === "D-" && "60–62%"}
                            {letter === "F"  && "Below 60%"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Weight Bonuses Section */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{
              borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              overflow: "hidden",
            }}
          >
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--admin-border-default)",
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--admin-bg-hover)",
            }}>
              <Trophy className="h-4 w-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  Weight Bonuses
                </div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                  Additional grade points added for advanced course types when computing weighted GPA
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 16px" }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { key: "HONORS", label: "Honors", description: "Standard honors-level courses", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
                  { key: "AP",     label: "AP",     description: "Advanced Placement courses",   color: "var(--admin-accent-blue, #3b82f6)", bg: "rgba(59,130,246,0.1)" },
                  { key: "IB",     label: "IB",     description: "International Baccalaureate",  color: "#10b981", bg: "rgba(16,185,129,0.1)" },
                ].map(({ key, label, description, color, bg }) => (
                  <div
                    key={key}
                    style={{
                      borderRadius: 8,
                      border: "1px solid var(--admin-border-default)",
                      background: "var(--admin-bg-hover)",
                      padding: "16px",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color,
                        letterSpacing: "0.03em",
                      }}>
                        {label}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{label} Bonus</div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", minWidth: 24 }}>+</span>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={bonuses[key] ?? 0}
                        onChange={(e) => handleBonusChange(key, e.target.value)}
                        style={{
                          width: 90,
                          height: 34,
                          borderRadius: 6,
                          border: "1px solid var(--admin-border-default)",
                          background: "var(--admin-bg-card)",
                          color: "var(--admin-font-primary)",
                          fontSize: 14,
                          fontWeight: 600,
                          padding: "0 10px",
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>points</span>
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 14, lineHeight: 1.5 }}>
                Weight bonuses are added on top of the unweighted grade point value. For example, an &quot;A&quot; in an AP course
                on a 4.0 scale would contribute {(gradeMap["A"] ?? 4.0) + (bonuses["AP"] ?? 1.0)} points to the weighted GPA
                ({gradeMap["A"] ?? 4.0} + {bonuses["AP"] ?? 1.0} AP bonus).
              </p>
            </div>
          </motion.div>

          {/* Bottom action row */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-end gap-3 pb-2"
          >
            <button
              onClick={handleComputeRanks}
              disabled={computing}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent",
                color: "var(--admin-font-primary)",
                border: "1px solid var(--admin-border-default)",
                cursor: computing ? "not-allowed" : "pointer",
                opacity: computing ? 0.6 : 1,
              }}
            >
              {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              {computing ? "Computing..." : "Compute Class Ranks"}
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </motion.div>
        </>
      )}
    </div>
  );
}
