"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listMyRecommendations,
  RecommendationRequest,
} from "@/services/recommendationService";
import RecommendationRequestForm from "./_components/RecommendationRequestForm";
import RecommendationList from "./_components/RecommendationList";

export default function RecommendationsPage() {
  const [requests, setRequests] = useState<RecommendationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listMyRecommendations();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load recommendation requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton
          className="h-8 w-64"
          style={{ background: "var(--admin-bg-hover)" }}
        />
        <div className="grid grid-cols-1 gap-3">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <Skeleton
                key={i}
                className="h-20"
                style={{ background: "var(--admin-bg-hover)" }}
              />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Applications
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
            Letters of Recommendation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request and track letters from your counselors and teachers.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            height: 36,
            borderRadius: 6,
            padding: "0 14px",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--admin-accent-blue, #065292)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Request Letter
        </button>
      </motion.div>

      {/* Request form */}
      <AnimatePresence>
        {showForm && (
          <RecommendationRequestForm
            onClose={() => setShowForm(false)}
            onSuccess={load}
          />
        )}
      </AnimatePresence>

      {/* Requests list */}
      <RecommendationList requests={requests} />
    </div>
  );
}
