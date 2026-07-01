"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { useQuery } from "@tanstack/react-query";

interface CollegeResult {
  id: string;
  name: string;
}

interface AddApplicationFormProps {
  onSubmit: (data: { collegeId: string; collegeName: string; fit: string; deadlineType: string; deadlineDate: string }) => void;
  isPending: boolean;
}

export function AddApplicationForm({ onSubmit, isPending }: AddApplicationFormProps) {
  const [collegeSearch, setCollegeSearch] = useState("");
  const [newApp, setNewApp] = useState({ collegeId: "", collegeName: "", fit: "match", deadlineType: "RD", deadlineDate: "" });

  const { data: collegeResults } = useQuery({
    queryKey: ["college-search", collegeSearch],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/search?q=${encodeURIComponent(collegeSearch)}`);
      return res?.data ?? [];
    },
    enabled: collegeSearch.length >= 2,
  });

  const handleSubmit = () => {
    onSubmit(newApp);
    setNewApp({ collegeId: "", collegeName: "", fit: "match", deadlineType: "RD", deadlineDate: "" });
    setCollegeSearch("");
  };

  const selectStyle = {
    width: "100%", height: 34, borderRadius: 6, padding: "0 8px", fontSize: 12,
    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
  } as const;

  return (
    <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.03)", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>Add Application</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* College Search */}
        <div style={{ flex: "2 1 200px", position: "relative" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>College</label>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: 10, width: 14, height: 14, color: "var(--admin-font-light)" }} />
            <input placeholder="Search colleges..." value={collegeSearch}
              onChange={(e) => { setCollegeSearch(e.target.value); setNewApp({ ...newApp, collegeId: "", collegeName: "" }); }}
              style={{ ...selectStyle, paddingLeft: 30 }} />
          </div>
          {collegeResults && (collegeResults as CollegeResult[]).length > 0 && !newApp.collegeId && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
              background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}>
              {(collegeResults as CollegeResult[]).map((c) => (
                <div key={c.id}
                  onClick={() => { setNewApp({ ...newApp, collegeId: c.id, collegeName: c.name }); setCollegeSearch(c.name); }}
                  style={{ padding: "8px 12px", fontSize: 12, color: "var(--admin-font-primary)", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deadline Type */}
        <div style={{ flex: "1 1 100px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Deadline Type</label>
          <select value={newApp.deadlineType} onChange={(e) => setNewApp({ ...newApp, deadlineType: e.target.value })} style={selectStyle}>
            <option value="ED">ED</option>
            <option value="EA">EA</option>
            <option value="RD">RD</option>
            <option value="Rolling">Rolling</option>
          </select>
        </div>

        {/* Deadline Date */}
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Deadline</label>
          <input type="date" value={newApp.deadlineDate} onChange={(e) => setNewApp({ ...newApp, deadlineDate: e.target.value })} style={selectStyle} />
        </div>

        {/* Fit */}
        <div style={{ flex: "1 1 100px" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Fit</label>
          <select value={newApp.fit} onChange={(e) => setNewApp({ ...newApp, fit: e.target.value })} style={selectStyle}>
            <option value="reach">Reach</option>
            <option value="match">Match</option>
            <option value="safety">Safety</option>
          </select>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={isPending || !newApp.collegeName || !newApp.deadlineDate}
          style={{
            height: 34, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
            background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
            opacity: (isPending || !newApp.collegeName || !newApp.deadlineDate) ? 0.5 : 1,
          }}>
          {isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Add"}
        </button>
      </div>
    </div>
  );
}
