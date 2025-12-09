'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  HardDrive,
  Globe,
  Mail,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Ban,
  Pencil,
  ExternalLink,
  Shield,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Organization {
  id: string;
  name: string;
  partnerId: string | null;
  ownerUserId: string;
  billingEmail: string | null;
  billingAddress: string | null;
  gstNumber: string | null;
  isRetail: boolean;
  totalStorageBytes: number;
  usedStorageBytes: number;
  isActive: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  rocketChatWorkspaceId: string | null;
  rocketChatWorkspaceUrl: string | null;
  hybridMailEnabled: boolean;
  hybridMailProvider: string | null;
  createdAt: Date;
}

interface Partner {
  id: string;
  companyName: string;
  tierName: string;
}

interface Domain {
  id: string;
  organizationId: string;
  domainName: string;
  isPrimary: boolean;
  dnsVerified: boolean;
  dnsVerifiedAt: Date | null;
  mxRecord: string | null;
  spfRecord: string | null;
  dkimRecord: string | null;
  dkimSelector: string | null;
  dmarcRecord: string | null;
  archivalEnabled: boolean;
  archivalStorageBytes: number;
  archivalUsedBytes: number;
  status: 'pending' | 'dns_pending' | 'active' | 'suspended';
  createdAt: Date;
}

interface OrgUser {
  id: string;
  organizationId: string;
  domainId: string;
  userId: string | null;
  emailAddress: string;
  nuboUsername: string | null;
  displayName: string | null;
  mailboxStorageBytes: number;
  mailboxUsedBytes: number;
  driveStorageBytes: number;
  driveUsedBytes: number;
  imapHost: string | null;
  imapPort: number | null;
  smtpHost: string | null;
  smtpPort: number | null;
  hasProSubscription: boolean;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  dns_pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  dns_pending: <AlertCircle className="h-3 w-3" />,
  active: <CheckCircle className="h-3 w-3" />,
  suspended: <Ban className="h-3 w-3" />,
};

export default function AdminOrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editStorageDialogOpen, setEditStorageDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [newStorageGB, setNewStorageGB] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    const fetchOrganization = async () => {
      if (!id) return;
      try {
        const data = await api.admin.getOrganizationById.query({ organizationId: id });
        setOrganization(data.organization as Organization);
        setPartner(data.partner as Partner | null);
        setDomains(data.domains as Domain[]);
        setUsers(data.users as OrgUser[]);
      } catch (error) {
        console.error('Failed to fetch organization:', error);
        toast.error('Failed to load organization details');
      } finally {
        setLoading(false);
      }
    };
    fetchOrganization();
  }, [id]);

  const handleUpdateStorage = async () => {
    if (!organization || !newStorageGB) return;
    try {
      const bytes = parseFloat(newStorageGB) * 1024 * 1024 * 1024;
      await api.admin.updateOrganizationStorage.mutate({
        organizationId: organization.id,
        storageBytes: bytes,
      });
      setOrganization({ ...organization, totalStorageBytes: bytes });
      setEditStorageDialogOpen(false);
      toast.success('Organization storage updated');
    } catch (error) {
      console.error('Failed to update storage:', error);
      toast.error('Failed to update storage');
    }
  };

  const handleSuspend = async () => {
    if (!organization) return;
    try {
      await api.admin.suspendOrganization.mutate({
        organizationId: organization.id,
        reason: suspensionReason,
      });
      setOrganization({ ...organization, isActive: false, suspensionReason });
      setSuspendDialogOpen(false);
      setSuspensionReason('');
      toast.success('Organization suspended');
    } catch (error) {
      console.error('Failed to suspend organization:', error);
      toast.error('Failed to suspend organization');
    }
  };

  const handleActivate = async () => {
    if (!organization) return;
    try {
      await api.admin.activateOrganization.mutate({ organizationId: organization.id });
      setOrganization({ ...organization, isActive: true, suspensionReason: null, suspendedAt: null });
      toast.success('Organization activated');
    } catch (error) {
      console.error('Failed to activate organization:', error);
      toast.error('Failed to activate organization');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Organization not found</h2>
          <Button variant="outline" onClick={() => navigate('/admin/organizations')} className="mt-4">
            Back to Organizations
          </Button>
        </div>
      </div>
    );
  }

  const storageUsagePercent = organization.totalStorageBytes > 0
    ? Math.min(100, (organization.usedStorageBytes / organization.totalStorageBytes) * 100)
    : 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/organizations')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Organization Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {organization.name}
                </h1>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-sm font-medium',
                    organization.isRetail
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  )}
                >
                  {organization.isRetail ? 'Retail' : 'Partner'}
                </span>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-sm font-medium',
                    organization.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  )}
                >
                  {organization.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                {partner && (
                  <button
                    onClick={() => navigate(`/admin/partners/${partner.id}`)}
                    className="flex items-center gap-1 hover:text-blue-600"
                  >
                    <Building2 className="h-4 w-4" />
                    {partner.companyName} ({partner.tierName})
                  </button>
                )}
                {organization.billingEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {organization.billingEmail}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Created {formatDate(organization.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {organization.isActive ? (
              <Button variant="outline" className="text-red-600" onClick={() => setSuspendDialogOpen(true)}>
                <Ban className="h-4 w-4 mr-2" />
                Suspend
              </Button>
            ) : (
              <Button variant="outline" className="text-green-600" onClick={handleActivate}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Globe className="h-4 w-4" />
              Domains
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {domains.length}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Users className="h-4 w-4" />
              Email Accounts
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {users.length}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <HardDrive className="h-4 w-4" />
              Storage
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatBytes(organization.usedStorageBytes)} / {formatBytes(organization.totalStorageBytes)}
            </p>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full mt-2">
              <div
                className={cn(
                  'h-full rounded-full',
                  storageUsagePercent > 90 ? 'bg-red-500' : storageUsagePercent > 70 ? 'bg-yellow-500' : 'bg-blue-600'
                )}
                style={{ width: `${storageUsagePercent}%` }}
              />
            </div>
            <Button variant="link" size="sm" className="p-0 h-auto mt-1" onClick={() => {
              setNewStorageGB((organization.totalStorageBytes / (1024 * 1024 * 1024)).toString());
              setEditStorageDialogOpen(true);
            }}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Shield className="h-4 w-4" />
              GST Number
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mt-1">
              {organization.gstNumber || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Domains Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Domains</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {domains.length} domain{domains.length !== 1 ? 's' : ''}
          </span>
        </div>
        {domains.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No domains configured yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Domain</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">DNS Verified</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Archival</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Created</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-900 dark:text-white font-medium">{domain.domainName}</span>
                      {domain.isPrimary && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Primary
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    {domain.dnsVerified ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <AlertCircle className="h-4 w-4" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-gray-900 dark:text-white">
                    {domain.archivalEnabled ? (
                      <span className="text-sm">
                        {formatBytes(domain.archivalUsedBytes)} / {formatBytes(domain.archivalStorageBytes)}
                      </span>
                    ) : (
                      <span className="text-gray-400">Disabled</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1',
                      statusColors[domain.status]
                    )}>
                      {statusIcons[domain.status]}
                      {domain.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(domain.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Email Accounts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Accounts</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {users.length} account{users.length !== 1 ? 's' : ''}
          </span>
        </div>
        {users.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No email accounts created yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Display Name</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Mailbox</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Drive</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">IMAP/SMTP</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-900 dark:text-white font-medium">{user.emailAddress}</span>
                      {user.hasProSubscription && (
                        <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          Pro
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-gray-900 dark:text-white">
                    {user.displayName || '-'}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {formatBytes(user.mailboxUsedBytes)} / {formatBytes(user.mailboxStorageBytes)}
                      </span>
                      <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mt-1">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{
                            width: `${Math.min(100, user.mailboxStorageBytes > 0 ? (user.mailboxUsedBytes / user.mailboxStorageBytes) * 100 : 0)}%`
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {formatBytes(user.driveUsedBytes)} / {formatBytes(user.driveStorageBytes)}
                      </span>
                      <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mt-1">
                        <div
                          className="h-full bg-green-600 rounded-full"
                          style={{
                            width: `${Math.min(100, user.driveStorageBytes > 0 ? (user.driveUsedBytes / user.driveStorageBytes) * 100 : 0)}%`
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    {user.imapHost ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Server className="h-4 w-4" />
                        Configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400">
                        <Server className="h-4 w-4" />
                        Not set
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1',
                      statusColors[user.status]
                    )}>
                      {statusIcons[user.status]}
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Billing Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Billing Email</p>
              <p className="text-gray-900 dark:text-white">{organization.billingEmail || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Billing Address</p>
              <p className="text-gray-900 dark:text-white">{organization.billingAddress || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">GST Number</p>
              <p className="text-gray-900 dark:text-white">{organization.gstNumber || '-'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Integration Status</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Nubo Chat (Rocket.Chat)</p>
              <p className="text-gray-900 dark:text-white">
                {organization.rocketChatWorkspaceUrl ? (
                  <a
                    href={organization.rocketChatWorkspaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    {organization.rocketChatWorkspaceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-gray-400">Not configured</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Hybrid Mail</p>
              <p className="text-gray-900 dark:text-white">
                {organization.hybridMailEnabled ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {organization.hybridMailProvider === 'google_workspace' ? 'Google Workspace' : 'Office 365'}
                  </span>
                ) : (
                  <span className="text-gray-400">Disabled</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Storage Dialog */}
      <Dialog open={editStorageDialogOpen} onOpenChange={setEditStorageDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Edit Storage Allocation</DialogTitle>
            <DialogDescription>Adjust the storage allocation for this organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Storage (GB)</Label>
              <Input
                type="number"
                value={newStorageGB}
                onChange={(e) => setNewStorageGB(e.target.value)}
                placeholder="Enter storage in GB"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStorageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStorage}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Suspend Organization</DialogTitle>
            <DialogDescription>
              This will suspend the organization and all its users. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Suspension Reason</Label>
              <Textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="Enter reason for suspension..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={!suspensionReason}>
              Suspend Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
