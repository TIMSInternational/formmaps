"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import React, { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A highly professional magnetic physics wrapper.
 * When the user hovers over this element, it gently yields toward their cursor
 * using strict spring physics, avoiding native CSS transitions that cause jitter.
 */
export function MagneticWrapper({ 
  children, 
  className,
  magneticRange = 0.15 // How far it pulls (15% by default)
}: { 
  children: React.ReactNode;
  className?: string;
  magneticRange?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Extremely professional, tight spring configuration
  // High stiffness + moderate damping = fast, snappy return without bounce
  const springConfig = { damping: 25, stiffness: 250, mass: 0.5 };
  const smoothX = useSpring(x, springConfig);
  const smoothY = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    if (ref.current) {
        const { height, width, left, top } = ref.current.getBoundingClientRect();
        // Calculate raw distance from the exact center of the component
        const middleX = clientX - (left + width / 2);
        const middleY = clientY - (top + height / 2);
        
        // Calculate precise pull
        x.set(middleX * magneticRange);
        y.set(middleY * magneticRange);
    }
  };

  const handleMouseLeave = () => {
    // Snap cleanly back to origin
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: smoothX, y: smoothY }}
      className={cn("inline-flex h-full w-full", className)}
    >
      {children}
    </motion.div>
  );
}
