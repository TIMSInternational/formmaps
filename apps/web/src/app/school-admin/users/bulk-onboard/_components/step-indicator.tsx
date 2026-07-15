"use client";

import { CheckCircle } from "lucide-react";

const STEPS = ["Upload", "Preview & Validate", "Complete"];

interface StepIndicatorProps {
  current: number;
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "all 0.3s",
                  background: done
                    ? "#10b981"
                    : active
                    ? "linear-gradient(135deg, #14b8a6, #0ea5e9)"
                    : "var(--admin-bg-hover)",
                  border: active
                    ? "2px solid #14b8a6"
                    : done
                    ? "2px solid #10b981"
                    : "2px solid var(--admin-border-default)",
                  color: done || active ? "#fff" : "var(--admin-font-light)",
                  boxShadow: active ? "0 0 0 4px rgba(20,184,166,0.15)" : "none",
                }}
              >
                {done ? <CheckCircle style={{ width: 16, height: 16 }} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? "var(--admin-font-primary)"
                    : done
                    ? "#10b981"
                    : "var(--admin-font-light)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 80,
                  height: 2,
                  margin: "0 8px",
                  marginBottom: 20,
                  background: done ? "#10b981" : "var(--admin-border-default)",
                  transition: "background 0.4s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
