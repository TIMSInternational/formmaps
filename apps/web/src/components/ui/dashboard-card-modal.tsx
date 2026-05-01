"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, Calendar, MapPin, User, CreditCard, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailCardProps {
  title: string;
  subtitle?: string;
  avatar?: string;
  badge?: { text: string; variant?: "default" | "secondary" | "destructive" };
  fields: { label: string; value: string; icon?: React.ElementType; copyable?: boolean }[];
  action?: { label: string; icon?: React.ElementType; onClick?: () => void };
  className?: string;
}

export function DetailCard({
  title,
  subtitle,
  avatar,
  badge,
  fields,
  action,
  className,
}: DetailCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = !shouldReduceMotion;

  const handleCopy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 30, staggerChildren: 0.06, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 400, damping: 28 } },
  };

  return (
    <motion.div
      className={cn("w-full bg-card border border-border rounded-xl overflow-hidden", className)}
      initial={shouldAnimate ? "hidden" : "visible"}
      animate="visible"
      variants={shouldAnimate ? containerVariants : {}}
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <motion.div className="flex items-center gap-3" variants={shouldAnimate ? itemVariants : {}}>
          {avatar && (
            <Avatar className="w-10 h-10 ring-2 ring-primary/10">
              <AvatarImage src={avatar} alt={title} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {title.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {badge && <Badge variant={badge.variant || "secondary"} className="text-[10px]">{badge.text}</Badge>}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </motion.div>

        {/* Fields */}
        <div className="space-y-3">
          {fields.map((field) => {
            const Icon = field.icon;
            return (
              <motion.div key={field.label} className="flex items-center justify-between" variants={shouldAnimate ? itemVariants : {}}>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{field.label}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{field.value}</p>
                </div>
                {field.copyable && (
                  <button
                    onClick={() => handleCopy(field.value, field.label)}
                    className="ml-2 w-6 h-6 rounded-md bg-muted/50 hover:bg-muted/80 flex items-center justify-center transition-colors"
                  >
                    {copiedField === field.label ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Action */}
        {action && (
          <motion.div className="pt-2" variants={shouldAnimate ? itemVariants : {}}>
            <Button onClick={action.onClick} variant="outline" size="sm" className="w-full text-xs gap-1.5">
              {action.icon && <action.icon className="w-3.5 h-3.5" />}
              {action.label}
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
