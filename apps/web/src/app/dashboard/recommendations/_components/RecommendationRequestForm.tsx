"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { X, Loader2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { requestRecommendation } from "@/services/recommendationService";
import StaffSearch, { StaffUser } from "./StaffSearch";

interface RecommendationRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecommendationRequestForm({
  onClose,
  onSuccess,
}: RecommendationRequestFormProps) {
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [relationship, setRelationship] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setSelectedStaff(null);
    setRelationship("");
    setMessage("");
    setDueDate("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedStaff) {
      toast.error("Please select a staff member");
      return;
    }
    if (!relationship.trim()) {
      toast.error("Please describe your relationship");
      return;
    }
    if (!message.trim()) {
      toast.error("Please include a request message");
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
      toast.success("Recommendation request sent");
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { message?: string } } };
      const msg =
        errObj?.response?.data?.message ?? "Failed to send request";
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
          New Recommendation Request
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
            Staff Member *
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
            Relationship *
          </label>
          <Input
            placeholder="e.g. Math teacher, Counselor"
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
            Due Date
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
            Request Message *
          </label>
          <textarea
            placeholder="Describe why you are requesting this letter and any relevant context..."
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
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              height: 34,
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--admin-accent-blue, #2E9098)",
              color: "#fff",
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
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
            Send Request
          </button>
        </div>
      </div>
    </motion.div>
  );
}
