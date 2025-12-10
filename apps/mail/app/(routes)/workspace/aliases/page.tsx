'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Forward,
  Plus,
  Trash2,
  MoreVertical,
  Loader2,
  Globe,
  ArrowRight,
} from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Domain {
  id: string;
  domainName: string;
  status: string;
}

interface Alias {
  id: number;
  address: string;
  goto: string;
  domain: string;
  active: number;
  created: string;
  modified: string;
}

export default function WorkspaceAliasesPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<Alias | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [aliasLocalPart, setAliasLocalPart] = useState('');
  const [gotoEmail, setGotoEmail] = useState('');

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.workspace.getDomains.query({});
        const activeDomains = (data?.domains || []).filter(
          (d: Domain) => d.status === 'active'
        );
        setDomains(activeDomains);
        if (activeDomains.length > 0) {
          setSelectedDomainId(activeDomains[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch domains:', error);
        toast.error('Failed to load domains');
      } finally {
        setLoading(false);
      }
    };
    fetchDomains();
  }, []);

  useEffect(() => {
    if (!selectedDomainId) return;

    const fetchAliases = async () => {
      setLoadingAliases(true);
      try {
        const data = await api.workspace.getAliases.query({ domainId: selectedDomainId });
        setAliases(data?.aliases || []);
      } catch (error) {
        console.error('Failed to fetch aliases:', error);
        toast.error('Failed to load aliases');
        setAliases([]);
      } finally {
        setLoadingAliases(false);
      }
    };
    fetchAliases();
  }, [selectedDomainId]);

  const selectedDomain = domains.find((d) => d.id === selectedDomainId);

  const handleCreateAlias = async () => {
    if (!aliasLocalPart || !gotoEmail || !selectedDomainId) {
      toast.error('Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gotoEmail)) {
      toast.error('Please enter a valid destination email');
      return;
    }

    const aliasAddress = `${aliasLocalPart}@${selectedDomain?.domainName}`;

    setCreating(true);
    try {
      await api.workspace.createAlias.mutate({
        domainId: selectedDomainId,
        address: aliasAddress,
        goto: gotoEmail,
      });

      toast.success('Alias created successfully');
      setCreateDialogOpen(false);
      setAliasLocalPart('');
      setGotoEmail('');

      // Refresh aliases
      const data = await api.workspace.getAliases.query({ domainId: selectedDomainId });
      setAliases(data?.aliases || []);
    } catch (error: any) {
      console.error('Failed to create alias:', error);
      toast.error(error.message || 'Failed to create alias');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (alias: Alias) => {
    setAliasToDelete(alias);
    setDeleteDialogOpen(true);
  };

  const handleDeleteAlias = async () => {
    if (!aliasToDelete) return;

    setDeleting(true);
    try {
      const result = await api.workspace.deleteAlias.mutate({
        domainId: selectedDomainId,
        aliasId: aliasToDelete.id,
        aliasAddress: aliasToDelete.address,
        gotoAddress: aliasToDelete.goto,
      });

      toast.success(result.message || 'Delete request submitted for admin approval');
      setDeleteDialogOpen(false);
      setAliasToDelete(null);
    } catch (error: unknown) {
      console.error('Failed to delete alias:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete alias');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Aliases</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage email forwarding aliases for your domains
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          disabled={domains.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Alias
        </Button>
      </div>

      {/* Domain Selector */}
      {domains.length > 0 && (
        <div className="mb-6">
          <Label className="mb-2 block">Select Domain</Label>
          <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
            <SelectTrigger className="w-64">
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
      )}

      {/* Aliases List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {domains.length === 0 ? (
          <div className="p-8 text-center">
            <Globe className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No active domains
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add and verify a domain first before creating aliases
            </p>
          </div>
        ) : loadingAliases ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : aliases.length === 0 ? (
          <div className="p-8 text-center">
            <Forward className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No aliases yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Create an alias to forward emails to another address
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Alias
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {aliases.map((alias) => (
              <div
                key={alias.id}
                className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                      <Forward className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {alias.address}
                        </span>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-300">
                          {alias.goto}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            alias.active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {alias.active ? 'Active' : 'Inactive'}
                        </span>
                        {alias.created && (
                          <span>Created: {new Date(alias.created).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDeleteClick(alias)}
                        disabled={deleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Alias
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Alias Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Email Alias</DialogTitle>
            <DialogDescription>
              Create an alias to forward emails to another address
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="alias">Alias Address</Label>
              <div className="flex mt-1">
                <Input
                  id="alias"
                  value={aliasLocalPart}
                  onChange={(e) =>
                    setAliasLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
                  }
                  placeholder="alias"
                  className="rounded-r-none"
                />
                <span className="inline-flex items-center px-3 bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md text-gray-500 dark:text-gray-400">
                  @{selectedDomain?.domainName || 'domain.com'}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="goto">Forward To</Label>
              <Input
                id="goto"
                type="email"
                value={gotoEmail}
                onChange={(e) => setGotoEmail(e.target.value)}
                placeholder="destination@example.com"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Emails sent to the alias will be forwarded to this address
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAlias} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Alias'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alias Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alias</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{aliasToDelete?.address}</strong>? This action
              requires admin approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAlias}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Submitting...' : 'Delete Alias'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
