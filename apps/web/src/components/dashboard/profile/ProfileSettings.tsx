"use client";

import { motion } from "motion/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { FiLink, FiSettings, FiUsers, FiArrowRight } from "react-icons/fi";
import { StudentInviteParentPanel } from "./StudentInviteParentPanel";
import { CalendarIntegrationPanel } from "@/components/shared/CalendarIntegrationPanel";

export function ProfileSettings() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <Card className="border-none shadow-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#2E9098]/10 rounded-lg text-[#2E9098] dark:bg-[#2E9098]/20">
              <FiLink size={20} />
            </div>
            <div>
              <CardTitle>Calendar Integration</CardTitle>
              <CardDescription>Connect your calendar to sync sessions and bookings.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="glass-card">
          <CalendarIntegrationPanel />
        </CardContent>
      </Card>

      <Card className="border-none shadow-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 dark:bg-indigo-900/30">
              <FiUsers size={20} />
            </div>
            <div>
              <CardTitle>Family Access</CardTitle>
              <CardDescription>Invite a parent or guardian to follow your progress.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="glass-card">
          <StudentInviteParentPanel />
        </CardContent>
      </Card>

      <Card className="border-none shadow-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg text-gray-600 dark:bg-gray-700/50">
              <FiSettings size={20} />
            </div>
            <div>
              <CardTitle>Notifications &amp; Privacy</CardTitle>
              <CardDescription>
                Email notifications, weekly digest, profile visibility, and more live in Settings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="glass-card">
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#2E9098] hover:text-[#2E9098]/80 dark:text-[#2E9098]"
          >
            Open Settings
            <FiArrowRight size={16} />
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}
