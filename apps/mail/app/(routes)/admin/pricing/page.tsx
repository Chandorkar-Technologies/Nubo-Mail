'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

interface PlanCategory {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanVariant {
  id: string;
  categoryId: string;
  name: string;
  displayName: string;
  storageBytes: number;
  retailPriceMonthly: string;
  retailPriceYearly: string;
  partnerPriceMonthly: string;
  partnerPriceYearly: string;
  currency: string | null;
  isActive: boolean | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerTier {
  id: string;
  name: string;
  displayName: string;
  discountPercentage: string;
  minQuarterlySales: string;
  maxQuarterlySales: string | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<PlanVariant[]>([]);
  const [tiers, setTiers] = useState<PartnerTier[]>([]);
  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editTierDialogOpen, setEditTierDialogOpen] = useState(false);
  const [editPlanDialogOpen, setEditPlanDialogOpen] = useState(false);
  const [addPlanDialogOpen, setAddPlanDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PartnerTier | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanVariant | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states for tier
  const [tierForm, setTierForm] = useState({
    displayName: '',
    discountPercentage: '',
    minQuarterlySales: '',
    maxQuarterlySales: '',
  });

  // Form states for plan (edit)
  const [planForm, setPlanForm] = useState({
    displayName: '',
    retailPriceMonthly: '',
    retailPriceYearly: '',
    partnerPriceMonthly: '',
    partnerPriceYearly: '',
    isActive: true,
  });

  // Form states for new plan
  const [newPlanForm, setNewPlanForm] = useState({
    categoryId: '',
    name: '',
    displayName: '',
    storageGb: '',
    retailPriceMonthly: '',
    retailPriceYearly: '',
    partnerPriceMonthly: '',
    partnerPriceYearly: '',
    isActive: true,
  });

  const fetchPricing = async () => {
    try {
      const [plansData, tiersData, categoriesData] = await Promise.all([
        api.admin.getPlanVariants.query({}),
        api.admin.getPartnerTiers.query(),
        api.admin.getPlanCategories.query(),
      ]);
      setPlans(plansData);
      setTiers(tiersData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      toast.error('Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb} GB`;
  };

  const handleEditTier = (tier: PartnerTier) => {
    setSelectedTier(tier);
    setTierForm({
      displayName: tier.displayName,
      discountPercentage: tier.discountPercentage,
      minQuarterlySales: tier.minQuarterlySales,
      maxQuarterlySales: tier.maxQuarterlySales || '',
    });
    setEditTierDialogOpen(true);
  };

  const handleSaveTier = async () => {
    if (!selectedTier) return;
    setSaving(true);
    try {
      await api.admin.updatePartnerTier.mutate({
        id: selectedTier.id,
        displayName: tierForm.displayName,
        discountPercentage: tierForm.discountPercentage,
        minQuarterlySales: tierForm.minQuarterlySales,
        maxQuarterlySales: tierForm.maxQuarterlySales || null,
      });
      toast.success('Partner tier updated successfully');
      setEditTierDialogOpen(false);
      fetchPricing();
    } catch (error) {
      console.error('Failed to update tier:', error);
      toast.error('Failed to update partner tier');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPlan = (plan: PlanVariant) => {
    setSelectedPlan(plan);
    setPlanForm({
      displayName: plan.displayName,
      retailPriceMonthly: plan.retailPriceMonthly,
      retailPriceYearly: plan.retailPriceYearly,
      partnerPriceMonthly: plan.partnerPriceMonthly,
      partnerPriceYearly: plan.partnerPriceYearly,
      isActive: plan.isActive ?? true,
    });
    setEditPlanDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    try {
      await api.admin.updatePlanVariant.mutate({
        id: selectedPlan.id,
        displayName: planForm.displayName,
        retailPriceMonthly: planForm.retailPriceMonthly,
        retailPriceYearly: planForm.retailPriceYearly,
        partnerPriceMonthly: planForm.partnerPriceMonthly,
        partnerPriceYearly: planForm.partnerPriceYearly,
        isActive: planForm.isActive,
      });
      toast.success('Plan variant updated successfully');
      setEditPlanDialogOpen(false);
      fetchPricing();
    } catch (error) {
      console.error('Failed to update plan:', error);
      toast.error('Failed to update plan variant');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePlanStatus = async (plan: PlanVariant) => {
    try {
      await api.admin.updatePlanVariant.mutate({
        id: plan.id,
        isActive: !plan.isActive,
      });
      toast.success(`Plan ${plan.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchPricing();
    } catch (error) {
      console.error('Failed to toggle plan status:', error);
      toast.error('Failed to update plan status');
    }
  };

  const handleOpenAddPlanDialog = () => {
    if (categories.length === 0) {
      toast.error('No plan categories found. Please seed the database first.');
      return;
    }
    setNewPlanForm({
      categoryId: categories[0]?.id || '',
      name: '',
      displayName: '',
      storageGb: '',
      retailPriceMonthly: '',
      retailPriceYearly: '',
      partnerPriceMonthly: '',
      partnerPriceYearly: '',
      isActive: true,
    });
    setAddPlanDialogOpen(true);
  };

  const handleCreatePlan = async () => {
    if (!newPlanForm.categoryId) {
      toast.error('Please select a category');
      return;
    }
    if (!newPlanForm.name || !newPlanForm.displayName || !newPlanForm.storageGb) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createPlanVariant.mutate({
        categoryId: newPlanForm.categoryId,
        name: newPlanForm.name,
        displayName: newPlanForm.displayName,
        storageGb: parseFloat(newPlanForm.storageGb),
        retailPriceMonthly: newPlanForm.retailPriceMonthly || '0',
        retailPriceYearly: newPlanForm.retailPriceYearly || '0',
        partnerPriceMonthly: newPlanForm.partnerPriceMonthly || '0',
        partnerPriceYearly: newPlanForm.partnerPriceYearly || '0',
        isActive: newPlanForm.isActive,
      });
      toast.success('Plan variant created successfully');
      setAddPlanDialogOpen(false);
      fetchPricing();
    } catch (error: any) {
      console.error('Failed to create plan:', error);
      const message = error?.message || 'Failed to create plan variant';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pricing Management</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage plan variants and partner tiers
        </p>
      </div>

      {/* Partner Tiers */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Partner Tiers</h2>
          <Button size="sm" onClick={() => toast.info('Creating new tiers is not yet implemented')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tier
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">{tier.displayName}</h3>
                <Button variant="ghost" size="sm" onClick={() => handleEditTier(tier)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {tier.discountPercentage}%
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Discount</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Min Sales: {formatCurrency(tier.minQuarterlySales)}
                </p>
                {tier.maxQuarterlySales && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Max Sales: {formatCurrency(tier.maxQuarterlySales)}
                  </p>
                )}
              </div>
            </div>
          ))}
          {tiers.length === 0 && (
            <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              No partner tiers configured
            </div>
          )}
        </div>
      </div>

      {/* Plan Variants */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Plan Variants</h2>
          <Button size="sm" onClick={handleOpenAddPlanDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Plan
          </Button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Plan
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Internal Name
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Category
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Storage
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Retail Price
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Partner Price
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
              {plans.map((plan) => {
                const category = categories.find((c) => c.id === plan.categoryId);
                return (
                <tr
                  key={plan.id}
                  className="border-b border-gray-200 dark:border-gray-700 last:border-0"
                >
                  <td className="p-4">
                    <p className="font-medium text-gray-900 dark:text-white">{plan.displayName}</p>
                  </td>
                  <td className="p-4">
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-mono">{plan.name}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-gray-600 dark:text-gray-300">{category?.displayName || plan.categoryId}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-gray-900 dark:text-white">{formatStorage(plan.storageBytes)}</span>
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="text-gray-900 dark:text-white">
                        {formatCurrency(plan.retailPriceMonthly)}/mo
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatCurrency(plan.retailPriceYearly)}/yr
                      </p>
                    </div>
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="text-gray-900 dark:text-white">
                        {formatCurrency(plan.partnerPriceMonthly)}/mo
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatCurrency(plan.partnerPriceYearly)}/yr
                      </p>
                    </div>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleTogglePlanStatus(plan)}
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity',
                        plan.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      )}
                    >
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditPlan(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => toast.info('Deleting plans is not yet implemented')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
              })}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No plans configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Tier Dialog */}
      <Dialog open={editTierDialogOpen} onOpenChange={setEditTierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Partner Tier</DialogTitle>
            <DialogDescription>
              Update the partner tier details and discount percentage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tierDisplayName">Display Name</Label>
              <Input
                id="tierDisplayName"
                value={tierForm.displayName}
                onChange={(e) => setTierForm({ ...tierForm, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tierDiscount">Discount Percentage</Label>
              <Input
                id="tierDiscount"
                type="number"
                value={tierForm.discountPercentage}
                onChange={(e) => setTierForm({ ...tierForm, discountPercentage: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tierMinSales">Minimum Quarterly Sales (INR)</Label>
              <Input
                id="tierMinSales"
                type="number"
                value={tierForm.minQuarterlySales}
                onChange={(e) => setTierForm({ ...tierForm, minQuarterlySales: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tierMaxSales">Maximum Quarterly Sales (INR)</Label>
              <Input
                id="tierMaxSales"
                type="number"
                value={tierForm.maxQuarterlySales}
                onChange={(e) => setTierForm({ ...tierForm, maxQuarterlySales: e.target.value })}
                placeholder="Leave empty for unlimited"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTierDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTier} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={editPlanDialogOpen} onOpenChange={setEditPlanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Plan Variant</DialogTitle>
            <DialogDescription>
              Update the plan pricing and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="planDisplayName">Display Name</Label>
              <Input
                id="planDisplayName"
                value={planForm.displayName}
                onChange={(e) => setPlanForm({ ...planForm, displayName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retailMonthly">Retail Price (Monthly)</Label>
                <Input
                  id="retailMonthly"
                  type="number"
                  value={planForm.retailPriceMonthly}
                  onChange={(e) => setPlanForm({ ...planForm, retailPriceMonthly: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retailYearly">Retail Price (Yearly)</Label>
                <Input
                  id="retailYearly"
                  type="number"
                  value={planForm.retailPriceYearly}
                  onChange={(e) => setPlanForm({ ...planForm, retailPriceYearly: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partnerMonthly">Partner Price (Monthly)</Label>
                <Input
                  id="partnerMonthly"
                  type="number"
                  value={planForm.partnerPriceMonthly}
                  onChange={(e) => setPlanForm({ ...planForm, partnerPriceMonthly: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partnerYearly">Partner Price (Yearly)</Label>
                <Input
                  id="partnerYearly"
                  type="number"
                  value={planForm.partnerPriceYearly}
                  onChange={(e) => setPlanForm({ ...planForm, partnerPriceYearly: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="planActive">Active</Label>
              <Switch
                id="planActive"
                checked={planForm.isActive}
                onCheckedChange={(checked) => setPlanForm({ ...planForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Plan Dialog */}
      <Dialog open={addPlanDialogOpen} onOpenChange={setAddPlanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Plan Variant</DialogTitle>
            <DialogDescription>
              Create a new plan variant with pricing details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="newPlanCategory">Category *</Label>
              <select
                id="newPlanCategory"
                value={newPlanForm.categoryId}
                onChange={(e) => setNewPlanForm({ ...newPlanForm, categoryId: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPlanName">Internal Name *</Label>
                <Input
                  id="newPlanName"
                  value={newPlanForm.name}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, name: e.target.value })}
                  placeholder="e.g., 5gb, 10gb"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPlanDisplayName">Display Name *</Label>
                <Input
                  id="newPlanDisplayName"
                  value={newPlanForm.displayName}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, displayName: e.target.value })}
                  placeholder="e.g., 5 GB Plan"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPlanStorage">Storage (GB) *</Label>
              <Input
                id="newPlanStorage"
                type="number"
                value={newPlanForm.storageGb}
                onChange={(e) => setNewPlanForm({ ...newPlanForm, storageGb: e.target.value })}
                placeholder="e.g., 5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newRetailMonthly">Retail Price (Monthly)</Label>
                <Input
                  id="newRetailMonthly"
                  type="number"
                  value={newPlanForm.retailPriceMonthly}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, retailPriceMonthly: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newRetailYearly">Retail Price (Yearly)</Label>
                <Input
                  id="newRetailYearly"
                  type="number"
                  value={newPlanForm.retailPriceYearly}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, retailPriceYearly: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPartnerMonthly">Partner Price (Monthly)</Label>
                <Input
                  id="newPartnerMonthly"
                  type="number"
                  value={newPlanForm.partnerPriceMonthly}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, partnerPriceMonthly: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPartnerYearly">Partner Price (Yearly)</Label>
                <Input
                  id="newPartnerYearly"
                  type="number"
                  value={newPlanForm.partnerPriceYearly}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, partnerPriceYearly: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="newPlanActive">Active</Label>
              <Switch
                id="newPlanActive"
                checked={newPlanForm.isActive}
                onCheckedChange={(checked) => setNewPlanForm({ ...newPlanForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePlan} disabled={saving}>
              {saving ? 'Creating...' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
