"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PathwayEditor } from "./PathwayEditor";

interface PathwayEditorDialogProps {
  open: boolean;
  onClose: () => void;
}

/** All-pathways visual editor, shown as a full-screen modal. The editor body and
 *  logic live in PathwayEditor (also used by the per-pathway editor route). */
export function PathwayEditorDialog({ open, onClose }: PathwayEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 flex flex-col"
        style={{ width: "95vw", maxWidth: "95vw", height: "92vh", background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
      >
        <DialogTitle className="sr-only">Pathway editor</DialogTitle>
        <PathwayEditor variant="dialog" onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
