"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

interface ScholarshipFormProps {
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  onCancel: () => void;
}

export function ScholarshipForm({ onSubmit, isPending, onCancel }: ScholarshipFormProps) {
  const [form, setForm] = useState({
    name: "", provider: "", amount: "", deadline: "", url: "", notes: "",
  });

  const inputStyle = {
    height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
  } as const;

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    onSubmit({
      name: form.name, provider: form.provider,
      amount: form.amount ? Number(form.amount) : 0,
      deadline: form.deadline || undefined,
      url: form.url || undefined,
      notes: form.notes || undefined,
    });
    setForm({ name: "", provider: "", amount: "", deadline: "", url: "", notes: "" });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.03)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>Add Scholarship</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Scholarship name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ ...inputStyle, flex: 2, minWidth: 200 }} />
          <input placeholder="Provider" value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Amount ($)" type="number" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
          <input placeholder="Deadline" type="date" value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input placeholder="URL (optional)" value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            style={{ ...inputStyle, flex: 2, minWidth: 200 }} />
        </div>
        <textarea placeholder="Notes (optional)" value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          style={{
            width: "100%", borderRadius: 6, padding: "8px 10px", fontSize: 13,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", resize: "vertical",
          }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSubmit} disabled={isPending}
            style={{
              height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600,
              background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: isPending ? 0.6 : 1,
            }}>
            {isPending && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            Submit
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
