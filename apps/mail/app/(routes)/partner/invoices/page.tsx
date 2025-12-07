import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import {
  Receipt,
  Download,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

export default function PartnerInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api.partner.getInvoices.query({
          status: statusFilter !== 'all' ? (statusFilter as any) : undefined,
          page: pagination.page,
          limit: pagination.limit,
        });
        setInvoices(data.invoices);
        setPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: data.totalPages,
        }));
      } catch (error) {
        console.error('Failed to fetch invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [statusFilter, pagination.page]);

  const formatCurrency = (amount: string, currency: string = 'INR'): string => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
    }).format(num);
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'overdue':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
          styles[status] || styles.draft
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          View and manage your invoices and payment history
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <Receipt className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No invoices yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Your invoices will appear here once generated
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Invoice
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Date
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Due Date
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Amount
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {invoice.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                        {formatDate(invoice.dueDate)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(invoice.totalAmount, invoice.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(invoice.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setViewDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
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
          </>
        )}
      </div>

      {/* Invoice Detail Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice {selectedInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              {/* Invoice Header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Invoice Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(selectedInvoice.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Due Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(selectedInvoice.dueDate)}
                  </p>
                </div>
                <div>{getStatusBadge(selectedInvoice.status)}</div>
              </div>

              {/* Line Items */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Description
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Unit Price
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedInvoice.lineItems?.map((item) => (
                      <tr key={item.description}>
                        <td className="px-4 py-3 text-gray-900 dark:text-white">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                          {formatCurrency(item.unitPrice, selectedInvoice.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(item.totalPrice, selectedInvoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">GST (18%)</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.taxAmount, selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="font-medium text-gray-900 dark:text-white">Total</span>
                  <span className="font-bold text-xl text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                {selectedInvoice.status === 'pending' && (
                  <Button className="bg-green-600 hover:bg-green-700">Pay Now</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
