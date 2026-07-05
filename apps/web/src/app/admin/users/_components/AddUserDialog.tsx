"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUser } from "@/services/adminUsersService";

interface AddUserDialogProps {
  onUserCreated: () => void;
}

export function AddUserDialog({ onUserCreated }: AddUserDialogProps) {
  const { t } = useTranslation();
  const { t: tPO } = useTranslation("platform_owner");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
  });

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error(t('admin.users.fillRequired'));
      return;
    }

    setIsCreating(true);
    try {
      await createUser({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role as "student" | "coach" | "admin",
      });
      toast.success(t('admin.users.success'));
      setIsOpen(false);
      setNewUser({ name: "", email: "", password: "", role: "student" });
      onUserCreated();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('admin.users.error');
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-xl bg-gray-900 text-white shadow-sm hover:bg-gray-800 transition-all hover:shadow-md">
          <UserPlus className="mr-2 h-4 w-4" />
          {t("admin.users.addUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-gray-100 shadow-2xl p-0 overflow-hidden">
        <div className="bg-gray-50/50 p-6 border-b border-gray-100 flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
            <UserPlus className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900">{t('admin.users.dialogTitle')}</DialogTitle>
          <DialogDescription className="text-gray-500 mt-1 max-w-[280px]">
            {t('admin.users.dialogDescription')}
          </DialogDescription>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold text-gray-700 ml-1">{t('admin.users.nameLabel')}</Label>
            <Input
              id="name"
              placeholder={t('admin.users.namePlaceholder')}
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700 ml-1">{tPO("users.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('admin.users.emailPlaceholder')}
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm font-semibold text-gray-700 ml-1">{tPO("users.roleLabel")}</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all text-gray-600">
                  <SelectValue placeholder={tPO("users.roleSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{tPO("users.roles.student")}</SelectItem>
                  <SelectItem value="coach">{tPO("users.roles.coach")}</SelectItem>
                  <SelectItem value="admin">{tPO("users.roles.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-700 ml-1">{t('admin.users.passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('admin.users.passwordPlaceholder')}
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 px-1">
            {t('admin.users.passwordHint')}
          </p>
        </div>

        <DialogFooter className="bg-gray-50/50 p-6 border-t border-gray-100 gap-3 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="rounded-xl h-11 border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 bg-white shadow-sm flex-1 sm:flex-none sm:mr-3"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAddUser}
            disabled={isCreating}
            className="rounded-xl h-11 bg-gray-900 hover:bg-gray-800 text-white shadow-md flex-1 sm:flex-none sm:min-w-[120px]"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tPO("users.creating")}
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('admin.users.createUser')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
