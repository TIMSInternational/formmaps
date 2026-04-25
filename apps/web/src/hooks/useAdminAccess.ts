"use client";
import { useState, useEffect } from "react";
import { verifyAdminAccess } from "@/services/adminService";

interface AdminAccessResult {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export function useAdminAccess(): AdminAccessResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log("🔍 useAdminAccess: Starting admin verification...");
        const result = await verifyAdminAccess();
        console.log("🔍 useAdminAccess: Verification result:", result);

        const hasAdminAccess = result.isAdmin || result.isSuperAdmin;
        console.log("🔍 useAdminAccess: Has admin access?", hasAdminAccess);

        setIsAdmin(hasAdminAccess);
      } catch (err) {
        console.error("Admin access verification error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to verify admin access"
        );
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, []);

  return { isAdmin, loading, error };
}
