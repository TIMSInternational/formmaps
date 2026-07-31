"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  MapPin,
  Calendar,
  Globe,
  Shield,
  Award,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { DynamicBookingModal } from "@/lib/dynamic-imports";
import { useParams, useRouter } from "next/navigation";
import { Coach } from "@/types/coach";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailabilityStatus } from "./_components/AvailabilityStatus";

export default function CoachProfilePage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const coachId = params.coachId as string;

  const [coach, setCoach] = useState<Coach | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    const fetchCoachDetails = async () => {
      if (!coachId) return;
      try {
        const { getCoachDetails } = await import("@/services/coachService");
        const data = await getCoachDetails(coachId);
        setCoach(data);
      } catch {
        // error handled silently
      } finally {
        setIsLoading(false);
      }
    };
    fetchCoachDetails();
  }, [coachId]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <Link
          href="/dashboard/book-coach"
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("coaching.profile.backToCoaches")}
        </Link>
        <div className="dash-card p-8 text-center">
          <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-foreground mb-1">{t("coaching.profile.notFoundTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("coaching.profile.notFoundText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Back link */}
      <Link
        href="/dashboard/book-coach"
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("coaching.profile.backToCoaches")}
      </Link>

      {/* Coach header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="dash-card p-5 mb-4"
      >
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 rounded-xl border-2 border-border shrink-0">
            <AvatarImage src={coach.image || ""} alt={coach.name} className="object-cover" />
            <AvatarFallback className="text-xl bg-secondary text-foreground rounded-xl font-bold">
              {coach.name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-foreground">{coach.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{coach.title}</p>
              </div>
              <button
                onClick={() => setIsBookingModalOpen(true)}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
              >
                {t("coaching.profile.bookSession")}
              </button>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border">
              {coach.rating && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="font-semibold text-foreground">{coach.rating}</span>
                  <span className="text-muted-foreground">({typeof coach.reviews === "number" ? coach.reviews : Array.isArray(coach.reviews) ? coach.reviews.length : 0} reviews)</span>
                </div>
              )}
              {coach.location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  {coach.location}
                </div>
              )}
              {(coach.languages?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="w-3.5 h-3.5" />
                  {coach.languages?.join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* About */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="dash-card p-5"
          >
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              {t("coaching.profile.about")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {coach.bio || "No bio available."}
            </p>
          </motion.div>

          {/* Expertise */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="dash-card p-5"
          >
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-muted-foreground" />
              {t("coaching.profile.expertise")}
            </h2>

            <div className="space-y-4">
              {coach.specialization && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                    {t("coaching.profile.coreSpecialization")}
                  </p>
                  <Badge className="bg-primary/10 text-primary border-primary/20 rounded-lg px-3 py-1">
                    {coach.specialization}
                  </Badge>
                </div>
              )}

              {(coach.tags?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                    Topics & Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {coach.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-lg bg-secondary text-xs font-medium text-muted-foreground border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Sidebar — Availability */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="dash-card p-5 lg:sticky lg:top-6 self-start"
        >
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {t("coaching.profile.availability")}
          </h3>

          <AvailabilityStatus coachId={coach.id} />

          <button
            className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
            onClick={() => setIsBookingModalOpen(true)}
          >
            {t("coaching.profile.checkCalendar")}
            <ChevronRight className="w-4 h-4" />
          </button>

          <p className="text-[10px] text-center text-muted-foreground mt-3">
            {t("coaching.profile.freeCancellation")}
          </p>
        </motion.div>
      </div>

      <DynamicBookingModal
        coach={coach}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
      />
    </div>
  );
}
