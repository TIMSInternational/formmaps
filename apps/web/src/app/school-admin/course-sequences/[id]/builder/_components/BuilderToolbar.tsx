"use client";

import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2, Network } from "lucide-react";

interface BuilderToolbarProps {
  sequenceName: string;
  onSequenceNameChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  nodeCount: number;
  edgeCount: number;
}

export function BuilderToolbar({
  sequenceName, onSequenceNameChange, onBack, onSave, saving, nodeCount, edgeCount,
}: BuilderToolbarProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px", borderRadius: 8,
      background: "var(--admin-bg-card)",
      border: "1px solid var(--admin-border-default)",
    }}>
      <button onClick={onBack}
        style={{
          width: 28, height: 28, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none",
          color: "var(--admin-font-light)", cursor: "pointer",
        }}>
        <ArrowLeft style={{ width: 16, height: 16 }} />
      </button>
      <div style={{ width: 1, height: 20, background: "var(--admin-border-default)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: "var(--admin-accent-blue, #065292)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Network style={{ width: 14, height: 14, color: "#fff" }} />
        </div>
        <Input value={sequenceName} onChange={(e) => onSequenceNameChange(e.target.value)}
          className="h-8 w-56 text-sm font-medium" placeholder="Sequence Name..."
          style={{
            background: "transparent", border: "1px solid transparent",
            color: "var(--admin-font-primary)", borderRadius: 6,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--admin-accent-blue, #065292)";
            e.currentTarget.style.background = "var(--admin-bg-hover)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.background = "transparent";
          }}
        />
      </div>
      <button onClick={onSave}
        disabled={saving}
        style={{
          height: 32, borderRadius: 6, padding: "0 14px",
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--admin-accent-blue, #065292)", color: "#fff", border: "none",
          cursor: "pointer", fontSize: 12, fontWeight: 600,
          opacity: saving ? 0.7 : 1,
        }}>
        {saving
          ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
          : <Save style={{ width: 12, height: 12 }} />}
        Save
      </button>
    </div>
  );
}

interface CanvasStatsProps {
  nodeCount: number;
  edgeCount: number;
}

export function CanvasStats({ nodeCount, edgeCount }: CanvasStatsProps) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 6,
      background: "var(--admin-bg-card)",
      border: "1px solid var(--admin-border-default)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, color: "var(--admin-font-tertiary)",
      }}>
        <span><strong style={{ color: "var(--admin-font-primary)" }}>{nodeCount}</strong> courses</span>
        <span style={{ color: "var(--admin-border-default)" }}>|</span>
        <span><strong style={{ color: "var(--admin-font-primary)" }}>{edgeCount}</strong> paths</span>
      </div>
    </div>
  );
}

export function EmptyCanvasState() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
      <div style={{
        padding: "32px 40px", borderRadius: 12, textAlign: "center",
        background: "var(--admin-bg-card)",
        border: "1px solid var(--admin-border-default)",
        maxWidth: 380,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--admin-accent-bg-blue, rgba(59,130,246,0.08))",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px",
        }}>
          <Network style={{ width: 24, height: 24, color: "var(--admin-accent-blue, #065292)" }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6 }}>
          Empty Sequence Map
        </div>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>
          Drag courses from the library to the canvas. Connect courses by dragging from the bottom handle of a prerequisite to the top of the next course.
        </div>
      </div>
    </div>
  );
}
