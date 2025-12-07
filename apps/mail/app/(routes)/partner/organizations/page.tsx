import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Building2,
  Plus,
  Search,
  Users,
  Globe,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  allocatedStorageBytes: number;
  usedStorageBytes: number;
  userCount: number;
  domainCount: number;
  createdAt: string;
}

export default function PartnerOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api.partner.getOrganizations.query({
          search: search || undefined,
          page: pagination.page,
          limit: pagination.limit,
        });
        setOrganizations(data.organizations);
        setPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: data.totalPages,
        }));
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [search, pagination.page]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStoragePercentage = (used: number, allocated: number) => {
    if (!allocated) return 0;
    return Math.min((used / allocated) * 100, 100);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organizations</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your customer organizations
          </p>
        </div>
        <Button onClick={() => navigate('/partner/organizations/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Organization
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Organizations Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : organizations.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No organizations yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Create your first organization to get started
            </p>
            <Button onClick={() => navigate('/partner/organizations/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Organization
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {organizations.map((org) => {
                const storagePercentage = getStoragePercentage(
                  org.usedStorageBytes,
                  org.allocatedStorageBytes
                );

                return (
                  <div
                    key={org.id}
                    className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                          <span className="text-lg font-bold text-green-700 dark:text-green-300">
                            {org.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {org.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{org.slug}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/partner/organizations/${org.id}`)}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Manage
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span>{org.userCount} users</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <span>{org.domainCount} domains</span>
                      </div>
                    </div>

                    {/* Storage Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          Storage
                        </span>
                        <span>
                          {formatBytes(org.usedStorageBytes)} / {formatBytes(org.allocatedStorageBytes)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-all',
                            storagePercentage > 90
                              ? 'bg-red-500'
                              : storagePercentage > 70
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          )}
                          style={{ width: `${storagePercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                          org.status === 'active' &&
                            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                          org.status === 'suspended' &&
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                          org.status === 'pending' &&
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        )}
                      >
                        {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                      </span>
                      <Link
                        to={`/partner/organizations/${org.id}`}
                        className="text-sm text-green-600 dark:text-green-400 hover:underline"
                      >
                        View details →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
