'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Globe,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  MoreVertical,
  RefreshCw,
  Trash2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface Domain {
  id: string;
  domainName: string;
  verificationStatus: string;
  dnsVerified: boolean;
  mxVerified: boolean;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  isPrimary: boolean;
  createdAt: string;
  dnsRecords?: {
    mx: { type: string; host: string; value: string; priority: number }[];
    spf: { type: string; host: string; value: string };
    dkim: { type: string; host: string; value: string };
    dmarc: { type: string; host: string; value: string };
  };
}

export default function WorkspaceDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [dnsDialogOpen, setDnsDialogOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.workspace.getDomains.query();
        setDomains(data.domains);
      } catch (error) {
        console.error('Failed to fetch domains:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDomains();
  }, []);

  const handleVerifyDns = async (domainId: string) => {
    setVerifying(true);
    try {
      const result = await api.workspace.verifyDomainDns.mutate({ domainId });
      if (result.verified) {
        toast.success('Domain verified successfully');
        // Refresh domains list
        const data = await api.workspace.getDomains.query();
        setDomains(data.domains);
      } else {
        toast.error('DNS verification failed. Please check your records.');
      }
    } catch (error: any) {
      console.error('Failed to verify DNS:', error);
      toast.error(error.message || 'Failed to verify DNS');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      verified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
          styles[status] || styles.pending
        )}
      >
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your organization's email domains
          </p>
        </div>
        <Button onClick={() => navigate('/workspace/domains/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Domain
        </Button>
      </div>

      {/* Domains List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : domains.length === 0 ? (
          <div className="p-8 text-center">
            <Globe className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No domains yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add your first domain to start receiving emails
            </p>
            <Button onClick={() => navigate('/workspace/domains/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                      <Globe className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {domain.domainName}
                        </h3>
                        {domain.isPrimary && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        {getStatusBadge(domain.verificationStatus)}
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span
                            className={cn(
                              'flex items-center gap-1',
                              domain.mxVerified
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400'
                            )}
                          >
                            {domain.mxVerified ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            MX
                          </span>
                          <span
                            className={cn(
                              'flex items-center gap-1',
                              domain.spfVerified
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400'
                            )}
                          >
                            {domain.spfVerified ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            SPF
                          </span>
                          <span
                            className={cn(
                              'flex items-center gap-1',
                              domain.dkimVerified
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400'
                            )}
                          >
                            {domain.dkimVerified ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            DKIM
                          </span>
                          <span
                            className={cn(
                              'flex items-center gap-1',
                              domain.dmarcVerified
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400'
                            )}
                          >
                            {domain.dmarcVerified ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            DMARC
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {domain.verificationStatus !== 'verified' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerifyDns(domain.id)}
                        disabled={verifying}
                      >
                        <RefreshCw
                          className={cn('h-4 w-4 mr-1', verifying && 'animate-spin')}
                        />
                        Verify DNS
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDomain(domain);
                        setDnsDialogOpen(true);
                      }}
                    >
                      View DNS Records
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Domain
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DNS Records Dialog */}
      <Dialog open={dnsDialogOpen} onOpenChange={setDnsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>DNS Records for {selectedDomain?.domainName}</DialogTitle>
            <DialogDescription>
              Add the following DNS records to your domain registrar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 max-h-96 overflow-y-auto">
            {/* MX Records */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                MX Records
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Type</span>
                  <span>Host</span>
                  <span>Value</span>
                  <span>Priority</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <span className="text-gray-900 dark:text-white">MX</span>
                  <span className="text-gray-600 dark:text-gray-300">@</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-300 truncate">
                      mail.nubo.email
                    </span>
                    <button
                      onClick={() => copyToClipboard('mail.nubo.email')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">10</span>
                </div>
              </div>
            </div>

            {/* SPF Record */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                SPF Record
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Type</span>
                  <span>Host</span>
                  <span>Value</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-gray-900 dark:text-white">TXT</span>
                  <span className="text-gray-600 dark:text-gray-300">@</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-300 truncate">
                      v=spf1 include:_spf.nubo.email ~all
                    </span>
                    <button
                      onClick={() => copyToClipboard('v=spf1 include:_spf.nubo.email ~all')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* DKIM Record */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                DKIM Record
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Type</span>
                  <span>Host</span>
                  <span>Value</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-gray-900 dark:text-white">TXT</span>
                  <span className="text-gray-600 dark:text-gray-300">nubo._domainkey</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-300 truncate">
                      v=DKIM1; k=rsa; p=...
                    </span>
                    <button
                      onClick={() => copyToClipboard('v=DKIM1; k=rsa; p=...')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* DMARC Record */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                DMARC Record
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Type</span>
                  <span>Host</span>
                  <span>Value</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-gray-900 dark:text-white">TXT</span>
                  <span className="text-gray-600 dark:text-gray-300">_dmarc</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-300 truncate">
                      v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email'
                        )
                      }
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnsDialogOpen(false)}>
              Close
            </Button>
            {selectedDomain?.verificationStatus !== 'verified' && (
              <Button
                onClick={() => {
                  if (selectedDomain) {
                    handleVerifyDns(selectedDomain.id);
                    setDnsDialogOpen(false);
                  }
                }}
                disabled={verifying}
              >
                Verify DNS Records
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
