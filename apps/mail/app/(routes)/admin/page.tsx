'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Users,
  Building2,
  Clock,
  IndianRupee,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStats {
  totalPartners: number;
  pendingApplications: number;
  activeOrganizations: number;
  pendingApprovals: number;
  totalRevenue: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.admin.getDashboardStats.query();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)}L`;
    } else if (num >= 1000) {
      return `₹${(num / 1000).toFixed(2)}K`;
    }
    return `₹${num.toFixed(2)}`;
  };

  const statCards = [
    {
      title: 'Total Partners',
      value: stats?.totalPartners ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      trend: '+12%',
    },
    {
      title: 'Pending Applications',
      value: stats?.pendingApplications ?? 0,
      icon: Clock,
      color: 'bg-yellow-500',
      urgent: (stats?.pendingApplications ?? 0) > 0,
    },
    {
      title: 'Active Organizations',
      value: stats?.activeOrganizations ?? 0,
      icon: Building2,
      color: 'bg-green-500',
      trend: '+8%',
    },
    {
      title: 'Pending Approvals',
      value: stats?.pendingApprovals ?? 0,
      icon: AlertCircle,
      color: 'bg-orange-500',
      urgent: (stats?.pendingApprovals ?? 0) > 0,
    },
    {
      title: 'Total Revenue',
      value: stats ? formatCurrency(stats.totalRevenue) : '₹0',
      icon: IndianRupee,
      color: 'bg-purple-500',
      isRevenue: true,
    },
  ];

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Admin Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Overview of your Nubo B2B platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className={cn(
              'bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700',
              stat.urgent && 'ring-2 ring-orange-500'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn('p-2 rounded-lg', stat.color)}>
                <stat.icon className="h-5 w-5 text-white" />
              </div>
              {stat.trend && (
                <div className="flex items-center text-green-500 text-sm">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  {stat.trend}
                </div>
              )}
            </div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {stat.title}
            </h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stat.isRevenue ? stat.value : stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Applications */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Partnership Applications
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {stats?.pendingApplications
              ? `${stats.pendingApplications} pending application(s) require your attention.`
              : 'No pending applications.'}
          </p>
          <a
            href="/admin/partners?tab=applications"
            className="mt-4 inline-flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
          >
            View all applications →
          </a>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Pending Approvals
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {stats?.pendingApprovals
              ? `${stats.pendingApprovals} item(s) waiting for approval.`
              : 'No pending approvals.'}
          </p>
          <a
            href="/admin/approvals"
            className="mt-4 inline-flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
          >
            View all approvals →
          </a>
        </div>
      </div>
    </div>
  );
}
