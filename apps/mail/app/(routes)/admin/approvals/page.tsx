import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Globe,
  User,
  HardDrive,
  Archive,
  Building2,
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const typeIcons: Record<string, any> = {
  domain: Globe,
  user: User,
  storage: HardDrive,
  archival: Archive,
  organization: Building2,
};

const typeLabels: Record<string, string> = {
  domain: 'Domain',
  user: 'User',
  storage: 'Storage',
  archival: 'Archival',
  organization: 'Organization',
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  // Dialog states
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api.admin.getApprovalRequests.query({
          type: typeFilter !== 'all' ? (typeFilter as any) : undefined,
          status: statusFilter !== 'all' ? (statusFilter as any) : undefined,
          page: pagination.page,
          limit: pagination.limit,
        });
        setRequests(data.requests);
        setPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: data.totalPages,
        }));
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to load approval requests');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [typeFilter, statusFilter, pagination.page]);

  const handleApprove = async (requestId: string) => {
    setProcessing(true);
    try {
      await api.admin.processApprovalRequest.mutate({
        requestId,
        action: 'approve',
      });
      toast.success('Request approved');
      setRequests((prev) => prev.filter((req) => req.id !== requestId));
    } catch (error) {
      console.error('Failed to approve request:', error);
      toast.error('Failed to approve request');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason) return;
    setProcessing(true);
    try {
      await api.admin.processApprovalRequest.mutate({
        requestId: selectedRequest.id,
        action: 'reject',
        rejectionReason,
      });
      toast.success('Request rejected');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason('');
      setRequests((prev) => prev.filter((req) => req.id !== selectedRequest.id));
    } catch (error) {
      console.error('Failed to reject request:', error);
      toast.error('Failed to reject request');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Approval Requests</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Review and process pending approval requests
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="domain">Domain</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="archival">Archival</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requests List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No approval requests found
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {requests.map((request) => {
              const Icon = typeIcons[request.type] || Building2;
              const requestData = request.requestData as Record<string, any>;

              return (
                <div key={request.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'p-2 rounded-lg',
                          request.type === 'domain' && 'bg-blue-100 dark:bg-blue-900',
                          request.type === 'user' && 'bg-green-100 dark:bg-green-900',
                          request.type === 'storage' && 'bg-purple-100 dark:bg-purple-900',
                          request.type === 'archival' && 'bg-orange-100 dark:bg-orange-900',
                          request.type === 'organization' && 'bg-gray-100 dark:bg-gray-700'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5',
                            request.type === 'domain' && 'text-blue-600 dark:text-blue-400',
                            request.type === 'user' && 'text-green-600 dark:text-green-400',
                            request.type === 'storage' && 'text-purple-600 dark:text-purple-400',
                            request.type === 'archival' && 'text-orange-600 dark:text-orange-400',
                            request.type === 'organization' && 'text-gray-600 dark:text-gray-400'
                          )}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {typeLabels[request.type]} Request
                          </h3>
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                              request.status === 'pending' &&
                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                              request.status === 'approved' &&
                                'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                              request.status === 'rejected' &&
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            )}
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {request.requestorType === 'partner' ? 'Partner' : 'Organization'} Request
                        </p>

                        {/* Request Details */}
                        <div className="mt-3 text-sm">
                          {request.type === 'domain' && (
                            <p>
                              <span className="text-gray-500">Domain:</span>{' '}
                              <span className="font-medium text-gray-900 dark:text-white">
                                {requestData.domainName}
                              </span>
                            </p>
                          )}
                          {request.type === 'user' && (
                            <div className="space-y-1">
                              <p>
                                <span className="text-gray-500">Email:</span>{' '}
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {requestData.emailAddress}
                                </span>
                              </p>
                              {requestData.displayName && (
                                <p>
                                  <span className="text-gray-500">Name:</span>{' '}
                                  <span className="text-gray-900 dark:text-white">
                                    {requestData.displayName}
                                  </span>
                                </p>
                              )}
                            </div>
                          )}
                          {request.type === 'archival' && (
                            <div className="space-y-1">
                              <p>
                                <span className="text-gray-500">Domain:</span>{' '}
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {requestData.domainName}
                                </span>
                              </p>
                              <p>
                                <span className="text-gray-500">Storage:</span>{' '}
                                <span className="text-gray-900 dark:text-white">
                                  {formatBytes(requestData.storageBytes)}
                                </span>
                              </p>
                            </div>
                          )}
                          {requestData.organizationName && (
                            <p className="text-gray-500 mt-1">
                              Organization: {requestData.organizationName}
                            </p>
                          )}
                        </div>

                        <p className="text-xs text-gray-400 mt-2">
                          Submitted: {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>

                    {request.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(request.id)}
                          disabled={processing}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setRejectDialogOpen(true);
                          }}
                          disabled={processing}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason || processing}
            >
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
