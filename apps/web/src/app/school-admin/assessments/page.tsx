"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings2, Loader2, ClipboardCheck, RotateCcw, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  useAssessmentConfig,
  useUpdateAssessmentConfig,
  useAssessmentStatus,
} from "@/hooks/useAssessmentConfigQueries";
import type { AssessmentConfigItem } from "@/types/assessmentConfig";
import { useState, useEffect } from "react";

const assessmentIcons: Record<string, React.ReactNode> = {
  MIL: <ClipboardCheck className="h-5 w-5" />,
  PCA: <ClipboardCheck className="h-5 w-5" />,
  "360": <RotateCcw className="h-5 w-5" />,
};

export default function AssessmentConfigPage() {
  const { t } = useTranslation();
  const { data: config, isLoading: configLoading } = useAssessmentConfig();
  const { data: status, isLoading: statusLoading } = useAssessmentStatus();
  const update = useUpdateAssessmentConfig();

  const [items, setItems] = useState<AssessmentConfigItem[]>([]);

  useEffect(() => {
    if (config?.configs && config.configs.length > 0) {
      setItems(config.configs);
    } else if (config) {
      // Fallback defaults if the API returns an empty array or undefined configs
      setItems([
        { assessmentType: "MIL", isEnabled: false, description: "" },
        { assessmentType: "PCA", isEnabled: false, description: "" },
        { assessmentType: "360", isEnabled: false, description: "" },
      ]);
    }
  }, [config]);

  const toggleAssessment = (type: string) => {
    setItems((prev) =>
      prev.map((a) => (a.assessmentType === type ? { ...a, isEnabled: !a.isEnabled } : a))
    );
  };

  const updateDescription = (type: string, description: string) => {
    setItems((prev) =>
      prev.map((a) => (a.assessmentType === type ? { ...a, description } : a))
    );
  };

  const handleSave = () => {
    update.mutate(
      { configs: items },
      {
        onSuccess: () => toast.success(t("schoolAdmin.assessments.saved", "Assessment configuration saved")),
        onError: () => toast.error(t("schoolAdmin.assessments.error", "Failed to save")),
      }
    );
  };

  if (configLoading || statusLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.assessments.title", "Assessment Configuration")}
        </h1>
        <p className="text-lg text-gray-500 font-medium">
          {t("schoolAdmin.assessments.subtitle", "Enable or disable each assessment type and add an optional description.")}
        </p>
      </motion.div>

      {/* Status Overview — renders only once backend implements /assessments/status */}
      {status?.summary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(status.summary).map(([type, s]) => (
              <Card key={type} className="border-0 shadow-md">
                <CardContent className="pt-6 text-center">
                  <div className="text-teal-600 mb-2 flex justify-center">{assessmentIcons[type]}</div>
                  <p className="font-bold text-lg">{type}</p>
                  <div className="flex justify-center gap-3 mt-2 text-xs">
                    <span className="text-green-600">{s.completed} done</span>
                    <span className="text-yellow-600">{s.inProgress} active</span>
                    <span className="text-gray-400">{s.notStarted} pending</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Assessment Cards */}
      <div className="space-y-4">
        {items?.map((assessment, idx) => (
          <motion.div key={assessment.assessmentType} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + idx * 0.05 }}>
            <Card className={`border-0 shadow-lg ${assessment.isEnabled ? "" : "opacity-60"}`}>
              <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-teal-600">{assessmentIcons[assessment.assessmentType] ?? <Settings2 className="h-5 w-5" />}</div>
                    <div>
                      <CardTitle>{assessment.assessmentType}</CardTitle>
                      <CardDescription>
                        {assessment.isEnabled ? (
                          <Badge className="bg-green-100 text-green-700 border-0 text-xs">Enabled</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Disabled</Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={assessment.isEnabled}
                    onCheckedChange={() => toggleAssessment(assessment.assessmentType)}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600">Description</Label>
                  <Textarea
                    value={assessment.description}
                    onChange={(e) => updateDescription(assessment.assessmentType, e.target.value)}
                    placeholder="Brief description shown to students and staff..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Save */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white px-8"
        >
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("schoolAdmin.assessments.save", "Save Configuration")}
        </Button>
      </motion.div>
    </div>
  );
}
