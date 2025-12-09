'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Search, Users, HardDrive, MoreVertical, Eye, Ban, CheckCircle, Pencil, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  isRetail: boolean | null;
  totalStorageBytes: number;
  usedStorageBytes: number;
  isActive: boolean | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminOrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [_orgDetails, _setOrgDetails] = useState<any>(null);
  const [newStorageGB, setNewStorageGB] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [partners, setPartners] = useState<Array<{ id: string; companyName: string }>>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const data = await api.admin.getOrganizations.query({ search });
        setOrganizations(data.organizations);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrganizations();
  }, [search]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleViewDetails = (org: Organization) => {
    navigate(`/admin/organizations/${org.id}`);
  };

  const handleOpenStorageDialog = (org: Organization) => {
    setSelectedOrg(org);
    setNewStorageGB((org.totalStorageBytes / (1024 * 1024 * 1024)).toString());
    setStorageDialogOpen(true);
  };

  const handleUpdateStorage = async () => {
    if (!selectedOrg || !newStorageGB) return;
    try {
      const bytes = parseFloat(newStorageGB) * 1024 * 1024 * 1024;
      await api.admin.updateOrganizationStorage.mutate({
        organizationId: selectedOrg.id,
        storageBytes: bytes,
      });
      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === selectedOrg.id ? { ...org, totalStorageBytes: bytes } : org
        )
      );
      setStorageDialogOpen(false);
      toast.success('Storage updated successfully');
    } catch (error) {
      console.error('Failed to update storage:', error);
      toast.error('Failed to update storage');
    }
  };

  const handleOpenSuspendDialog = (org: Organization) => {
    setSelectedOrg(org);
    setSuspensionReason('');
    setSuspendDialogOpen(true);
  };

  const handleSuspend = async () => {
    if (!selectedOrg) return;
    try {
      await api.admin.suspendOrganization.mutate({
        organizationId: selectedOrg.id,
        reason: suspensionReason,
      });
      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === selectedOrg.id
            ? { ...org, isActive: false, suspensionReason, suspendedAt: new Date() }
            : org
        )
      );
      setSuspendDialogOpen(false);
      toast.success('Organization suspended');
    } catch (error) {
      console.error('Failed to suspend organization:', error);
      toast.error('Failed to suspend organization');
    }
  };

  const handleActivate = async (org: Organization) => {
    try {
      await api.admin.activateOrganization.mutate({ organizationId: org.id });
      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === org.id
            ? { ...o, isActive: true, suspensionReason: null, suspendedAt: null }
            : o
        )
      );
      toast.success('Organization activated');
    } catch (error) {
      console.error('Failed to activate organization:', error);
      toast.error('Failed to activate organization');
    }
  };

  const handleOpenPartnerDialog = async (org: Organization) => {
    setSelectedOrg(org);
    setSelectedPartnerId(org.partnerId);
    try {
      const data = await api.admin.getPartners.query({});
      setPartners(data.partners);
      setPartnerDialogOpen(true);
    } catch (error) {
      console.error('Failed to fetch partners:', error);
      toast.error('Failed to load partners');
    }
  };

  const handleAssignPartner = async () => {
    if (!selectedOrg) return;
    try {
      await api.admin.assignOrganizationToPartner.mutate({
        organizationId: selectedOrg.id,
        partnerId: selectedPartnerId,
      });
      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === selectedOrg.id
            ? { ...org, partnerId: selectedPartnerId }
            : org
        )
      );
      setPartnerDialogOpen(false);
      toast.success(selectedPartnerId ? 'Partner assigned successfully' : 'Partner removed');
    } catch (error) {
      console.error('Failed to assign partner:', error);
      toast.error('Failed to assign partner');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organizations</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage all organizations across all partners
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Organization
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Partner
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Users
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Storage
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="text-right p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr
                key={org.id}
                className="border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{org.billingEmail || '-'}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="text-gray-900 dark:text-white">
                    {org.isRetail ? 'Retail' : org.partnerId ? 'Partner' : 'Retail'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-900 dark:text-white">-</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-900 dark:text-white">
                      {formatBytes(org.usedStorageBytes)} / {formatBytes(org.totalStorageBytes)}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      org.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    )}
                  >
                    {org.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewDetails(org)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenStorageDialog(org)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Manage Storage
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenPartnerDialog(org)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Assign Partner
                      </DropdownMenuItem>
                      {org.isActive ? (
                        <DropdownMenuItem
                          onClick={() => handleOpenSuspendDialog(org)}
                          className="text-red-600"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Suspend
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleActivate(org)}
                          className="text-green-600"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Activate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No organizations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent showOverlay className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedOrg?.name}</DialogTitle>
            <DialogDescription>Organization details and information</DialogDescription>
          </DialogHeader>
          {orgDetails && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Billing Email</p>
                  <p className="text-gray-900 dark:text-white">{orgDetails.organization.billingEmail || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">GST Number</p>
                  <p className="text-gray-900 dark:text-white">{orgDetails.organization.gstNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Storage</p>
                  <p className="text-gray-900 dark:text-white">
                    {formatBytes(orgDetails.organization.usedStorageBytes)} / {formatBytes(orgDetails.organization.totalStorageBytes)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Users</p>
                  <p className="text-gray-900 dark:text-white">{orgDetails.userCount}</p>
                </div>
              </div>
              {orgDetails.domains && orgDetails.domains.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Domains</h4>
                  <div className="space-y-2">
                    {orgDetails.domains.map((domain: any) => (
                      <div key={domain.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        <span className="text-gray-900 dark:text-white">{domain.domain}</span>
                        <span className={cn(
                          'px-2 py-1 rounded text-xs',
                          domain.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        )}>
                          {domain.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Storage Dialog */}
      <Dialog open={storageDialogOpen} onOpenChange={setStorageDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Manage Storage</DialogTitle>
            <DialogDescription>
              Update storage allocation for {selectedOrg?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Usage</Label>
              <p className="text-sm text-gray-500">
                {formatBytes(selectedOrg?.usedStorageBytes || 0)} used
              </p>
            </div>
            <div>
              <Label>Storage Allocation (GB)</Label>
              <Input
                type="number"
                value={newStorageGB}
                onChange={(e) => setNewStorageGB(e.target.value)}
                placeholder="Enter storage in GB"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStorageDialogOpen(false)}>Cancel</Button>
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
              This will suspend {selectedOrg?.name} and disable all user access.
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
            <Button variant="destructive" onClick={handleSuspend}>
              Suspend Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Partner Dialog */}
      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent showOverlay>
          <DialogHeader>
            <DialogTitle>Assign Partner</DialogTitle>
            <DialogDescription>
              Assign {selectedOrg?.name} to a partner to manage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Partner</Label>
              <select
                className="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white"
                value={selectedPartnerId || ''}
                onChange={(e) => setSelectedPartnerId(e.target.value || null)}
              >
                <option value="">No Partner (Retail)</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.companyName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Assigning to a partner will allow them to manage this organization.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignPartner}>
              {selectedPartnerId ? 'Assign Partner' : 'Remove Partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
