import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  HardDrive,
  Plus,
  Building2,
  TrendingUp,
  ShoppingCart,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface StorageStats {
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  percentage: number;
  organizationBreakdown: Array<{
    id: string;
    name: string;
    allocatedBytes: number;
    usedBytes: number;
  }>;
}

interface PricingTier {
  id: string;
  sizeGB: number;
  priceINR: number;
  discountedPrice: number;
  popular?: boolean;
}

export default function PartnerStoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData] = await Promise.all([
          // Mock storage stats until we add the endpoint
          Promise.resolve({
            allocatedBytes: 100 * 1024 * 1024 * 1024, // 100 GB
            usedBytes: 45 * 1024 * 1024 * 1024, // 45 GB
            availableBytes: 55 * 1024 * 1024 * 1024, // 55 GB
            percentage: 45,
            organizationBreakdown: [],
          }),
          api.partner.getDashboardStats.query(),
        ]);
        setStats(statsData);

        // Mock pricing tiers
        setPricing([
          { id: '1', sizeGB: 50, priceINR: 5000, discountedPrice: 4000 },
          { id: '2', sizeGB: 100, priceINR: 9000, discountedPrice: 7200, popular: true },
          { id: '3', sizeGB: 250, priceINR: 20000, discountedPrice: 16000 },
          { id: '4', sizeGB: 500, priceINR: 35000, discountedPrice: 28000 },
          { id: '5', sizeGB: 1000, priceINR: 60000, discountedPrice: 48000 },
        ]);
      } catch (error) {
        console.error('Failed to fetch storage data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePurchase = async () => {
    if (!selectedTier) return;
    setPurchasing(true);
    try {
      await api.partner.requestStoragePurchase.mutate({
        storageBytesRequested: selectedTier.sizeGB * 1024 * 1024 * 1024,
      });
      toast.success('Storage purchase request submitted');
      setPurchaseDialogOpen(false);
      setSelectedTier(null);
    } catch (error: any) {
      console.error('Failed to purchase storage:', error);
      toast.error(error.message || 'Failed to process purchase');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Storage Pool</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your storage allocation and purchase additional capacity
        </p>
      </div>

      {/* Storage Overview Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-xl">
              <HardDrive className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Total Storage Pool
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {formatBytes(stats?.usedBytes ?? 0)} used of {formatBytes(stats?.allocatedBytes ?? 0)}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setPurchaseDialogOpen(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Buy More Storage
          </Button>
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
                    : 'bg-green-500'
              )}
              style={{ width: `${Math.max(stats?.percentage ?? 0, 5)}%` }}
            >
              {(stats?.percentage ?? 0) >= 20 && (
                <span className="text-xs font-medium text-white">
                  {stats?.percentage.toFixed(1)}%
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
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
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
      </div>

      {/* Storage Pricing */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Purchase Storage
          </h2>
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <TrendingUp className="h-4 w-4" />
            <span>Partner discount applied</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {pricing.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                'relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-6 transition-all cursor-pointer hover:shadow-md',
                tier.popular
                  ? 'border-green-500 ring-2 ring-green-500'
                  : 'border-gray-200 dark:border-gray-700',
                selectedTier?.id === tier.id && 'ring-2 ring-green-500'
              )}
              onClick={() => setSelectedTier(tier)}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                  Popular
                </span>
              )}
              <div className="text-center">
                <HardDrive className="h-8 w-8 text-purple-500 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {tier.sizeGB >= 1000 ? `${tier.sizeGB / 1000} TB` : `${tier.sizeGB} GB`}
                </h3>
                <p className="text-sm text-gray-400 line-through mb-1">
                  {formatCurrency(tier.priceINR)}
                </p>
                <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(tier.discountedPrice)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">one-time</p>
              </div>
              {selectedTier?.id === tier.id && (
                <div className="absolute top-2 right-2">
                  <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedTier && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => setPurchaseDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Purchase {selectedTier.sizeGB >= 1000 ? `${selectedTier.sizeGB / 1000} TB` : `${selectedTier.sizeGB} GB`} for {formatCurrency(selectedTier.discountedPrice)}
            </Button>
          </div>
        )}
      </div>

      {/* Organization Breakdown */}
      {stats?.organizationBreakdown && stats.organizationBreakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Storage by Organization
          </h2>
          <div className="space-y-4">
            {stats.organizationBreakdown.map((org) => {
              const percentage =
                org.allocatedBytes > 0
                  ? (org.usedBytes / org.allocatedBytes) * 100
                  : 0;

              return (
                <div key={org.id} className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {org.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatBytes(org.usedBytes)} / {formatBytes(org.allocatedBytes)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Purchase Confirmation Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Storage Purchase</DialogTitle>
            <DialogDescription>
              You are about to purchase additional storage for your partner account.
            </DialogDescription>
          </DialogHeader>
          {selectedTier && (
            <div className="py-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Storage</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedTier.sizeGB >= 1000
                      ? `${selectedTier.sizeGB / 1000} TB`
                      : `${selectedTier.sizeGB} GB`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Original Price</span>
                  <span className="text-gray-400 line-through">
                    {formatCurrency(selectedTier.priceINR)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Partner Discount</span>
                  <span className="text-green-600 dark:text-green-400">
                    -{formatCurrency(selectedTier.priceINR - selectedTier.discountedPrice)}
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-3 flex justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">Total</span>
                  <span className="font-bold text-xl text-gray-900 dark:text-white">
                    {formatCurrency(selectedTier.discountedPrice)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  + 18% GST applicable
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePurchase}
              disabled={purchasing}
              className="bg-green-600 hover:bg-green-700"
            >
              {purchasing ? 'Processing...' : 'Proceed to Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
