"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createConversation, searchContacts, ConversationSummary } from "@/services/messageService";
import { getInitials } from "@/lib/stringUtils";

interface Contact {
  id: string;
  name: string;
  email: string;
  roleName: string;
}

interface NewConversationProps {
  onCreated: (conversation: ConversationSummary) => void;
}

/** "New" button + contact picker so students can actually start a conversation. */
export default function NewConversation({ onCreated }: NewConversationProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setContacts(await searchContacts(search || undefined));
      } catch {
        setContacts([]);
        toast.error("Failed to load contacts.");
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, search]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handlePick = async (contact: Contact) => {
    if (creating) return;
    setCreating(contact.id);
    try {
      const conversation = await createConversation(contact.id);
      setOpen(false);
      setSearch("");
      onCreated(conversation);
    } catch {
      toast.error("Could not start a conversation with this contact.");
    } finally {
      setCreating(null);
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="New conversation"
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--admin-border-light)", background: "#102B47", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
      >
        <Plus style={{ width: 13, height: 13 }} />
        New
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 280, zIndex: 50, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--admin-border-light)" }}>
              <Search style={{ width: 13, height: 13, color: "var(--admin-font-light)", flexShrink: 0 }} />
              <input
                autoFocus
                placeholder="Search staff..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }}
              />
              {loading && <Loader2 style={{ width: 13, height: 13, color: "var(--admin-font-light)" }} className="animate-spin" />}
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {!loading && contacts.length === 0 ? (
                <p style={{ padding: "12px", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                  No staff found to message.
                </p>
              ) : (
                contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handlePick(c)}
                    disabled={creating !== null}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", opacity: creating && creating !== c.id ? 0.5 : 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>
                      {creating === c.id ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : getInitials(c.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                      <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.email}{c.roleName ? ` · ${c.roleName.replace("_", " ")}` : ""}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
