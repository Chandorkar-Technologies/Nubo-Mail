'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Users,
  Globe,
  HardDrive,
  Archive,
  CreditCard,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router';

interface DashboardStats {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    allocatedStorageBytes: number;
    usedStorageBytes: number;
  };
  userCount: number;
  domainCount: number;
  archivalEnabled: boolean;
  pendingInvoices: number;
  storage: {
    allocated: number;
    used: number;
    percentage: number;
    allocatedFormatted: string;
    usedFormatted: string;
  };
}

export default function WorkspaceDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.workspace.getDashboardStats.query();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.userCount ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/workspace/users',
    },
    {
      title: 'Domains',
      value: stats?.domainCount ?? 0,
      icon: Globe,
      color: 'bg-purple-500',
      href: '/workspace/domains',
    },
    {
      title: 'Archival',
      value: stats?.archivalEnabled ? 'Enabled' : 'Disabled',
      icon: Archive,
      color: 'bg-orange-500',
      href: '/workspace/archival',
      isText: true,
    },
    {
      title: 'Pending Invoices',
      value: stats?.pendingInvoices ?? 0,
      icon: CreditCard,
      color: 'bg-green-500',
      href: '/workspace/invoices',
      urgent: (stats?.pendingInvoices ?? 0) > 0,
    },
  ];

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Workspace Dashboard
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Welcome to {stats?.organization?.name || 'your workspace'}
            </p>
          </div>
          <div
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              stats?.organization?.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            )}
          >
            {stats?.organization?.status === 'active' ? 'Active' : 'Pending'}
          </div>
        </div>
      </div>

      {/* Storage Progress Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <HardDrive className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Storage Usage
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stats?.storage.usedFormatted} of {stats?.storage.allocatedFormatted} used
              </p>
            </div>
          </div>
          <Link
            to="/workspace/storage"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            Manage Storage
            <ArrowUpRight className="h-4 w-4 ml-1" />
          </Link>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
          <div
            className={cn(
              'h-4 rounded-full transition-all',
              (stats?.storage.percentage ?? 0) > 90
                ? 'bg-red-500'
                : (stats?.storage.percentage ?? 0) > 70
                  ? 'bg-yellow-500'
                  : 'bg-blue-500'
            )}
            style={{ width: `${Math.min(stats?.storage.percentage ?? 0, 100)}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {stats?.storage.percentage?.toFixed(1)}% of your storage is in use
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
              {stat.href && (
                <Link
                  to={stat.href}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <ArrowUpRight className="h-5 w-5" />
                </Link>
              )}
            </div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {stat.title}
            </h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stat.isText ? stat.value : stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link
              to="/workspace/domains/new"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Add Domain</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link
              to="/workspace/users/new"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Add User</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link
              to="/workspace/archival"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Archive className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Configure Archival</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Getting Started
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center',
                  (stats?.domainCount ?? 0) > 0
                    ? 'bg-green-100 dark:bg-green-900'
                    : 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                {(stats?.domainCount ?? 0) > 0 ? (
                  <svg
                    className="h-3 w-3 text-green-600 dark:text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Add your first domain</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect a custom domain for your organization's email
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center',
                  (stats?.userCount ?? 0) > 1
                    ? 'bg-green-100 dark:bg-green-900'
                    : 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                {(stats?.userCount ?? 0) > 1 ? (
                  <svg
                    className="h-3 w-3 text-green-600 dark:text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Invite team members</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Add users to your organization
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center',
                  stats?.archivalEnabled
                    ? 'bg-green-100 dark:bg-green-900'
                    : 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                {stats?.archivalEnabled ? (
                  <svg
                    className="h-3 w-3 text-green-600 dark:text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Enable email archival</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Set up compliance and retention policies
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
