'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Users,
  Globe,
  HardDrive,
  Trash2,
  Plus,
  Mail,
  Copy,
  ChevronDown,
  ChevronUp,
  Pencil,
  AlertTriangle,
  Info,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrganizationDetail {
  id: string;
  name: string;
  billingEmail: string | null;
  billingAddress: string | null;
  gstNumber: string | null;
  totalStorageBytes: number;
  usedStorageBytes: number;
  isActive: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  hybridMailEnabled?: boolean;
  hybridMailProvider?: string | null;
}

interface Domain {
  id: string;
  domainName: string;
  isPrimary: boolean;
  dnsVerified: boolean;
  mxRecord: string | null;
  spfRecord: string | null;
  dkimRecord: string | null;
  dkimSelector: string | null;
  dmarcRecord: string | null;
  status: 'pending' | 'dns_pending' | 'active' | 'suspended';
  createdAt: string;
}

interface OrganizationUser {
  id: string;
  emailAddress: string;
  displayName: string | null;
  domainId: string;
  mailboxStorageBytes: number;
  mailboxUsedBytes: number;
  driveStorageBytes: number;
  driveUsedBytes: number;
  status: 'pending' | 'active' | 'suspended';
  hasProSubscription: boolean;
  createdAt: string;
}

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerAvailableStorage, setPartnerAvailableStorage] = useState(0);

  // Delete organization dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add domain dialog
  const [addDomainDialogOpen, setAddDomainDialogOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  // Mailcow domain settings
  const [domainQuotaGB, setDomainQuotaGB] = useState(10);
  const [maxQuotaPerMailboxMB, setMaxQuotaPerMailboxMB] = useState(10240);
  const [defaultQuotaPerMailboxMB, setDefaultQuotaPerMailboxMB] = useState(1024);
  const [maxMailboxes, setMaxMailboxes] = useState(0); // 0 = unlimited
  const [rateLimitPerHour, setRateLimitPerHour] = useState(500);
  const [showAdvancedDomain, setShowAdvancedDomain] = useState(false);

  // Domain detail expansion
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  // Delete domain dialog
  const [deleteDomainDialogOpen, setDeleteDomainDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null);
  const [deletingDomain, setDeletingDomain] = useState(false);

  // Add user dialog
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [newUserDomainId, setNewUserDomainId] = useState('');
  const [newUserMailboxStorage, setNewUserMailboxStorage] = useState(5); // GB
  const [newUserDriveStorage, setNewUserDriveStorage] = useState(5); // GB
  const [addingUser, setAddingUser] = useState(false);

  // Delete user dialog
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<OrganizationUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Edit domain dialog
  const [editDomainDialogOpen, setEditDomainDialogOpen] = useState(false);
  const [domainToEdit, setDomainToEdit] = useState<Domain | null>(null);
  const [editDomainQuotaGB, setEditDomainQuotaGB] = useState(10);
  const [editMaxQuotaPerMailboxMB, setEditMaxQuotaPerMailboxMB] = useState(10240);
  const [editDefaultQuotaPerMailboxMB, setEditDefaultQuotaPerMailboxMB] = useState(1024);
  const [editMaxMailboxes, setEditMaxMailboxes] = useState(0);
  const [editRateLimitPerHour, setEditRateLimitPerHour] = useState(500);
  const [editDomainActive, setEditDomainActive] = useState(true);
  const [updatingDomain, setUpdatingDomain] = useState(false);

  // Edit user dialog
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<OrganizationUser | null>(null);
  const [editUserDisplayName, setEditUserDisplayName] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserConfirmPassword, setEditUserConfirmPassword] = useState('');
  const [editUserMailboxStorage, setEditUserMailboxStorage] = useState(5);
  const [editUserDriveStorage, setEditUserDriveStorage] = useState(5);
  const [editUserStatus, setEditUserStatus] = useState<'active' | 'suspended'>('active');
  const [updatingUser, setUpdatingUser] = useState(false);

  // Edit storage dialog
  const [editStorageDialogOpen, setEditStorageDialogOpen] = useState(false);
  const [newStorageGB, setNewStorageGB] = useState(0);
  const [updatingStorage, setUpdatingStorage] = useState(false);

  // Edit billing dialog
  const [editBillingDialogOpen, setEditBillingDialogOpen] = useState(false);
  const [billingForm, setBillingForm] = useState({
    billingEmail: '',
    billingAddress: '',
    gstNumber: '',
  });
  const [updatingBilling, setUpdatingBilling] = useState(false);

  // Hybrid mail toggle
  const [updatingHybridMail, setUpdatingHybridMail] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [orgData, statsData] = await Promise.all([
        api.partner.getOrganizationById.query({ organizationId: id }),
        api.partner.getDashboardStats.query(),
      ]);
      setOrganization(orgData.organization);
      setDomains(orgData.domains || []);
      setUsers(orgData.users || []);
      setPartnerAvailableStorage(statsData.storage.allocated - statsData.storage.used);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      toast.error('Failed to load organization details');
      navigate('/partner/organizations');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const bytesToGB = (bytes: number): number => {
    return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
  };

  const gbToBytes = (gb: number): number => {
    return gb * 1024 * 1024 * 1024;
  };

  const getStoragePercentage = (used: number, total: number) => {
    if (!total) return 0;
    return Math.min((used / total) * 100, 100);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  // =============== Organization Actions ===============

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.partner.deleteOrganization.mutate({ organizationId: id });
      toast.success('Organization deleted successfully');
      navigate('/partner/organizations');
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      toast.error(error.message || 'Failed to delete organization');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleUpdateStorage = async () => {
    if (!id || !organization) return;
    const newStorageBytes = gbToBytes(newStorageGB);
    const currentStorageBytes = organization.totalStorageBytes;
    const difference = newStorageBytes - currentStorageBytes;

    // Check if we have enough storage in pool
    if (difference > 0 && difference > partnerAvailableStorage + currentStorageBytes) {
      toast.error('Insufficient storage in your pool');
      return;
    }

    setUpdatingStorage(true);
    try {
      await api.partner.updateOrganization.mutate({
        organizationId: id,
        totalStorageBytes: newStorageBytes,
      });
      toast.success('Storage updated successfully');
      setEditStorageDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update storage');
    } finally {
      setUpdatingStorage(false);
    }
  };

  const handleUpdateBilling = async () => {
    if (!id) return;
    setUpdatingBilling(true);
    try {
      await api.partner.updateOrganization.mutate({
        organizationId: id,
        billingEmail: billingForm.billingEmail || undefined,
        billingAddress: billingForm.billingAddress || undefined,
        gstNumber: billingForm.gstNumber || undefined,
      });
      toast.success('Billing information updated');
      setEditBillingDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update billing information');
    } finally {
      setUpdatingBilling(false);
    }
  };

  const handleToggleHybridMail = async (enabled: boolean) => {
    if (!id) return;
    setUpdatingHybridMail(true);
    try {
      await api.partner.updateOrganization.mutate({
        organizationId: id,
        hybridMailEnabled: enabled,
      });
      setOrganization((prev) => (prev ? { ...prev, hybridMailEnabled: enabled } : null));
      toast.success(enabled ? 'Hybrid mail enabled' : 'Hybrid mail disabled');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update hybrid mail setting');
    } finally {
      setUpdatingHybridMail(false);
    }
  };

  // =============== Domain Actions ===============

  const handleAddDomain = async () => {
    if (!id || !newDomainName.trim()) return;

    // Check if organization has enough storage for domain quota
    const domainQuotaBytes = domainQuotaGB * 1024 * 1024 * 1024;
    if (organization && domainQuotaBytes > organization.totalStorageBytes - organization.usedStorageBytes) {
      toast.error('Insufficient storage in organization for this domain quota');
      return;
    }

    setAddingDomain(true);
    try {
      await api.partner.createDomain.mutate({
        organizationId: id,
        domainName: newDomainName.trim().toLowerCase(),
        domainQuotaGB,
        maxQuotaPerMailboxMB,
        defaultQuotaPerMailboxMB,
        maxMailboxes,
        rateLimitPerHour,
      });
      toast.success('Domain added successfully');
      setAddDomainDialogOpen(false);
      // Reset form
      setNewDomainName('');
      setDomainQuotaGB(10);
      setMaxQuotaPerMailboxMB(10240);
      setDefaultQuotaPerMailboxMB(1024);
      setMaxMailboxes(0);
      setRateLimitPerHour(500);
      setShowAdvancedDomain(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add domain');
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;
    setDeletingDomain(true);
    try {
      await api.partner.deleteDomain.mutate({ domainId: domainToDelete.id });
      toast.success('Domain deleted successfully');
      setDeleteDomainDialogOpen(false);
      setDomainToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete domain');
    } finally {
      setDeletingDomain(false);
    }
  };

  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);

  const handleVerifyDomainDns = async (domainId: string) => {
    setVerifyingDomain(domainId);
    try {
      const result = await api.partner.verifyDomainDns.mutate({ domainId });
      if (result.verified) {
        toast.success('Domain DNS verified successfully! Domain is now active.');
      } else {
        const failedRecords = [];
        if (!result.results.mx.verified) failedRecords.push('MX');
        if (!result.results.spf.verified) failedRecords.push('SPF');
        if (!result.results.dkim.verified) failedRecords.push('DKIM');
        if (!result.results.dmarc.verified) failedRecords.push('DMARC');
        toast.error(`DNS verification incomplete. Missing: ${failedRecords.join(', ')}`);
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify DNS records');
    } finally {
      setVerifyingDomain(null);
    }
  };

  // =============== User Actions ===============

  const handleAddUser = async () => {
    if (!id || !newUserEmail.trim() || !newUserDomainId) return;

    // Validate password
    if (!newUserPassword || newUserPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newUserPassword !== newUserConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const selectedDomain = domains.find((d) => d.id === newUserDomainId);
    if (!selectedDomain) {
      toast.error('Please select a domain');
      return;
    }

    // Check domain is active
    if (selectedDomain.status !== 'active') {
      toast.error('Selected domain is not active. Please verify DNS first.');
      return;
    }

    const emailLocal = newUserEmail.trim().toLowerCase();
    const fullEmail = `${emailLocal}@${selectedDomain.domainName}`;
    const totalUserStorage = gbToBytes(newUserMailboxStorage + newUserDriveStorage);

    // Check if we have enough storage
    if (organization && totalUserStorage > organization.totalStorageBytes - organization.usedStorageBytes) {
      toast.error('Insufficient storage allocated to this organization');
      return;
    }

    setAddingUser(true);
    try {
      await api.partner.createUser.mutate({
        organizationId: id,
        domainId: newUserDomainId,
        emailAddress: fullEmail,
        displayName: newUserDisplayName.trim() || undefined,
        password: newUserPassword,
        mailboxStorageBytes: gbToBytes(newUserMailboxStorage),
        driveStorageBytes: gbToBytes(newUserDriveStorage),
      });
      toast.success('User created successfully! They can now login with their email and password.');
      setAddUserDialogOpen(false);
      // Reset form
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserPassword('');
      setNewUserConfirmPassword('');
      setNewUserDomainId('');
      setNewUserMailboxStorage(5);
      setNewUserDriveStorage(5);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      await api.partner.deleteUser.mutate({ userId: userToDelete.id });
      toast.success('User deleted successfully');
      setDeleteUserDialogOpen(false);
      setUserToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  // =============== Edit Domain ===============

  const openEditDomainDialog = (domain: Domain) => {
    setDomainToEdit(domain);
    // TODO: We'd need domain details from backend to populate these
    // For now using defaults - ideally fetch from domain record
    setEditDomainQuotaGB(10);
    setEditMaxQuotaPerMailboxMB(10240);
    setEditDefaultQuotaPerMailboxMB(1024);
    setEditMaxMailboxes(0);
    setEditRateLimitPerHour(500);
    setEditDomainActive(domain.status === 'active');
    setEditDomainDialogOpen(true);
  };

  const handleUpdateDomain = async () => {
    if (!domainToEdit) return;
    setUpdatingDomain(true);
    try {
      await api.partner.updateDomain.mutate({
        domainId: domainToEdit.id,
        domainQuotaGB: editDomainQuotaGB,
        maxQuotaPerMailboxMB: editMaxQuotaPerMailboxMB,
        defaultQuotaPerMailboxMB: editDefaultQuotaPerMailboxMB,
        maxMailboxes: editMaxMailboxes,
        rateLimitPerHour: editRateLimitPerHour,
        mailcowActive: editDomainActive,
      });
      toast.success('Domain updated successfully');
      setEditDomainDialogOpen(false);
      setDomainToEdit(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update domain');
    } finally {
      setUpdatingDomain(false);
    }
  };

  // =============== Edit User ===============

  const openEditUserDialog = (user: OrganizationUser) => {
    setUserToEdit(user);
    setEditUserDisplayName(user.displayName || '');
    setEditUserPassword('');
    setEditUserConfirmPassword('');
    setEditUserMailboxStorage(Math.round(user.mailboxStorageBytes / (1024 * 1024 * 1024)));
    setEditUserDriveStorage(Math.round(user.driveStorageBytes / (1024 * 1024 * 1024)));
    setEditUserStatus(user.status === 'suspended' ? 'suspended' : 'active');
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!userToEdit) return;

    // Validate password if provided
    if (editUserPassword && editUserPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (editUserPassword && editUserPassword !== editUserConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setUpdatingUser(true);
    try {
      await api.partner.updateUser.mutate({
        userId: userToEdit.id,
        displayName: editUserDisplayName || undefined,
        password: editUserPassword || undefined,
        mailboxStorageBytes: editUserMailboxStorage * 1024 * 1024 * 1024,
        driveStorageBytes: editUserDriveStorage * 1024 * 1024 * 1024,
        status: editUserStatus,
      });
      toast.success('User updated successfully');
      setEditUserDialogOpen(false);
      setUserToEdit(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update user');
    } finally {
      setUpdatingUser(false);
    }
  };

  // =============== Render ===============

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

  if (!organization) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Organization not found</p>
      </div>
    );
  }

  const storagePercentage = getStoragePercentage(
    organization.usedStorageBytes,
    organization.totalStorageBytes
  );

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      dns_pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return styles[status] || styles.pending;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/partner/organizations')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Organizations
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                {organization.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {organization.name}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Created {new Date(organization.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Organization
          </Button>
        </div>
      </div>

      {/* Status Badge */}
      {!organization.isActive && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300 font-medium">
            This organization is suspended
          </p>
          {organization.suspensionReason && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">
              Reason: {organization.suspensionReason}
            </p>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Users */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">Users</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{users.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Email accounts</p>
        </div>

        {/* Domains */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Globe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">Domains</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{domains.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connected domains</p>
        </div>

        {/* Storage */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <HardDrive className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">Storage</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewStorageGB(bytesToGB(organization.totalStorageBytes));
                setEditStorageDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatBytes(organization.usedStorageBytes)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            of {formatBytes(organization.totalStorageBytes)} allocated
          </p>
          <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
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
      </div>

      {/* Hybrid Mail Option */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <ExternalLink className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Hybrid Mail Solution</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Keep some emails on Google Workspace or Office 365, and remaining on Nubo
              </p>
            </div>
          </div>
          <Switch
            checked={organization.hybridMailEnabled || false}
            onCheckedChange={handleToggleHybridMail}
            disabled={updatingHybridMail}
          />
        </div>
        {organization.hybridMailEnabled && (
          <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
              <p className="text-sm text-orange-700 dark:text-orange-300">
                When adding users, you can choose whether their mailbox should be on Nubo or an
                external provider (Google Workspace / Office 365). Configure external IMAP/SMTP
                settings per user.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Domains Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Domains</h3>
          <Button onClick={() => setAddDomainDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Domain
          </Button>
        </div>
        {domains.length === 0 ? (
          <div className="text-center py-8">
            <Globe className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No domains configured yet</p>
            <Button onClick={() => setAddDomainDialogOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Domain
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => (
              <div key={domain.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {domain.domainName}
                    </span>
                    {domain.isPrimary && (
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn('px-2 py-1 rounded text-xs font-medium', getStatusBadge(domain.status))}>
                      {domain.status === 'dns_pending' ? 'DNS Pending' : domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDomainDialog(domain);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDomainToDelete(domain);
                        setDeleteDomainDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {expandedDomain === domain.id ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {expandedDomain === domain.id && (
                  <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="mt-4 space-y-4">
                      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Configure the following DNS records with your domain provider to verify ownership and enable email delivery.
                        </p>
                      </div>

                      {/* Required Records Header */}
                      <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Required Records</h4>
                      </div>

                      {/* MX Records */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            MX Records
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded">Required</span>
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                            <code className="text-sm text-gray-900 dark:text-white">
                              @ MX mx1.nubo.email (Priority: 10)
                            </code>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard('mx1.nubo.email')}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                            <code className="text-sm text-gray-900 dark:text-white">
                              @ MX mx2.nubo.email (Priority: 20)
                            </code>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard('mx2.nubo.email')}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* SPF Record */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            SPF Record (TXT)
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded">Required</span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('v=spf1 a mx ip4:46.224.135.53 ip6:2a01:4f8:c013:fd93::1 include:mailchannels.net -all')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="text-sm text-gray-900 dark:text-white block p-2 bg-white dark:bg-gray-800 rounded border break-all">
                          v=spf1 a mx ip4:46.224.135.53 ip6:2a01:4f8:c013:fd93::1 include:mailchannels.net -all
                        </code>
                      </div>

                      {/* DKIM Record */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            DKIM Record (TXT) - dkim._domainkey
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded">Required</span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(domain.dkimRecord || 'Contact admin for DKIM key')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="text-sm text-gray-900 dark:text-white block p-2 bg-white dark:bg-gray-800 rounded border break-all">
                          {domain.dkimRecord || 'DKIM key will be generated after domain verification'}
                        </code>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                          Note: DKIM key is generated after domain verification. Contact support if you need the key.
                        </p>
                      </div>

                      {/* DMARC Record */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            DMARC Record (TXT) - _dmarc
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded">Required</span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email; ruf=mailto:dmarc@nubo.email; fo=1; pct=100')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="text-sm text-gray-900 dark:text-white block p-2 bg-white dark:bg-gray-800 rounded border break-all">
                          v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email; ruf=mailto:dmarc@nubo.email; fo=1; pct=100
                        </code>
                      </div>

                      {/* Optional Records Header */}
                      <div className="border-b border-gray-200 dark:border-gray-700 pb-2 mt-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Optional Records (Recommended)</h4>
                      </div>

                      {/* Autodiscover */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            Autodiscover (CNAME)
                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded">Optional</span>
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard('autodiscover.nubo.email')}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="text-sm text-gray-900 dark:text-white block p-2 bg-white dark:bg-gray-800 rounded border">
                          autodiscover CNAME autodiscover.nubo.email
                        </code>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Enables automatic configuration for Outlook/Exchange
                        </p>
                      </div>

                      {/* Autoconfig */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            Autoconfig (CNAME)
                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded">Optional</span>
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard('autoconfig.nubo.email')}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="text-sm text-gray-900 dark:text-white block p-2 bg-white dark:bg-gray-800 rounded border">
                          autoconfig CNAME autoconfig.nubo.email
                        </code>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Enables automatic configuration for Thunderbird and other clients
                        </p>
                      </div>

                      {/* Custom Mail Server Option */}
                      <div className="border-b border-gray-200 dark:border-gray-700 pb-2 mt-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Alternative: Custom Mail Server</h4>
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                          If you want to use your own mail server instead:
                        </p>
                        <div className="space-y-1 text-xs font-mono text-amber-700 dark:text-amber-300">
                          <p>@ MX mail.{domain.domainName} (Priority: 10)</p>
                          <p>mail A YOUR_SERVER_IP</p>
                        </div>
                      </div>

                      {!domain.dnsVerified && (
                        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                              DNS records are pending verification. Once you've added these records, click the button below to verify.
                            </p>
                            <Button
                              onClick={() => handleVerifyDomainDns(domain.id)}
                              disabled={verifyingDomain === domain.id}
                              size="sm"
                            >
                              {verifyingDomain === domain.id ? 'Verifying...' : 'Verify DNS Records'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users/Email Accounts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Email Accounts</h3>
          <Button
            onClick={() => setAddUserDialogOpen(true)}
            size="sm"
            disabled={domains.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
        {users.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No email accounts yet</p>
            {domains.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add a domain first to create email accounts
              </p>
            ) : (
              <Button onClick={() => setAddUserDialogOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add First User
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Display Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Storage
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const totalStorage = user.mailboxStorageBytes + user.driveStorageBytes;
                  const usedStorage = user.mailboxUsedBytes + user.driveUsedBytes;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="py-3 px-4">
                        <span className="text-gray-900 dark:text-white font-medium">
                          {user.emailAddress}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                        {user.displayName || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-gray-600 dark:text-gray-400">
                          {formatBytes(usedStorage)} / {formatBytes(totalStorage)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium', getStatusBadge(user.status))}>
                          {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditUserDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            setUserToDelete(user);
                            setDeleteUserDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Billing Information */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Billing Information</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBillingForm({
                billingEmail: organization.billingEmail || '',
                billingAddress: organization.billingAddress || '',
                gstNumber: organization.gstNumber || '',
              });
              setEditBillingDialogOpen(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-500 dark:text-gray-400">Billing Email</Label>
            <p className="text-gray-900 dark:text-white">
              {organization.billingEmail || 'Not set'}
            </p>
          </div>
          <div>
            <Label className="text-gray-500 dark:text-gray-400">GST Number</Label>
            <p className="text-gray-900 dark:text-white">{organization.gstNumber || 'Not set'}</p>
          </div>
          <div className="md:col-span-2">
            <Label className="text-gray-500 dark:text-gray-400">Billing Address</Label>
            <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
              {organization.billingAddress || 'Not set'}
            </p>
          </div>
        </div>
      </div>

      {/* ============ DIALOGS ============ */}

      {/* Delete Organization Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{organization.name}</strong>? This action
              cannot be undone. All users, domains, and data associated with this organization will
              be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete Organization'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Domain Dialog */}
      <Dialog open={addDomainDialogOpen} onOpenChange={setAddDomainDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Domain</DialogTitle>
            <DialogDescription>
              Add a new domain to this organization. You'll need to configure DNS records after adding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="domainName">Domain Name</Label>
              <Input
                id="domainName"
                placeholder="example.com"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="domainQuota">Domain Storage Quota (GB)</Label>
              <Input
                id="domainQuota"
                type="number"
                min={1}
                value={domainQuotaGB}
                onChange={(e) => setDomainQuotaGB(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">
                Available: {organization ? formatBytes(organization.totalStorageBytes - organization.usedStorageBytes) : '0'}
              </p>
            </div>

            <div>
              <Label htmlFor="defaultQuota">Default Mailbox Quota (MB)</Label>
              <Input
                id="defaultQuota"
                type="number"
                min={100}
                value={defaultQuotaPerMailboxMB}
                onChange={(e) => setDefaultQuotaPerMailboxMB(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Default storage for new mailboxes</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-500"
              onClick={() => setShowAdvancedDomain(!showAdvancedDomain)}
            >
              {showAdvancedDomain ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
              Advanced Settings
            </Button>

            {showAdvancedDomain && (
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <Label htmlFor="maxQuota">Max Quota Per Mailbox (MB)</Label>
                  <Input
                    id="maxQuota"
                    type="number"
                    min={100}
                    value={maxQuotaPerMailboxMB}
                    onChange={(e) => setMaxQuotaPerMailboxMB(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum storage any mailbox can have</p>
                </div>

                <div>
                  <Label htmlFor="maxMailboxes">Max Mailboxes</Label>
                  <Input
                    id="maxMailboxes"
                    type="number"
                    min={0}
                    value={maxMailboxes}
                    onChange={(e) => setMaxMailboxes(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">0 = unlimited mailboxes</p>
                </div>

                <div>
                  <Label htmlFor="rateLimit">Rate Limit (emails/hour)</Label>
                  <Input
                    id="rateLimit"
                    type="number"
                    min={0}
                    value={rateLimitPerHour}
                    onChange={(e) => setRateLimitPerHour(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Max emails per hour (0 = unlimited)</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDomainDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDomain} disabled={addingDomain || !newDomainName.trim()}>
              {addingDomain ? 'Adding...' : 'Add Domain'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Domain Dialog */}
      <AlertDialog open={deleteDomainDialogOpen} onOpenChange={setDeleteDomainDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{domainToDelete?.domainName}</strong>? All
              email accounts on this domain will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDomain}
              disabled={deletingDomain}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingDomain ? 'Deleting...' : 'Delete Domain'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Email Account</DialogTitle>
            <DialogDescription>
              Create a new email account for this organization. The user will be able to login with their email and password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Domain</Label>
              <Select value={newUserDomainId} onValueChange={setNewUserDomainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.filter(d => d.status === 'active').map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.domainName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {domains.length > 0 && domains.filter(d => d.status === 'active').length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No active domains. Please verify DNS for at least one domain first.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="userEmail">Username (local part)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="userEmail"
                  placeholder="john.doe"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  @{domains.find((d) => d.id === newUserDomainId)?.domainName || 'domain.com'}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="displayName">Full Name</Label>
              <Input
                id="displayName"
                placeholder="John Doe"
                value={newUserDisplayName}
                onChange={(e) => setNewUserDisplayName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="userPassword">Password</Label>
                <Input
                  id="userPassword"
                  type="password"
                  placeholder="Min 8 characters"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Retype password"
                  value={newUserConfirmPassword}
                  onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            {newUserPassword && newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Storage Allocation</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mailboxStorage">Mailbox Storage (GB)</Label>
                  <Input
                    id="mailboxStorage"
                    type="number"
                    min={1}
                    value={newUserMailboxStorage}
                    onChange={(e) => setNewUserMailboxStorage(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Email storage</p>
                </div>
                <div>
                  <Label htmlFor="driveStorage">Drive Storage (GB)</Label>
                  <Input
                    id="driveStorage"
                    type="number"
                    min={0}
                    value={newUserDriveStorage}
                    onChange={(e) => setNewUserDriveStorage(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Nubo Drive storage</p>
                </div>
              </div>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Total allocation: {newUserMailboxStorage + newUserDriveStorage} GB
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Available in organization: {formatBytes(organization.totalStorageBytes - organization.usedStorageBytes)}
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>After creation:</strong> User can login at nubo.email with their email and password.
                Their emails will sync automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={
                addingUser ||
                !newUserEmail.trim() ||
                !newUserDomainId ||
                !newUserPassword ||
                newUserPassword.length < 8 ||
                newUserPassword !== newUserConfirmPassword
              }
            >
              {addingUser ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{userToDelete?.emailAddress}</strong>? All
              emails and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deletingUser}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingUser ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Storage Dialog */}
      <Dialog open={editStorageDialogOpen} onOpenChange={setEditStorageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Storage Allocation</DialogTitle>
            <DialogDescription>
              Adjust the storage allocated to this organization from your partner pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="storageGB">Storage (GB)</Label>
              <Input
                id="storageGB"
                type="number"
                min={bytesToGB(organization.usedStorageBytes)}
                value={newStorageGB}
                onChange={(e) => setNewStorageGB(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Currently used: {formatBytes(organization.usedStorageBytes)}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Available in your pool: {formatBytes(partnerAvailableStorage + organization.totalStorageBytes)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStorageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStorage} disabled={updatingStorage}>
              {updatingStorage ? 'Updating...' : 'Update Storage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Billing Dialog */}
      <Dialog open={editBillingDialogOpen} onOpenChange={setEditBillingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Billing Information</DialogTitle>
            <DialogDescription>Update the billing details for this organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="billingEmail">Billing Email</Label>
              <Input
                id="billingEmail"
                type="email"
                placeholder="billing@example.com"
                value={billingForm.billingEmail}
                onChange={(e) => setBillingForm({ ...billingForm, billingEmail: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                placeholder="22AAAAA0000A1Z5"
                value={billingForm.gstNumber}
                onChange={(e) => setBillingForm({ ...billingForm, gstNumber: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="billingAddress">Billing Address</Label>
              <Textarea
                id="billingAddress"
                placeholder="123 Main St, City, State, PIN"
                value={billingForm.billingAddress}
                onChange={(e) => setBillingForm({ ...billingForm, billingAddress: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBillingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateBilling} disabled={updatingBilling}>
              {updatingBilling ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Domain Dialog */}
      <Dialog open={editDomainDialogOpen} onOpenChange={setEditDomainDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Domain</DialogTitle>
            <DialogDescription>
              Update settings for {domainToEdit?.domainName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editDomainQuota">Domain Storage Quota (GB)</Label>
              <Input
                id="editDomainQuota"
                type="number"
                min={1}
                value={editDomainQuotaGB}
                onChange={(e) => setEditDomainQuotaGB(Number(e.target.value))}
              />
            </div>

            <div>
              <Label htmlFor="editDefaultQuota">Default Mailbox Quota (MB)</Label>
              <Input
                id="editDefaultQuota"
                type="number"
                min={100}
                value={editDefaultQuotaPerMailboxMB}
                onChange={(e) => setEditDefaultQuotaPerMailboxMB(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Default storage for new mailboxes</p>
            </div>

            <div>
              <Label htmlFor="editMaxQuota">Max Quota Per Mailbox (MB)</Label>
              <Input
                id="editMaxQuota"
                type="number"
                min={100}
                value={editMaxQuotaPerMailboxMB}
                onChange={(e) => setEditMaxQuotaPerMailboxMB(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Maximum storage any mailbox can have</p>
            </div>

            <div>
              <Label htmlFor="editMaxMailboxes">Max Mailboxes</Label>
              <Input
                id="editMaxMailboxes"
                type="number"
                min={0}
                value={editMaxMailboxes}
                onChange={(e) => setEditMaxMailboxes(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">0 = unlimited mailboxes</p>
            </div>

            <div>
              <Label htmlFor="editRateLimit">Rate Limit (emails/hour)</Label>
              <Input
                id="editRateLimit"
                type="number"
                min={0}
                value={editRateLimitPerHour}
                onChange={(e) => setEditRateLimitPerHour(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500 mt-1">Max emails per hour (0 = unlimited)</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <Label>Domain Active</Label>
                <p className="text-xs text-gray-500">Enable or disable this domain in Mailcow</p>
              </div>
              <Switch
                checked={editDomainActive}
                onCheckedChange={setEditDomainActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDomainDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDomain} disabled={updatingDomain}>
              {updatingDomain ? 'Updating...' : 'Update Domain'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update settings for {userToEdit?.emailAddress}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editDisplayName">Display Name</Label>
              <Input
                id="editDisplayName"
                placeholder="John Doe"
                value={editUserDisplayName}
                onChange={(e) => setEditUserDisplayName(e.target.value)}
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Change Password (optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editPassword">New Password</Label>
                  <Input
                    id="editPassword"
                    type="password"
                    placeholder="Min 8 characters"
                    value={editUserPassword}
                    onChange={(e) => setEditUserPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="editConfirmPassword">Confirm Password</Label>
                  <Input
                    id="editConfirmPassword"
                    type="password"
                    placeholder="Retype password"
                    value={editUserConfirmPassword}
                    onChange={(e) => setEditUserConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              {editUserPassword && editUserConfirmPassword && editUserPassword !== editUserConfirmPassword && (
                <p className="text-xs text-red-500 mt-2">Passwords do not match</p>
              )}
              <p className="text-xs text-gray-500 mt-2">Leave blank to keep current password</p>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Storage Allocation</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editMailboxStorage">Mailbox Storage (GB)</Label>
                  <Input
                    id="editMailboxStorage"
                    type="number"
                    min={1}
                    value={editUserMailboxStorage}
                    onChange={(e) => setEditUserMailboxStorage(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="editDriveStorage">Drive Storage (GB)</Label>
                  <Input
                    id="editDriveStorage"
                    type="number"
                    min={0}
                    value={editUserDriveStorage}
                    onChange={(e) => setEditUserDriveStorage(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Account Status</h4>
              <Select value={editUserStatus} onValueChange={(v) => setEditUserStatus(v as 'active' | 'suspended')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Suspended users cannot login or send/receive emails</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateUser}
              disabled={
                updatingUser ||
                (editUserPassword !== '' && editUserPassword.length < 8) ||
                (editUserPassword !== '' && editUserPassword !== editUserConfirmPassword)
              }
            >
              {updatingUser ? 'Updating...' : 'Update User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
