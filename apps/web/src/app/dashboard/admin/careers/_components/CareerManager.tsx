"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Edit, Plus, Trash2, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  listCareers,
  adminCreateCareer,
  adminUpdateCareer,
  adminDeleteCareer,
} from "@/services/careerService";
import { useQueryClient } from "@tanstack/react-query";
import { careerKeys } from "@/hooks/useCareerQueries";
import { CareerRole } from "@/types/career";
import { CareerFormDialog } from "./CareerFormDialog";

export function CareerManager() {
  const { t } = useTranslation();
  const [careers, setCareers] = useState<CareerRole[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CareerRole | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await listCareers();
      setCareers(res.careers || []);
      setLoading(false);
    }
    load();
  }, []);

  const queryClient = useQueryClient();

  const filtered = careers.filter((c) =>
    ((c.title?.en || c.title?.es || "") as string)
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleCreate = () => {
    setSelected(null);
    setIsOpen(true);
  };
  const handleEdit = (c: CareerRole) => {
    setSelected(c);
    setIsOpen(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.careers.confirmDelete") || "Are you sure?")) return;
    await adminDeleteCareer(id);
    setCareers(careers.filter((x) => x.id !== id));
  };

  const handleSave = async (career: CareerRole) => {
    if (career.id) {
      const updated = await adminUpdateCareer(career.id, career);
      setCareers(careers.map((c) => (c.id === career.id ? updated ?? c : c)));
      queryClient.invalidateQueries({ queryKey: careerKeys.list() });
    } else {
      const created = await adminCreateCareer(career);
      setCareers([...careers, created]);
      queryClient.invalidateQueries({ queryKey: careerKeys.list() });
    }
    setIsOpen(false);
  };

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {t("admin.careers.header.title") || "Careers"}
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search careers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
              <Button onClick={handleCreate} className="gap-2">
                <Plus className="w-4 h-4" /> Create
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {loading && <div>Loading...</div>}
            {filtered.map((c, index) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.035 }}
                className="p-3 bg-white rounded shadow-sm border flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{c.title.en}</div>
                  <div className="text-sm text-gray-500">
                    {c.shortDescription?.en}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" onClick={() => handleEdit(c)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(c.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <CareerFormDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        career={selected}
        onSave={handleSave}
      />
    </div>
  );
}
