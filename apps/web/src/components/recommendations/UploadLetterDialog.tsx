"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { uploadRecommendationLetter } from "@/services/recommendationService";

export function UploadLetterDialog({
  requestId,
  open,
  onClose,
  onUploaded,
}: {
  requestId: string;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fix #1: Reset selected file when dialog (re)opens — hook must be before early return
  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  // Fix #3: handleUpload defined before the early-return guard
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadRecommendationLetter(requestId, file);
      toast.success("Letter uploaded");
      onUploaded();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Upload letter"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(440px, 92vw)", borderRadius: 10, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", padding: 20 }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary)", marginBottom: 4 }}>Upload recommendation letter</h2>
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 14 }}>
          PDF only. Uploading marks the request as submitted and notifies the student.
        </p>
        <label htmlFor="letter-pdf" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 6 }}>
          Letter PDF
        </label>
        <input
          id="letter-pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12, marginBottom: 16, width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)", cursor: uploading ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#102B47", color: "#fff", border: "none", cursor: !file || uploading ? "not-allowed" : "pointer", opacity: !file || uploading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
          >
            {uploading ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <UploadCloud style={{ width: 14, height: 14 }} />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadLetterDialog;
