"use client";

interface ScoreGaugeProps {
  score: number;
  maxScore?: number;
  size?: number;
  label?: string;
}

export function ScoreGauge({
  score,
  maxScore = 10,
  size = 120,
  label,
}: ScoreGaugeProps) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(score, maxScore);
  const filled = (normalizedScore / maxScore) * circumference;

  const color =
    normalizedScore >= 7
      ? "text-emerald-500"
      : normalizedScore >= 4
        ? "text-amber-500"
        : "text-red-500";

  const bgColor =
    normalizedScore >= 7
      ? "bg-emerald-500/10"
      : normalizedScore >= 4
        ? "bg-amber-500/10"
        : "bg-red-500/10";

  const statusLabel =
    label ??
    (normalizedScore >= 7 ? "Good" : normalizedScore >= 4 ? "Fair" : "Poor");

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          className={`${color} transition-all duration-700`}
          style={{ stroke: "currentColor" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">
          {normalizedScore.toFixed(1)}
        </span>
        <span className={`text-[10px] font-semibold ${color}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
