"use client";

import { useState, useEffect } from "react";
import { SingleInviteForm } from "@/components/admin/SingleInviteForm";
import { BulkInviteForm } from "@/components/admin/BulkInviteForm";
import { CoachesTable } from "@/components/admin/CoachesTable";
import { Button } from "@/components/ui/button";
import { Plus, Users, UserCheck, UserPlus, Clock, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coach } from "@/types/coach";

interface CoachStats {
  totalCoaches: number;
  activeNow: number;
  pendingInvites: number;
  expiringContracts: number;
}

export default function CoachesPage() {
  const { t } = useTranslation();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [stats, setStats] = useState<CoachStats>({
    totalCoaches: 0,
    activeNow: 0,
    pendingInvites: 0,
    expiringContracts: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | undefined>(
    undefined,
  );

  const handleEdit = (coach: Coach) => {
    setEditingCoach(coach);
    setIsEditOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditOpen(false);
    setEditingCoach(undefined);
    window.location.reload();
  };

  // Fetch coach stats from API
  useEffect(() => {
    const fetchCoachStats = async () => {
      setIsLoadingStats(true);
      try {
        const { getCoachStats } = await import("@/services/coachService");
        const data = await getCoachStats();
        setStats(data);
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoadingStats(false);
      }
    };

    fetchCoachStats();
  }, []);

  const statsData = [
    {
      labelKey: "admin.coaches.totalCoaches",
      label: "Total Coaches",
      value: isLoadingStats ? "..." : stats.totalCoaches.toString(),
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50/50",
      border: "border-blue-100",
    },
    {
      labelKey: "admin.coaches.activeNow",
      label: "Active Now",
      value: isLoadingStats ? "..." : stats.activeNow.toString(),
      icon: UserCheck,
      color: "text-green-600",
      bg: "bg-green-50/50",
      border: "border-green-100",
    },
    {
      labelKey: "admin.coaches.pendingInvites",
      label: "Pending Invites",
      value: isLoadingStats ? "..." : stats.pendingInvites.toString(),
      icon: UserPlus,
      color: "text-orange-600",
      bg: "bg-orange-50/50",
      border: "border-orange-100",
    },
    {
      labelKey: "admin.coaches.expiringContracts",
      label: "Expiring Contracts",
      value: isLoadingStats ? "..." : stats.expiringContracts.toString(),
      icon: Clock,
      color: "text-red-600",
      bg: "bg-red-50/50",
      border: "border-red-100",
    },
  ];

  return (
    <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.coaches.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("admin.coaches.subtitle")}
            </p>
          </div>

          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gray-900 text-white hover:bg-black shadow-xl hover:shadow-2xl transition-all duration-300 rounded-full px-6 h-12 text-sm font-semibold tracking-wide">
                <Plus className="mr-2 h-4 w-4" />
                {t("admin.coaches.inviteButton")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl rounded-2xl p-0 overflow-hidden gap-0">
              <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
                <DialogTitle className="text-xl">
                  {t("admin.coaches.inviteTitle")}
                </DialogTitle>
                <DialogDescription className="text-base pt-1">
                  {t("admin.coaches.inviteDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="p-6">
                <Tabs defaultValue="single" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100/50 p-1 rounded-xl">
                    <TabsTrigger
                      value="single"
                      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      {t("admin.coaches.singleInvite")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="bulk"
                      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      {t("admin.coaches.bulkUpload")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="single" className="mt-0">
                    <SingleInviteForm
                      onSuccess={() => setIsInviteOpen(false)}
                    />
                  </TabsContent>
                  <TabsContent value="bulk" className="mt-0">
                    <BulkInviteForm />
                  </TabsContent>
                </Tabs>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="sm:max-w-xl rounded-2xl p-0 overflow-hidden gap-0">
              <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
                <DialogTitle className="text-xl">
                  {t("admin.coaches.editTitle", "Edit Coach")}
                </DialogTitle>
                <DialogDescription className="text-base pt-1">
                  {t("admin.coaches.editDescription", "Update coach details.")}
                </DialogDescription>
              </DialogHeader>
              <div className="p-6">
                <SingleInviteForm
                  initialData={editingCoach}
                  onSuccess={handleEditSuccess}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid — dashboard card style */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsData.map((stat, index) => (
            <div key={index} style={{ borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #2a2a2a)", background: "var(--admin-bg-card, #1e1e1e)", padding: 16, transition: "border-color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #333)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--admin-bg-icon-box, #2a2a2a)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>{t(stat.labelKey)}</div>
            </div>
          ))}
        </div>
      {/* Main Content Area */}
      <CoachesTable onEdit={handleEdit} />
    </div>
  );
}
