"use client";

import { useState, useEffect } from "react";
import { unwrapList } from "@/lib/unwrapList";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { Coach, CoachesResponse } from "@/types/coach";
import { useTranslation } from "react-i18next";
import { CoachCardSkeleton } from "@/components/skeletons/CoachCardSkeleton";
import { motion } from "motion/react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 18 } },
};

const PAGE_SIZE = 12;

export default function BookCoachPage() {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // audit 2026-10-09 C15: search + specialty filter are sent to the API (which now honours both)
  // and results page with "Load more" instead of silently stopping at the first 10.
  const [specialty, setSpecialty] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchCoaches = async () => {
      try {
        setFetchError(null);
        const { getCoaches } = await import("@/services/coachService");
        const response: CoachesResponse = await getCoaches({
          search: search.trim() || undefined,
          specialization: specialty || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        const list: Coach[] = unwrapList(response, "coaches");
        const meta = (response as unknown as { data?: { totalPages?: number } })?.data;
        setTotalPages(Math.max(1, Number(meta?.totalPages) || 1));
        setCoaches((prev) => (page === 1 ? list : [...prev, ...list]));
        // Filter options = specialties seen in unfiltered results (no separate taxonomy endpoint).
        if (!specialty) {
          setSpecialties((prev) => {
            const next = new Set(prev);
            list.forEach((c) => { if (c.specialization) next.add(c.specialization); });
            return next.size === prev.length ? prev : Array.from(next).sort((a, b) => a.localeCompare(b));
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch coaches:", error);
        setFetchError(t("coaching.find.fetchError", "Failed to load coaches. Please try again."));
      } finally {
        if (!cancelled) { setIsLoading(false); setLoadingMore(false); }
      }
    };

    // Debounce typing; "Load more" fetches immediately.
    const timeoutId = setTimeout(fetchCoaches, page === 1 ? 500 : 0);

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [search, specialty, page, retryCount, t]);

  const resetTo = (apply: () => void) => { apply(); setPage(1); setIsLoading(true); };

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {t("coaching.find.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("coaching.find.subtitle")}
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("coaching.find.searchPlaceholder")}
                className="pl-9 rounded-xl border-border bg-card"
                value={search}
                onChange={(e) => { const v = e.target.value; resetTo(() => setSearch(v)); }}
              />
            </div>
            <select
              aria-label={t("coaching.find.specialtyFilter")}
              className="rounded-xl border border-border bg-card px-3 text-sm text-foreground"
              value={specialty}
              onChange={(e) => { const v = e.target.value; resetTo(() => setSpecialty(v)); }}
            >
              <option value="">{t("coaching.find.allSpecialties")}</option>
              {specialties.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Coach Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CoachCardSkeleton key={i} />
            ))}
          </div>
        ) : fetchError ? (
          <div className="dash-card p-5 text-center py-12 border-dashed border-destructive/30">
            <h3 className="text-lg font-medium text-destructive">
              {fetchError}
            </h3>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => { setFetchError(null); setIsLoading(true); setRetryCount(c => c + 1); }}
            >
              {t("coaching.find.retry", "Retry")}
            </Button>
          </div>
        ) : coaches.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {coaches.map((coach) => (
              <motion.div key={coach.id} variants={itemVariants}>
                <div className="dash-card p-0 overflow-hidden flex flex-col">
                  {/* Colored strip for avatar area */}
                  <div className="h-3 bg-secondary" />
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="h-14 w-14 border-2 border-border">
                        <AvatarImage src={coach.image} />
                        <AvatarFallback className="bg-secondary text-foreground font-bold">
                          {coach.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-foreground truncate">
                              {coach.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">{coach.title}</p>
                          </div>
                          <div className="flex items-center gap-1 text-xs font-medium text-amber-600">
                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                            {coach.rating || t("coaching.find.new")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mr-2 shrink-0" />
                        {coach.location || t("coaching.find.remote")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {coach.specialization && (
                          <Badge variant="secondary" className="text-xs">
                            {coach.specialization}
                          </Badge>
                        )}
                        {coach.tags?.slice(0, 2).map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs border-border">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-border">
                      <Button
                        className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-xl"
                        asChild
                      >
                        <Link href={`/dashboard/book-coach/${coach.id}`}>
                          {t("coaching.find.viewProfileBook")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {page < totalPages && (
              <div className="col-span-full flex justify-center">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={loadingMore}
                  onClick={() => { setLoadingMore(true); setPage((p) => p + 1); }}
                >
                  {t("coaching.find.loadMore")}
                </Button>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="dash-card p-5 text-center py-12 border-dashed">
            <h3 className="text-lg font-medium text-foreground">
              {t("coaching.find.noCoachesFound")}
            </h3>
            <p className="text-muted-foreground mt-1">{t("coaching.find.tryAdjusting")}</p>
          </div>
        )}
    </div>
  );
}
