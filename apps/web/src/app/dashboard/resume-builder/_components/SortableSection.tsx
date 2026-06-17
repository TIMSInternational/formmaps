"use client";

import { type ReactNode, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Pencil,
  GripVertical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  type: string;
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  entries: Array<{ id: string; [key: string]: unknown }>;
}

export interface SortableSectionProps {
  section: Section;
  index: number;
  toggleSection: (id: string) => void;
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  editingSectionTitle?: string | null;
  sectionTitleForm?: string;
  onEditTitle?: (sectionId: string, currentTitle: string) => void;
  onSaveTitle?: (sectionId: string) => void;
  onCancelEditTitle?: () => void;
  onTitleChange?: (value: string) => void;
}

export function SortableSection({
  section,
  index,
  toggleSection,
  headerMeta,
  headerActions,
  children,
  editingSectionTitle,
  sectionTitleForm,
  onEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onTitleChange,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  const handleSectionToggle = () => {
    toggleSection(section.id);
  };

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSectionToggle();
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * (index + 2) }}
      className={cn(
        "bg-card rounded-xl border shadow-sm overflow-hidden transition-all duration-200",
        isDragging
          ? "border-[#065292]/40 shadow-lg scale-[1.02]"
          : section.isExpanded
            ? "border-[#065292]/30 hover:border-[#065292]/40"
            : "border-border hover:border-[#065292]/30"
      )}
    >
      <div
        className={cn(
          "group w-full flex items-center gap-3 px-4 py-3.5 transition-colors",
          section.isExpanded ? "bg-[#065292]/5" : "hover:bg-secondary/50"
        )}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "cursor-grab active:cursor-grabbing p-2 rounded transition-all",
            "hover:bg-[#065292]/10 hover:text-[#065292]",
            "focus:outline-none focus:ring-2 focus:ring-[#065292]/50",
            isDragging && "cursor-grabbing bg-[#065292]/20"
          )}
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Section Header */}
        {editingSectionTitle === section.id ? (
          <div className="flex-1 flex items-center gap-2">
            <section.icon className="w-5 h-5 text-[#065292] flex-shrink-0" />
            <input
              type="text"
              value={sectionTitleForm}
              onChange={(e) => onTitleChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSaveTitle?.(section.id);
                } else if (e.key === "Escape") {
                  onCancelEditTitle?.();
                }
              }}
              className="flex-1 px-2 py-1 text-sm font-semibold bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#065292] focus:border-[#065292]"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveTitle?.(section.id);
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Save title"
            >
              <Check className="w-4 h-4 text-green-600" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelEditTitle?.();
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={section.isExpanded}
            onClick={handleSectionToggle}
            onKeyDown={handleHeaderKeyDown}
            className="flex-1 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065292] rounded-md"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <section.icon className="w-5 h-5 text-[#065292] flex-shrink-0" />
              <span className="font-semibold text-foreground text-left truncate">
                {section.title}
              </span>
              {section.type === "custom" && onEditTitle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTitle(section.id, section.title);
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-all"
                  title="Edit section title"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {headerMeta ? (
                <span className="text-xs text-muted-foreground truncate">
                  {headerMeta}
                </span>
              ) : null}
            </div>
            {section.isExpanded ? (
              <ChevronUp className="w-5 h-5 text-[#065292]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}

        {headerActions ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {section.isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
