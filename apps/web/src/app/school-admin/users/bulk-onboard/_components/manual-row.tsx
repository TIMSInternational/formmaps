"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StudentRow } from "./types";

interface ManualRowProps {
  row: StudentRow;
  onChange: (id: string, field: keyof StudentRow, value: string) => void;
  onRemove: (id: string) => void;
  index: number;
}

export function ManualRow({ row, onChange, onRemove, index }: ManualRowProps) {
  const { t } = useTranslation("school_admin");
  const inputStyle: React.CSSProperties = {
    background: "var(--admin-bg-hover)",
    border: "1px solid var(--admin-border-default)",
    borderRadius: 6,
    color: "var(--admin-font-primary)",
    height: 34,
    fontSize: 13,
    padding: "0 10px",
    outline: "none",
    width: "100%",
  };

  return (
    <motion.tr
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
      style={{ borderBottom: "1px solid var(--admin-border-default)" }}
    >
      <td className="px-3 py-2" style={{ fontSize: 12, color: "var(--admin-font-tertiary)", width: 36 }}>
        {index + 1}
      </td>
      <td className="px-3 py-2">
        <input
          style={inputStyle}
          placeholder={t("ui.student360.fullName")}
          value={row.name}
          onChange={(e) => onChange(row.id, "name", e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          style={inputStyle}
          placeholder="student@school.edu"
          value={row.email}
          onChange={(e) => onChange(row.id, "email", e.target.value)}
        />
      </td>
      <td className="px-3 py-2" style={{ minWidth: 150 }}>
        <Select
          value={row.classLevel || "placeholder"}
          onValueChange={(v) => onChange(row.id, "classLevel", v === "placeholder" ? "" : v)}
        >
          <SelectTrigger
            style={{
              ...inputStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <SelectValue placeholder={t("ui.bulkOnboard.classLevel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="placeholder" disabled>
              {t("ui.bulkOnboard.selectClass")}
            </SelectItem>
            <SelectItem value="Freshman">{t("ui.bulkOnboard.levels.Freshman")}</SelectItem>
            <SelectItem value="Sophomore">{t("ui.bulkOnboard.levels.Sophomore")}</SelectItem>
            <SelectItem value="Junior">{t("ui.bulkOnboard.levels.Junior")}</SelectItem>
            <SelectItem value="Senior">{t("ui.bulkOnboard.levels.Senior")}</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => onRemove(row.id)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--admin-border-default)",
            color: "#ef4444",
            cursor: "pointer",
          }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </td>
    </motion.tr>
  );
}
