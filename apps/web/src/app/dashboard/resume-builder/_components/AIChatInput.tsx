"use client";

import { useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AIChatInputProps {
  onSend: (instruction: string) => Promise<void>;
  isLoading: boolean;
  suggestions?: string[];
}

export function AIChatInput({ onSend, isLoading, suggestions }: AIChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");

  const defaultSuggestions = suggestions ?? [
    t("resumeBuilder.aiChat.suggestions.actionVerbs", "Use stronger action verbs"),
    t("resumeBuilder.aiChat.suggestions.shortenSummary", "Shorten my summary"),
    t("resumeBuilder.aiChat.suggestions.moreMetrics", "Add more metrics to bullets"),
  ];

  async function handleSubmit() {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    await onSend(text);
  }

  return (
    <div className="space-y-3">
      {/* Suggestion chips — one scrollable row on phones so they don't push the
          thread (and its greeting) out of view (#406); wrapped from md up. */}
      <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 pb-1 md:pb-0">
        {defaultSuggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isLoading}
            onClick={() => onSend(s)}
            className="shrink-0 whitespace-nowrap md:whitespace-normal inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" />
            {s}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-4 py-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={t("resumeBuilder.aiChat.inputPlaceholder", "Tell me how to tweak your resume...")}
          disabled={isLoading}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          aria-label={t("resumeBuilder.aiChat.send", "Send")}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
