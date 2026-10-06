"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { X, Loader2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { requestRecommendation } from "@/services/recommendationService";
import StaffSearch, { StaffUser } from "./StaffSearch";

// Mirrors the API's createRequestSchema: a staff member must be SELECTED (not
// just typed into the search) and the required text fields non-blank
// (formmaps-platform#412).
const requestSchema = z.object({
  recommenderId: z.string().trim().min(1),
  relationship: z.string().trim().min(1).max(100),
  requestMessage: z.string().trim().min(1).max(2000),
});

interface RecommendationRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecommendationRequestForm({
  onClose,
  onSuccess,
}: RecommendationRequestFormProps) {
  const { t } = useTranslation();
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [relationship, setRelationship] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValid = requestSchema.safeParse({
    recommenderId: selectedStaff?.id ?? "",
    relationship,
    requestMessage: message,
  }).success;
  const canSubmit = isValid && !submitting;

  const resetForm = () => {
    setSelectedStaff(null);
    setRelationship("");
    setMessage("");
    setDueDate("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedStaff) {
      toast.error(t("studentUi.recommendations.form.selectStaff"));
      return;
    }
    if (!relationship.trim()) {
      toast.error(t("studentUi.recommendations.form.relationshipRequired"));
      return;
    }
    if (!message.trim()) {
      toast.error(t("studentUi.recommendations.form.messageRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await requestRecommendation({
        recommenderId: selectedStaff.id,
        relationship: relationship.trim(),
        requestMessage: message.trim(),
        dueDate: dueDate || undefined,
      });
      toast.success(t("studentUi.recommendations.form.sent"));
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { message?: string } } };
      const msg =
        errObj?.response?.data?.message ?? t("studentUi.recommendations.form.sendFailed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
      {/* Form header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--admin-bg-hover)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--admin-font-primary)",
          }}
        >
          {t("studentUi.recommendations.form.title")}
        </span>
        <button
          onClick={resetForm}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--admin-font-tertiary)",
            display: "flex",
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Form body */}
      <div
        style={{
          padding: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {/* Staff search -- full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-font-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            {t("studentUi.recommendations.form.staffMember")}
          </label>
          <StaffSearch
            value={selectedStaff}
            onChange={setSelectedStaff}
          />
        </div>

        {/* Relationship */}
        <div>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-font-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            {t("studentUi.recommendations.form.relationship")}
          </label>
          <Input
            placeholder={t("studentUi.recommendations.form.relationshipPlaceholder")}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="h-9 text-sm"
            style={{
              borderRadius: 6,
              background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)",
            }}
          />
        </div>

        {/* Due date */}
        <div>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-font-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            {t("studentUi.recommendations.form.dueDate")}
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-9 text-sm"
            style={{
              borderRadius: 6,
              background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)",
            }}
          />
        </div>

        {/* Message -- full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-font-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            {t("studentUi.recommendations.form.message")}
          </label>
          <textarea
            placeholder={t("studentUi.recommendations.form.messagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              color: "var(--admin-font-primary)",
              fontSize: 13,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Actions */}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={resetForm}
            disabled={submitting}
            style={{
              height: 34,
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)",
              cursor: "pointer",
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              height: 34,
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--admin-accent-blue)",
              color: "#fff",
              border: "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {submitting ? (
              <Loader2
                style={{ width: 13, height: 13 }}
                className="animate-spin"
              />
            ) : (
              <Send style={{ width: 13, height: 13 }} />
            )}
            {t("studentUi.recommendations.form.send")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
