"use client";

import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileOverview } from "./ProfileOverview";
import { ProfileForm } from "./ProfileForm";
import { ProfileSettings } from "./ProfileSettings";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProfileView() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-gray-50/30 dark:bg-gray-900/10 pb-24">
      
      <ProfileHeader />

      <main className="container mx-auto px-4 md:px-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="overview" className="space-y-8" onValueChange={setActiveTab}>
            {/* Elegant Floating Tabs */}
            <div className="flex justify-center md:justify-start">
                <TabsList className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 p-1.5 rounded-2xl shadow-sm h-auto inline-flex gap-1">
                    {["overview", "edit", "settings"].map((tab) => (
                        <TabsTrigger
                            key={tab}
                            value={tab}
                            className={cn(
                                "rounded-xl px-6 py-2.5 text-sm font-medium transition-all duration-300",
                                // Token base color — NOT text-gray-500: the admin-theme legacy remap
                                // is !important and beats the active-state variant, which left dark
                                // text on the dark active pill.
                                "text-[color:var(--admin-font-secondary)] capitalize",
                                "data-[state=active]:bg-[#102B47] data-[state=active]:text-white data-[state=active]:shadow-md",
                                "hover:bg-[var(--admin-bg-hover)]"
                            )}
                        >
                            {tab}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>

            <TabsContent value="overview" className="focus:outline-none min-h-[500px] mt-0">
              <ProfileOverview />
            </TabsContent>

            <TabsContent value="edit" className="focus:outline-none mt-0">
              <ProfileForm />
            </TabsContent>

            <TabsContent value="settings" className="focus:outline-none mt-0">
              <ProfileSettings />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
