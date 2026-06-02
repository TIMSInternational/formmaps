"use client";

import { motion } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mail, Phone, ChevronDown } from "lucide-react";

interface InvitationActionsProps {
  totalEvaluators: number;
  allGroupsComplete: boolean;
  onSendAllEmails: () => void;
  onSendSpecificEmails: () => void;
  onSendAllSMS: () => void;
  onSendSpecificSMS: () => void;
  groupCount: number;
}

export function InvitationActions({
  totalEvaluators,
  allGroupsComplete,
  onSendAllEmails,
  onSendSpecificEmails,
  onSendAllSMS,
  onSendSpecificSMS,
  groupCount,
}: InvitationActionsProps) {
  const isDisabled = totalEvaluators === 0 || !allGroupsComplete;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="dash-card p-4"
    >
      <div className="flex items-center flex-col sm:flex-row gap-3 justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {totalEvaluators} evaluators across {groupCount} groups
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={isDisabled}
                className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Mail className="w-4 h-4" />
                <span>Send Email Invitations</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onSendAllEmails}>
                Send to All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSendSpecificEmails}>
                Send to Specific
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={isDisabled}
                className="border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Phone className="w-4 h-4" />
                <span>Send SMS Invitations</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onSendAllSMS}>
                Send to All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSendSpecificSMS}>
                Send to Specific
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
