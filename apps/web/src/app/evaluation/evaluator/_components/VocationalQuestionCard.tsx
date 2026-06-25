"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { VocationalQuestionItem } from "@/services/vocationalTakeService";

export interface VocationalAnswerValue {
  ratingValue?: number;
  rankingOrder?: { value: string; rank: number }[];
  selectedValues?: string[];
  textValue?: string;
}

const ROW = "flex items-center gap-3 rounded-lg border p-3 cursor-pointer";
const ROW_STYLE = { borderColor: "var(--admin-border-default)", background: "var(--admin-bg-card)" } as const;

export function VocationalQuestionCard({
  question, value, onChange,
}: {
  question: VocationalQuestionItem;
  value: VocationalAnswerValue | undefined;
  onChange: (v: VocationalAnswerValue) => void;
}) {
  const options = question.options ?? [];

  if (question.type === "likert") {
    const anchors = question.scaleAnchors ?? ["1", "2", "3", "4", "5"];
    return (
      <RadioGroup value={value?.ratingValue?.toString() ?? ""} onValueChange={(v) => onChange({ ratingValue: Number(v) })} className="space-y-2">
        {anchors.map((label, i) => {
          const score = i + 1;
          const id = `q${question.number}-s${score}`;
          return (
            <label key={score} htmlFor={id} className={ROW} style={ROW_STYLE}>
              <RadioGroupItem value={score.toString()} id={id} />
              <span className="text-sm text-foreground">{score} — {label}</span>
            </label>
          );
        })}
      </RadioGroup>
    );
  }

  if (question.type === "single_select") {
    return (
      <RadioGroup value={value?.textValue ?? ""} onValueChange={(v) => onChange({ textValue: v })} className="space-y-2">
        {options.map((o) => {
          const id = `q${question.number}-${o.value}`;
          return (
            <label key={o.value} htmlFor={id} className={ROW} style={ROW_STYLE}>
              <RadioGroupItem value={o.value} id={id} />
              <span className="text-sm text-foreground">{o.labelEs}</span>
            </label>
          );
        })}
      </RadioGroup>
    );
  }

  if (question.type === "multi_select") {
    const selected = value?.selectedValues ?? [];
    const toggle = (v: string) => (selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    return (
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.value} className={ROW} style={ROW_STYLE}>
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onChange({ selectedValues: toggle(o.value) })} />
            <span className="text-sm text-foreground">{o.labelEs}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "open") {
    return (
      <Textarea value={value?.textValue ?? ""} maxLength={4000} rows={5}
        onChange={(e) => onChange({ textValue: e.target.value })}
        placeholder="Escribe tu respuesta…" className="w-full" />
    );
  }

  // ranking — reorderable list, rank = position
  const order = value?.rankingOrder?.length
    ? value.rankingOrder.slice().sort((a, b) => a.rank - b.rank).map((r) => r.value)
    : options.map((o) => o.value);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.labelEs ?? v;
  const move = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = order.slice();
    [next[idx], next[ni]] = [next[ni], next[idx]];
    onChange({ rankingOrder: next.map((v, i) => ({ value: v, rank: i + 1 })) });
  };
  return (
    <ol className="space-y-2">
      {order.map((v, idx) => (
        <li key={v} className="flex items-center justify-between rounded-lg border p-3" style={ROW_STYLE}>
          <span className="text-sm text-foreground">{idx + 1}. {labelOf(v)}</span>
          <div className="flex gap-1">
            <button type="button" aria-label={`move ${labelOf(v)} up`} disabled={idx === 0} onClick={() => move(idx, -1)} className="disabled:opacity-30 p-1"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" aria-label={`move ${labelOf(v)} down`} disabled={idx === order.length - 1} onClick={() => move(idx, 1)} className="disabled:opacity-30 p-1"><ChevronDown className="h-4 w-4" /></button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default VocationalQuestionCard;
