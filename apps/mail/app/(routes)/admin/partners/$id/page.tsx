'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  HardDrive,
  CreditCard,
  Globe,
  Mail,
  Phone,
  TrendingUp,
  Pencil,
  Ban,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const tierBadgeColors: Record<string, string> = {
  entry: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  bronze: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  silver: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200',
  gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

const tierDisplayNames: Record<string, string> = {
  entry: 'Entry Partner',
  bronze: 'Bronze Partner',
  silver: 'Silver Partner',
  gold: 'Gold Partner',
};

interface Partner {
  id: string;
  userId: string;
  companyName: string;
  companyWebsite: string | null;
  companyAddress: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  tierName: string;
  allocatedStorageBytes: number;
  usedStorageBytes: number;
  isActive: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  createdAt: Date;
  organizationsCount?: number;
  usersCount?: number;
}

export default function AdminPartnerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editTierDialogOpen, setEditTierDialogOpen] = useState(false);
  const [editStorageDialogOpen, setEditStorageDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [newTier, setNewTier] = useState('');
  const [newStorageGB, setNewStorageGB] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    const fetchPartner = async () => {
      if (!id) return;
      try {
        const data = await api.admin.getPartnerById.query({ partnerId: id });
        setPartner(data.partner);
        setOrganizations(data.organizations || []);
      } catch (error) {
        console.error('Failed to fetch partner:', error);
        toast.error('Failed to load partner details');
      } finally {
        setLoading(false);
      }
    };
    fetchPartner();
  }, [id]);

  const handleUpdateTier = async () => {
    if (!partner || !newTier) return;
    try {
      await api.admin.updatePartnerTierById.mutate({
        partnerId: partner.id,
        tierName: newTier,
      });
      setPartner({ ...partner, tierName: newTier });
      setEditTierDialogOpen(false);
      toast.success('Partner tier updated');
    } catch (error) {
      console.error('Failed to update tier:', error);
      toast.error('Failed to update tier');
    }
  };

  const handleUpdateStorage = async () => {
    if (!partner || !newStorageGB) return;
    try {
      const bytes = parseFloat(newStorageGB) * 1024 * 1024 * 1024;
      await api.admin.updatePartnerStorage.mutate({
        partnerId: partner.id,
        storageBytes: bytes,
      });
      setPartner({ ...partner, allocatedStorageBytes: bytes });
      setEditStorageDialogOpen(false);
      toast.success('Partner storage updated');
    } catch (error) {
      console.error('Failed to update storage:', error);
      toast.error('Failed to update storage');
    }
  };

  const handleSuspend = async () => {
    if (!partner) return;
    try {
      await api.admin.suspendPartner.mutate({
        partnerId: partner.id,
        reason: suspensionReason,
      });
      setPartner({ ...partner, isActive: false, suspensionReason });
      setSuspendDialogOpen(false);
      setSuspensionReason('');
      toast.success('Partner suspended');
    } catch (error) {
      console.error('Failed to suspend partner:', error);
      toast.error('Failed to suspend partner');
    }
  };

  const handleActivate = async () => {
    if (!partner) return;
    try {
      await api.admin.activatePartner.mutate({ partnerId: partner.id });
      setPartner({ ...partner, isActive: true, suspensionReason: null, suspendedAt: null });
      toast.success('Partner activated');
    } catch (error) {
      console.error('Failed to activate partner:', error);
      toast.error('Failed to activate partner');
    }
  };

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
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Partner not found</h2>
          <Button variant="outline" onClick={() => navigate('/admin/partners')} className="mt-4">
            Back to Partners
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/partners')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Partner Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {partner.companyName}
                </h1>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-sm font-medium',
                    tierBadgeColors[partner.tierName || 'entry']
                  )}
                >
                  {tierDisplayNames[partner.tierName || 'entry']}
                </span>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-sm font-medium',
                    partner.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  )}
                >
                  {partner.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                {partner.companyWebsite && (
                  <a href={partner.companyWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                    <Globe className="h-4 w-4" />
                    {partner.companyWebsite}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {partner.contactEmail}
                </span>
                {partner.contactPhone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {partner.contactPhone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {partner.isActive ? (
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
              <Building2 className="h-4 w-4" />
              Organizations
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {organizations.length}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <HardDrive className="h-4 w-4" />
              Storage
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatBytes(partner.usedStorageBytes)} / {formatBytes(partner.allocatedStorageBytes)}
            </p>
            <Button variant="link" size="sm" className="p-0 h-auto mt-1" onClick={() => {
              setNewStorageGB((partner.allocatedStorageBytes / (1024 * 1024 * 1024)).toString());
              setEditStorageDialogOpen(true);
            }}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <TrendingUp className="h-4 w-4" />
              Partner Tier
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 capitalize">
              {partner.tierName || 'Entry'}
            </p>
            <Button variant="link" size="sm" className="p-0 h-auto mt-1" onClick={() => {
              setNewTier(partner.tierName || 'entry');
              setEditTierDialogOpen(true);
            }}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <CreditCard className="h-4 w-4" />
              GST Number
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mt-1">
              {partner.gstNumber || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Contact & Address */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Contact Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Contact Name</p>
              <p className="text-gray-900 dark:text-white">{partner.contactName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
              <p className="text-gray-900 dark:text-white">{partner.contactEmail}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
              <p className="text-gray-900 dark:text-white">{partner.contactPhone || '-'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Business Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Address</p>
              <p className="text-gray-900 dark:text-white">{partner.companyAddress || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">GST Number</p>
              <p className="text-gray-900 dark:text-white">{partner.gstNumber || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">PAN Number</p>
              <p className="text-gray-900 dark:text-white">{partner.panNumber || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Organizations */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Organizations</h2>
        {organizations.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No organizations created yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Storage</th>
                <th className="text-left py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <td className="py-3 text-gray-900 dark:text-white">{org.name}</td>
                  <td className="py-3 text-gray-900 dark:text-white">
                    {formatBytes(org.usedStorageBytes || 0)} / {formatBytes(org.totalStorageBytes || 0)}
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      org.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    )}>
                      {org.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Tier Dialog */}
      <Dialog open={editTierDialogOpen} onOpenChange={setEditTierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Partner Tier</DialogTitle>
            <DialogDescription>Change the partner tier to adjust their discount rate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Partner Tier</Label>
              <Select value={newTier} onValueChange={setNewTier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry (20% discount)</SelectItem>
                  <SelectItem value="bronze">Bronze (25% discount)</SelectItem>
                  <SelectItem value="silver">Silver (30% discount)</SelectItem>
                  <SelectItem value="gold">Gold (35% discount)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTierDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateTier}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Storage Dialog */}
      <Dialog open={editStorageDialogOpen} onOpenChange={setEditStorageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Storage Allocation</DialogTitle>
            <DialogDescription>Adjust the storage allocation for this partner.</DialogDescription>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Partner</DialogTitle>
            <DialogDescription>
              This will suspend the partner and all their organizations. Please provide a reason.
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
              Suspend Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
