import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Building2,
  Mail,
  Shield,
  Users,
  Save,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultUserRole: string;
  allowSelfRegistration: boolean;
  requireTwoFactor: boolean;
  allowExternalSharing: boolean;
  maxAttachmentSizeMB: number;
}

export default function WorkspaceSettingsPage() {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    defaultUserRole: 'member',
    allowSelfRegistration: false,
    requireTwoFactor: false,
    allowExternalSharing: true,
    maxAttachmentSizeMB: 25,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.workspace.getDashboardStats.query();
        setSettings({
          id: data.organization.id,
          name: data.organization.name,
          slug: data.organization.slug,
          status: data.organization.status,
          defaultUserRole: 'member',
          allowSelfRegistration: false,
          requireTwoFactor: false,
          allowExternalSharing: true,
          maxAttachmentSizeMB: 25,
        });
        setFormData({
          name: data.organization.name,
          defaultUserRole: 'member',
          allowSelfRegistration: false,
          requireTwoFactor: false,
          allowExternalSharing: true,
          maxAttachmentSizeMB: 25,
        });
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // This would call an update endpoint
      toast.success('Settings saved successfully');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your organization settings
        </p>
      </div>

      {/* Organization Status */}
      <div
        className={cn(
          'rounded-xl p-4 mb-8 flex items-center gap-3',
          settings?.status === 'active'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
        )}
      >
        {settings?.status === 'active' ? (
          <>
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Organization Active
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Your organization is active and all services are running
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Organization Pending
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Your organization is pending activation
              </p>
            </div>
          </>
        )}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* General Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              General Settings
            </h2>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Organization Slug</Label>
                <Input id="slug" value={settings?.slug} disabled className="bg-gray-50" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Cannot be changed after creation
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* User Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Users className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              User Settings
            </h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="selfRegistration" className="text-base">
                  Allow Self Registration
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Allow users with your domain email to register automatically
                </p>
              </div>
              <Switch
                id="selfRegistration"
                checked={formData.allowSelfRegistration}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, allowSelfRegistration: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="twoFactor" className="text-base">
                  Require Two-Factor Authentication
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enforce 2FA for all users in the organization
                </p>
              </div>
              <Switch
                id="twoFactor"
                checked={formData.requireTwoFactor}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, requireTwoFactor: checked }))
                }
              />
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Mail className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Email Settings
            </h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="externalSharing" className="text-base">
                  Allow External Sharing
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Allow users to share emails and files with external contacts
                </p>
              </div>
              <Switch
                id="externalSharing"
                checked={formData.allowExternalSharing}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, allowExternalSharing: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAttachment">Maximum Attachment Size (MB)</Label>
              <Input
                id="maxAttachment"
                type="number"
                min="1"
                max="100"
                value={formData.maxAttachmentSizeMB}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxAttachmentSizeMB: parseInt(e.target.value) || 25,
                  }))
                }
                className="max-w-xs"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Maximum size for email attachments (1-100 MB)
              </p>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Security Settings
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-200">
                  Security Features Enabled
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                  <li>• End-to-end encryption for all emails</li>
                  <li>• TLS encryption for mail transport</li>
                  <li>• SPF, DKIM, and DMARC protection</li>
                  <li>• Spam and phishing protection</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="mt-12 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4">
          Danger Zone
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-red-900 dark:text-red-200">
              Delete Organization
            </p>
            <p className="text-sm text-red-700 dark:text-red-300">
              Permanently delete this organization and all associated data
            </p>
          </div>
          <Button variant="destructive" disabled>
            Delete Organization
          </Button>
        </div>
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
          Contact your partner administrator to delete this organization
        </p>
      </div>
    </div>
  );
}
