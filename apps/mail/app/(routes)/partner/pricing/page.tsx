import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Check,
  HardDrive,
  Users,
  Archive,
  TrendingUp,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface PricingData {
  discount: number;
  tierName: string;
  categories: Array<{
    id: string;
    name: string;
    displayName: string;
    description: string;
    variants: Array<{
      id: string;
      name: string;
      displayName: string;
      features: string[];
      prices: {
        INR: { monthly: number; yearly: number };
        USD: { monthly: number; yearly: number };
      };
      discountedPrices: {
        INR: { monthly: number; yearly: number };
        USD: { monthly: number; yearly: number };
      };
    }>;
  }>;
  storagePricing: Array<{
    sizeGB: number;
    priceINR: number;
    discountedPrice: number;
  }>;
}

export default function PartnerPricingPage() {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const data = await api.partner.getPricing.query();
        setPricing(data);
      } catch (error) {
        console.error('Failed to fetch pricing:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
  }, []);

  const formatCurrency = (amount: number, curr: string = 'INR'): string => {
    return new Intl.NumberFormat(curr === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryIcon = (name: string) => {
    switch (name) {
      case 'unlimited_user':
        return Users;
      case 'limited_user':
        return Users;
      case 'archival':
        return Archive;
      default:
        return HardDrive;
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pricing</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              View partner pricing for all plans and services
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300 font-medium">
              {pricing?.discount}% Partner Discount ({pricing?.tierName})
            </span>
          </div>
        </div>
      </div>

      {/* Currency & Billing Toggle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Currency:</span>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setCurrency('INR')}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                  currency === 'INR'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                )}
              >
                INR
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                  currency === 'USD'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                )}
              >
                USD
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Billing:</span>
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                billingPeriod === 'monthly'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                billingPeriod === 'yearly'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              Yearly
              <span className="ml-1 text-xs text-green-600 dark:text-green-400">(Save 20%)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Plan Categories */}
      <Tabs defaultValue={pricing?.categories[0]?.name} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          {pricing?.categories.map((category) => {
            const Icon = getCategoryIcon(category.name);
            return (
              <TabsTrigger key={category.id} value={category.name} className="gap-2">
                <Icon className="h-4 w-4" />
                {category.displayName}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {pricing?.categories.map((category) => (
          <TabsContent key={category.id} value={category.name}>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{category.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {category.variants.map((variant, index) => {
                const prices = variant.prices[currency];
                const discountedPrices = variant.discountedPrices[currency];
                const price = billingPeriod === 'monthly' ? prices.monthly : prices.yearly;
                const discountedPrice =
                  billingPeriod === 'monthly'
                    ? discountedPrices.monthly
                    : discountedPrices.yearly;
                const isPopular = index === 1;

                return (
                  <div
                    key={variant.id}
                    className={cn(
                      'relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-6',
                      isPopular
                        ? 'border-green-500 ring-2 ring-green-500'
                        : 'border-gray-200 dark:border-gray-700'
                    )}
                  >
                    {isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                        Most Popular
                      </span>
                    )}

                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {variant.displayName}
                    </h3>

                    <div className="mt-4 mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(discountedPrice, currency)}
                        </span>
                        <span className="text-gray-400 line-through text-sm">
                          {formatCurrency(price, currency)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        per user / {billingPeriod === 'monthly' ? 'month' : 'year'}
                      </p>
                    </div>

                    <ul className="space-y-3">
                      {variant.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Storage Pricing */}
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-6">
          <HardDrive className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Storage Pricing
          </h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>One-time purchase. Storage is added to your partner pool.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {pricing?.storagePricing.map((tier) => (
            <div
              key={tier.sizeGB}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 text-center"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 mb-3">
                <HardDrive className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {tier.sizeGB >= 1000 ? `${tier.sizeGB / 1000} TB` : `${tier.sizeGB} GB`}
              </h3>
              <p className="text-sm text-gray-400 line-through">
                {formatCurrency(tier.priceINR, 'INR')}
              </p>
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(tier.discountedPrice, 'INR')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">one-time</p>
            </div>
          ))}
        </div>
      </div>

      {/* Partner Discount Info */}
      <div className="mt-12 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-100 dark:border-green-800">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
            <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Your Partner Discount
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
              As a <span className="font-medium">{pricing?.tierName}</span>, you receive a{' '}
              <span className="font-bold text-green-600 dark:text-green-400">
                {pricing?.discount}% discount
              </span>{' '}
              on all plans and storage purchases. This discount is automatically applied to all
              your invoices.
            </p>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Entry</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">20%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Bronze</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">25%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Silver</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">30%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Gold</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">35%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
