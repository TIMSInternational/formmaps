"use client";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminStatsData {
  totalUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  planDistribution: {
    planName: string;
    count: number;
    percentage: number;
  }[];
}

export function AdminStats() {
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock data for now - replace with actual API calls
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Mock data
        setStats({
          totalUsers: 1247,
          activeSubscriptions: 892,
          totalRevenue: 26450.0,
          planDistribution: [
            { planName: "Monthly", count: 534, percentage: 60 },
            { planName: "Yearly", count: 267, percentage: 30 },
            { planName: "One-time", count: 91, percentage: 10 },
          ],
        });
      } catch (error) {
      // error handled silently
    } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg p-6 shadow-sm border border-gray-200"
            >
              <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      icon: "👥",
      color: "blue",
      change: "+12%",
    },
    {
      title: "Active Subscriptions",
      value: stats.activeSubscriptions.toLocaleString(),
      icon: "💳",
      color: "green",
      change: "+8%",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: "💰",
      color: "purple",
      change: "+15%",
    },
    {
      title: "Conversion Rate",
      value: `${Math.round(
        (stats.activeSubscriptions / stats.totalUsers) * 100
      )}%`,
      icon: "📈",
      color: "orange",
      change: "+3%",
    },
  ];

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    green: "bg-green-50 text-green-600 border-green-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    orange: "bg-orange-50 text-orange-600 border-orange-200",
  };

  return (
    <div className="mb-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl border ${colorClasses[stat.color as keyof typeof colorClasses]
                  }`}
              >
                {stat.icon}
              </div>
              <span className="text-sm text-green-600 font-medium">
                {stat.change}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Plan Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-lg p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Subscription Plan Distribution
        </h3>
        <div className="space-y-4">
          {stats.planDistribution.map((plan, index) => (
            <div
              key={plan.planName}
              className="flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div
                  className="w-3 h-3 rounded-full bg-blue-500"
                  style={{
                    backgroundColor:
                      index === 0
                        ? "#3B82F6"
                        : index === 1
                          ? "#10B981"
                          : "#F59E0B",
                  }}
                ></div>
                <span className="text-sm font-medium text-gray-900">
                  {plan.planName}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${plan.percentage}%`,
                      backgroundColor:
                        index === 0
                          ? "#3B82F6"
                          : index === 1
                            ? "#10B981"
                            : "#F59E0B",
                    }}
                  ></div>
                </div>
                <span className="text-sm text-gray-600 w-12 text-right">
                  {plan.count}
                </span>
                <span className="text-sm text-gray-500 w-8 text-right">
                  {plan.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
