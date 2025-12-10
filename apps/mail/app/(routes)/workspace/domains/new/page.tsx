'use client';

import { api } from '@/lib/trpc';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Globe, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function NewDomainPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [domainName, setDomainName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [createdDomain, setCreatedDomain] = useState<{
    domainId: string;
    domainName: string;
    dnsRecords: {
      mxRecord: string;
      spfRecord: string;
      dkimSelector: string;
      dkimRecord: string;
      dmarcRecord: string;
    };
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!domainName) {
      toast.error('Please enter a domain name');
      return;
    }

    // Basic domain validation
    const domainRegex = /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domainName)) {
      toast.error('Please enter a valid domain name');
      return;
    }

    setLoading(true);
    try {
      const result = await api.workspace.createDomain.mutate({
        domainName: domainName.toLowerCase(),
        isPrimary,
      });

      toast.success('Domain added successfully');
      setCreatedDomain({
        domainId: result.domainId,
        domainName: domainName.toLowerCase(),
        dnsRecords: result.dnsRecords,
      });
    } catch (error: any) {
      console.error('Failed to create domain:', error);
      toast.error(error.message || 'Failed to add domain');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleVerifyDns = async () => {
    if (!createdDomain) return;

    setLoading(true);
    try {
      const result = await api.workspace.verifyDomainDns.mutate({
        domainId: createdDomain.domainId,
      });

      if (result.verified) {
        toast.success('DNS verified successfully! Domain is now active.');
        navigate('/workspace/domains');
      } else {
        const failedRecords = [];
        if (!result.results.mx.verified) failedRecords.push('MX');
        if (!result.results.spf.verified) failedRecords.push('SPF');
        if (!result.results.dkim.verified) failedRecords.push('DKIM');
        if (!result.results.dmarc.verified) failedRecords.push('DMARC');

        toast.error(
          `DNS verification failed for: ${failedRecords.join(', ')}. Please check your DNS settings.`
        );
      }
    } catch (error: any) {
      console.error('Failed to verify DNS:', error);
      toast.error(error.message || 'Failed to verify DNS');
    } finally {
      setLoading(false);
    }
  };

  if (createdDomain) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configure DNS Records</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Add the following DNS records to <strong>{createdDomain.domainName}</strong>
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                  DNS propagation may take up to 48 hours
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Add these records at your domain registrar, then click "Verify DNS" to check.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* MX Record */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">MX Record</h4>
                <button
                  onClick={() => copyToClipboard(createdDomain.dnsRecords.mxRecord, 'MX')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {copied === 'MX' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Type</span>
                  <span className="text-gray-900 dark:text-white">MX</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Host</span>
                  <span className="text-gray-900 dark:text-white">@</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Value</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">
                    {createdDomain.dnsRecords.mxRecord}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Priority</span>
                  <span className="text-gray-900 dark:text-white">10</span>
                </div>
              </div>
            </div>

            {/* SPF Record */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">SPF Record (TXT)</h4>
                <button
                  onClick={() => copyToClipboard(createdDomain.dnsRecords.spfRecord, 'SPF')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {copied === 'SPF' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Type</span>
                  <span className="text-gray-900 dark:text-white">TXT</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Host</span>
                  <span className="text-gray-900 dark:text-white">@</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Value</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs break-all">
                    {createdDomain.dnsRecords.spfRecord}
                  </span>
                </div>
              </div>
            </div>

            {/* DKIM Record */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">DKIM Record (TXT)</h4>
                <button
                  onClick={() => copyToClipboard(createdDomain.dnsRecords.dkimRecord, 'DKIM')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {copied === 'DKIM' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Type</span>
                  <span className="text-gray-900 dark:text-white">TXT</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Host</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">
                    {createdDomain.dnsRecords.dkimSelector}._domainkey
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Value</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">
                    (Generated after DNS verification)
                  </span>
                </div>
              </div>
            </div>

            {/* DMARC Record */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">DMARC Record (TXT)</h4>
                <button
                  onClick={() => copyToClipboard(createdDomain.dnsRecords.dmarcRecord, 'DMARC')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {copied === 'DMARC' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Type</span>
                  <span className="text-gray-900 dark:text-white">TXT</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Host</span>
                  <span className="text-gray-900 dark:text-white">_dmarc</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Value</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs break-all">
                    {createdDomain.dnsRecords.dmarcRecord}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => navigate('/workspace/domains')}
              className="flex-1"
            >
              Skip for Now
            </Button>
            <Button onClick={handleVerifyDns} disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify DNS'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/workspace/domains')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add Domain</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Add a new domain to your organization
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Domain Name */}
          <div>
            <Label htmlFor="domainName">Domain Name</Label>
            <Input
              id="domainName"
              value={domainName}
              onChange={(e) => setDomainName(e.target.value.toLowerCase())}
              placeholder="example.com"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter the domain name you want to use for email (e.g., company.com)
            </p>
          </div>

          {/* Primary Domain */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPrimary"
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked as boolean)}
            />
            <Label htmlFor="isPrimary" className="cursor-pointer">
              Set as primary domain
            </Label>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/workspace/domains')}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Domain'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
