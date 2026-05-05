"use client";

import React, { useState, useEffect } from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Plus, Trash2, Search, Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";
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

const PAGE_SIZE = 10;

export function CareerManager() {
  const { t } = useTranslation();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [careers, setCareers] = useState<CareerRole[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CareerRole | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

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
    (c.title?.en || c.title?.es || "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const handleCreate = () => {
    setSelected(null);
    setIsOpen(true);
  };
  const handleEdit = (c: CareerRole) => {
    setSelected(c);
    setIsOpen(true);
  };
  const handleDelete = async (id: string) => {
    const confirmed = await confirm({ title: t("admin.careers.confirmDelete", "Delete Career"), description: "This career will be permanently removed.", confirmLabel: "Delete", variant: "destructive" });
    if (!confirmed) return;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            {t("admin.careers.header.title") || "Careers"}
          </h1>
          <p className="text-lg text-gray-500 font-medium">
            Manage career roles and descriptions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search careers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-gray-200"
            />
          </div>
          <Button onClick={handleCreate} className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-10 px-5">
            <Plus className="mr-2 h-4 w-4" /> Create
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow className="border-gray-50">
              <TableHead className="py-4 font-semibold text-gray-600 pl-6">#</TableHead>
              <TableHead className="py-4 font-semibold text-gray-600">Title</TableHead>
              <TableHead className="py-4 font-semibold text-gray-600">Description</TableHead>
              <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow key="loading">
                <TableCell colSpan={4} className="h-48 text-center text-gray-500">
                  Loading careers...
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow key="empty">
                <TableCell colSpan={4} className="h-48 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Briefcase className="h-8 w-8 text-gray-300" />
                    <p>No careers found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((c, idx) => (
                <TableRow key={c.id || `career-${idx}`} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <TableCell className="pl-6 py-4 text-gray-400 text-sm font-medium">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell className="py-4 font-medium text-gray-900">
                    {c.title?.en || c.title?.es || "Untitled"}
                  </TableCell>
                  <TableCell className="py-4 text-gray-500 text-sm max-w-md truncate">
                    {c.shortDescription?.en || "—"}
                  </TableCell>
                  <TableCell className="py-4 text-right pr-6">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-gray-100" onClick={() => handleEdit(c)}>
                        <Edit className="w-4 h-4 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-gray-100" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
          <p className="text-sm text-gray-500">
            Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages}</span>
            {" "}({filtered.length} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border-gray-200 text-gray-500 h-8"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border-gray-200 text-gray-500 h-8"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <CareerFormDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        career={selected}
        onSave={handleSave}
      />
      <ConfirmDialog />
    </div>
  );
}
