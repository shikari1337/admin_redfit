import React, { useEffect, useState } from 'react';
import { staffAPI } from '../services/api';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/rbac';
import PermissionPicker from '../components/PermissionPicker';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  UserPlus, Pencil, Trash2, Loader2, ShieldCheck, ShieldOff,
  Eye, EyeOff, AlertCircle, Info,
} from 'lucide-react';

// ─── Legacy module definitions (RETIRED — kept only for reading OLD grants) ───
//
// These bare module names were what the old picker granted. The API checks
// `<area>.<action>`, so all of them except `page_editor` were INERT: ticking
// "Store Settings" here granted nothing at all. The picker is now
// `components/PermissionPicker.tsx`, driven by GET /staff/permissions.
// This table survives ONLY so `permissionSummary` can still label the legacy
// strings sitting on existing user rows.

interface ModuleGroup {
  group: string;
  color: string;
  modules: { id: string; label: string; desc: string }[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: 'Catalog',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    modules: [
      { id: 'products',   label: 'Products & Catalog', desc: 'View/edit products, categories, brands, attributes, bundles' },
      { id: 'inventory',  label: 'Inventory',           desc: 'Stock levels, warehouse management, package boxes' },
      { id: 'gallery',    label: 'Media Gallery',        desc: 'Upload and manage product images and media' },
    ],
  },
  {
    group: 'Commerce',
    color: 'bg-green-50 text-green-700 border-green-200',
    modules: [
      { id: 'orders',     label: 'Orders',               desc: 'View and update customer orders, status changes' },
      { id: 'shipments',  label: 'Shipments',             desc: 'Manage shipments, couriers, tracking updates' },
      { id: 'warehouses', label: 'Warehouses',            desc: 'Add and configure warehouse locations' },
    ],
  },
  {
    group: 'Marketing',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    modules: [
      { id: 'marketing',     label: 'Marketing Campaigns', desc: 'Email campaigns, push notifications, promotions' },
      { id: 'coupons',       label: 'Coupons',              desc: 'Create and manage discount codes and offers' },
      { id: 'abandoned_cart',label: 'Abandoned Carts',      desc: 'View and recover abandoned checkout sessions' },
    ],
  },
  {
    group: 'Customers',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    modules: [
      { id: 'users',          label: 'Store Customers',  desc: 'View customer profiles, order history, addresses' },
      { id: 'leads_manager',  label: 'Leads / CRM',      desc: 'Manage sales leads, follow-ups, pipeline' },
      { id: 'b2b',            label: 'B2B Portal',        desc: 'Wholesale customer management, bulk orders' },
    ],
  },
  {
    group: 'Content',
    color: 'bg-pink-50 text-pink-700 border-pink-200',
    modules: [
      { id: 'appearance', label: 'Appearance & Pages', desc: 'Edit pages, banners, navigation menus, style' },
      { id: 'page_editor',label: 'CMS Page Editor',     desc: 'Advanced block-level content editing' },
      { id: 'faqs',       label: 'FAQs',                desc: 'Manage help articles and FAQ sections' },
      { id: 'reviews',    label: 'Reviews',              desc: 'Moderate and respond to product reviews' },
    ],
  },
  {
    group: 'Analytics & System',
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    modules: [
      { id: 'analytics', label: 'Analytics',       desc: 'View store analytics, traffic, conversion reports' },
      { id: 'logs',       label: 'System Logs',    desc: 'View server and application logs' },
      { id: 'settings',   label: 'Store Settings', desc: 'Modify store config, payments, shipping, API keys' },
    ],
  },
];

const ALL_MODULE_IDS = MODULE_GROUPS.flatMap(g => g.modules.map(m => m.id));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

const Staff: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate]       = useState(false);
  const [editingStaff, setEditingStaff]   = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<any | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'staff', permissions: [] as string[] });
  const [createError, setCreateError]     = useState('');
  const [creating, setCreating]           = useState(false);
  const [showPassword, setShowPassword]   = useState(false);

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const data = await staffAPI.list();
      setStaff(Array.isArray(data) ? data : []);
    } catch { setStaff([]); }
    finally { setLoading(false); }
  };

  // ── Toggle active status ──────────────────────────────────────────────────
  const toggleActive = async (staffId: string, isActive: boolean) => {
    setSavingId(staffId);
    try {
      await staffAPI.update(staffId, { isActive });
      setStaff(prev => prev.map(s => (s._id === staffId || s.id === staffId) ? { ...s, isActive } : s));
    } catch { alert('Failed to update status'); }
    finally { setSavingId(null); }
  };

  // ── Create staff ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      setCreateError('Name, email and password are required.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await staffAPI.create({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
        permissions: createForm.permissions,
      });
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', role: 'staff', permissions: [] });
      await fetchStaff();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to create staff member.');
    } finally { setCreating(false); }
  };

  // ── Delete staff ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget._id || deleteTarget.id;
    try {
      await staffAPI.delete(id);
      setStaff(prev => prev.filter(s => (s._id || s.id) !== id));
    } catch { alert('Failed to delete staff member.'); }
    finally { setDeleteTarget(null); }
  };

  // ── Edit permissions (modal) ──────────────────────────────────────────────
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const openEdit = (member: any) => {
    setEditingStaff(member);
    setEditPerms([...(member.permissions || [])]);
  };

  /** Drops every EXTRA grant; the role's own baseline is untouched. */
  const clearAll = () => setEditPerms([]);

  const saveEdit = async () => {
    if (!editingStaff) return;
    const id = editingStaff._id || editingStaff.id;
    setSavingId(id);
    try {
      await staffAPI.update(id, { permissions: editPerms });
      setStaff(prev => prev.map(s => (s._id || s.id) === id ? { ...s, permissions: editPerms } : s));
      setEditingStaff(null);
    } catch { alert('Failed to save permissions.'); }
    finally { setSavingId(null); }
  };


  const permissionSummary = (perms: string[]) => {
    if (!perms?.length) return 'No access';
    if (perms.length === ALL_MODULE_IDS.length) return 'Full access';
    if (perms.length > 5) return `${perms.length} modules`;
    return perms
      .slice(0, 3)
      .map(p => MODULE_GROUPS.flatMap(g => g.modules).find(m => m.id === p)?.label ?? p)
      .join(', ') + (perms.length > 3 ? ` +${perms.length - 3}` : '');
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Staff & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage staff accounts and control which modules each person can access.
            </p>
          </div>
          {currentUser?.role === 'admin' && (
            <Button onClick={() => { setShowCreate(true); setCreateError(''); }} className="gap-2 shrink-0">
              <UserPlus className="h-4 w-4" /> Invite Staff
            </Button>
          )}
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-amber-800">
            <strong>Store-isolated security:</strong> Staff accounts are scoped to this store only.
            Credentials cannot be used to access data from other stores on the platform.
            Each staff member can only see and interact with the modules you explicitly grant below.
          </div>
        </div>

        {/* Staff table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Staff Members ({staff.length})</CardTitle>
            <CardDescription>Click the edit button to manage detailed module permissions for each staff member.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : staff.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShieldOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No staff members yet</p>
                <p className="text-xs mt-1">Invite your first staff member above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map(member => {
                      const id = member._id || member.id;
                      const isSaving = savingId === id;
                      const isCurrentUser = id === currentUser?._id;
                      return (
                        <TableRow key={id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                {initials(member.name || member.email || '?')}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{member.name || '—'}</p>
                                <p className="text-xs text-muted-foreground">{member.email}</p>
                              </div>
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-[10px]">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="capitalize text-xs">
                              {member.role || 'staff'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-sm text-muted-foreground hover:text-foreground cursor-help">
                                  {permissionSummary(member.permissions)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                {member.permissions?.length
                                  ? member.permissions.join(', ')
                                  : 'No module access granted'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {currentUser?.role === 'admin' && !isCurrentUser ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={member.isActive !== false}
                                  onCheckedChange={v => toggleActive(id, v)}
                                  disabled={isSaving}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {member.isActive !== false ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                            ) : (
                              <Badge variant={member.isActive !== false ? 'outline' : 'secondary'} className="text-xs">
                                {member.isActive !== false ? 'Active' : 'Disabled'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(member.lastLogin)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isSaving
                                ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                : (
                                  <>
                                    {currentUser?.role === 'admin' && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => openEdit(member)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Edit permissions</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {currentUser?.role === 'admin' && !isCurrentUser && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => setDeleteTarget(member)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Remove staff</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </>
                                )
                              }
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Create Staff Modal ─────────────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) setCreateError(''); }}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" /> Invite Staff Member
              </DialogTitle>
              <DialogDescription>
                Create a new staff account and set their module permissions. They will log in with these credentials.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={createForm.name}
                    onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="jane@store.com"
                    value={createForm.email}
                    onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The role decides which panel they land in (Accounting, Inventory, Orders…) and what they can do there.
                  Module access below is additive on top.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    value={createForm.password}
                    onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Module Access</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setCreateForm(p => ({ ...p, permissions: [...ALL_MODULE_IDS] }))}>
                      Select All
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setCreateForm(p => ({ ...p, permissions: [] }))}>
                      Clear
                    </Button>
                  </div>
                </div>
                <PermissionPicker
                  value={createForm.permissions}
                  role={createForm.role}
                  onChange={next => setCreateForm(p => ({ ...p, permissions: next }))}
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{createError}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={creating} className="gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? 'Creating…' : 'Create Account'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Edit Permissions Modal ─────────────────────────────────────────── */}
        <Dialog open={!!editingStaff} onOpenChange={(open: boolean) => { if (!open) setEditingStaff(null); }}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Edit Permissions
              </DialogTitle>
              <DialogDescription>
                {editingStaff?.name} ({editingStaff?.email}) — role <strong>{ROLE_LABELS[(editingStaff?.role || 'staff') as keyof typeof ROLE_LABELS] ?? editingStaff?.role}</strong>.
                Grant extra permissions on top of it below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {editPerms.length} extra permission{editPerms.length === 1 ? '' : 's'} granted
                </span>
                {/* No "select all": granting every permission is what the admin
                    ROLE is for — a staff account with all of them is an admin
                    with extra steps, and it defeats least privilege. */}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>
                  Clear extras
                </Button>
              </div>
              <PermissionPicker
                value={editPerms}
                role={editingStaff?.role || 'staff'}
                onChange={setEditPerms}
              />
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditingStaff(null)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={savingId === (editingStaff?._id || editingStaff?.id)} className="gap-2">
                  {savingId === (editingStaff?._id || editingStaff?.id) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Permissions
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
        <Dialog open={!!deleteTarget} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Remove Staff Member?
              </DialogTitle>
              <DialogDescription>
                This will permanently delete <strong>{deleteTarget?.name || deleteTarget?.email}</strong>'s
                account and revoke their access to this store. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
                Delete Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Staff;
