"use client";

import React from "react";
import { CertData } from "@/services/benchmarkService";
import { BadgeCheck, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface CertificationsListProps {
  data?: CertData[];
  isLoading: boolean;
}

export default function CertificationsList({ data, isLoading }: CertificationsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data?.map((cert, index) => (
        <div key={index} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors rounded-xl border border-slate-100">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-blue-500" />
              <span className="font-semibold text-slate-900">{cert.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 pl-6">
              <span>{cert.provider}</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {cert.duration}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-500">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
