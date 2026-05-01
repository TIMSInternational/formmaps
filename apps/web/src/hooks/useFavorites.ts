"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getFavoritesForUser,
  addFavorite,
  removeFavorite,
} from "@/services/careerService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { telemetry } from "@/services/telemetryService";
import { toast } from "@/hooks/useToast";

const FAVORITES_KEY = "nexa_career_favorites";

function loadLocalFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export function useFavorites() {
  const { user } = useGlobalStore();
  const [favorites, setFavorites] = useState<string[]>(loadLocalFavorites);

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    getFavoritesForUser(user.id).then((r) => {
      if (cancelled) return;
      const serverFavs = r.favorites || [];
      if (serverFavs.length > 0) {
        setFavorites(serverFavs);
        saveLocalFavorites(serverFavs);
      }
    });
    return () => { cancelled = true; };
  }, [user.id]);

  const toggleFavorite = useCallback(async (careerId: string) => {
    if (!user.id) return false;
    if (favorites.includes(careerId)) {
      setFavorites((s) => {
        const next = s.filter((x) => x !== careerId);
        saveLocalFavorites(next);
        return next;
      });
      removeFavorite(user.id, careerId).catch(() => {
        toast.error("Failed to remove favorite");
      });
      toast.success("Removed from favorites");
      telemetry.trackFavorite("remove", careerId, "career");
      return false;
    }
    setFavorites((s) => {
      const next = [...s, careerId];
      saveLocalFavorites(next);
      return next;
    });
    addFavorite(user.id, careerId).catch(() => {
      toast.error("Failed to save favorite");
    });
    toast.success("Added to favorites");
    telemetry.trackFavorite("add", careerId, "career");
    return true;
  }, [user.id, favorites]);

  return { favorites, toggleFavorite };
}
