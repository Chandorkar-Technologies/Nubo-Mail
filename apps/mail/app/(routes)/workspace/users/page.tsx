'use client';

import { api } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Mail,
  Shield,
  Crown,
  UserX,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Key,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface OrganizationUser {
  id: string;
  emailAddress: string;
  displayName: string;
  role: string;
  status: string;
  storageUsedBytes: number;
  hasProSubscription: boolean;
  createdAt: string;
}

export default function WorkspaceUsersPage() {
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [selectedUser, setSelectedUser] = useState<OrganizationUser | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [userToDelete, setUserToDelete] = useState<OrganizationUser | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<OrganizationUser | null>(null);
  const [newRole, setNewRole] = useState<string>('member');
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.workspace.getUsers.query({
        search: search || undefined,
        status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'active' | 'suspended') : undefined,
        page: pagination.page,
        limit: pagination.limit,
      });
      setUsers(data?.users || []);
      setPagination((prev) => ({
        ...prev,
        total: data?.total || 0,
        totalPages: data?.totalPages || 0,
      }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, statusFilter, pagination.page]);

  const handleSuspendUser = async (user: OrganizationUser) => {
    setProcessing(true);
    try {
      await api.workspace.updateUser.mutate({
        userId: user.id,
        status: 'suspended',
      });
      toast.success('User suspended successfully');
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to suspend user:', error);
      toast.error(error.message || 'Failed to suspend user');
    } finally {
      setProcessing(false);
    }
  };

  const handleActivateUser = async (user: OrganizationUser) => {
    setProcessing(true);
    try {
      await api.workspace.updateUser.mutate({
        userId: user.id,
        status: 'active',
      });
      toast.success('User activated successfully');
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to activate user:', error);
      toast.error(error.message || 'Failed to activate user');
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenRoleDialog = (user: OrganizationUser) => {
    setSelectedUser(user);
    setNewRole(user.role || 'member');
    setRoleDialogOpen(true);
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      // Note: Role change would require a backend endpoint that supports role updates
      // For now, we'll just show a toast
      toast.info('Role management requires admin privileges');
      setRoleDialogOpen(false);
    } catch (error: any) {
      console.error('Failed to change role:', error);
      toast.error(error.message || 'Failed to change role');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteClick = (user: OrganizationUser) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setProcessing(true);
    try {
      const result = await api.workspace.deleteUser.mutate({ userId: userToDelete.id });
      toast.success(result.message || 'Delete request submitted for admin approval');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (error: unknown) {
      console.error('Failed to delete user:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setProcessing(false);
    }
  };

  const handleResetPasswordClick = (user: OrganizationUser) => {
    setUserToResetPassword(user);
    setNewPassword('');
    setResetPasswordDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!userToResetPassword) return;

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setProcessing(true);
    try {
      await api.workspace.resetUserPassword.mutate({
        userId: userToResetPassword.id,
        newPassword,
      });
      toast.success('Password reset successfully');
      setResetPasswordDialogOpen(false);
      setUserToResetPassword(null);
      setNewPassword('');
    } catch (error: unknown) {
      console.error('Failed to reset password:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <Users className="h-4 w-4 text-gray-400" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const safeRole = role || 'member';
    const styles: Record<string, string> = {
      owner: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      member: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
          styles[safeRole] || styles.member
        )}
      >
        {getRoleIcon(safeRole)}
        {safeRole.charAt(0).toUpperCase() + safeRole.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const safeStatus = status || 'pending';
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      pending_deletion: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    };

    const displayText: Record<string, string> = {
      pending_deletion: 'Pending Deletion',
    };

    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
          styles[safeStatus] || styles.pending
        )}
      >
        {displayText[safeStatus] || safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)}
      </span>
    );
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your organization's users
          </p>
        </div>
        <Button onClick={() => navigate('/workspace/users/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No users found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {search || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'No users match your filters'
                : 'Add your first user to get started'}
            </p>
            {!search && roleFilter === 'all' && statusFilter === 'all' && (
              <Button onClick={() => navigate('/workspace/users/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      User
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Role
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Storage Used
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Plan
                    </th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-200">
                              {user.displayName?.charAt(0) || user.emailAddress.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {user.displayName || user.emailAddress.split('@')[0]}
                            </p>
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                              <Mail className="h-3 w-3" />
                              {user.emailAddress}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                      <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                        {formatBytes(user.storageUsedBytes)}
                      </td>
                      <td className="px-6 py-4">
                        {user.hasProSubscription ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            Pro
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Basic
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenRoleDialog(user)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleResetPasswordClick(user)}
                                disabled={processing}
                              >
                                <Key className="h-4 w-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              {user.status === 'active' ? (
                                <DropdownMenuItem
                                  className="text-orange-600"
                                  onClick={() => handleSuspendUser(user)}
                                  disabled={processing}
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Suspend User
                                </DropdownMenuItem>
                              ) : user.status === 'suspended' ? (
                                <DropdownMenuItem
                                  className="text-green-600"
                                  onClick={() => handleActivateUser(user)}
                                  disabled={processing}
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Activate User
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDeleteClick(user)}
                                disabled={processing || user.role === 'owner'}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Change the role for {selectedUser?.displayName || selectedUser?.emailAddress}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Select Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Admins can manage users and domains within the organization.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangeRole} disabled={processing}>
              {processing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{userToDelete?.displayName || userToDelete?.emailAddress}</strong>? This action
              requires admin approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? 'Submitting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter a new password for {userToResetPassword?.displayName || userToResetPassword?.emailAddress}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Password must be at least 8 characters long.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={processing || newPassword.length < 8}>
              {processing ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
