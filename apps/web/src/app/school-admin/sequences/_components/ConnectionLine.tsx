"use client";

import { getBezierPath, type ConnectionLineComponentProps } from "@xyflow/react";

export function ConnectionLine({
  fromX, fromY, toX, toY,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY + 4,
    targetX: toX,
    targetY: toY - 4,
  });

  return (
    <path
      d={path}
      fill="none"
      stroke="var(--admin-accent-blue, #065292)"
      strokeWidth={1}
    />
  );
}
