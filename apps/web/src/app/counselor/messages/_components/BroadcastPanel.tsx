"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Send, Loader2, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";

export function BroadcastPanel() {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);

  const handleBroadcast = async () => {
    if (!content.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setSending(true);
    try {
      const res = await apiRequest("/api/v1/messages/broadcast", {
        method: "POST",
        data: { recipientGroup: "students", content: content.trim() },
      });
      const count = res?.data?.recipientCount ?? 0;
      setRecipientCount(count);
      setSent(true);
      toast.success(`Message sent to ${count} student${count !== 1 ? "s" : ""}`);
      setContent("");
    } catch (e: any) {
      toast.error(e.message || "Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
        <Users className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-foreground">Broadcast to My Students</span>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          Send a message to all students assigned to you. Each student will receive the message as a direct conversation.
        </p>

        <Textarea
          placeholder="Type your message to all students..."
          value={content}
          onChange={(e) => { setContent(e.target.value); setSent(false); }}
          rows={4}
          className="resize-none text-sm"
          disabled={sending}
        />

        <div className="flex items-center gap-3">
          <Button
            onClick={handleBroadcast}
            disabled={!content.trim() || sending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {sending ? "Sending..." : "Message All My Students"}
          </Button>

          {sent && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs text-emerald-600 flex items-center gap-1"
            >
              <MessageSquare className="h-3 w-3" />
              Sent to {recipientCount} student{recipientCount !== 1 ? "s" : ""}
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
