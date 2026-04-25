"use client";
import { useState, useEffect } from "react";
import { verifySchoolAdminAccess } from "@/services/schoolAdminService";

interface SchoolAdminAccessResult {
  isSchoolAdmin: boolean;
  loading: boolean;
  error: string | null;
  schoolId?: string;
  schoolName?: string;
}

export function useSchoolAdminAccess(): SchoolAdminAccessResult {
  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | undefined>();
  const [schoolName, setSchoolName] = useState<string | undefined>();

  useEffect(() => {
    const checkSchoolAdminAccess = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log("🔍 useSchoolAdminAccess: Starting verification...");
        const result = await verifySchoolAdminAccess();
        console.log("🔍 useSchoolAdminAccess: Verification result:", result);

        setIsSchoolAdmin(result.isSchoolAdmin);
        setSchoolId(result.schoolId);
        setSchoolName(result.schoolName);
      } catch (err) {
        console.error("School admin access verification error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to verify school admin access"
        );
        setIsSchoolAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkSchoolAdminAccess();
  }, []);

  return { isSchoolAdmin, loading, error, schoolId, schoolName };
}
