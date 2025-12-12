import { Outlet, NavLink, useNavigate } from 'react-router';
import { authProxy } from '@/lib/auth-proxy';
import type { Route } from './+types/layout';
import { redirect } from 'react-router';
import { api } from '@/lib/trpc';
import {
  LayoutDashboard,
  Globe,
  Users,
  HardDrive,
  Archive,
  CreditCard,
  Settings,
  ChevronDown,
  LogOut,
  Building2,
  Forward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth-client';

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const session = await authProxy.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    throw redirect('/login');
  }

  // Check if user has workspace access (organization member)
  try {
    const dashboard = await api.workspace.getDashboardStats.query();
    return { user: session.user, organization: dashboard.organization };
  } catch (error: any) {
    if (error?.message?.includes('Organization access required')) {
      throw redirect('/mail/inbox');
    }
    throw error;
  }
}

const navItems = [
  { href: '/workspace', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { href: '/workspace/domains', label: 'Domains', icon: Globe },
  { href: '/workspace/users', label: 'Users', icon: Users },
  { href: '/workspace/aliases', label: 'Aliases', icon: Forward },
  { href: '/workspace/storage', label: 'Storage', icon: HardDrive },
  { href: '/workspace/archival', label: 'Archival', icon: Archive },
  { href: '/workspace/invoices', label: 'Invoices', icon: CreditCard },
  { href: '/workspace/settings', label: 'Settings', icon: Settings },
];

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  const { user, organization } = loaderData;
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Logo & Organization Name */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white truncate">
              Workspace
            </span>
          </div>
        </div>

        {/* Organization Info */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                {organization?.name?.charAt(0) || 'O'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {organization?.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {organization?.slug}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Storage Progress */}
        {organization && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500 dark:text-gray-400">Storage</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {formatBytes(organization.usedStorageBytes)} /{' '}
                  {formatBytes(organization.allocatedStorageBytes)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      organization.allocatedStorageBytes > 0
                        ? Math.min(
                            (organization.usedStorageBytes / organization.allocatedStorageBytes) *
                              100,
                            100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* User Menu */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-left font-normal"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-200">
                      {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {user.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate('/mail/inbox')}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Back to Mail
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
