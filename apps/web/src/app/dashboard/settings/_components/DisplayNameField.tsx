"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { updateUserProfile } from "@/services/userService";
import { useGlobalStore } from "@/store/useGlobalStore";

const NAME_MAX = 100;

/**
 * Editable display name (User.name) for Settings → Profile (tafurfede/formmaps-platform#401).
 * Saved via PUT /api/v1/user/profile {name} — a Node route (no .NET rewrite for /api/v1/user/profile).
 */
export function DisplayNameField() {
  const { t } = useTranslation();
  const name = useGlobalStore((s) => s.user.name);
  const setUser = useGlobalStore((s) => s.setUser);
  const [value, setValue] = useState(name ?? "");
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const canSave = !saving && trimmed.length > 0 && trimmed.length <= NAME_MAX && trimmed !== (name ?? "");

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await updateUserProfile({ name: trimmed });
      // An API without the name field (pre formmaps-platform#424) strips it and still answers 200.
      // Only claim success when the server echoes the name back.
      if (saved?.name !== trimmed) throw new Error("name not saved");
      setUser({ name: trimmed });
      setValue(trimmed);
      toast.success(t("dashboard.settings.profile.nameSaved", { defaultValue: "Name updated" }));
    } catch {
      toast.error(t("dashboard.settings.profile.nameFailed", { defaultValue: "Could not update your name" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="display-name" style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
        {t("dashboard.settings.profile.name", { defaultValue: "Name" })}
      </Label>
      <div className="flex gap-2">
        <input
          id="display-name"
          type="text"
          value={value}
          maxLength={NAME_MAX}
          autoComplete="name"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          className="w-full h-9 rounded-md px-3 text-sm outline-none"
          style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            height: 36,
            borderRadius: 6,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            background: "var(--admin-accent-blue)",
            color: "#fff",
            border: "none",
            cursor: canSave ? "pointer" : "not-allowed",
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {saving ? t("dashboard.settings.profile.saving", { defaultValue: "Saving..." }) : t("dashboard.settings.profile.saveName", { defaultValue: "Save name" })}
        </button>
      </div>
      {trimmed.length === 0 && (
        <p role="alert" style={{ fontSize: 11, color: "var(--admin-accent-red)" }}>
          {t("dashboard.settings.profile.nameRequired", { defaultValue: "Name is required" })}
        </p>
      )}
    </div>
  );
}
