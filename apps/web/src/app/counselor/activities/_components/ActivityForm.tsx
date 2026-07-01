"use client";

import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

const CATEGORY_OPTIONS = [
  { key: "academic", label: "Academic" },
  { key: "athletic", label: "Athletic" },
  { key: "arts", label: "Arts" },
  { key: "community_service", label: "Community Service" },
  { key: "work", label: "Work" },
  { key: "leadership", label: "Leadership" },
];

export interface ActivityFormData {
  name: string;
  category: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  hoursPerWeek: string;
  weeksPerYear: string;
  description: string;
  awards: string;
}

interface ActivityFormProps {
  form: ActivityFormData;
  setForm: (form: ActivityFormData) => void;
  editingId: string | null;
  isMutating: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ActivityForm({ form, setForm, editingId, isMutating, onSubmit, onCancel }: ActivityFormProps) {
  const inputStyle = {
    height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
  } as const;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        padding: 16, borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)",
        background: "rgba(99,102,241,0.03)",
      }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>
        {editingId ? "Edit Activity" : "Add Activity"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Activity name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ ...inputStyle, flex: 2, minWidth: 200 }}
          />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}>
            {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Organization" value={form.organization}
            onChange={(e) => setForm({ ...form, organization: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <input placeholder="Role / Position" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Start Date</label>
            <input type="date" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>End Date (optional)</label>
            <input type="date" value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <input placeholder="Hours/week" type="number" value={form.hoursPerWeek}
            onChange={(e) => setForm({ ...form, hoursPerWeek: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 100, marginTop: "auto" }}
          />
          <input placeholder="Weeks/year" type="number" value={form.weeksPerYear}
            onChange={(e) => setForm({ ...form, weeksPerYear: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 100, marginTop: "auto" }}
          />
        </div>
        <textarea placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          style={{
            width: "100%", borderRadius: 6, padding: "8px 10px", fontSize: 13,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", resize: "vertical",
          }}
        />
        <textarea placeholder="Awards / Honors (optional)" value={form.awards}
          onChange={(e) => setForm({ ...form, awards: e.target.value })}
          rows={2}
          style={{
            width: "100%", borderRadius: 6, padding: "8px 10px", fontSize: 13,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSubmit} disabled={isMutating}
            style={{
              height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600,
              background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: isMutating ? 0.6 : 1,
            }}>
            {isMutating && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            {editingId ? "Update" : "Submit"}
          </button>
          <button onClick={onCancel}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px", fontSize: 13,
              background: "transparent", color: "var(--admin-font-tertiary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit",
            }}>
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
