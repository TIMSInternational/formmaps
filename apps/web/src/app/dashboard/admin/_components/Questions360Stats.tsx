"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  questions360Service,
  Question360,
} from "@/services/questions360Service";

export function Questions360Stats() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    byRelationType: {
      Parent: 0,
      Teacher: 0,
      Other: 0,
      Self: 0,
    },
    loading: true,
    error: null as string | null,
  });

  const fetchStats = async () => {
    try {
      const data = await questions360Service.getAllQuestions();

      // Ensure data is an array
      const questions = Array.isArray(data) ? data : [];

      const active = questions.filter((q) => q.isActive).length;
      const inactive = questions.filter((q) => !q.isActive).length;

      const byRelationType = {
        Parent: questions.filter((q) => q.relationType === "Parent").length,
        Teacher: questions.filter((q) => q.relationType === "Teacher").length,
        Other: questions.filter((q) => q.relationType === "Other").length,
        Self: questions.filter((q) => q.relationType === "Self").length,
      };

      setStats({
        total: questions.length,
        active,
        inactive,
        byRelationType,
        loading: false,
        error: null,
      });
    } catch (error) {
      setStats((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load stats",
      }));
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (stats.loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            360° Questions
          </h3>
          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-600">Loading question statistics...</p>
      </div>
    );
  }

  if (stats.error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            360° Questions
          </h3>
          <span className="text-red-500">❌</span>
        </div>
        <p className="text-red-600 text-sm">{stats.error}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStats}
          className="mt-2 text-red-600 hover:text-red-700 h-auto p-0"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">360° Questions</h3>
        <Link
          href="/dashboard/admin/questions"
          className="text-red-600 hover:text-red-700 text-sm font-medium"
        >
          Manage →
        </Link>
      </div>

      <div className="space-y-4">
        {/* Overview Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {stats.total}
            </div>
            <div className="text-xs text-gray-600">Total</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {stats.active}
            </div>
            <div className="text-xs text-gray-600">Active</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {stats.inactive}
            </div>
            <div className="text-xs text-gray-600">Inactive</div>
          </div>
        </div>

        {/* By Relation Type */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            By Relation Type
          </h4>
          <div className="space-y-1">
            {Object.entries(stats.byRelationType).map(([type, count]) => (
              <div
                key={type}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-gray-600">{type}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t border-gray-200">
          <Button asChild className="w-full bg-red-600 hover:bg-red-700">
            <Link href="/dashboard/admin/questions">Manage Questions</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
