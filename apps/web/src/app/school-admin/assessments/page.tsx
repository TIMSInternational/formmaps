"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardCheck, RotateCcw, Settings2, Loader2, Save, Shield,
  Users, ExternalLink, Calendar, BarChart3, Eye, Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAssessmentConfig,
  useUpdateAssessmentConfig,
  useAssessmentStatus,
} from "@/hooks/useAssessmentConfigQueries";
import type { AssessmentConfigItem } from "@/types/assessmentConfig";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const assessmentMeta: Record<string, {
  icon: any; label: string; description: string; color: string;
  features: string[]; studentRoute?: string;
}> = {
  MIL: {
    icon: ClipboardCheck, label: "Multiple Intelligence Lens",
    description: "Measures student learning style preferences across 8 intelligence types (linguistic, logical-mathematical, spatial, musical, bodily-kinesthetic, interpersonal, intrapersonal, naturalistic).",
    color: "#3b82f6",
    features: ["Self-assessment questionnaire", "8 intelligence dimensions", "Learning style report", "Career alignment insights"],
    studentRoute: "/dashboard/assessments/mil",
  },
  PCA: {
    icon: Shield, label: "Personal Career Assessment",
    description: "Evaluates career interests and aptitudes across industry clusters. Maps student preferences to career pathways and generates personalized recommendations.",
    color: "#8b5cf6",
    features: ["Interest inventory", "Aptitude matching", "Career cluster mapping", "Pathway recommendations"],
    studentRoute: "/dashboard/assessments",
  },
  "360": {
    icon: RotateCcw, label: "360° Evaluation",
    description: "Multi-perspective feedback collection from teachers, peers, parents, and self-assessment. Provides holistic view of student competencies and growth areas.",
    color: "#10b981",
    features: ["Multi-evaluator feedback", "Competency framework", "Growth tracking", "Aggregated reports"],
    studentRoute: "/evaluation/evaluator",
  },
};

// Persist config to localStorage when backend is unavailable
const STORAGE_KEY = "assessment_config_local";

function loadLocalConfig(): AssessmentConfigItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [
    { assessmentType: "MIL", isEnabled: true, description: "" },
    { assessmentType: "PCA", isEnabled: true, description: "" },
    { assessmentType: "360", isEnabled: false, description: "" },
  ];
}

function saveLocalConfig(items: AssessmentConfigItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function AssessmentConfigPage() {
  const router = useRouter();
  const { data: config, isLoading: configLoading, isError: configError } = useAssessmentConfig();
  const { data: status } = useAssessmentStatus();
  const update = useUpdateAssessmentConfig();

  const [items, setItems] = useState<AssessmentConfigItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load config from backend or localStorage fallback
  useEffect(() => {
    if (config?.configs && config.configs.length > 0) {
      setItems(config.configs);
    } else {
      setItems(loadLocalConfig());
    }
  }, [config]);

  const toggleAssessment = (type: string) => {
    setItems((prev) =>
      prev.map((a) => (a.assessmentType === type ? { ...a, isEnabled: !a.isEnabled } : a))
    );
    setHasChanges(true);
  };

  const updateDescription = (type: string, description: string) => {
    setItems((prev) =>
      prev.map((a) => (a.assessmentType === type ? { ...a, description } : a))
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await update.mutateAsync({ configs: items });
      toast.success("Assessment configuration saved");
    } catch {
      // Backend unavailable — save locally
      saveLocalConfig(items);
      toast.success("Configuration saved locally");
    }
    setHasChanges(false);
    setSaving(false);
  };

  const enabledCount = items.filter((a) => a.isEnabled).length;

  if (configLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            Assessment Configuration
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Enable, disable, and configure assessment types available to your students
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            height: 36, borderRadius: 6, padding: "0 20px",
            fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: hasChanges ? "var(--admin-accent-blue, #3b82f6)" : "var(--admin-bg-hover)",
            color: hasChanges ? "#fff" : "var(--admin-font-tertiary)",
            border: hasChanges ? "none" : "1px solid var(--admin-border-default)",
            cursor: hasChanges ? "pointer" : "default",
            opacity: saving ? 0.7 : 1,
            transition: "all 0.15s",
          }}
        >
          {saving
            ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
            : <Save style={{ width: 14, height: 14 }} />}
          {hasChanges ? "Save Changes" : "Saved"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Types", value: items.length, icon: ClipboardCheck, color: "#6366f1" },
          { label: "Enabled", value: enabledCount, icon: ClipboardCheck, color: "#10b981" },
          { label: "Disabled", value: items.length - enabledCount, icon: ClipboardCheck, color: "#ef4444" },
          { label: "Completion", value: status?.summary ? Object.values(status.summary).reduce((a, s) => a + s.completed, 0) : "—", icon: BarChart3, color: "#8b5cf6" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: 16,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10,
            }}>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Assessment Cards */}
      <div className="space-y-4">
        {items.map((assessment) => {
          const meta = assessmentMeta[assessment.assessmentType];
          const Icon = meta?.icon || Settings2;
          const color = meta?.color || "#6b7280";

          return (
            <div
              key={assessment.assessmentType}
              style={{
                borderRadius: 8,
                border: `1px solid ${assessment.isEnabled ? "var(--admin-border-default)" : "var(--admin-border-default)"}`,
                background: "var(--admin-bg-card)",
                overflow: "hidden",
                transition: "all 0.15s",
              }}
            >
              {/* Card Header */}
              <div style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: assessment.isEnabled ? "var(--admin-bg-hover)" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: assessment.isEnabled ? `${color}15` : "var(--admin-bg-hover)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>
                    <Icon style={{ width: 18, height: 18, color: assessment.isEnabled ? color : "var(--admin-font-tertiary)" }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                        {assessment.assessmentType}
                      </span>
                      {meta?.label && (
                        <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>
                          — {meta.label}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: assessment.isEnabled ? `${color}12` : "var(--admin-bg-hover)",
                        color: assessment.isEnabled ? color : "var(--admin-font-tertiary)",
                        transition: "all 0.15s",
                      }}>
                        {assessment.isEnabled ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {assessment.isEnabled && meta?.studentRoute && (
                    <button
                      onClick={() => router.push(meta.studentRoute!)}
                      title="Preview student view"
                      style={{
                        height: 30, borderRadius: 6, padding: "0 10px",
                        fontSize: 11, fontWeight: 500,
                        display: "flex", alignItems: "center", gap: 4,
                        background: "transparent", color: "var(--admin-font-tertiary)",
                        border: "1px solid var(--admin-border-default)", cursor: "pointer",
                        transition: "color 0.1s, border-color 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = color; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--admin-font-tertiary)"; e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}
                    >
                      <Eye style={{ width: 12, height: 12 }} /> Preview
                    </button>
                  )}
                  <Switch
                    checked={assessment.isEnabled}
                    onCheckedChange={() => toggleAssessment(assessment.assessmentType)}
                  />
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: "14px 16px", opacity: assessment.isEnabled ? 1 : 0.5, transition: "opacity 0.15s" }}>
                {/* Description */}
                {meta?.description && (
                  <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 14, lineHeight: 1.5 }}>
                    {meta.description}
                  </p>
                )}

                {/* Features */}
                {meta?.features && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      Capabilities
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {meta.features.map((f) => (
                        <span key={f} style={{
                          fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 4,
                          background: "var(--admin-bg-hover)",
                          color: "var(--admin-font-secondary)",
                          border: "1px solid var(--admin-border-default)",
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Description */}
                <div className="space-y-2">
                  <Label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Custom Description for Students
                  </Label>
                  <Textarea
                    value={assessment.description}
                    onChange={(e) => updateDescription(assessment.assessmentType, e.target.value)}
                    placeholder={`Describe what ${assessment.assessmentType} means for your students...`}
                    rows={2}
                    disabled={!assessment.isEnabled}
                    style={{
                      background: "var(--admin-bg-input)",
                      border: "1px solid var(--admin-border-default)",
                      color: "var(--admin-font-primary)",
                      fontSize: 13, borderRadius: 6, resize: "none",
                      minHeight: 56,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
