import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Clock } from "lucide-react";

import { Coach } from "@/types/coach";

// Local interface removed in favor of shared type

import { useTranslation } from "react-i18next";
import { telemetry } from "@/services/telemetryService";

interface CoachCardProps {
  coach: Coach;
  onBook: (coach: Coach) => void;
}

export function CoachCard({ coach, onBook }: CoachCardProps) {
  const { t } = useTranslation();

  return (
    <article aria-labelledby={`coach-${coach.id}-name`}>
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 p-0 shadow-none">
      <CardHeader className="!p-0 ">
        <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative">
          <div className="absolute -bottom-12 left-6">
            <Avatar className="h-24 w-24 border-4 border-white shadow-sm">
              <AvatarImage src={coach.image} alt={coach.name} />
              <AvatarFallback>{coach.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-14 px-6 pb-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 id={`coach-${coach.id}-name`} className="text-xl font-bold text-gray-900">{coach.name}</h3>
            <p className="text-sm text-gray-500 font-medium">{coach.title}</p>
          </div>
          <div 
            className="flex items-center bg-yellow-50 px-2 py-1 rounded text-yellow-700 text-xs font-bold"
            role="img"
            aria-label={`Rating: ${coach.rating} out of 5, ${Array.isArray(coach.reviews) ? coach.reviews.length : coach.reviews} reviews`}
          >
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 mr-1" aria-hidden="true" />
            <span aria-hidden="true">{coach.rating} ({Array.isArray(coach.reviews) ? coach.reviews.length : coach.reviews})</span>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="h-4 w-4 mr-2 text-gray-400" aria-hidden="true" />
            {coach.location}
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-2 text-gray-400" aria-hidden="true" />
            {/* Simple availability display for now */}
            {coach.availability ? t("coaching.viewSchedule") : t("coaching.contactForAvailability")}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {coach.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
        <div>
          {/* Price removed */}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => telemetry.trackCoachView(coach.id, coach.name, "view_details")}
            asChild
          >
            <Link href={`/dashboard/coaching/schedule/${coach.id}`}>
              {t("coaching.viewDetails")}
            </Link>
          </Button>
          <Button size="sm" onClick={() => {
            telemetry.trackCoachView(coach.id, coach.name, "book_now");
            onBook(coach);
          }}>
            {t("coaching.bookNow")}
          </Button>
        </div>
      </CardFooter>
    </Card>
    </article>
  );
}
