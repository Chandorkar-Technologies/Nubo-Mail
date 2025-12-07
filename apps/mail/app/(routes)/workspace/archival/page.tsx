import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Archive,
  Clock,
  HardDrive,
  Shield,
  AlertCircle,
  Check,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ArchivalConfig {
  enabled: boolean;
  retentionDays: number;
  storageAllocatedBytes: number;
  storageUsedBytes: number;
  lastArchivalDate: string | null;
  emailsArchived: number;
  domains: Array<{
    id: string;
    domainName: string;
    archivalEnabled: boolean;
  }>;
}

export default function WorkspaceArchivalPage() {
  const [config, setConfig] = useState<ArchivalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [selectedRetention, setSelectedRetention] = useState('365');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.workspace.getArchivalConfig.query();
        setConfig(data);
      } catch (error) {
        console.error('Failed to fetch archival config:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleEnableArchival = async () => {
    setProcessing(true);
    try {
      await api.workspace.requestArchival.mutate({
        retentionDays: parseInt(selectedRetention),
      });
      toast.success('Archival request submitted for approval');
      setSetupDialogOpen(false);
      // Refresh config
      const data = await api.workspace.getArchivalConfig.query();
      setConfig(data);
    } catch (error: any) {
      console.error('Failed to enable archival:', error);
      toast.error(error.message || 'Failed to enable archival');
    } finally {
      setProcessing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Archival</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage email retention and compliance settings
          </p>
        </div>
        {!config?.enabled && (
          <Button onClick={() => setSetupDialogOpen(true)}>
            <Archive className="h-4 w-4 mr-2" />
            Enable Archival
          </Button>
        )}
      </div>

      {config?.enabled ? (
        <>
          {/* Archival Status Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-xl">
                  <Archive className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Archival Active
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    Emails are being archived according to your retention policy
                  </p>
                </div>
              </div>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.retentionDays}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Days Retention</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <Archive className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.emailsArchived.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Emails Archived</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <HardDrive className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatBytes(config.storageUsedBytes)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Storage Used</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <Shield className="h-6 w-6 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.lastArchivalDate ? formatDate(config.lastArchivalDate) : 'Never'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last Archival</p>
              </div>
            </div>
          </div>

          {/* Domains */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Archival by Domain
            </h2>
            <div className="space-y-3">
              {config.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center',
                        domain.archivalEnabled
                          ? 'bg-green-100 dark:bg-green-900'
                          : 'bg-gray-100 dark:bg-gray-700'
                      )}
                    >
                      {domain.archivalEnabled ? (
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Archive className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {domain.domainName}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-sm',
                      domain.archivalEnabled
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {domain.archivalEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Not Enabled State */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900 mb-6">
              <Archive className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Email Archival Not Enabled
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
              Enable email archival to retain emails for compliance purposes. All emails will be
              archived and searchable for your specified retention period.
            </p>
            <Button onClick={() => setSetupDialogOpen(true)}>
              <Archive className="h-4 w-4 mr-2" />
              Enable Archival
            </Button>
          </div>

          {/* Benefits */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Compliance Ready
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Meet regulatory requirements with immutable email archives and audit trails
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Flexible Retention
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose retention periods from 1 to 10 years based on your requirements
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
                <Archive className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Searchable Archives
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Quickly find any archived email with powerful search capabilities
              </p>
            </div>
          </div>
        </>
      )}

      {/* Setup Dialog */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Email Archival</DialogTitle>
            <DialogDescription>
              Configure email archival for your organization. This will archive all incoming and
              outgoing emails.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                Retention Period
              </label>
              <Select value={selectedRetention} onValueChange={setSelectedRetention}>
                <SelectTrigger>
                  <SelectValue placeholder="Select retention period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="365">1 Year</SelectItem>
                  <SelectItem value="730">2 Years</SelectItem>
                  <SelectItem value="1095">3 Years</SelectItem>
                  <SelectItem value="1825">5 Years</SelectItem>
                  <SelectItem value="2555">7 Years</SelectItem>
                  <SelectItem value="3650">10 Years</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Emails will be retained for the selected period
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                <p className="font-medium">Additional storage required</p>
                <p>
                  Archival requires dedicated storage. Your request will be sent to your partner
                  for approval and storage allocation.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnableArchival} disabled={processing}>
              {processing ? 'Submitting...' : 'Request Archival'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
