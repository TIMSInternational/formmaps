"use client";

import React from "react";
import { motion } from "motion/react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";

export default function FavoriteButton({
  isFavorite,
  onToggle,
  className,
}: {
  isFavorite: boolean;
  onToggle?: () => void | Promise<any>;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <motion.button
      aria-pressed={isFavorite}
      className={`px-2 py-1 rounded ${
        isFavorite
          ? "bg-yellow-400 text-yellow-800"
          : "bg-gray-100 text-gray-800"
      } text-sm ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        // support both sync and async toggle handlers
        onToggle?.();
      }}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      animate={{ rotate: isFavorite ? 15 : 0 }}
    >
      {isFavorite ? t("career.favorited") : t("career.favorite")}
    </motion.button>
  );
}
