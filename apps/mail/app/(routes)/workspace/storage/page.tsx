'use client';

import { useEffect, useState } from 'react';
import {
  HardDrive,
  Users,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StorageStats {
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  percentage: number;
  userBreakdown: Array<{
    id: string;
    displayName: string;
    emailAddress: string;
    usedBytes: number;
  }>;
}

export default function WorkspaceStoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Mock storage stats until we add the endpoint
        setStats({
          allocatedBytes: 50 * 1024 * 1024 * 1024, // 50 GB
          usedBytes: 23 * 1024 * 1024 * 1024, // 23 GB
          availableBytes: 27 * 1024 * 1024 * 1024, // 27 GB
          percentage: 46,
          userBreakdown: [
            {
              id: '1',
              displayName: 'John Doe',
              emailAddress: 'john@example.com',
              usedBytes: 8 * 1024 * 1024 * 1024,
            },
            {
              id: '2',
              displayName: 'Jane Smith',
              emailAddress: 'jane@example.com',
              usedBytes: 6 * 1024 * 1024 * 1024,
            },
            {
              id: '3',
              displayName: 'Bob Wilson',
              emailAddress: 'bob@example.com',
              usedBytes: 5 * 1024 * 1024 * 1024,
            },
            {
              id: '4',
              displayName: 'Alice Brown',
              emailAddress: 'alice@example.com',
              usedBytes: 4 * 1024 * 1024 * 1024,
            },
          ],
        });
      } catch (error) {
        console.error('Failed to fetch storage stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Storage</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Monitor your organization's storage usage
        </p>
      </div>

      {/* Storage Overview Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
            <HardDrive className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Organization Storage
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              {formatBytes(stats?.usedBytes ?? 0)} used of {formatBytes(stats?.allocatedBytes ?? 0)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6">
            <div
              className={cn(
                'h-6 rounded-full transition-all flex items-center justify-end pr-2',
                (stats?.percentage ?? 0) > 90
                  ? 'bg-red-500'
                  : (stats?.percentage ?? 0) > 70
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
              )}
              style={{ width: `${Math.max(stats?.percentage ?? 0, 5)}%` }}
            >
              {(stats?.percentage ?? 0) >= 20 && (
                <span className="text-xs font-medium text-white">
                  {stats?.percentage?.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBytes(stats?.allocatedBytes ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Allocated</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatBytes(stats?.usedBytes ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Currently Used</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatBytes(stats?.availableBytes ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Available</p>
          </div>
        </div>

        {/* Warning if storage is running low */}
        {(stats?.percentage ?? 0) > 80 && (
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                Storage Running Low
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Your organization is using more than 80% of allocated storage. Contact your
                partner to request additional storage.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* User Storage Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Storage by User
          </h2>
        </div>

        {stats?.userBreakdown && stats.userBreakdown.length > 0 ? (
          <div className="space-y-4">
            {stats.userBreakdown.map((user) => {
              const userPercentage =
                stats.usedBytes > 0 ? (user.usedBytes / stats.usedBytes) * 100 : 0;

              return (
                <div key={user.id} className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-200">
                      {user.displayName?.charAt(0) || user.emailAddress.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {user.displayName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {user.emailAddress}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white ml-4">
                        {formatBytes(user.usedBytes)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${userPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No user storage data available
          </p>
        )}
      </div>

      {/* Storage Tips */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-200">
              Storage Management Tips
            </h3>
            <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
              <li>• Encourage users to regularly clean up old emails and attachments</li>
              <li>• Consider enabling email archival to move old emails to cold storage</li>
              <li>• Large attachments can be stored in external cloud drives instead</li>
              <li>• Contact your partner administrator if you need more storage</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
