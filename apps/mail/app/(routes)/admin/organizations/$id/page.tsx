'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Building2, HardDrive, Globe, Mail, Users, CheckCircle, Clock, AlertCircle, Ban, Pencil, Shield, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  dns_pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function AdminOrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [domains, setDomains] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editStorageDialogOpen, setEditStorageDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [newStorageGB, setNewStorageGB] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    const fetchOrganization = async () => {
      if (!id) {
        setError('No organization ID provided');
        setLoading(false);
        return;
      }
      try {
        const data = await api.admin.getOrganizationById.query({ organizationId: id });
        setOrganization(data.organization);
        setPartner(data.partner);
        setDomains(data.domains || []);
        setUsers(data.users || []);
      } catch (err: any) {
        console.error('Failed to fetch organization:', err);
        setError(err?.message || 'Failed to load organization');
        toast.error('Failed to load organization details');
      } finally {
        setLoading(false);
      }
    };
    fetchOrganization();
  }, [id]);

  const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: any): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
      toast.success('Storage updated');
    } catch (err) {
      console.error('Failed to update storage:', err);
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
      setOrganization({ ...organization, isActive: false });
      setSuspendDialogOpen(false);
      toast.success('Organization suspended');
    } catch (err) {
      console.error('Failed to suspend:', err);
      toast.error('Failed to suspend');
    }
  };

  const handleActivate = async () => {
    if (!organization) return;
    try {
      await api.admin.activateOrganization.mutate({ organizationId: organization.id });
      setOrganization({ ...organization, isActive: true });
      toast.success('Organization activated');
    } catch (err) {
      console.error('Failed to activate:', err);
      toast.error('Failed to activate');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {error || 'Organization not found'}
          </h2>
          <Button variant="outline" onClick={() => navigate('/admin/organizations')} className="mt-4">
            Back to Organizations
          </Button>
        </div>
      </div>
    );
  }

  const storageUsagePercent = organization.totalStorageBytes > 0
    ? Math.min(100, ((organization.usedStorageBytes || 0) / organization.totalStorageBytes) * 100)
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
                <span className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  organization.isRetail
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                )}>
                  {organization.isRetail ? 'Retail' : 'Partner'}
                </span>
                <span className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  organization.isActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                )}>
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
                    {partner.companyName}
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

        {/* Stats */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Globe className="h-4 w-4" />
              Domains
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{domains.length}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Users className="h-4 w-4" />
              Email Accounts
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{users.length}</p>
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
              setNewStorageGB(((organization.totalStorageBytes || 0) / (1024 * 1024 * 1024)).toString());
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

      {/* Domains */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Domains ({domains.length})
        </h2>
        {domains.length === 0 ? (
          <p className="text-gray-500">No domains yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 text-sm font-medium text-gray-500">Domain</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500">DNS</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain: any) => (
                <tr key={domain.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{domain.domainName}</span>
                      {domain.isPrimary && (
                        <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800">Primary</span>
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
                  <td className="py-3">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusColors[domain.status] || statusColors.pending)}>
                      {domain.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Users */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Email Accounts ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-gray-500">No email accounts yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500">Mailbox</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500">IMAP</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{user.emailAddress}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm">
                    {formatBytes(user.mailboxUsedBytes)} / {formatBytes(user.mailboxStorageBytes)}
                  </td>
                  <td className="py-3">
                    {user.imapHost ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Server className="h-4 w-4" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusColors[user.status] || statusColors.pending)}>
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Storage Dialog */}
      <Dialog open={editStorageDialogOpen} onOpenChange={setEditStorageDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Edit Storage</DialogTitle>
            <DialogDescription>Set storage allocation in GB</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Storage (GB)</Label>
            <Input type="number" value={newStorageGB} onChange={(e) => setNewStorageGB(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStorageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStorage}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Suspend Organization</DialogTitle>
            <DialogDescription>Provide a reason for suspension</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason</Label>
            <Textarea value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={!suspensionReason}>Suspend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
