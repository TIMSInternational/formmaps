"use client";

import { motion } from "motion/react";

interface ShiningTextProps {
  text: string;
  className?: string;
}

export function ShiningText({ text, className }: ShiningTextProps) {
  const chars = text.split("");

  return (
    <span className={className} style={{ display: "inline-flex", fontSize: 12 }}>
      {chars.map((char, i) => (
        <motion.span
          key={i}
          animate={{
            color: [
              "var(--admin-font-tertiary)",
              "var(--admin-accent-blue)",
              "var(--admin-font-tertiary)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.05,
          }}
          style={{ whiteSpace: "pre" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}
