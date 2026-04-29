"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DollarSign, UserPlus, BookOpen, Clock, Bell, Settings } from "lucide-react";

export interface FeedItem {
  id: string;
  type?: "transaction" | "user" | "course" | "session" | "alert" | "system";
  message: string;
  time: string;
}

interface LiveFeedProps {
  items: FeedItem[];
  title?: string;
  autoScroll?: boolean;
  maxVisible?: number;
}

const typeIcons: Record<string, React.ElementType> = {
  transaction: DollarSign,
  user: UserPlus,
  course: BookOpen,
  session: Clock,
  alert: Bell,
  system: Settings,
};

const typeDotColors: Record<string, string> = {
  transaction: "var(--admin-accent-green, #10b981)",
  user: "var(--admin-accent-blue, #3b82f6)",
  course: "#8b5cf6",
  session: "#f59e0b",
  alert: "var(--admin-accent-red, #ef4444)",
  system: "var(--admin-font-tertiary, #818181)",
};

export function LiveFeed({ items, title = "Live Feed", autoScroll = true, maxVisible = 5 }: LiveFeedProps) {
  const [visibleItems, setVisibleItems] = useState(items.slice(0, maxVisible));
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const indexRef = useRef(maxVisible);

  useEffect(() => {
    if (!autoScroll || isHovered || items.length <= maxVisible) return;

    timerRef.current = setInterval(() => {
      setVisibleItems((prev) => {
        const next = [...prev.slice(1)];
        const nextItem = items[indexRef.current % items.length];
        next.push(nextItem);
        indexRef.current++;
        return next;
      });
    }, 3000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoScroll, isHovered, items, maxVisible]);

  // Update when items change externally
  useEffect(() => {
    setVisibleItems(items.slice(0, maxVisible));
    indexRef.current = maxVisible;
  }, [items, maxVisible]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default, #2a2a2a)",
        background: "var(--admin-bg-card, #1e1e1e)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 18px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-light, #555)" }}>
          {title}
        </span>
        {autoScroll && (
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: isHovered ? "var(--admin-font-tertiary)" : "var(--admin-accent-green, #10b981)",
            transition: "background 0.2s",
          }} />
        )}
      </div>

      {/* Feed Items */}
      <div style={{ padding: "0 18px 14px", minHeight: maxVisible * 52 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleItems.map((item) => {
            const dotColor = typeDotColors[item.type || "system"] || typeDotColors.system;
            return (
              <motion.div
                key={item.id + "-" + item.time}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--admin-border-default, #2a2a2a)",
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0,
                  background: dotColor,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--admin-font-secondary, #b3b3b3)", lineHeight: 1.4 }}>
                    {item.message}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-light, #555)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock style={{ width: 9, height: 9 }} />
                    {item.time}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
