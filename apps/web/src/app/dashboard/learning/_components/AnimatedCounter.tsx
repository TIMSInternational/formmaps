
"use client";

import { useEffect, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number; // ms
  formatter?: (val: number) => string;
  className?: string;
}

export default function AnimatedCounter({ 
  value, 
  duration = 1000, 
  formatter = (v) => v.toLocaleString(),
  className 
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    
    // If drastically different, reset logic or just smooth interpolate
    // For simplicity, we interpolate from *current visual state* to *new target*
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing function (easeOutExpo)
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      const current = startValue + (value - startValue) * ease;
      
      setDisplayValue(current);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span className={className}>{formatter(displayValue)}</span>;
}
