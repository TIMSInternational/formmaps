"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

interface AnimatedAIInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AnimatedAIInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask FORMMAPS AI anything...",
}: AnimatedAIInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend(value);
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSend(value);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const hasValue = value.trim().length > 0;

  return (
    <motion.div
      initial={false}
      animate={{
        boxShadow: isFocused
          ? "0 0 0 2px var(--admin-accent-blue), 0 2px 12px rgba(0,0,0,0.08)"
          : "0 1px 4px rgba(0,0,0,0.06)",
      }}
      transition={{ duration: 0.2 }}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
      {/* Textarea area */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={{
          width: "100%",
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 13,
          lineHeight: "1.5",
          color: "var(--admin-font-primary)",
          padding: "14px 16px 8px",
          minHeight: 24,
          maxHeight: 160,
          fontFamily: "inherit",
        }}
      />

      {/* Bottom toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "4px 8px 8px",
        }}
      >
        <motion.button
          onClick={handleSend}
          disabled={!hasValue || disabled}
          whileHover={hasValue && !disabled ? { scale: 1.08 } : {}}
          whileTap={hasValue && !disabled ? { scale: 0.92 } : {}}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 10,
            border: "none",
            flexShrink: 0,
            background:
              hasValue && !disabled
                ? "var(--admin-accent-blue)"
                : "var(--admin-bg-hover)",
            color:
              hasValue && !disabled
                ? "#fff"
                : "var(--admin-font-tertiary)",
            cursor: hasValue && !disabled ? "pointer" : "default",
            transition: "background 0.2s, color 0.2s",
          }}
        >
          <ArrowRight style={{ width: 15, height: 15 }} />
        </motion.button>
      </div>
    </motion.div>
  );
}
