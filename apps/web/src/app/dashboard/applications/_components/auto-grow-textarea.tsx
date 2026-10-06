"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  value: string;
  /** Height floor, in rows. The box never shrinks below this. */
  minRows?: number;
};

/**
 * Textarea that grows with its content instead of scrolling inside a fixed box
 * (formmaps#402: the essay draft box rendered one line tall). `rows` sets the floor;
 * height tracks scrollHeight on every value change.
 */
export function AutoGrowTextarea({ value, minRows = 8, className, ...props }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // 0 while hidden/collapsed — keep the rows-based floor rather than pinning it to 0px.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn("overflow-hidden", className)}
      {...props}
    />
  );
}
