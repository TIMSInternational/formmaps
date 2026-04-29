"use client";

import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AnimatedCard({ className, ...props }: CardProps) {
  return (
    <div
      role="region"
      className={cn(
        "group/animated-card relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-900 dark:bg-black",
        className
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 border-t border-zinc-200 p-4 dark:border-zinc-900",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-black dark:text-white",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-sm text-neutral-500 dark:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}

export function CardVisual({ className, ...props }: CardProps) {
  return (
    <div
      className={cn("h-[180px] w-full overflow-hidden", className)}
      {...props}
    />
  );
}

interface Visual3Props {
  mainColor?: string;
  secondaryColor?: string;
  gridColor?: string;
}

export function Visual3({
  mainColor = "#8b5cf6",
  secondaryColor = "#fbbf24",
  gridColor = "#80808015",
}: Visual3Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <div
        className="absolute inset-0 z-20"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <div className="relative h-[180px] w-full overflow-hidden rounded-t-lg">
        <Layer4 color={mainColor} secondaryColor={secondaryColor} hovered={hovered} />
        <Layer3 color={mainColor} />
        <Layer2 color={mainColor} />
        <Layer1 color={mainColor} secondaryColor={secondaryColor} />
        <EllipseGradient color={mainColor} />
        <GridLayer color={gridColor} />
      </div>
    </>
  );
}

interface LayerProps { color: string; secondaryColor?: string; hovered?: boolean; }

const GridLayer: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{ "--grid-color": color } as React.CSSProperties}
    className="pointer-events-none absolute inset-0 z-[4] h-full w-full bg-transparent bg-[linear-gradient(to_right,var(--grid-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-color)_1px,transparent_1px)] bg-[size:20px_20px] bg-center opacity-70 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"
  />
);

const EllipseGradient: React.FC<{ color: string }> = ({ color }) => (
  <div className="absolute inset-0 z-[5] flex h-full w-full items-center justify-center">
    <svg width="100%" height="180" viewBox="0 0 356 180" fill="none" preserveAspectRatio="xMidYMid slice">
      <rect width="356" height="180" fill="url(#ellipse-grad)" />
      <defs>
        <radialGradient id="ellipse-grad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(178 98) rotate(90) scale(98 178)">
          <stop stopColor={color} stopOpacity="0.25" />
          <stop offset="0.34" stopColor={color} stopOpacity="0.15" />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  </div>
);

const Layer1: React.FC<LayerProps> = ({ color, secondaryColor }) => (
  <div className="absolute top-4 left-4 z-[8] flex items-center gap-1">
    <div className="flex shrink-0 items-center rounded-full border border-zinc-200 bg-white/25 px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0 dark:border-zinc-800 dark:bg-black/25">
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="ml-1 text-[10px] text-black dark:text-white">+15.2%</span>
    </div>
    <div className="flex shrink-0 items-center rounded-full border border-zinc-200 bg-white/25 px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0 dark:border-zinc-800 dark:bg-black/25">
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: secondaryColor }} />
      <span className="ml-1 text-[10px] text-black dark:text-white">+18.7%</span>
    </div>
  </div>
);

const Layer2: React.FC<{ color: string }> = ({ color }) => (
  <div className="group relative h-full w-full">
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[7] flex w-full translate-y-full items-start justify-center bg-transparent p-4 transition-transform duration-500 group-hover/animated-card:translate-y-0">
      <div className="ease-[cubic-bezier(0.6,0,1)] rounded-md border border-zinc-200 bg-white/25 p-1.5 opacity-0 backdrop-blur-sm transition-opacity duration-500 group-hover/animated-card:opacity-100 dark:border-zinc-800 dark:bg-black/25">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <p className="text-xs text-black dark:text-white">Data Visualization</p>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Hover to explore stats</p>
      </div>
    </div>
  </div>
);

const Layer3: React.FC<{ color: string }> = ({ color }) => (
  <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[6] flex translate-y-full items-center justify-center opacity-0 transition-all duration-500 group-hover/animated-card:translate-y-0 group-hover/animated-card:opacity-100">
    <svg width="100%" height="180" viewBox="0 0 356 180" fill="none" preserveAspectRatio="xMidYMid slice">
      <rect width="356" height="180" fill="url(#layer3-grad)" />
      <defs>
        <linearGradient id="layer3-grad" x1="178" y1="0" x2="178" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0.35" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

const Layer4: React.FC<LayerProps> = ({ color, secondaryColor, hovered }) => {
  const rects = [
    { h: 20, y: 110, hh: 20, hy: 130, x: 40, f: "currentColor", hf: secondaryColor },
    { h: 20, y: 90, hh: 20, hy: 130, x: 60, f: color, hf: color },
    { h: 40, y: 70, hh: 30, hy: 120, x: 80, f: color, hf: color },
    { h: 30, y: 80, hh: 50, hy: 100, x: 100, f: color, hf: color },
    { h: 30, y: 110, hh: 40, hy: 110, x: 120, f: "currentColor", hf: secondaryColor },
    { h: 50, y: 110, hh: 20, hy: 130, x: 140, f: "currentColor", hf: secondaryColor },
    { h: 50, y: 60, hh: 30, hy: 120, x: 160, f: color, hf: color },
    { h: 30, y: 80, hh: 20, hy: 130, x: 180, f: color, hf: color },
    { h: 20, y: 110, hh: 40, hy: 110, x: 200, f: "currentColor", hf: secondaryColor },
    { h: 40, y: 70, hh: 60, hy: 90, x: 220, f: color, hf: color },
    { h: 30, y: 110, hh: 70, hy: 80, x: 240, f: "currentColor", hf: secondaryColor },
    { h: 50, y: 110, hh: 50, hy: 100, x: 260, f: "currentColor", hf: secondaryColor },
    { h: 20, y: 110, hh: 80, hy: 70, x: 280, f: "currentColor", hf: secondaryColor },
    { h: 30, y: 80, hh: 90, hy: 60, x: 300, f: color, hf: color },
  ];

  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[8] flex h-[180px] w-full items-center justify-center text-neutral-800/10 transition-transform duration-500 group-hover/animated-card:scale-150 dark:text-white/15">
      <svg width="100%" height="180" viewBox="0 0 356 180" preserveAspectRatio="xMidYMid slice">
        {rects.map((r, i) => (
          <rect key={i} width={15} height={hovered ? r.hh : r.h} x={r.x} y={hovered ? r.hy : r.y}
            fill={hovered ? r.hf : r.f} rx="2" ry="2"
            className="ease-[cubic-bezier(0.6,0.6,0,1)] transition-all duration-500" />
        ))}
      </svg>
    </div>
  );
};
