'use client';

import { api } from '@/lib/trpc';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Building2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [availableStorage, setAvailableStorage] = useState<number>(0);
  const [formData, setFormData] = useState({
    name: '',
    totalStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB default
  });

  useEffect(() => {
    // Fetch available storage from partner pool
    const fetchAvailableStorage = async () => {
      try {
        const stats = await api.partner.getDashboardStats.query();
        setAvailableStorage(stats.storage.allocated - stats.storage.used);
      } catch (error) {
        console.error('Failed to fetch storage stats:', error);
      }
    };
    fetchAvailableStorage();
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
    }));
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.totalStorageBytes > availableStorage) {
      toast.error(`Insufficient storage. Available: ${formatBytes(availableStorage)}`);
      return;
    }

    setLoading(true);
    try {
      const result = await api.partner.createOrganization.mutate({
        name: formData.name,
        totalStorageBytes: formData.totalStorageBytes,
      });
      toast.success('Organization created successfully');
      navigate(`/partner/organizations/${result.organizationId}`);
    } catch (error: any) {
      console.error('Failed to create organization:', error);
      toast.error(error.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const storageSizes = [
    { label: '5 GB', value: 5 * 1024 * 1024 * 1024 },
    { label: '10 GB', value: 10 * 1024 * 1024 * 1024 },
    { label: '25 GB', value: 25 * 1024 * 1024 * 1024 },
    { label: '50 GB', value: 50 * 1024 * 1024 * 1024 },
    { label: '100 GB', value: 100 * 1024 * 1024 * 1024 },
    { label: '250 GB', value: 250 * 1024 * 1024 * 1024 },
    { label: '500 GB', value: 500 * 1024 * 1024 * 1024 },
    { label: '1 TB', value: 1024 * 1024 * 1024 * 1024 },
  ];

  return (
    <div className="p-8 max-w-2xl">
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Create Organization
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Set up a new organization for your customer
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              placeholder="Acme Corporation"
              value={formData.name}
              onChange={handleNameChange}
              required
            />
          </div>

          {/* Storage Allocation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Initial Storage Allocation</Label>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Available: <span className="font-medium text-green-600 dark:text-green-400">{formatBytes(availableStorage)}</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {storageSizes.map((size) => {
                const isDisabled = size.value > availableStorage;
                const isSelected = formData.totalStorageBytes === size.value;
                return (
                  <Button
                    key={size.value}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    disabled={isDisabled}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, totalStorageBytes: size.value }))
                    }
                    className={
                      isSelected
                        ? 'bg-green-600 hover:bg-green-700'
                        : isDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                    }
                  >
                    {size.label}
                  </Button>
                );
              })}
            </div>
            {formData.totalStorageBytes > availableStorage && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Selected storage exceeds available pool. Please purchase more storage.</span>
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This storage comes from your partner storage pool. You can adjust it later.
            </p>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-200">
                What happens next?
              </h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                <li>• The organization will be created and activated immediately</li>
                <li>• You can add domains and users after creation</li>
                <li>• A separate Rocket.Chat workspace will be provisioned</li>
                <li>• Storage will be allocated from your partner pool</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/partner/organizations')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
            {loading ? 'Creating...' : 'Create Organization'}
          </Button>
        </div>
      </form>
    </div>
  );
}
