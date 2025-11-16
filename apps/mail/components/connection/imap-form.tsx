import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ImapFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ImapForm = ({ open, onOpenChange }: ImapFormProps) => {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: true,
    username: '',
    password: '',
  });

  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const testConnection = trpc.connections.testImap.useMutation();
  const createConnection = trpc.connections.createImap.useMutation();
  const utils = trpc.useUtils();

  const handleTest = async () => {
    setTesting(true);
    setTestSuccess(false);

    try {
      await testConnection.mutateAsync({
        host: formData.imapHost,
        port: formData.imapPort,
        tls: formData.imapSecure,
        username: formData.username,
        password: formData.password,
      });

      setTestSuccess(true);
      toast.success('IMAP connection successful!');
    } catch (error: any) {
      toast.error(error.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!testSuccess) {
      toast.error('Please test the connection first');
      return;
    }

    try {
      await createConnection.mutateAsync(formData);

      toast.success('IMAP account added successfully!');
      await utils.connections.list.invalidate();

      // Reset form
      setFormData({
        email: '',
        name: '',
        imapHost: '',
        imapPort: 993,
        imapSecure: true,
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: true,
        username: '',
        password: '',
      });
      setTestSuccess(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add IMAP account');
    }
  };

  const handleChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestSuccess(false); // Reset test status when form changes
  };

  // Auto-fill common providers
  const fillGmailDefaults = () => {
    setFormData((prev) => ({
      ...prev,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
    }));
  };

  const fillOutlookDefaults = () => {
    setFormData((prev) => ({
      ...prev,
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add IMAP Account</DialogTitle>
          <DialogDescription>
            Connect your email account using IMAP. Works with Gmail, Outlook, and any custom IMAP
            server.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Quick Setup Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fillGmailDefaults}
              className="flex-1"
            >
              Gmail Defaults
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fillOutlookDefaults}
              className="flex-1"
            >
              Outlook Defaults
            </Button>
          </div>

          {/* Account Information */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display Name (optional)</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="My Email Account"
            />
          </div>

          {/* IMAP Settings */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">IMAP Settings (Receiving)</h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="imapHost">IMAP Server *</Label>
                <Input
                  id="imapHost"
                  type="text"
                  value={formData.imapHost}
                  onChange={(e) => handleChange('imapHost', e.target.value)}
                  placeholder="imap.gmail.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imapPort">Port *</Label>
                <Input
                  id="imapPort"
                  type="number"
                  value={formData.imapPort}
                  onChange={(e) => handleChange('imapPort', parseInt(e.target.value))}
                  placeholder="993"
                  required
                />
              </div>
            </div>
          </div>

          {/* SMTP Settings */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">SMTP Settings (Sending)</h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="smtpHost">SMTP Server *</Label>
                <Input
                  id="smtpHost"
                  type="text"
                  value={formData.smtpHost}
                  onChange={(e) => handleChange('smtpHost', e.target.value)}
                  placeholder="smtp.gmail.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPort">Port *</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  value={formData.smtpPort}
                  onChange={(e) => handleChange('smtpPort', parseInt(e.target.value))}
                  placeholder="587"
                  required
                />
              </div>
            </div>
          </div>

          {/* Authentication */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">Authentication</h3>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="Usually your email address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password / App Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="For Gmail/Outlook, use an app-specific password"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  <strong>Gmail:</strong> Create app password at{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    App passwords
                  </a>
                  <br />
                  <strong>Outlook:</strong> Enable IMAP in settings and use app password
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={
                testing ||
                !formData.imapHost ||
                !formData.username ||
                !formData.password
              }
              className="flex-1"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : testSuccess ? (
                '✓ Connection Successful'
              ) : (
                'Test Connection'
              )}
            </Button>

            <Button
              type="submit"
              disabled={!testSuccess || createConnection.isPending}
              className="flex-1"
            >
              {createConnection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Account'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
