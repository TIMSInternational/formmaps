"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

interface InlineEditFieldProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  label?: string;
  placeholder?: string;
  type?: "text" | "textarea";
  renderDisplay?: (value: string) => ReactNode;
}

export function InlineEditField({
  value,
  onSave,
  label,
  placeholder,
  type = "text",
  renderDisplay,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = useCallback(async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && type !== "textarea") handleSave();
      if (e.key === "Escape") handleCancel();
    },
    [handleSave, handleCancel, type],
  );

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {label && (
            <div
              className="text-[11px] font-medium uppercase tracking-wider mb-0.5"
              style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
            >
              {label}
            </div>
          )}
          <div
            className="text-sm cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors"
            style={{ color: "var(--admin-font-primary, var(--foreground))" }}
            onClick={() => setEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
          >
            {renderDisplay ? renderDisplay(value) : value || (
              <span style={{ color: "var(--admin-font-light, var(--muted-foreground))" }}>
                {placeholder ?? "Click to edit"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 rounded transition-opacity"
          style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const inputStyle = {
    background: "var(--admin-bg-input, var(--input))",
    border: "1px solid var(--admin-border-hover, var(--border))",
    color: "var(--admin-font-primary, var(--foreground))",
    borderRadius: "4px",
    fontSize: "13px",
    padding: "4px 8px",
    width: "100%",
    outline: "none",
  };

  return (
    <div>
      {label && (
        <div
          className="text-[11px] font-medium uppercase tracking-wider mb-1"
          style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
        >
          {label}
        </div>
      )}
      <div className="flex items-start gap-1.5">
        {type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            rows={3}
            style={{ ...inputStyle, height: "auto", resize: "vertical" }}
            disabled={saving}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            style={inputStyle}
            disabled={saving}
          />
        )}
        <div className="flex gap-0.5 shrink-0">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--admin-font-tertiary)" }} />
          ) : (
            <>
              <button
                onClick={handleSave}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--admin-accent-green, #10b981)" }}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--admin-accent-red, #ef4444)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
