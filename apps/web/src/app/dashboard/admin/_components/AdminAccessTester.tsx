"use client";
import { useState } from "react";
import { setTestAdminRole, debugAdminStatus } from "@/services/adminService";

export function AdminAccessTester() {
  const [status, setStatus] = useState<string>("");

  const handleSetRole = (role: "user" | "admin" | "super_admin") => {
    setTestAdminRole(role);
    setStatus(`Role set to: ${role}. Refreshing page...`);
    // Auto-refresh after setting role
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleDebug = () => {
    debugAdminStatus();
    setStatus("Check console for debug information.");
  };

  const handleClearStorage = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setStatus("LocalStorage cleared. Refresh the page.");
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-sm">
      <h3 className="font-semibold text-gray-900 mb-3">Admin Access Tester</h3>

      <div className="space-y-2 mb-3">
        <button
          onClick={() => handleSetRole("super_admin")}
          className="w-full bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
        >
          Set Super Admin
        </button>
        <button
          onClick={() => handleSetRole("admin")}
          className="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
        >
          Set Admin
        </button>
        <button
          onClick={() => handleSetRole("user")}
          className="w-full bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700"
        >
          Set User
        </button>
      </div>

      <div className="space-y-2 mb-3">
        <button
          onClick={handleDebug}
          className="w-full bg-yellow-600 text-white px-3 py-2 rounded text-sm hover:bg-yellow-700"
        >
          Debug Status
        </button>
        <button
          onClick={handleClearStorage}
          className="w-full bg-orange-600 text-white px-3 py-2 rounded text-sm hover:bg-orange-700"
        >
          Clear Storage
        </button>
      </div>

      {status && (
        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
          {status}
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2">
        After setting role, refresh the page and try accessing /dashboard/admin
      </div>
    </div>
  );
}
