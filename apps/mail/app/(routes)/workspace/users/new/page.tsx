'use client';

import { api } from '@/lib/trpc';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Loader2, Copy, Check } from 'lucide-react';
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
import { toast } from 'sonner';

interface Domain {
  id: string;
  domainName: string;
  status: string;
}

export default function NewUserPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdUser, setCreatedUser] = useState<{
    emailAddress: string;
    password: string;
    imapConfig: { host: string; port: number; security: string };
    smtpConfig: { host: string; port: number; security: string };
  } | null>(null);

  const [formData, setFormData] = useState({
    domainId: '',
    localPart: '',
    displayName: '',
    password: '',
    mailboxStorageGB: 1,
  });

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.workspace.getDomains.query({});
        // Only show active domains
        const activeDomains = (data?.domains || []).filter(
          (d: Domain) => d.status === 'active'
        );
        setDomains(activeDomains);
        if (activeDomains.length > 0) {
          setFormData((prev) => ({ ...prev, domainId: activeDomains[0].id }));
        }
      } catch (error) {
        console.error('Failed to fetch domains:', error);
        toast.error('Failed to load domains');
      } finally {
        setLoadingDomains(false);
      }
    };
    fetchDomains();
  }, []);

  const generatePassword = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    setFormData((prev) => ({ ...prev, password }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.domainId) {
      toast.error('Please select a domain');
      return;
    }

    if (!formData.localPart) {
      toast.error('Please enter email local part');
      return;
    }

    if (!formData.password || formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    const selectedDomain = domains.find((d) => d.id === formData.domainId);
    if (!selectedDomain) {
      toast.error('Invalid domain selected');
      return;
    }

    const emailAddress = `${formData.localPart}@${selectedDomain.domainName}`;

    setLoading(true);
    try {
      const result = await api.workspace.createUser.mutate({
        domainId: formData.domainId,
        emailAddress,
        displayName: formData.displayName || undefined,
        password: formData.password,
        mailboxStorageBytes: formData.mailboxStorageGB * 1024 * 1024 * 1024,
      });

      toast.success('User created successfully');
      setCreatedUser({
        emailAddress,
        password: formData.password,
        imapConfig: result.imapConfig,
        smtpConfig: result.smtpConfig,
      });
    } catch (error: any) {
      console.error('Failed to create user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!createdUser) return;
    const text = `Email: ${createdUser.emailAddress}
Password: ${createdUser.password}

IMAP Settings:
- Host: ${createdUser.imapConfig.host}
- Port: ${createdUser.imapConfig.port}
- Security: ${createdUser.imapConfig.security}

SMTP Settings:
- Host: ${createdUser.smtpConfig.host}
- Port: ${createdUser.smtpConfig.port}
- Security: ${createdUser.smtpConfig.security}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Credentials copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdUser) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Created</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              The user can now login with these credentials
            </p>
          </div>

          <div className="space-y-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div>
              <Label className="text-xs text-gray-500">Email Address</Label>
              <p className="font-mono text-gray-900 dark:text-white">{createdUser.emailAddress}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Password</Label>
              <div className="flex items-center gap-2">
                <p className="font-mono text-gray-900 dark:text-white">
                  {showPassword ? createdUser.password : '••••••••••••'}
                </p>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <Label className="text-xs text-gray-500">IMAP Settings</Label>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Host: {createdUser.imapConfig.host} | Port: {createdUser.imapConfig.port} |{' '}
                {createdUser.imapConfig.security}
              </p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">SMTP Settings</Label>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Host: {createdUser.smtpConfig.host} | Port: {createdUser.smtpConfig.port} |{' '}
                {createdUser.smtpConfig.security}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={copyCredentials} className="flex-1">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Credentials'}
            </Button>
            <Button onClick={() => navigate('/workspace/users')} className="flex-1">
              Back to Users
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
        <Button variant="ghost" size="icon" onClick={() => navigate('/workspace/users')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create User</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Add a new email user to your organization
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {loadingDomains ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              You need an active domain before creating users.
            </p>
            <Button onClick={() => navigate('/workspace/domains/new')}>Add Domain First</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Domain Selection */}
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Select
                value={formData.domainId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, domainId: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.domainName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Email Local Part */}
            <div>
              <Label htmlFor="localPart">Email Address</Label>
              <div className="flex mt-1">
                <Input
                  id="localPart"
                  value={formData.localPart}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      localPart: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                    }))
                  }
                  placeholder="username"
                  className="rounded-r-none"
                />
                <span className="inline-flex items-center px-3 bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md text-gray-500 dark:text-gray-400">
                  @{domains.find((d) => d.id === formData.domainId)?.domainName || 'domain.com'}
                </span>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <Label htmlFor="displayName">Display Name (Optional)</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="John Doe"
                className="mt-1"
              />
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={generatePassword}>
                  Generate
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Minimum 8 characters. User will use this password to login.
              </p>
            </div>

            {/* Storage */}
            <div>
              <Label htmlFor="storage">Mailbox Storage (GB)</Label>
              <Select
                value={formData.mailboxStorageGB.toString()}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, mailboxStorageGB: parseInt(value) }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 GB</SelectItem>
                  <SelectItem value="2">2 GB</SelectItem>
                  <SelectItem value="5">5 GB</SelectItem>
                  <SelectItem value="10">10 GB</SelectItem>
                  <SelectItem value="25">25 GB</SelectItem>
                  <SelectItem value="50">50 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/workspace/users')}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
