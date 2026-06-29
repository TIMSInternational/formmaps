"use client";

import { useTranslation } from "react-i18next";
import { MoreHorizontal, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedDate: string;
  subscriptionStatus?: string;
}

interface UsersTableProps {
  users: UserRecord[];
  loading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onViewProfile: (user: UserRecord) => void;
}

export function UsersTable({ users, loading, page, totalPages, onPageChange, onViewProfile }: UsersTableProps) {
  const { t } = useTranslation();
  const { t: tPO } = useTranslation("platform_owner");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
      <Table>
        <TableHeader className="bg-gray-50/50">
          <TableRow className="border-gray-50 hover:bg-gray-50/50">
            <TableHead className="py-4 font-semibold text-gray-600 pl-6">{t("admin.users.table.name")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.email")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.role")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.status")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.subscription")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.joined")}</TableHead>
            <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">
              {t("admin.users.table.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowsSkeleton columnCount={7} rowCount={5} showActions />
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-48 text-center text-gray-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <UserX className="h-8 w-8 text-gray-300" />
                  <p>{t("admin.users.noUsersFound")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                onClick={() => onViewProfile(user)}>
                <TableCell className="font-medium text-gray-900 pl-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                      {user.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    {user.name}
                  </div>
                </TableCell>
                <TableCell className="text-gray-500 py-4">{user.email}</TableCell>
                <TableCell className="py-4">
                  <Badge variant="outline" className="capitalize font-medium border-gray-200 text-gray-600 bg-gray-50/50">
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  <Badge
                    variant={user.status === "active" ? "default" : "secondary"}
                    className={`font-medium shadow-none border-0 ${user.status === "active"
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                  >
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  {user.subscriptionStatus ? (
                    <Badge variant="outline" className="capitalize border-blue-100 text-blue-700 bg-blue-50/50">
                      {user.subscriptionStatus}
                    </Badge>
                  ) : (
                    <span className="text-gray-400 text-sm pl-2">-</span>
                  )}
                </TableCell>
                <TableCell className="text-gray-500 py-4">
                  {new Date(user.joinedDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right pr-6 py-4">
                  <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full"
                    onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4 text-gray-400" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination inside Card */}
      <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
        <p className="text-sm text-gray-500">
          {tPO("users.pagination.showingPage", { page, total: totalPages || 1 })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
          >
            {t("common.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages || loading}
            className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
          >
            {t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
