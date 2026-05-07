"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  GraduationCap,
  ChevronRight,
  Users,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useParentProfile } from "@/hooks/useParentPortalQueries";
import type { ParentChildLink } from "@/types/parentPortal";
import { cn } from "@/lib/utils";

const RELATIONSHIP_COLORS: Record<string, string> = {
  mother: "bg-pink-100 text-pink-700",
  father: "bg-blue-100 text-blue-700",
  sibling: "bg-purple-100 text-purple-700",
  guardian: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

export default function ParentChildrenPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: profile, isLoading } = useParentProfile();
  const children: ParentChildLink[] = profile?.children || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {t("parent.children.title", "My Children")}
        </h1>
        <p className="text-gray-500 mt-1">
          {t(
            "parent.children.subtitle",
            "View progress and academic details for each of your linked children."
          )}
        </p>
      </motion.div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Children",
            value: isLoading ? "…" : children.length,
            icon: Users,
            color: "bg-indigo-50 text-indigo-600",
          },
          {
            label: "Enrolled",
            value: isLoading ? "…" : children.length,
            icon: TrendingUp,
            color: "bg-emerald-50 text-emerald-600",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", stat.color.split(" ")[0])}>
                  <stat.icon className={cn("h-5 w-5", stat.color.split(" ")[1])} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Children Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <Users className="h-14 w-14 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">
            {t("parent.children.none", "No children linked yet")}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {t(
              "parent.children.noneDesc",
              "Your school counselor or admin will send you a portal invite."
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map((child, idx) => {
            const initials = child.studentName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <motion.div
                key={child.studentId}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
              >
                <Card className="hover:shadow-lg transition-all duration-200 group cursor-pointer border border-gray-100">
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 border-2 border-white shadow">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{child.studentName}</CardTitle>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "capitalize text-xs",
                              RELATIONSHIP_COLORS[child.relationship] || "bg-gray-100 text-gray-700"
                            )}
                          >
                            {child.relationship}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                          <GraduationCap className="h-3.5 w-3.5" />
                          <span>Grade {child.gradeLevel}</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Placeholder progress until real data loads */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Graduation Progress</span>
                        <span>—</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>

                    <Button
                      className="w-full gap-2 group-hover:bg-indigo-600 group-hover:text-white transition-colors"
                      variant="outline"
                      onClick={() =>
                        router.push(`/parent/children/${child.studentId}`)
                      }
                    >
                      View Academic Progress
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
