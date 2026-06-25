"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  respondToRecommendation,
  updateRecommendationStatus,
  getRecommendationLetterUrl,
  RecommendationRequest,
} from "@/services/recommendationService";
import { UploadLetterDialog } from "./UploadLetterDialog";

function MenuButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        color,
        borderBottom: "1px solid var(--admin-border-default)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

export function RecommendationActionMenu({
  req,
  isMyRequest,
  onAction,
}: {
  req: RecommendationRequest;
  isMyRequest: boolean;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (!isMyRequest) return null;

  const canRespond = req.status === "requested";
  const canMarkInProgress = req.status === "accepted";
  const canUpload = req.status === "accepted" || req.status === "in_progress";
  const canDownload = req.status === "submitted" && !!req.letterFileKey;

  if (!canRespond && !canMarkInProgress && !canUpload && !canDownload) return null;

  const handle = async (fn: () => Promise<void>) => {
    setLoading(true);
    setOpen(false);
    try {
      await fn();
      onAction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="Actions"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        style={{
          height: 28,
          borderRadius: 5,
          padding: "0 10px",
          fontSize: 11,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "var(--admin-bg-hover)",
          color: "var(--admin-font-primary)",
          border: "1px solid var(--admin-border-default)",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
        ) : (
          <>
            Actions
            <ChevronDown style={{ width: 11, height: 11 }} />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 4px)",
                zIndex: 50,
                minWidth: 170,
                borderRadius: 6,
                border: "1px solid var(--admin-border-default)",
                background: "var(--admin-bg-card)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                overflow: "hidden",
              }}
            >
              {canRespond && (
                <>
                  <MenuButton
                    label="Accept"
                    color="#10b981"
                    onClick={() =>
                      handle(async () => {
                        await respondToRecommendation(req.id, "accept");
                        toast.success("Request accepted");
                      })
                    }
                  />
                  <MenuButton
                    label="Decline"
                    color="#ef4444"
                    onClick={() =>
                      handle(async () => {
                        const reason = window.prompt("Reason for declining (optional — the student will see this):") ?? undefined;
                        await respondToRecommendation(req.id, "decline", reason || undefined);
                        toast.success("Request declined");
                      })
                    }
                  />
                </>
              )}
              {canMarkInProgress && (
                <MenuButton
                  label="Mark In Progress"
                  color="#f97316"
                  onClick={() =>
                    handle(async () => {
                      await updateRecommendationStatus(req.id, "in_progress");
                      toast.success("Status updated to In Progress");
                    })
                  }
                />
              )}
              {canUpload && (
                <MenuButton
                  label="Upload Letter"
                  color="#065292"
                  onClick={() => { setOpen(false); setUploadOpen(true); }}
                />
              )}
              {canDownload && (
                <MenuButton
                  label="Download Letter"
                  color="#065292"
                  onClick={() =>
                    handle(async () => {
                      const { url } = await getRecommendationLetterUrl(req.id);
                      window.open(url, "_blank", "noopener,noreferrer");
                    })
                  }
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <UploadLetterDialog
        requestId={req.id}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={onAction}
      />
    </div>
  );
}

export default RecommendationActionMenu;
