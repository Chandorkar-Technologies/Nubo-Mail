import { Outlet, NavLink, useNavigate } from 'react-router';
import { authProxy } from '@/lib/auth-proxy';
import type { Route } from './+types/layout';
import { redirect } from 'react-router';
import { api } from '@/lib/trpc';
import {
  LayoutDashboard,
  Building2,
  HardDrive,
  CreditCard,
  Settings,
  ChevronDown,
  LogOut,
  Handshake,
  DollarSign,
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

  // Check application status
  try {
    const status = await api.partner.getApplicationStatus.query();

    if (status.isPartner) {
      // User is an approved partner
      const profile = await api.partner.getPartnerProfile.query();
      return { user: session.user, partner: profile.partner, tier: profile.tier };
    } else if (status.status === 'pending') {
      // Has pending application - show waiting page
      return { user: session.user, applicationPending: true, application: status.application };
    } else if (status.status === 'rejected') {
      // Application was rejected
      return { user: session.user, applicationRejected: true, application: status.application };
    } else {
      // No application - redirect to apply page
      throw redirect('/partner/apply');
    }
  } catch (error: any) {
    if (error?.message?.includes('Partner access required')) {
      throw redirect('/partner/apply');
    }
    throw error;
  }
}

const navItems = [
  { href: '/partner', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { href: '/partner/organizations', label: 'Organizations', icon: Building2 },
  { href: '/partner/storage', label: 'Storage', icon: HardDrive },
  { href: '/partner/invoices', label: 'Invoices', icon: CreditCard },
  { href: '/partner/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/partner/settings', label: 'Settings', icon: Settings },
];

const tierColors: Record<string, string> = {
  entry: 'bg-gray-500',
  bronze: 'bg-orange-500',
  silver: 'bg-gray-400',
  gold: 'bg-yellow-500',
};

export default function PartnerLayout({ loaderData }: Route.ComponentProps) {
  const { user, partner, tier, applicationPending, applicationRejected, application } = loaderData;
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Show pending application status
  if (applicationPending) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Handshake className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Application Under Review
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your partnership application for <strong>{application?.companyName}</strong> is currently being reviewed.
            We'll notify you once it's approved.
          </p>
          <Button variant="outline" onClick={() => navigate('/mail/inbox')}>
            Back to Mail
          </Button>
        </div>
      </div>
    );
  }

  // Show rejected application status
  if (applicationRejected) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Handshake className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Application Rejected
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Unfortunately, your partnership application was not approved.
          </p>
          {application?.rejectionReason && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-red-700 dark:text-red-300">
                <strong>Reason:</strong> {application.rejectionReason}
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/mail/inbox')}>
              Back to Mail
            </Button>
            <Button onClick={() => navigate('/partner/apply')}>
              Apply Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Logo & Tier Badge */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Handshake className="h-8 w-8 text-green-600" />
            <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
              Partner
            </span>
          </div>
          <div
            className={cn(
              'px-2 py-1 rounded text-xs font-medium text-white',
              tierColors[tier?.name || 'entry']
            )}
          >
            {tier?.displayName || 'Entry Partner'}
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
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-200'
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
        {partner && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500 dark:text-gray-400">Storage Pool</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {formatBytes(partner.usedStorageBytes)} / {formatBytes(partner.allocatedStorageBytes)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      partner.allocatedStorageBytes > 0
                        ? Math.min(
                            (partner.usedStorageBytes / partner.allocatedStorageBytes) * 100,
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
                  <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <span className="text-sm font-medium text-green-700 dark:text-green-200">
                      {partner?.companyName?.charAt(0) || 'P'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {partner?.companyName}
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
