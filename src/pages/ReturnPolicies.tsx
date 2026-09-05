import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FaPlus, FaTimes, FaEdit, FaTrash } from 'react-icons/fa';

interface ReturnPolicy {
  id: string;
  name: string;
  is_returnable: boolean;
  return_window_days?: number;
  is_replaceable: boolean;
  replacement_window_days?: number;
  is_refundable: boolean;
  refund_window_days?: number;
  refund_mode?: string;
  conditions?: string;
  exceptions?: string;
  /** Exactly one policy is the STORE default — it sets the return window for
   *  every product that has no policy of its own, and that window is what
   *  decides when a delivered order stops being returnable. */
  is_default?: boolean;
}

/** Mirrors DEFAULT_RETURN_WINDOW_DAYS in backend/src/db/queries/tax.ts — the
 *  window used when a store has set no default policy at all. */
const DEFAULT_RETURN_WINDOW_DAYS = 7;

const EMPTY_FORM = {
  name: '',
  is_default: false,
  is_returnable: false,
  return_window_days: '',
  is_replaceable: false,
  replacement_window_days: '',
  is_refundable: false,
  refund_window_days: '',
  refund_mode: 'original_payment',
  conditions: '',
  exceptions: '',
};

const ReturnPolicies: React.FC = () => {
  const [policies, setPolicies] = useState<ReturnPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { fetchPolicies(); }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/tax/return-policies');
      const data = res.data;
      if (Array.isArray(data)) setPolicies(data);
      else if (Array.isArray(data?.data)) setPolicies(data.data);
      else setPolicies([]);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setPolicies([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load return policies. The endpoint may not be available yet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (policy: ReturnPolicy) => {
    setEditId(policy.id);
    setForm({
      name: policy.name,
      is_default: !!policy.is_default,
      is_returnable: policy.is_returnable,
      return_window_days: policy.return_window_days != null ? String(policy.return_window_days) : '',
      is_replaceable: policy.is_replaceable,
      replacement_window_days: policy.replacement_window_days != null ? String(policy.replacement_window_days) : '',
      is_refundable: policy.is_refundable,
      refund_window_days: policy.refund_window_days != null ? String(policy.refund_window_days) : '',
      refund_mode: policy.refund_mode ?? 'original_payment',
      conditions: policy.conditions ?? '',
      exceptions: policy.exceptions ?? '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required'); return; }

    setSaving(true);
    setFormError(null);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      is_default: form.is_default,
      is_returnable: form.is_returnable,
      return_window_days: form.return_window_days ? parseInt(form.return_window_days) : undefined,
      is_replaceable: form.is_replaceable,
      replacement_window_days: form.replacement_window_days ? parseInt(form.replacement_window_days) : undefined,
      is_refundable: form.is_refundable,
      refund_window_days: form.refund_window_days ? parseInt(form.refund_window_days) : undefined,
      refund_mode: form.refund_mode || undefined,
      conditions: form.conditions.trim() || undefined,
      exceptions: form.exceptions.trim() || undefined,
    };

    try {
      if (editId) {
        await api.put(`/tax/return-policies/${editId}`, payload);
      } else {
        await api.post('/tax/return-policies', payload);
      }
      setShowModal(false);
      fetchPolicies();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  /** The one policy that sets the store-wide window (backend enforces singularity). */
  const defaultPolicy = policies.find(p => p.is_default) ?? null;

  const handleDelete = async (policy: ReturnPolicy) => {
    if (!confirm(`Delete return policy "${policy.name}"?`)) return;
    try {
      await api.delete(`/tax/return-policies/${policy.id}`);
      fetchPolicies();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete policy');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Return Policies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Define return, replacement, and refund policies for your products. The policy marked
            <strong> Store default</strong> sets your store's return window.
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          Add Policy
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      {/* The store-level return window, stated plainly. A delivered order stops
          being returnable — and becomes billable — when this many days pass, so
          "no default set" is a real condition worth naming rather than hiding
          behind a silent 7-day fallback. */}
      {!loading && !error && (
        defaultPolicy ? (
          <div className="p-4 border rounded-md bg-muted/40 text-sm">
            <span className="text-muted-foreground">Your store's return window is </span>
            <strong>{defaultPolicy.return_window_days ?? DEFAULT_RETURN_WINDOW_DAYS} days</strong>
            <span className="text-muted-foreground">, from the default policy </span>
            <strong>{defaultPolicy.name}</strong>
            <span className="text-muted-foreground">
              . It applies to every product without a policy of its own, and it decides when a
              delivered order stops being returnable.
            </span>
          </div>
        ) : (
          <div className="p-4 border border-amber-300 bg-amber-50 text-amber-900 text-sm rounded-md">
            <strong>No store default is set.</strong> Your store is falling back to{' '}
            {DEFAULT_RETURN_WINDOW_DAYS} days, and editing a policy below will not change that
            until you mark one as the store default
            {policies.length > 0 ? ' (edit a policy and turn on "Use as store default")' : ''}.
          </div>
        )
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold px-4 py-3">Name</TableHead>
                <TableHead className="font-semibold px-4 py-3">Returnable</TableHead>
                <TableHead className="font-semibold px-4 py-3">Return Window</TableHead>
                <TableHead className="font-semibold px-4 py-3">Refund Mode</TableHead>
                <TableHead className="font-semibold px-4 py-3">Refundable</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : policies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    No return policies configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                policies.map(policy => (
                  <TableRow key={policy.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        {policy.name}
                        {policy.is_default && (
                          <Badge className="bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs">Store default</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {policy.is_returnable
                        ? <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">Yes</Badge>
                        : <Badge variant="secondary" className="text-xs">No</Badge>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {policy.return_window_days != null ? `${policy.return_window_days} days` : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground capitalize">
                      {policy.refund_mode?.replace(/_/g, ' ') || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {policy.is_refundable
                        ? <Badge className="bg-blue-100 text-blue-800 border border-blue-200 text-xs">Yes</Badge>
                        : <Badge variant="secondary" className="text-xs">No</Badge>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => openEdit(policy)}>
                          <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(policy)}>
                          <FaTrash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editId ? 'Edit Return Policy' : 'Add Return Policy'}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <FaTimes className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                {formError && (
                  <div className="p-3 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
                    {formError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="policy-name">Policy Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="policy-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Standard Return Policy"
                    required
                  />
                </div>

                {/* Store default — the switch that makes this policy the store's
                    return window. Without it, a policy only applies to products
                    explicitly linked to it. */}
                <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-default"
                      checked={form.is_default}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_default: checked }))}
                    />
                    <Label htmlFor="is-default" className="cursor-pointer font-medium">Use as store default</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Applies this policy's return window to every product without a policy of its own,
                    and it is the window that decides when a delivered order stops being returnable.
                    {defaultPolicy && defaultPolicy.id !== editId && (
                      <> Turning this on removes the default from <strong>{defaultPolicy.name}</strong> —
                      only one policy can be the store default.</>
                    )}
                  </p>
                </div>

                {/* Returnable */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-returnable"
                      checked={form.is_returnable}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_returnable: checked }))}
                    />
                    <Label htmlFor="is-returnable" className="cursor-pointer font-medium">Product is returnable</Label>
                  </div>
                  {form.is_returnable && (
                    <div className="space-y-2">
                      <Label htmlFor="return-window">Return Window (days)</Label>
                      <Input
                        id="return-window"
                        type="number"
                        min={1}
                        value={form.return_window_days}
                        onChange={e => setForm(f => ({ ...f, return_window_days: e.target.value }))}
                        placeholder="7"
                      />
                    </div>
                  )}
                </div>

                {/* Replaceable */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-replaceable"
                      checked={form.is_replaceable}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_replaceable: checked }))}
                    />
                    <Label htmlFor="is-replaceable" className="cursor-pointer font-medium">Product is replaceable</Label>
                  </div>
                  {form.is_replaceable && (
                    <div className="space-y-2">
                      <Label htmlFor="replacement-window">Replacement Window (days)</Label>
                      <Input
                        id="replacement-window"
                        type="number"
                        min={1}
                        value={form.replacement_window_days}
                        onChange={e => setForm(f => ({ ...f, replacement_window_days: e.target.value }))}
                        placeholder="7"
                      />
                    </div>
                  )}
                </div>

                {/* Refundable */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-refundable"
                      checked={form.is_refundable}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_refundable: checked }))}
                    />
                    <Label htmlFor="is-refundable" className="cursor-pointer font-medium">Product is refundable</Label>
                  </div>
                  {form.is_refundable && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="refund-window">Refund Window (days)</Label>
                        <Input
                          id="refund-window"
                          type="number"
                          min={1}
                          value={form.refund_window_days}
                          onChange={e => setForm(f => ({ ...f, refund_window_days: e.target.value }))}
                          placeholder="7"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="refund-mode">Refund Mode</Label>
                        <Select
                          value={form.refund_mode}
                          onValueChange={v => setForm(f => ({ ...f, refund_mode: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="original_payment">Original Payment</SelectItem>
                            <SelectItem value="store_credit">Store Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conditions">Conditions</Label>
                  <Textarea
                    id="conditions"
                    rows={3}
                    value={form.conditions}
                    onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
                    placeholder="Product must be unused and in original packaging..."
                    className="resize-y"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="exceptions">Exceptions</Label>
                  <Textarea
                    id="exceptions"
                    rows={3}
                    value={form.exceptions}
                    onChange={e => setForm(f => ({ ...f, exceptions: e.target.value }))}
                    placeholder="Non-returnable if seal is broken..."
                    className="resize-y"
                  />
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Saving...' : editId ? 'Update Policy' : 'Create Policy'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnPolicies;
