import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { payload } from '@/lib/unwrap';
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
import { formatDay } from '../utils/date';

interface ReturnPolicy {
  id: string;
  name: string;
  is_returnable: boolean;
  return_window_days?: number | null;
  is_replaceable: boolean;
  replacement_window_days?: number | null;
  is_refundable: boolean;
  refund_window_days?: number | null;
  refund_mode?: string | null;
  /** A json column: text as the form saves it, `{}` when a policy was saved without any. */
  conditions?: unknown;
  exceptions?: unknown;
  /** A policy not in use is hidden from the product form and the shop; products already on it keep it. */
  is_active?: boolean;
  /** Exactly one policy is the STORE default: it sets the return window for
   *  every product that has no policy of its own, and that window is what
   *  decides when a delivered order stops being returnable. */
  is_default?: boolean;
  /** How many products name this policy (books RETURN_POLICIES `product_count`). */
  product_count?: number | null;
}

/** Mirrors DEFAULT_RETURN_WINDOW_DAYS in growcord-rs commerce service/orders/lifecycle.rs: the
 *  window an order gets when neither its products nor the store name one. */
const DEFAULT_RETURN_WINDOW_DAYS = 7;

/** A new policy starts as the table's own defaults (everything allowed): the switches are enforced
 *  (DEC-086), so a policy saved without looking at them must not quietly refuse every return. */
const EMPTY_FORM = {
  name: '',
  is_default: false,
  is_active: true,
  is_returnable: true,
  return_window_days: '',
  is_replaceable: true,
  replacement_window_days: '',
  is_refundable: true,
  refund_window_days: '',
  refund_mode: 'original_payment',
  conditions: '',
  exceptions: '',
};

/** A json or text column as the text box shows it: `{}` and `[]` are nothing, never "[object Object]". */
const asText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const t = (v as any).text;
    if (typeof t === 'string') return t;
    if (Array.isArray(v) ? v.length === 0 : Object.keys(v as object).length === 0) return '';
    return JSON.stringify(v);
  }
  return String(v);
};

/** A window box: a whole number of days, or nothing. On an edit, nothing clears the window (null);
 *  on a new policy it is simply left out. */
const windowValue = (raw: string, editing: boolean): number | null | undefined => {
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return editing ? null : undefined;
};

const days = (n?: number | null) => (n != null ? `${n} day${n === 1 ? '' : 's'}` : null);

/** How the server enforces the policies (commerce `GET /returns/meta`, staff half, DEC-086). */
interface Enforcement {
  enforced: boolean;
  /** When this store first fixed an order's terms at its delivery (none yet: no order delivered since). */
  since: string | null;
}

const enforcementOf = (m: any): Enforcement | null => {
  const e = m?.policy_enforcement ?? m?.policyEnforcement;
  if (!e || typeof e !== 'object') return null;
  return { enforced: e.enforced !== false, since: e.fixed_at_delivery_since ?? e.fixedAtDeliverySince ?? null };
};

const ReturnPolicies: React.FC = () => {
  const [policies, setPolicies] = useState<ReturnPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  /** The record could not be read whole: its conditions and exceptions are unknown, so an empty
   *  box is left out of the save rather than clearing them. */
  const [partial, setPartial] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [enforcement, setEnforcement] = useState<Enforcement | null>(null);

  useEffect(() => { fetchPolicies(); }, []);
  // Best effort: without it the page still says the rules are enforced, only not since when.
  useEffect(() => {
    api.get('/returns/meta').then((r) => setEnforcement(enforcementOf(payload<any>(r)))).catch(() => setEnforcement(null));
  }, []);

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
        setError(err?.response?.data?.message || 'Could not load your return policies.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setPartial(false);
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setShowModal(true);
  };

  /** The list rows leave out conditions and exceptions, so the record is read whole first. */
  const openEdit = async (row: ReturnPolicy) => {
    setOpening(row.id);
    let policy: ReturnPolicy = row;
    let whole = false;
    try {
      const full = payload<ReturnPolicy>(await api.get(`/tax/return-policies/${row.id}`));
      if (full && typeof full === 'object' && (full as any).id) { policy = { ...row, ...full }; whole = true; }
    } catch {
      // The row still opens; the save leaves the two text boxes alone unless they are typed in.
    } finally {
      setOpening(null);
    }
    setPartial(!whole);
    setEditId(policy.id);
    setForm({
      name: policy.name,
      is_default: !!policy.is_default,
      is_active: policy.is_active !== false,
      is_returnable: !!policy.is_returnable,
      return_window_days: policy.return_window_days != null ? String(policy.return_window_days) : '',
      is_replaceable: !!policy.is_replaceable,
      replacement_window_days: policy.replacement_window_days != null ? String(policy.replacement_window_days) : '',
      is_refundable: !!policy.is_refundable,
      refund_window_days: policy.refund_window_days != null ? String(policy.refund_window_days) : '',
      refund_mode: policy.refund_mode ?? 'original_payment',
      conditions: asText(policy.conditions),
      exceptions: asText(policy.exceptions),
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Give the policy a name.'); return; }
    if (form.is_default && !form.is_active) {
      setFormError('The store default has to be in use. Turn on "In use", or make another policy the default first.');
      return;
    }

    setSaving(true);
    setFormError(null);
    const editing = !!editId;

    const body: Record<string, any> = {
      name: form.name.trim(),
      is_default: form.is_default,
      is_active: form.is_active,
      is_returnable: form.is_returnable,
      return_window_days: windowValue(form.return_window_days, editing),
      is_replaceable: form.is_replaceable,
      replacement_window_days: windowValue(form.replacement_window_days, editing),
      is_refundable: form.is_refundable,
      refund_window_days: windowValue(form.refund_window_days, editing),
      refund_mode: form.refund_mode || undefined,
      conditions: form.conditions.trim() || (editing && !partial ? '' : undefined),
      exceptions: form.exceptions.trim() || (editing && !partial ? '' : undefined),
    };

    try {
      if (editId) {
        await api.put(`/tax/return-policies/${editId}`, body);
      } else {
        await api.post('/tax/return-policies', body);
      }
      setShowModal(false);
      fetchPolicies();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not save this policy.');
    } finally {
      setSaving(false);
    }
  };

  /** The one policy that sets the store-wide window (backend enforces singularity). */
  const defaultPolicy = policies.find(p => p.is_default && p.is_active !== false) ?? null;
  const editingPolicy = editId ? policies.find(p => p.id === editId) ?? null : null;

  const handleDelete = async (policy: ReturnPolicy) => {
    const used = Number(policy.product_count ?? 0);
    const warning = used > 0
      ? `${used} product${used === 1 ? '' : 's'} use "${policy.name}". Deleting it moves them to the store default window. `
        + 'To stop offering it without moving them, edit it and turn off "In use" instead.\n\nDelete it anyway?'
      : `Delete the return policy "${policy.name}"? This cannot be undone.`;
    if (!confirm(warning)) return;
    setError(null);
    try {
      await api.delete(`/tax/return-policies/${policy.id}`);
      fetchPolicies();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not delete this policy.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Return Policies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            How long a customer has to send something back, and what they can get for it. The policy marked
            <strong> Store default</strong> sets your store's return window.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchPolicies} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <FaPlus className="h-4 w-4" />
            Add Policy
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md flex items-center justify-between gap-3 flex-wrap">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchPolicies}>Try again</Button>
        </div>
      )}

      {/* DEC-086: the rules below are enforced by the server, and from when. */}
      {!loading && !error && (
        <div className="p-4 border border-border rounded-md text-sm space-y-1.5">
          <p className="font-medium text-foreground">These rules are enforced.</p>
          <p className="text-muted-foreground">
            A customer&apos;s request that a policy does not allow (an item that is not returnable, replaceable or
            refundable, or a window that has closed) is refused, with the reason shown to them. Your returns desk can
            still raise one as an exception, but only with a reason, which is kept with the name of the person who
            raised it. Windows count from the day the order is delivered.
          </p>
          <p className="text-muted-foreground">
            {enforcement?.since ? (
              <>Since <strong className="text-foreground">{formatDay(enforcement.since)}</strong>, each delivered order
                keeps the policy that was in force on its delivery day, so editing a policy changes only orders
                delivered after the edit. Orders delivered before that are judged by the policy as it stands now.</>
            ) : (
              <>From the next order delivered, each order keeps the policy in force on its delivery day, so a later
                edit does not change it. Orders delivered before that are judged by the policy as it stands now.</>
            )}
          </p>
        </div>
      )}

      {/* The store-level return window, stated plainly. A delivered order stops
          being returnable (and becomes billable) when this many days pass, so
          "no default set" is a real condition worth naming rather than hiding
          behind a silent 7-day fallback. */}
      {!loading && !error && (
        defaultPolicy ? (
          <div className="p-4 border border-border rounded-md bg-muted/40 text-sm">
            <span className="text-muted-foreground">Your store's return window is </span>
            <strong>{defaultPolicy.return_window_days ?? DEFAULT_RETURN_WINDOW_DAYS} days</strong>
            <span className="text-muted-foreground">, from the default policy </span>
            <strong>{defaultPolicy.name}</strong>
            <span className="text-muted-foreground">
              . It applies to every product without a policy of its own, and it decides when a
              delivered order stops being returnable. Your product pages state this window.
            </span>
          </div>
        ) : (
          <div className="p-4 border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 text-sm rounded-md">
            <strong>No store default is set.</strong> Your store is falling back to{' '}
            {DEFAULT_RETURN_WINDOW_DAYS} days, and editing a policy below will not change that
            until you mark one as the store default
            {policies.length > 0 ? ' (edit a policy and turn on "Use as store default")' : ''}.
          </div>
        )
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="w-0 min-w-full overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold px-4 py-3">Name</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Return window</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Replacement</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Refund</TableHead>
                  <TableHead className="font-semibold px-4 py-3 text-right">Products</TableHead>
                  <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : policies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                      <p className="font-medium">No return policies yet.</p>
                      <p className="text-xs mt-1">
                        Add one and mark it as the store default to set how long customers have to return an order.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  policies.map(policy => {
                    const inUse = policy.is_active !== false;
                    const count = policy.product_count;
                    return (
                      <TableRow key={policy.id} className={`hover:bg-muted/50 transition-colors ${inUse ? '' : 'opacity-60'}`}>
                        <TableCell className="px-4 py-3 font-medium">
                          <span className="flex items-center gap-2 flex-wrap">
                            {policy.name}
                            {policy.is_default && (
                              <Badge className="bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs">Store default</Badge>
                            )}
                            {!inUse && <Badge variant="secondary" className="text-xs">Not in use</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                          {policy.is_returnable
                            ? (days(policy.return_window_days) ?? <span className="text-muted-foreground">Store window</span>)
                            : <span className="text-muted-foreground">Not returnable</span>}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                          {policy.is_replaceable
                            ? (days(policy.replacement_window_days) ?? 'Yes')
                            : <span className="text-muted-foreground">No</span>}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                          {policy.is_refundable ? (
                            <span>
                              {days(policy.refund_window_days) ?? 'Yes'}
                              {policy.refund_mode && (
                                <span className="block text-xs text-muted-foreground capitalize">{policy.refund_mode.replace(/_/g, ' ')}</span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">No</span>}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-right tabular-nums">
                          {count == null ? <span className="text-muted-foreground">-</span> : count === 0 ? <span className="text-muted-foreground">None</span> : count}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" className="h-8 px-3" disabled={opening === policy.id} onClick={() => openEdit(policy)}>
                              {opening === policy.id
                                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                : <FaEdit className="h-3.5 w-3.5 mr-1.5" />}
                              Edit
                            </Button>
                            <Button variant="destructive" size="sm" className="h-8 w-8 p-0" aria-label={`Delete ${policy.name}`} onClick={() => handleDelete(policy)}>
                              <FaTrash className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border">
              <h2 className="text-lg font-semibold">{editId ? 'Edit Return Policy' : 'Add Return Policy'}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} aria-label="Close">
                <FaTimes className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-5 sm:p-6 space-y-5">
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

                {/* Store default: the switch that makes this policy the store's
                    return window. Without it, a policy only applies to products
                    explicitly linked to it. */}
                <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-default"
                      checked={form.is_default}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_default: checked, is_active: checked ? true : f.is_active }))}
                    />
                    <Label htmlFor="is-default" className="cursor-pointer font-medium">Use as store default</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Applies this policy's return window to every product without a policy of its own,
                    and it is the window that decides when a delivered order stops being returnable.
                    {defaultPolicy && defaultPolicy.id !== editId && (
                      <> Turning this on removes the default from <strong>{defaultPolicy.name}</strong>:
                      only one policy can be the store default.</>
                    )}
                  </p>
                </div>

                {/* In use: a retired policy leaves the product form and the shop, while the
                    products already on it keep their window. The safe way to stop offering one. */}
                <div className="space-y-2 p-4 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-active"
                      checked={form.is_active}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))}
                    />
                    <Label htmlFor="is-active" className="cursor-pointer font-medium">In use</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Turn off to stop offering this policy on new products. Products already on it keep it
                    {editingPolicy?.product_count ? <> ({editingPolicy.product_count} today)</> : null}.
                  </p>
                </div>

                {/* Returnable */}
                <div className="space-y-3 p-4 border border-border rounded-lg">
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
                        inputMode="numeric"
                        min={1}
                        value={form.return_window_days}
                        onChange={e => setForm(f => ({ ...f, return_window_days: e.target.value }))}
                        placeholder={String(DEFAULT_RETURN_WINDOW_DAYS)}
                      />
                      <p className="text-xs text-muted-foreground">Counted from the day the order is delivered. Leave empty to use the store's window.</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {form.is_returnable
                      ? 'Requests are accepted until the return window closes. The replacement and refund windows never run past it.'
                      : 'Off: the item cannot be sent back for anything, so no replacement or refund can be asked either.'}
                  </p>
                </div>

                {/* Replaceable */}
                <div className="space-y-3 p-4 border border-border rounded-lg">
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
                        inputMode="numeric"
                        min={1}
                        value={form.replacement_window_days}
                        onChange={e => setForm(f => ({ ...f, replacement_window_days: e.target.value }))}
                        placeholder="Return window"
                      />
                      <p className="text-xs text-muted-foreground">Days after delivery a replacement can be asked for. Leave empty to use the return window.</p>
                    </div>
                  )}
                  {!form.is_replaceable && (
                    <p className="text-xs text-muted-foreground">Off: a request for a replacement of this item is refused.</p>
                  )}
                </div>

                {/* Refundable */}
                <div className="space-y-3 p-4 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="is-refundable"
                      checked={form.is_refundable}
                      onCheckedChange={checked => setForm(f => ({ ...f, is_refundable: checked }))}
                    />
                    <Label htmlFor="is-refundable" className="cursor-pointer font-medium">Product is refundable</Label>
                  </div>
                  {form.is_refundable && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="refund-window">Refund Window (days)</Label>
                        <Input
                          id="refund-window"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={form.refund_window_days}
                          onChange={e => setForm(f => ({ ...f, refund_window_days: e.target.value }))}
                          placeholder="Return window"
                        />
                        <p className="text-xs text-muted-foreground">Days after delivery money back can be asked for. Empty: the return window.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="refund-mode">Refund Mode</Label>
                        <Select
                          value={form.refund_mode}
                          onValueChange={v => setForm(f => ({ ...f, refund_mode: v }))}
                        >
                          <SelectTrigger id="refund-mode">
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
                  {!form.is_refundable && (
                    <p className="text-xs text-muted-foreground">Off: a request for a refund or store credit for this item is refused.</p>
                  )}
                </div>

                {partial && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The saved conditions and exceptions could not be read. They are kept as they are unless you type new ones.
                  </p>
                )}
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

              <div className="flex gap-3 p-5 sm:p-6 border-t border-border">
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
