"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { AIChatInput } from "./AIChatInput";
import { aiEditResume, type Resume } from "@/services/resumeService";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AIChatEditorProps {
  resumeId: string;
  onResumeUpdated: (resume: Resume) => void;
}

const SUGGESTIONS = [
  "Make my summary more impactful",
  "Add measurable metrics to my bullets",
  "Tighten and fix grammar",
  "Tailor for a software engineering role",
  "Use stronger action verbs",
];

const GREETING = "Tell me how to improve your resume and I'll edit it live.";

export function AIChatEditor({ resumeId, onResumeUpdated }: AIChatEditorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", text: GREETING },
  ]);
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
            text: result.changeSummary || "Done — your resume has been updated.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.message || "I couldn't apply that — try rephrasing.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Something went wrong applying that edit. Please try again.",
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
                  <div className="w-7 h-7 rounded-lg bg-[#065292]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#065292]" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-secondary/60 border border-border px-3.5 py-2.5 text-sm text-foreground leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl rounded-tr-sm bg-[#065292] text-white px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
                  {msg.text}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#065292]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-[#065292] animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-secondary/60 border border-border px-3.5 py-2.5 text-sm text-muted-foreground">
              Editing your resume…
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
          suggestions={SUGGESTIONS}
        />
      </div>
    </div>
  );
}
