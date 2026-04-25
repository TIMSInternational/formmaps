import { cn } from "@/lib/utils";
import React from "react";
import { useUIDesign } from "@/components/ui-provider";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  innerClassName?: string;
  children: React.ReactNode;
}

export const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, innerClassName, children, ...props }, ref) => {
    const { themeMode } = useUIDesign();
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }

    return (
      <motion.div 
        ref={ref as React.RefObject<HTMLDivElement>}
        onMouseMove={handleMouseMove}
        className={cn(
          "relative flex flex-col overflow-hidden group/card p-6 lg:p-8",
          themeMode === "solid" 
            ? "bg-white border border-slate-200 shadow-sm rounded-[1.5rem]"
            : "bg-white/30 backdrop-blur-[40px] border border-white/50 rounded-[2.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)]",
          className,
          innerClassName
        )}
        {...(props as any)}
      >
        {themeMode === "glass" && (
           <>
             {/* Static Refraction Ring */}
             <div className="absolute inset-0 rounded-[2.5rem] border border-white/20 pointer-events-none mix-blend-overlay" />
             
             {/* Dynamic Framer Motion Mouse Spotlight */}
             <motion.div 
               className="pointer-events-none absolute -inset-px rounded-[2.5rem] opacity-0 transition duration-500 group-hover/card:opacity-100 z-10"
               style={{
                 background: useMotionTemplate`
                   radial-gradient(
                     600px circle at ${mouseX}px ${mouseY}px,
                     rgba(255, 255, 255, 0.15),
                     transparent 80%
                   )
                 `,
               }}
             />
           </>
        )}
        <div className="relative z-20 w-full h-full flex flex-col flex-1">
          {children}
        </div>
      </motion.div>
    );
  }
);
PremiumCard.displayName = "PremiumCard";
PremiumCard.displayName = "PremiumCard";
