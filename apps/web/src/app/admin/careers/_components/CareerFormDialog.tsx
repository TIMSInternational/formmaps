"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CareerRole } from "@/types/career";
import { useTranslation } from "react-i18next";

export function CareerFormDialog({
  isOpen,
  onClose,
  career,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  career?: CareerRole | null;
  onSave: (c: CareerRole) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(career?.title?.en || "");
  const [shortDesc, setShortDesc] = useState(
    career?.shortDescription?.en || ""
  );

  useEffect(() => {
    setTitle(career?.title?.en || "");
    setShortDesc(career?.shortDescription?.en || "");
  }, [career]);

  const handleSave = () => {
    const payload: CareerRole = career
      ? ({ ...career, title: { en: title } } as any)
      : ({
          id: "",
          title: { en: title },
          shortDescription: { en: shortDesc },
        } as any);
    onSave(payload);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="p-4 max-w-2xl">
        <h3 className="text-lg font-medium">
          {career
            ? t("admin.careers.editTitle")
            : t("admin.careers.createTitle")}
        </h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">
              {t("admin.careers.form.title")}
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              {t("admin.careers.form.shortDescription")}
            </label>
            <Input
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end space-x-2 mt-3">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={handleSave}>{t("common.save")}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default CareerFormDialog;
