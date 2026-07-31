"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api/apiClient";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  roleName?: string;
}

interface StaffSearchProps {
  value: StaffUser | null;
  onChange: (u: StaffUser | null) => void;
}

export default function StaffSearch({ value, onChange }: StaffSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      setError(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        // Student-accessible endpoint: staff at the student's own school only
        const res = await apiRequest(
          `/api/v1/recommendations/staff?search=${encodeURIComponent(query)}&limit=10`,
          { method: "GET" }
        );
        const users = res?.data?.data ?? res?.data ?? [];
        setResults(Array.isArray(users) ? users : []);
        setOpen(true);
      } catch {
        setResults([]);
        setError(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--admin-font-primary)",
            }}
          >
            {value.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {value.email}
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--admin-font-tertiary)",
            display: "flex",
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: "var(--admin-font-tertiary)" }}
        />
        <Input
          placeholder="Search counselors and staff..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
          style={{
            borderRadius: 6,
            background: "var(--admin-bg-card)",
            border: "1px solid var(--admin-border-default)",
          }}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin"
            style={{ color: "var(--admin-font-tertiary)" }}
          />
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 50,
              borderRadius: 6,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--admin-font-tertiary)",
                }}
              >
                Search failed. Please try again.
              </div>
            )}
            {!error && results.length === 0 && (
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--admin-font-tertiary)",
                }}
              >
                No counselors or staff found at your school.
              </div>
            )}
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onChange(u);
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--admin-border-default)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--admin-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--admin-font-primary)",
                  }}
                >
                  {u.name}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}
                >
                  {u.email}
                  {u.roleName ? ` · ${u.roleName}` : ""}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
