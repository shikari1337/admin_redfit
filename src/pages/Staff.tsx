import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffAPI } from '../services/api';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/rbac';
import PermissionPicker, { usePermissionCatalog, type Catalog } from '../components/PermissionPicker';
import WarehouseAreaPicker, { type WarehouseAreaValue } from '../components/staff/WarehouseAreaPicker';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StatCard, StatGrid } from '../components/erp';
import { localeDate } from '../utils/date';
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
  UserPlus, Pencil, UserX, Loader2, ShieldCheck, ShieldOff,
  Eye, EyeOff, AlertCircle, Info, KeyRound, History, RefreshCw,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * Staff and access (`staff.read` to see the team; `staff.manage` to add, edit and switch off; `staff.delete`
 * to deactivate). On v2 a staff account is the store's record AND the Growcord ID membership its person
 * signs in with (identity `store_staff`, DEC-061): the role and the extra grants come from the server's
 * catalogue (`GET /staff/permissions`), an account is never deleted (the sales and activity records key on
 * it) but deactivated, and every change lands on the store's activity log.
 */

/** A message that used to be a blocking alert(): now a toast (the shell mounts the Toaster). */
const notify = (message: string) =>
  toast({ title: message, variant: /fail|could not|error|not /i.test(message) ? 'destructive' : 'default' });

const errText = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || fallback;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d?: string): string {
  if (!d) return 'Never';
  return localeDate(d, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-IN');
}

/** A role in words: the admin's labels, else the server's own word. */
function roleLabel(role?: string): string {
  const r = role || 'staff';
  return (ROLE_LABELS as Record<string, string>)[r] ?? r.replace(/_/g, ' ');
}

/** A grant in words, from the server's catalogue (`Orders: Manage`); an unknown key as it is. */
function grantLabel(catalog: Catalog | null, key: string): string {
  if (key === '*') return 'Everything';
  for (const area of catalog?.catalog ?? []) {
    const action = area.actions.find((a) => a.key === key);
    if (action) return `${area.label}: ${action.label}`;
  }
  const legacy = catalog?.legacy.find((l) => l.key === key);
  return legacy?.label ?? key;
}

/** What a sign-in access answer means, in words (`StaffAccessView`). */
function accessMessage(access: any): string | null {
  if (!access) return null;
  if (access.membership === 'none') {
    const why = access.reason ? `: ${String(access.reason).replace(/_/g, ' ')}` : '';
    return `No Growcord ID sign-in for this account${why}`;
  }
  if (access.membership === 'suspended') return 'Their Growcord ID sign-in for this store is paused while the account is off';
  if (access.person === 'created' && access.password_set) return 'Growcord ID created: they can sign in with the password you set';
  if (access.person === 'created') return 'Growcord ID created: they set their own password from the sign-in page';
  if (access.person === 'linked') return 'Linked to their existing Growcord ID: they sign in with it';
  return null;
}

const isActive = (m: any) => m?.isActive !== false && m?.is_active !== false;

// ─── Component ────────────────────────────────────────────────────────────────

const Staff: React.FC = () => {
  const { user: currentUser, hasPerm } = useAuth();
  // The server checks staff.manage for add and edit (role, grants, active, warehouse area) and
  // staff.delete for a deactivation; the buttons follow the same permissions (never `role === 'admin'`).
  const canManageStaff = hasPerm('staff.manage');
  const canDeleteStaff = hasPerm('staff.delete');
  const canReadLog = hasPerm('audit.read');
  const { catalog } = usePermissionCatalog();
  const roleChoices: string[] = useMemo(
    () => (catalog?.roles?.length ? catalog.roles.map((r) => r.role) : [...ASSIGNABLE_ROLES]),
    [catalog],
  );

  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate]       = useState(false);
  const [editingStaff, setEditingStaff]   = useState<any | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'staff', permissions: [] as string[] });
  const [createError, setCreateError]     = useState('');
  const [creating, setCreating]           = useState(false);
  const [showPassword, setShowPassword]   = useState(false);

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await staffAPI.list();
      setStaff(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setStaff([]);
      setLoadError(errText(e, 'Could not load the team.'));
    } finally { setLoading(false); }
  };

  const idOf = (m: any): string => m?._id || m?.id;

  // What to act on first: accounts that are on but have never signed in.
  const counts = useMemo(() => {
    const active = staff.filter(isActive);
    return {
      active: active.length,
      off: staff.length - active.length,
      neverSignedIn: active.filter((m) => !(m.lastLogin || m.last_login)).length,
    };
  }, [staff]);

  // ── Toggle active status ──────────────────────────────────────────────────
  const toggleActive = async (staffId: string, on: boolean) => {
    setSavingId(staffId);
    try {
      const saved = await staffAPI.update(staffId, { isActive: on });
      setStaff(prev => prev.map(s => idOf(s) === staffId ? { ...s, isActive: on, is_active: on } : s));
      const msg = accessMessage(saved?.access);
      if (msg && on) notify(msg);
    } catch (e: any) { notify(errText(e, 'Failed to update status')); }
    finally { setSavingId(null); }
  };

  // ── Create staff ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setCreateError('Name and e-mail are required.');
      return;
    }
    if (createForm.password && createForm.password.length < 8) {
      setCreateError('A password needs at least 8 characters, or leave it blank.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const created = await staffAPI.create({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        ...(createForm.password ? { password: createForm.password } : {}),
        role: createForm.role,
        permissions: createForm.permissions,
      });
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', role: 'staff', permissions: [] });
      const msg = accessMessage(created?.access);
      notify(msg ? `Staff member added. ${msg}` : 'Staff member added');
      await fetchStaff();
    } catch (err: any) {
      setCreateError(errText(err, 'Failed to create staff member.'));
    } finally { setCreating(false); }
  };

  // ── Deactivate (never a delete: the sales and activity records key on the account) ──
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const id = idOf(deactivateTarget);
    setSavingId(id);
    try {
      await staffAPI.delete(id);
      setStaff(prev => prev.map(s => idOf(s) === id ? { ...s, isActive: false, is_active: false } : s));
      notify('Account switched off. They can no longer sign in to this store.');
    } catch (e: any) { notify(errText(e, 'Failed to deactivate the account.')); }
    finally { setSavingId(null); setDeactivateTarget(null); }
  };

  // ── Sign-in access (Growcord ID) for an account that has none ─────────────
  const giveAccess = async (member: any) => {
    const id = idOf(member);
    setSavingId(id);
    try {
      const saved = await staffAPI.link(id);
      notify(accessMessage(saved?.access) ?? 'Sign-in access checked');
    } catch (e: any) { notify(errText(e, 'Could not give sign-in access.')); }
    finally { setSavingId(null); }
  };

  // ── Edit role, permissions and warehouse area (modal) ─────────────────────
  const [editRole, setEditRole] = useState<string>('staff');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  // The second and third axes beside permissions (migration 217): which
  // facility, and which part of it. EMPTY in both = everywhere.
  const [editArea, setEditArea] = useState<WarehouseAreaValue>({ facilities: [], nodes: [] });
  const [areaNote, setAreaNote] = useState<string>('');
  const openEdit = (member: any) => {
    setEditingStaff(member);
    setEditRole(member.role || 'staff');
    setEditPerms([...(member.permissions || [])]);
    setEditArea({
      facilities: [...(member.warehouse_access || member.warehouseAccess || [])],
      nodes: [...(member.warehouse_node_access || member.warehouseNodeAccess || [])],
    });
    setAreaNote('');
  };

  /** Drops every EXTRA grant; the role's own baseline is untouched. */
  const clearAll = () => setEditPerms([]);

  const saveEdit = async () => {
    if (!editingStaff) return;
    const id = idOf(editingStaff);
    const roleChanged = editRole !== (editingStaff.role || 'staff');
    setSavingId(id);
    try {
      await staffAPI.update(id, { permissions: editPerms, ...(roleChanged ? { role: editRole } : {}) });
      // The warehouse scope is its own call (it validates ids and reports a
      // store that has not received migration 217 yet), so a failure there must
      // not be reported as a permission save that did not happen, or the other
      // way round.
      let areaOk = true;
      try {
        await staffAPI.setWarehouseAccess(id, {
          warehouse_access: editArea.facilities,
          warehouse_node_access: editArea.nodes,
        });
      } catch (e: any) {
        areaOk = false;
        setAreaNote(errText(e, 'The warehouse area could not be saved. The role and permissions were saved.'));
      }
      setStaff(prev => prev.map(s => idOf(s) === id
        ? { ...s, permissions: editPerms, role: editRole,
            ...(areaOk ? { warehouse_access: editArea.facilities, warehouse_node_access: editArea.nodes } : {}) }
        : s));
      if (areaOk) setEditingStaff(null);
    } catch (e: any) { notify(errText(e, 'Failed to save access.')); }
    finally { setSavingId(null); }
  };

  /** The extra grants in words (the role's baseline is not repeated here). */
  const permissionSummary = (perms: string[]) => {
    if (!perms?.length) return 'Role only';
    if (perms.includes('*')) return 'Everything';
    const shown = perms.slice(0, 2).map((p) => grantLabel(catalog, p)).join(', ');
    return perms.length > 2 ? `${shown} +${perms.length - 2}` : shown;
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Staff &amp; Access</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Who can sign in to this store, their role, and anything granted on top of it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canReadLog && (
              <Button asChild variant="outline" className="gap-2">
                <Link to="/logs?entity_type=staff_member"><History className="h-4 w-4" /> Access history</Link>
              </Button>
            )}
            {canManageStaff && (
              <Button onClick={() => { setShowCreate(true); setCreateError(''); }} className="gap-2 shrink-0">
                <UserPlus className="h-4 w-4" /> Add staff
              </Button>
            )}
          </div>
        </div>

        {/* What to act on first, then the numbers. */}
        {!loading && !loadError && counts.neverSignedIn > 0 && (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {counts.neverSignedIn === 1 ? '1 active account has' : `${counts.neverSignedIn} active accounts have`} never signed in.
              {canManageStaff && ' Use the key button on the row to check their Growcord ID sign-in.'}
            </span>
          </div>
        )}
        {!loading && !loadError && staff.length > 0 && (
          <StatGrid cols={3}>
            <StatCard label="Active" value={counts.active} />
            <StatCard label="Switched off" value={counts.off} />
            <StatCard label="Never signed in" value={counts.neverSignedIn} tone={counts.neverSignedIn > 0 ? 'warn' : 'default'} />
          </StatGrid>
        )}

        <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Each person signs in with their own Growcord ID and reaches this store only. The role sets what they
            may do; extra permissions add to it. Every change here is kept on the store&apos;s activity log.
          </span>
        </div>

        {/* Staff table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Team ({staff.length})</CardTitle>
            <CardDescription>Edit a row to change the role, extra permissions or warehouse area.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-sm text-red-700">{loadError}</p>
                <Button variant="outline" size="sm" onClick={fetchStaff} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : staff.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShieldOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No staff members yet</p>
                {canManageStaff && <p className="text-xs mt-1">Add the first one with Add staff.</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Extra permissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last sign-in</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map(member => {
                      const id = idOf(member);
                      const isSaving = savingId === id;
                      const isCurrentUser = id === currentUser?._id;
                      const on = isActive(member);
                      return (
                        <TableRow key={id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                {initials(member.name || member.email || '?')}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm">{member.name || member.email}</p>
                                <p className="text-xs text-muted-foreground break-all">{member.email}</p>
                              </div>
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-[10px]">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">
                              {roleLabel(member.role)}
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
                                  ? member.permissions.map((p: string) => grantLabel(catalog, p)).join(', ')
                                  : 'Only what the role gives'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {canManageStaff && !isCurrentUser ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={on}
                                  onCheckedChange={v => toggleActive(id, v)}
                                  disabled={isSaving}
                                  aria-label={on ? 'Switch this account off' : 'Switch this account on'}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {on ? 'Active' : 'Off'}
                                </span>
                              </div>
                            ) : (
                              <Badge variant={on ? 'outline' : 'secondary'} className="text-xs">
                                {on ? 'Active' : 'Off'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(member.lastLogin || member.last_login)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isSaving
                                ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                : (
                                  <>
                                    {canManageStaff && !isCurrentUser && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(member)} aria-label="Edit access">
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Edit role and access</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {canManageStaff && on && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => giveAccess(member)} aria-label="Check sign-in">
                                            <KeyRound className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Check their Growcord ID sign-in, and give it if missing</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {canReadLog && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                            <Link to={`/logs?actor_id=${encodeURIComponent(id)}`} aria-label="Their changes">
                                              <History className="h-3.5 w-3.5" />
                                            </Link>
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>What they changed</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {canDeleteStaff && !isCurrentUser && on && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => setDeactivateTarget(member)}
                                            aria-label="Deactivate"
                                          >
                                            <UserX className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Deactivate</TooltipContent>
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
                <UserPlus className="h-5 w-5" /> Add staff member
              </DialogTitle>
              <DialogDescription>
                They sign in with their Growcord ID: an existing one is linked by e-mail, otherwise one is made for them.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-5 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="staff-name">Full name *</Label>
                  <Input
                    id="staff-name"
                    placeholder="Jane Doe"
                    value={createForm.name}
                    onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-email">E-mail *</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    placeholder="jane@store.com"
                    value={createForm.email}
                    onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-role">Role *</Label>
                <select
                  id="staff-role"
                  value={createForm.role}
                  onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {roleChoices.map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The role decides which panels they work in and what they may do there. Extra permissions below add to it.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-password">First password (optional)</Label>
                <div className="relative">
                  <Input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={createForm.password}
                    onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used only when this e-mail has no Growcord ID yet. Someone who already has one keeps their own password.
                </p>
              </div>

              {/* Permissions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Extra permissions</Label>
                  {/* No "select all": every permission is what the Administrator role is
                      for, and a staff account holding all of them defeats least privilege. */}
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setCreateForm(p => ({ ...p, permissions: [] }))}>
                    Clear
                  </Button>
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
                  {creating ? 'Adding...' : 'Add staff member'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Edit Access Modal ──────────────────────────────────────────────── */}
        <Dialog open={!!editingStaff} onOpenChange={(open: boolean) => { if (!open) setEditingStaff(null); }}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Edit access
              </DialogTitle>
              <DialogDescription>
                {editingStaff?.name || editingStaff?.email} ({editingStaff?.email}). Change the role, grant extra
                permissions on top of it, and say where in the warehouse they may work.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {!roleChoices.includes(editRole) && <option value={editRole}>{roleLabel(editRole)}</option>}
                  {roleChoices.map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">To take access away, pick a narrower role.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {editPerms.length} extra permission{editPerms.length === 1 ? '' : 's'} granted
                </span>
                {/* No "select all": granting every permission is what the admin
                    ROLE is for; a staff account with all of them is an admin
                    with extra steps, and it defeats least privilege. */}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>
                  Clear extras
                </Button>
              </div>
              <PermissionPicker
                value={editPerms}
                role={editRole}
                onChange={setEditPerms}
              />

              {/* Where they may work: migration 217, plan 4.2, ask A10. */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Warehouse area</h4>
                <WarehouseAreaPicker value={editArea} onChange={setEditArea} />
                {areaNote && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
                    {areaNote}
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditingStaff(null)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={savingId === idOf(editingStaff)} className="gap-2">
                  {savingId === idOf(editingStaff) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save access
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Deactivate Confirm ─────────────────────────────────────────────── */}
        <Dialog open={!!deactivateTarget} onOpenChange={(open: boolean) => { if (!open) setDeactivateTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <UserX className="h-5 w-5" /> Deactivate this account?
              </DialogTitle>
              <DialogDescription>
                <strong>{deactivateTarget?.name || deactivateTarget?.email}</strong> can no longer sign in to this
                store. Their orders, sales and changes stay on record, and you can switch the account back on at any time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
              <Button onClick={handleDeactivate} className="bg-red-600 hover:bg-red-700 text-white">
                Deactivate
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Staff;
