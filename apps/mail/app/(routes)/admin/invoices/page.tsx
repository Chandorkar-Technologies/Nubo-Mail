'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { Receipt, Search, Download, Eye, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'partner' | 'organization' | 'user';
  billingName: string | null;
  billingEmail: string | null;
  subtotal: string;
  gstAmount: string;
  gstPercentage: string | null;
  totalAmount: string;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | null;
  dueDate: string;
  createdAt: Date;
  paidAt: Date | null;
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const data = await api.admin.getInvoices.query({
          status: statusFilter === 'all' ? undefined : (statusFilter as 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'),
        });
        setInvoices(data.invoices);
      } catch (error) {
        console.error('Failed to fetch invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [statusFilter]);

  const formatCurrency = (amount: string | number, currency: string = 'INR') => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handleDownloadPDF = (inv: Invoice) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to download the invoice');
      return;
    }

    const statusLabel = (inv.status || 'draft').charAt(0).toUpperCase() + (inv.status || 'draft').slice(1);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${inv.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
          .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 32px; color: #333; margin-bottom: 8px; }
          .invoice-number { font-size: 16px; color: #666; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
          .meta-item h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
          .meta-item p { font-size: 14px; color: #111; font-weight: 500; }
          .billing { margin-bottom: 30px; }
          .billing h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
          .billing p { font-size: 14px; color: #111; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .status-paid { background: #dcfce7; color: #166534; }
          .status-sent { background: #dbeafe; color: #1e40af; }
          .status-draft { background: #fef9c3; color: #854d0e; }
          .status-overdue { background: #fee2e2; color: #991b1b; }
          .status-cancelled { background: #e5e7eb; color: #374151; }
          .totals { margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
          .total-row.final { border-top: 2px solid #e5e7eb; margin-top: 10px; padding-top: 16px; font-size: 18px; font-weight: 700; }
          .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #666; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Nubo Admin</div>
          <div class="invoice-title">
            <h1>INVOICE</h1>
            <div class="invoice-number">${inv.invoiceNumber}</div>
          </div>
        </div>
        <div class="meta">
          <div class="meta-item">
            <h3>Invoice Date</h3>
            <p>${formatDate(inv.createdAt)}</p>
          </div>
          <div class="meta-item">
            <h3>Due Date</h3>
            <p>${formatDate(inv.dueDate)}</p>
          </div>
          <div class="meta-item">
            <h3>Status</h3>
            <span class="status status-${inv.status || 'draft'}">${statusLabel}</span>
          </div>
        </div>
        <div class="billing">
          <h3>Bill To</h3>
          <p>${inv.billingName || 'N/A'}</p>
          <p>${inv.billingEmail || 'N/A'}</p>
        </div>
        <div class="totals">
          <div class="total-row">
            <span>Subtotal</span>
            <span>${formatCurrency(inv.subtotal || '0', inv.currency)}</span>
          </div>
          <div class="total-row">
            <span>GST (${inv.gstPercentage || '18'}%)</span>
            <span>${formatCurrency(inv.gstAmount || '0', inv.currency)}</span>
          </div>
          <div class="total-row final">
            <span>Total Amount</span>
            <span>${formatCurrency(inv.totalAmount || '0', inv.currency)}</span>
          </div>
        </div>
        <div class="footer">
          <p>Thank you for your business!</p>
          <p style="margin-top: 8px;">Nubo Email - nubo.email</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="flex gap-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-40"></div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          View and manage all invoices across the platform
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Invoice
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Customer
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Type
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Amount
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                Due Date
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
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(invoice.createdAt)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-gray-900 dark:text-white">{invoice.billingName || '-'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {invoice.billingEmail || '-'}
                    </p>
                  </div>
                </td>
                <td className="p-4">
                  <span className="capitalize text-gray-600 dark:text-gray-300">
                    {invoice.type}
                  </span>
                </td>
                <td className="p-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(invoice.totalAmount, invoice.currency)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      GST: {formatCurrency(invoice.gstAmount || '0', invoice.currency)}
                    </p>
                  </div>
                </td>
                <td className="p-4">
                  <span className="text-gray-900 dark:text-white">
                    {formatDate(invoice.dueDate)}
                  </span>
                </td>
                <td className="p-4">
                  <span
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium capitalize',
                      getStatusColor(invoice.status || 'draft')
                    )}
                  >
                    {invoice.status || 'draft'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(invoice)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDownloadPDF(invoice)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No invoices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* View Invoice Dialog */}
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
                <div>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium capitalize',
                      getStatusColor(selectedInvoice.status || 'draft')
                    )}
                  >
                    {selectedInvoice.status || 'draft'}
                  </span>
                </div>
              </div>

              {/* Billing Info */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Bill To</h4>
                <p className="text-gray-900 dark:text-white">{selectedInvoice.billingName || 'N/A'}</p>
                <p className="text-gray-600 dark:text-gray-300">{selectedInvoice.billingEmail || 'N/A'}</p>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.subtotal || '0', selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    GST ({selectedInvoice.gstPercentage || '18'}%)
                  </span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.gstAmount || '0', selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="font-medium text-gray-900 dark:text-white">Total</span>
                  <span className="font-bold text-xl text-gray-900 dark:text-white">
                    {formatCurrency(selectedInvoice.totalAmount || '0', selectedInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => handleDownloadPDF(selectedInvoice)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
