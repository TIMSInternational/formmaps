"use client";

import { useState, useEffect } from "react";
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
import { Search, MapPin, Star, Filter } from "lucide-react";
import Link from "next/link";
import { CoachesResponse } from "@/types/coach";
import { useTranslation } from "react-i18next";
import { CoachCardSkeleton } from "@/components/skeletons/CoachCardSkeleton";

export default function BookCoachPage() {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const { getCoaches } = await import("@/services/coachService");
        const response: any = await getCoaches({ search });
        console.log("API Response:", response);

        // Handle different response structures
        // API might return { data: Coach[] } or { data: { data: Coach[] } }
        let coachesData: any[] = [];
        if (Array.isArray(response)) {
          coachesData = response;
        } else if (response?.data) {
          if (Array.isArray(response.data)) {
            coachesData = response.data;
          } else if (response.data?.data && Array.isArray(response.data.data)) {
            coachesData = response.data.data;
          }
        }

        console.log("Parsed coaches:", coachesData);
        setCoaches(coachesData);
      } catch (error) {
        console.error("Failed to fetch coaches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(() => {
      fetchCoaches();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [search]);

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t("coaching.find.title")}
          </h1>
          <p className="text-gray-500 mt-1">{t("coaching.find.subtitle")}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t("coaching.find.searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CoachCardSkeleton key={i} />
          ))}
        </div>
      ) : coaches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coaches.map((coach) => (
            <Card
              key={coach.id}
              className="overflow-hidden hover:shadow-lg transition-shadow flex py-0 flex-col"
            >
              <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600 relative">
                <Avatar className="absolute -bottom-10 left-6 h-20 w-20 border-4 border-white shadow-md">
                  <AvatarImage src={coach.image} />
                  <AvatarFallback>{coach.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
              <CardContent className="pt-12 pb-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      {coach.name}
                    </h3>
                    <p className="text-sm text-gray-600">{coach.title}</p>
                  </div>
                  <div className="flex items-center bg-yellow-50 px-2 py-1 rounded text-xs font-medium text-yellow-700">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 mr-1" />
                    {coach.rating || t("coaching.find.new")}
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPin className="h-4 w-4 mr-2" />
                    {coach.location || t("coaching.find.remote")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {coach.specialization && (
                      <Badge
                        variant="secondary"
                        className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        {coach.specialization}
                      </Badge>
                    )}
                    {coach.tags?.slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-gray-50/50 p-4">
                <Button className="w-full" asChild>
                  <Link href={`/dashboard/book-coach/${coach.id}`}>
                    {t("coaching.find.viewProfileBook")}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed">
          <h3 className="text-lg font-medium text-gray-900">
            {t("coaching.find.noCoachesFound")}
          </h3>
          <p className="text-gray-500">{t("coaching.find.tryAdjusting")}</p>
        </div>
      )}
    </div>
  );
}
