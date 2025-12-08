'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  HardDrive,
  Plus,
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface StorageStats {
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  percentage: number;
}

interface PlanVariant {
  id: string;
  name: string;
  displayName: string;
  storageBytes: number;
  retailPriceMonthly: string;
  retailPriceYearly: string;
  partnerPriceMonthly: string;
  partnerPriceYearly: string;
}

export default function PartnerStoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [storageVariants, setStorageVariants] = useState<PlanVariant[]>([]);
  const [tierDiscount, setTierDiscount] = useState(20);
  const [loading, setLoading] = useState(true);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<PlanVariant | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('');
  const [partnerEmail, setPartnerEmail] = useState<string>('');

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    const fetchData = async () => {
      try {
        const [dashboardStats, pricingData, partnerProfile] = await Promise.all([
          api.partner.getDashboardStats.query(),
          api.partner.getPricing.query(),
          api.partner.getPartnerProfile.query(),
        ]);

        // Set partner info
        setPartnerId(partnerProfile.partner.id);
        setPartnerName(partnerProfile.partner.companyName);
        setPartnerEmail(partnerProfile.partner.contactEmail);

        // Set storage stats from dashboard
        const allocated = dashboardStats.storage.allocated;
        const used = dashboardStats.storage.used;
        setStats({
          allocatedBytes: allocated,
          usedBytes: used,
          availableBytes: allocated - used,
          percentage: dashboardStats.storage.percentage,
        });

        // Get storage variants from unlimited_user category (storage pool plans)
        const unlimitedCategory = pricingData.categories.find(
          (c: { name: string }) => c.name === 'unlimited_user'
        );
        if (unlimitedCategory) {
          setStorageVariants(unlimitedCategory.variants);
        }
        setTierDiscount(pricingData.tierDiscount);
      } catch (error) {
        console.error('Failed to fetch storage data:', error);
        toast.error('Failed to load storage data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
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

  const getPrice = (variant: PlanVariant) => {
    return isYearly
      ? Number(variant.partnerPriceYearly)
      : Number(variant.partnerPriceMonthly);
  };

  const getRetailPrice = (variant: PlanVariant) => {
    return isYearly
      ? Number(variant.retailPriceYearly)
      : Number(variant.retailPriceMonthly);
  };

  const handlePurchase = async () => {
    if (!selectedVariant || !partnerId) return;
    setPurchasing(true);

    try {
      // Calculate storage in GB
      const storageSizeGB = selectedVariant.storageBytes / (1024 * 1024 * 1024);
      const priceINR = getPrice(selectedVariant);

      // Create Razorpay order
      const orderData = await api.razorpayB2B.createStorageOrder.mutate({
        partnerId,
        storageSizeGB,
        priceINR,
      });

      // Open Razorpay checkout
      const options = {
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency,
        name: 'Nubo',
        description: `Storage Pool - ${selectedVariant.displayName}`,
        order_id: orderData.orderId,
        prefill: {
          name: partnerName,
          email: partnerEmail,
        },
        theme: {
          color: '#16a34a',
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // Verify payment
            await api.razorpayB2B.verifyPayment.mutate({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              invoiceId: orderData.invoiceId,
            });

            toast.success('Payment successful! Storage has been added to your pool.');
            setPurchaseDialogOpen(false);
            setSelectedVariant(null);

            // Refresh storage stats
            const dashboardStats = await api.partner.getDashboardStats.query();
            const allocated = dashboardStats.storage.allocated;
            const used = dashboardStats.storage.used;
            setStats({
              allocatedBytes: allocated,
              usedBytes: used,
              availableBytes: allocated - used,
              percentage: dashboardStats.storage.percentage,
            });
          } catch (error: any) {
            console.error('Payment verification failed:', error);
            toast.error(error.message || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => {
            setPurchasing(false);
            toast.info('Payment cancelled');
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      console.error('Failed to create order:', error);
      toast.error(error.message || 'Failed to create payment order');
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              <span>{tierDiscount}% Partner discount</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <Label
                htmlFor="billing-toggle"
                className={cn(
                  'px-3 py-1 rounded-md text-sm cursor-pointer transition-colors',
                  !isYearly
                    ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                )}
                onClick={() => setIsYearly(false)}
              >
                Monthly
              </Label>
              <Switch
                id="billing-toggle"
                checked={isYearly}
                onCheckedChange={setIsYearly}
                className="data-[state=checked]:bg-green-600"
              />
              <Label
                htmlFor="billing-toggle"
                className={cn(
                  'px-3 py-1 rounded-md text-sm cursor-pointer transition-colors',
                  isYearly
                    ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                )}
                onClick={() => setIsYearly(true)}
              >
                Yearly
              </Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {storageVariants.map((variant, index) => {
            const isPopular = index === Math.floor(storageVariants.length / 2);
            return (
            <div
              key={variant.id}
              className={cn(
                'relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-6 transition-all cursor-pointer hover:shadow-md',
                isPopular
                  ? 'border-green-500 ring-2 ring-green-500'
                  : 'border-gray-200 dark:border-gray-700',
                selectedVariant?.id === variant.id && 'ring-2 ring-green-500'
              )}
              onClick={() => setSelectedVariant(variant)}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                  Popular
                </span>
              )}
              <div className="text-center">
                <HardDrive className="h-8 w-8 text-purple-500 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {variant.displayName}
                </h3>
                <p className="text-sm text-gray-400 line-through mb-1">
                  {formatCurrency(getRetailPrice(variant))}
                </p>
                <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(getPrice(variant))}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  per {isYearly ? 'year' : 'month'}
                </p>
              </div>
              {selectedVariant?.id === variant.id && (
                <div className="absolute top-2 right-2">
                  <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>

        {storageVariants.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No storage plans available
          </div>
        )}

        {selectedVariant && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => setPurchaseDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Purchase {selectedVariant.displayName} for {formatCurrency(getPrice(selectedVariant))}/{isYearly ? 'yr' : 'mo'}
            </Button>
          </div>
        )}
      </div>

      {/* Purchase Confirmation Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Storage Purchase</DialogTitle>
            <DialogDescription>
              You are about to purchase additional storage for your partner account.
            </DialogDescription>
          </DialogHeader>
          {selectedVariant && (
            <div className="py-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Storage</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedVariant.displayName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Billing</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {isYearly ? 'Yearly' : 'Monthly'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Retail Price</span>
                  <span className="text-gray-400 line-through">
                    {formatCurrency(getRetailPrice(selectedVariant))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Partner Discount ({tierDiscount}%)</span>
                  <span className="text-green-600 dark:text-green-400">
                    -{formatCurrency(getRetailPrice(selectedVariant) - getPrice(selectedVariant))}
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-3 flex justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">Total</span>
                  <span className="font-bold text-xl text-gray-900 dark:text-white">
                    {formatCurrency(getPrice(selectedVariant))}/{isYearly ? 'yr' : 'mo'}
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
