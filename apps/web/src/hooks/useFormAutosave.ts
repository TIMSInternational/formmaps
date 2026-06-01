"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Form Autosave Hook
 * 
 * Provides autosave functionality for forms with backend API integration.
 * Automatically saves drafts on change (debounced) and restores on mount.
 */

interface Draft {
  draftId: string;
  formId: string;
  data: Record<string, unknown>;
  step?: number;
  lastModified: string;
  expiresAt?: string;
}

interface AutosaveOptions {
  debounceMs?: number;
  enabled?: boolean;
  onSaveSuccess?: (draftId: string) => void;
  onSaveError?: (error: Error) => void;
  onRestoreSuccess?: (data: Record<string, unknown>) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export function useFormAutosave(
  formId: string,
  options: AutosaveOptions = {}
) {
  const {
    debounceMs = 1000,
    enabled = true,
    onSaveSuccess,
    onSaveError,
    onRestoreSuccess,
  } = options;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<Record<string, unknown> | null>(null);

  /**
   * Load existing draft from backend
   */
  const loadDraft = useCallback(async (): Promise<Draft | null> => {
    if (!enabled) return null;

    try {
      setIsLoading(true);
      const response = await apiRequest<{ drafts: Draft[] }>(
        `/api/v1/user/drafts?formId=${encodeURIComponent(formId)}`
      );

      const existingDraft = response.drafts?.[0] || null;
      setDraft(existingDraft);

      if (existingDraft && onRestoreSuccess) {
        onRestoreSuccess(existingDraft.data);
      }

      return existingDraft;
    } catch (error) {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [formId, enabled, onRestoreSuccess]);

  /**
   * Save draft to backend
   */
  const saveDraft = useCallback(
    async (data: Record<string, unknown>, step?: number): Promise<string | null> => {
      if (!enabled) return null;

      try {
        setIsSaving(true);

        const response = await apiRequest<{ success: boolean; draftId: string }>(
          "/api/v1/user/drafts",
          {
            method: "POST",
            body: JSON.stringify({
              formId,
              data,
              step,
              lastModified: new Date().toISOString(),
            }),
          }
        );

        if (response.success) {
          setDraft((prev) => ({
            draftId: response.draftId,
            formId,
            data,
            step,
            lastModified: new Date().toISOString(),
            expiresAt: prev?.expiresAt,
          }));
          setLastSaved(new Date());

          if (onSaveSuccess) {
            onSaveSuccess(response.draftId);
          }

          return response.draftId;
        }

        return null;
      } catch (error) {
        if (onSaveError) {
          onSaveError(error as Error);
        }
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [formId, enabled, onSaveSuccess, onSaveError]
  );

  /**
   * Debounced save - call this on form changes
   */
  const debouncedSave = useCallback(
    (data: Record<string, unknown>, step?: number) => {
      pendingData.current = data;

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        if (pendingData.current) {
          saveDraft(pendingData.current, step);
          pendingData.current = null;
        }
      }, debounceMs);
    },
    [saveDraft, debounceMs]
  );

  /**
   * Clear draft after successful form submission
   */
  const clearDraft = useCallback(async (): Promise<boolean> => {
    if (!draft?.draftId) return true;

    try {
      await apiRequest(`/api/v1/user/drafts/${draft.draftId}`, {
        method: "DELETE",
      });

      setDraft(null);
      setLastSaved(null);
      return true;
    } catch (error) {
      return false;
    }
  }, [draft?.draftId]);

  /**
   * Force flush any pending saves
   */
  const flushPending = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    if (pendingData.current) {
      await saveDraft(pendingData.current);
      pendingData.current = null;
    }
  }, [saveDraft]);

  /**
   * Mark that the draft has been restored (prevents double restore)
   */
  const markRestored = useCallback(() => {
    setHasRestoredDraft(true);
  }, []);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    // State
    draft,
    isSaving,
    isLoading,
    lastSaved,
    hasRestoredDraft,

    // Actions
    saveDraft,
    debouncedSave,
    loadDraft,
    clearDraft,
    flushPending,
    markRestored,
  };
}

/**
 * Simplified hook for React Hook Form integration
 */
export function useFormAutosaveWithRHF<T extends Record<string, unknown>>(
  formId: string,
  watch: () => T,
  reset: (data: T) => void,
  options: AutosaveOptions = {}
) {
  const autosave = useFormAutosave(formId, {
    ...options,
    onRestoreSuccess: (data) => {
      reset(data as T);
      options.onRestoreSuccess?.(data);
    },
  });

  // Auto-save on form changes
  useEffect(() => {
    if (autosave.isLoading || !autosave.hasRestoredDraft) return;

    const subscription = setInterval(() => {
      const currentData = watch();
      if (currentData && Object.keys(currentData).length > 0) {
        autosave.debouncedSave(currentData);
      }
    }, 2000); // Check for changes every 2 seconds

    return () => clearInterval(subscription);
  }, [autosave, watch]);

  // Mark as restored after initial load
  useEffect(() => {
    if (!autosave.isLoading && autosave.draft) {
      autosave.markRestored();
    } else if (!autosave.isLoading && !autosave.draft) {
      autosave.markRestored(); // No draft exists, but we're done loading
    }
  }, [autosave.isLoading, autosave.draft, autosave.markRestored]);

  return autosave;
}
