"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AIChatInput } from "./AIChatInput";
import { aiEditResume, type Resume } from "@/services/resumeService";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const STORAGE_PREFIX = "formmaps.resumeAiChat.";
const MAX_STORED_MESSAGES = 50;
const GREETING: ChatMessage = { id: "greeting", role: "assistant", text: "" };

// The conversation lives only in the browser (no API stores it) — persisted per
// resume so a reload doesn't wipe it (#406). Storage can throw (private mode,
// blocked site data), so every access is guarded.
function loadConversation(resumeId: string): ChatMessage[] {
  if (!resumeId) return [GREETING];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + resumeId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const saved = Array.isArray(parsed)
      ? parsed.filter(
          (m): m is ChatMessage =>
            !!m && typeof m.id === "string" && typeof m.text === "string" &&
            (m.role === "user" || m.role === "assistant")
        )
      : [];
    return [GREETING, ...saved];
  } catch {
    return [GREETING];
  }
}

function saveConversation(resumeId: string, messages: ChatMessage[]) {
  if (!resumeId) return;
  try {
    const toStore = messages.filter((m) => m.id !== GREETING.id).slice(-MAX_STORED_MESSAGES);
    window.localStorage.setItem(STORAGE_PREFIX + resumeId, JSON.stringify(toStore));
  } catch {
    // Best-effort only.
  }
}

interface AIChatEditorProps {
  resumeId: string;
  onResumeUpdated: (resume: Resume) => void;
}

export function AIChatEditor({ resumeId, onResumeUpdated }: AIChatEditorProps) {
  const { t } = useTranslation();
  // The tailoring chip follows the student's own top career match (it used to
  // say "software engineering" to everyone). Locked = no real matches yet.
  const { data: scoring } = useTimsCareerScoring();
  const topCareer = scoring?.data?.locked ? undefined : scoring?.data?.careers?.[0]?.programTitle;
  const suggestions = [
    t("resumeBuilder.aiChat.suggestions.impactfulSummary", "Make my summary more impactful"),
    t("resumeBuilder.aiChat.suggestions.measurableMetrics", "Add measurable metrics to my bullets"),
    t("resumeBuilder.aiChat.suggestions.tightenGrammar", "Tighten and fix grammar"),
    topCareer
      ? t("resumeBuilder.aiChat.suggestions.tailorCareer", { career: topCareer, defaultValue: "Tailor for a {{career}} role" })
      : t("resumeBuilder.aiChat.suggestions.tailorTarget", "Tailor for my target career"),
    t("resumeBuilder.aiChat.suggestions.actionVerbs", "Use stronger action verbs"),
  ];
  // The greeting is resolved at render time (see below) so it follows the UI language.
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(resumeId));
  const loadedFor = useRef(resumeId);

  // resumeId arrives after mount (route param → store); reload that resume's thread.
  useEffect(() => {
    if (loadedFor.current === resumeId) return;
    loadedFor.current = resumeId;
    setMessages(loadConversation(resumeId));
  }, [resumeId]);

  useEffect(() => {
    if (loadedFor.current === resumeId) saveConversation(resumeId, messages);
  }, [resumeId, messages]);
  const [isLoading, setIsLoading] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSend(instruction: string) {
    const trimmed = instruction.trim();
    if (!trimmed || isLoading) return;
    if (!resumeId) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: trimmed },
    ]);
    setIsLoading(true);

    try {
      const result = await aiEditResume(resumeId, trimmed);
      if (result.applied && result.resume) {
        onResumeUpdated(result.resume);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.changeSummary || t("resumeBuilder.aiChat.updated", "Done — your resume has been updated."),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.message || t("resumeBuilder.aiChat.couldNotApply", "I couldn't apply that — try rephrasing."),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: t("resumeBuilder.aiChat.editFailed", "Something went wrong applying that edit. Please try again."),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={
                msg.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              {msg.role === "assistant" ? (
                <div className="flex items-start gap-2 max-w-[85%]">
                  <div className="w-7 h-7 rounded-lg bg-[#102B47]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#2E9098]" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-secondary/60 border border-border px-3.5 py-2.5 text-sm text-foreground leading-relaxed">
                    {msg.id === "greeting"
                      ? t("resumeBuilder.aiChat.greeting", "Tell me how to improve your resume and I'll edit it live.")
                      : msg.text}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl rounded-tr-sm bg-[#102B47] text-white px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
                  {msg.text}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#102B47]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-[#2E9098] animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-secondary/60 border border-border px-3.5 py-2.5 text-sm text-muted-foreground">
              {t("resumeBuilder.aiChat.editing", "Editing your resume…")}
            </div>
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Input + suggestions */}
      <div className="border-t border-border p-3 shrink-0 bg-white dark:bg-card">
        <AIChatInput
          onSend={handleSend}
          isLoading={isLoading}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}
