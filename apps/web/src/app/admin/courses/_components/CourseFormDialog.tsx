"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Course } from "@/types/course";
import { useTranslation } from "react-i18next";

interface CourseFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (course: Course) => void;
  course: Course | null;
  isCreating: boolean;
}

export function CourseFormDialog({
  isOpen,
  onClose,
  onSave,
  course,
  isCreating,
}: CourseFormDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Course>>({
    title: "",
    shortDescription: "",
    fullDescription: "",
    provider: "",
    instructor: "",
    category: "",
    difficulty: "Beginner",
    duration: 4,
    estimatedHours: 5,
    thumbnailUrl: "",
    videoUrl: "",
    rating: 4.5,
    reviewCount: 0,
    enrollmentCount: 0,
    isActive: true,
    certificate: true,
    language: "English",
    country: "United States",
    region: "North America",
  });

  useEffect(() => {
    if (course) {
      setFormData(course);
    } else {
      setFormData({
        title: "",
        shortDescription: "",
        fullDescription: "",
        provider: "",
        instructor: "",
        category: "",
        difficulty: "Beginner",
        duration: 4,
        estimatedHours: 5,
        thumbnailUrl: "",
        videoUrl: "",
        rating: 4.5,
        reviewCount: 0,
        enrollmentCount: 0,
        isActive: true,
        certificate: true,
        language: "English",
        country: "United States",
        region: "North America",
      });
    }
  }, [course]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as Course);
  };

  const handleChange = (
    field: keyof Course,
    value: string | number | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full min-w-5xl max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {isCreating
              ? t("admin.courses.form.titleCreate")
              : t("admin.courses.form.titleEdit")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <form id="course-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.courses.form.labels.basicInformation")}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="title">
                    {t("admin.courses.form.labels.title")} *
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    required
                    placeholder="e.g., Python for Data Science"
                  />
                </div>

                <div>
                  <Label htmlFor="provider">
                    {t("admin.courses.form.labels.provider")} *
                  </Label>
                  <Input
                    id="provider"
                    value={formData.provider}
                    onChange={(e) => handleChange("provider", e.target.value)}
                    required
                    placeholder="e.g., Coursera"
                  />
                </div>

                <div>
                  <Label htmlFor="instructor">
                    {t("admin.courses.form.labels.instructor")} *
                  </Label>
                  <Input
                    id="instructor"
                    value={formData.instructor}
                    onChange={(e) => handleChange("instructor", e.target.value)}
                    required
                    placeholder="e.g., Dr. John Smith"
                  />
                </div>

                <div>
                  <Label htmlFor="category">
                    {t("admin.courses.form.labels.category")} *
                  </Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => handleChange("category", e.target.value)}
                    required
                    placeholder="e.g., Technology"
                  />
                </div>

                <div>
                  <Label htmlFor="difficulty">
                    {t("admin.courses.form.labels.difficulty")}
                  </Label>
                  <Select
                    value={formData.difficulty}
                    onValueChange={(value) => handleChange("difficulty", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginner">
                        {t("courses.difficulty.beginner")}
                      </SelectItem>
                      <SelectItem value="Intermediate">
                        {t("courses.difficulty.intermediate")}
                      </SelectItem>
                      <SelectItem value="Advanced">
                        {t("courses.difficulty.advanced")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="duration">
                    {t("admin.courses.form.labels.duration")}
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration}
                    onChange={(e) =>
                      handleChange("duration", parseInt(e.target.value))
                    }
                    required
                    min="1"
                  />
                </div>

                <div>
                  <Label htmlFor="estimatedHours">
                    {t("admin.courses.form.labels.hoursPerWeek")}
                  </Label>
                  <Input
                    id="estimatedHours"
                    type="number"
                    value={formData.estimatedHours}
                    onChange={(e) =>
                      handleChange("estimatedHours", parseInt(e.target.value))
                    }
                    required
                    min="1"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="shortDescription">
                    {t("admin.courses.form.labels.shortDescription")} *
                  </Label>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) =>
                      handleChange("shortDescription", e.target.value)
                    }
                    required
                    rows={2}
                    placeholder="Brief description for course cards"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="fullDescription">
                    {t("admin.courses.form.labels.fullDescription")} *
                  </Label>
                  <Textarea
                    id="fullDescription"
                    value={formData.fullDescription}
                    onChange={(e) =>
                      handleChange("fullDescription", e.target.value)
                    }
                    required
                    rows={4}
                    placeholder="Detailed course description"
                  />
                </div>
              </div>
            </div>

            {/* Media */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.courses.form.labels.media")}
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="thumbnailUrl">
                    {t("admin.courses.form.labels.thumbnailUrl")} *
                  </Label>
                  <Input
                    id="thumbnailUrl"
                    value={formData.thumbnailUrl}
                    onChange={(e) =>
                      handleChange("thumbnailUrl", e.target.value)
                    }
                    required
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>

                <div>
                  <Label htmlFor="videoUrl">
                    {t("admin.courses.form.labels.videoUrl")}
                  </Label>
                  <Input
                    id="videoUrl"
                    value={formData.videoUrl}
                    onChange={(e) => handleChange("videoUrl", e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>
            </div>

            {/* Location & Language */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.courses.form.labels.locationLanguage")}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="language">
                    {t("admin.courses.form.labels.language")} *
                  </Label>
                  <Input
                    id="language"
                    value={formData.language}
                    onChange={(e) => handleChange("language", e.target.value)}
                    required
                    placeholder="e.g., English"
                  />
                </div>

                <div>
                  <Label htmlFor="country">
                    {t("admin.courses.form.labels.country")} *
                  </Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => handleChange("country", e.target.value)}
                    required
                    placeholder="e.g., United States"
                  />
                </div>

                <div>
                  <Label htmlFor="region">
                    {t("admin.courses.form.labels.region")} *
                  </Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => handleChange("region", e.target.value)}
                    required
                    placeholder="e.g., North America"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Form Actions - fixed at bottom of dialog */}
        <div className="flex justify-end gap-3 p-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("admin.courses.form.cancel")}
          </Button>
          {/* The button lives outside the <form> (fixed footer), so it must
              target it by id — without this, submit never fires and Save
              silently does nothing. */}
          <Button type="submit" form="course-form">
            {isCreating
              ? t("admin.courses.form.titleCreate")
              : t("admin.courses.form.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
