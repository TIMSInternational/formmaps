"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface CourseImportDialogProps {
  onImport: (url: string) => Promise<void>;
}
export function CourseImportDialog({ onImport }: CourseImportDialogProps) {
  const [url, setUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { t } = useTranslation();
  const handleImport = async () => {
    if (!url.trim()) {
      toast.error(t("courses_import.invalidUrl"));
      return;
    }

    setIsImporting(true);
    try {
      await onImport(url.trim());
      setUrl("");
      setIsOpen(false);
      toast.success(t("courses_import.success"));
    } catch (error) {
      toast.error(t("courses_import.failure"));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          {t("courses_import.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("courses_import.title")}</DialogTitle>
          <DialogDescription>
            {t("courses_import.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="url">{t("courses_import.labelUrl")}</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://coursera.org/learn/example-course"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isImporting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={isImporting || !url.trim()}
            className="gap-2"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isImporting
              ? t("courses_import.importing")
              : t("courses_import.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
