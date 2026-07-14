"use client";

/**
 * One personality item — the prompt and two big A/B option buttons. The
 * currently-selected choice (from an already-answered item) is highlighted so
 * navigating Back shows the prior answer. Untimed: choosing advances.
 */
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { BinaryChoice, ServedItem } from "@/services/personalityService";
import { cn } from "@/lib/utils";

export function PersonalityItemCard({
  item,
  selected,
  onChoose,
}: {
  item: ServedItem;
  selected?: BinaryChoice;
  onChoose: (choice: BinaryChoice) => void;
}) {
  const options: { choice: BinaryChoice; text: string }[] = [
    { choice: "A", text: item.optionA },
    { choice: "B", text: item.optionB },
  ];

  return (
    <motion.div
      key={item.n}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8"
    >
      <p className="text-lg sm:text-xl font-semibold text-foreground text-center mb-8 leading-snug">
        {item.prompt}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ choice, text }) => {
          const isSelected = selected === choice;
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onChoose(choice)}
              aria-pressed={isSelected}
              className={cn(
                "group relative w-full text-left rounded-xl border-2 px-5 py-5 transition-all",
                isSelected
                  ? "border-[#065292] bg-[#065292]/5 ring-2 ring-[#065292]/20"
                  : "border-border bg-background hover:border-[#065292]/50 hover:bg-secondary/40",
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isSelected
                      ? "bg-[#065292] text-white"
                      : "bg-secondary text-muted-foreground group-hover:bg-[#065292]/10 group-hover:text-[#065292]",
                  )}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : choice}
                </span>
                <span className="text-sm sm:text-base font-medium text-foreground leading-snug">
                  {text}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
