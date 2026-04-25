"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FiLock, FiBell, FiMoon, FiGlobe } from "react-icons/fi";
import { useState } from "react";
import { toast } from "sonner"; // Assuming sonner
import { StudentInviteParentPanel } from "./StudentInviteParentPanel";
import { CalendarIntegrationPanel } from "@/components/shared/CalendarIntegrationPanel";

export function ProfileSettings() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [publicProfile, setPublicProfile] = useState(true);

  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

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
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600 dark:bg-blue-900/30">
              <FiBell size={20} />
            </div>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Manage how you receive notifications.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 glass-card">
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="space-y-1">
              <Label className="text-base cursor-pointer" htmlFor="email-notifs">Email Notifications</Label>
              <p className="text-sm text-gray-500">Receive emails about your account activity.</p>
            </div>
            <Switch id="email-notifs" checked={emailNotifs} onCheckedChange={setEmailNotifs} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="space-y-1">
              <Label className="text-base cursor-pointer" htmlFor="marketing">Marketing Emails</Label>
              <p className="text-sm text-gray-500">Receive emails about new features and offers.</p>
            </div>
            <Switch id="marketing" checked={marketingEmails} onCheckedChange={setMarketingEmails} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 dark:bg-indigo-900/30">
              <FiLock size={20} />
            </div>
            <div>
              <CardTitle>Privacy</CardTitle>
              <CardDescription>Manage who can see your profile.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 glass-card">
          <div className="border-b border-gray-100 dark:border-gray-700/50 pb-6 mb-6">
            <CalendarIntegrationPanel />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="space-y-1">
              <Label className="text-base cursor-pointer" htmlFor="public-profile">Public Profile</Label>
              <p className="text-sm text-gray-500">Allow others to find and view your profile.</p>
            </div>
            <Switch id="public-profile" checked={publicProfile} onCheckedChange={setPublicProfile} />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700/50 my-2 pt-6 pb-2">
            <StudentInviteParentPanel />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
          Save Preference
        </Button>
      </div>
    </motion.div>
  );
}
