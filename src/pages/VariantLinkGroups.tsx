import React, { useEffect, useState, useRef } from 'react';
import { api, attributesAPI, variantGroupsAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FaPlus, FaTimes, FaEdit, FaTrash, FaSearch, FaArrowUp, FaArrowDown } from 'react-icons/fa';

interface MemberRow {
  productId: string;
  name: string;
  slug?: string;
  sku?: string;
  attributeValue: string;
  isDefault: boolean;
}

interface VariantLinkGroup {
  id: string;
  name: string;
  display_attribute_slug?: string;
  is_active: boolean;
  /** From GET / — number of member products. */
  member_count?: number;
  /** Legacy shape kept for tolerance. */
  products?: string[];
  members?: any[];
}

interface AttributeOpt { _id?: string; id?: string; name?: string; slug?: string }

const EMPTY_FORM = {
  name: '',
  display_attribute_slug: '',
  is_active: true,
};

const VariantLinkGroups: React.FC = () => {
  const [groups, setGroups] = useState<VariantLinkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<AttributeOpt[]>([]);

  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchGroups(); }, []);
  useEffect(() => {
    attributesAPI.list({ isActive: true }).then((list: any[]) => setAttributes(Array.isArray(list) ? list : []));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/variant-groups');
      const data = res.data;
      if (Array.isArray(data)) setGroups(data);
      else if (Array.isArray(data?.data)) setGroups(data.data);
      else setGroups([]);
    } catch (err: any) {
      // A failed load must NOT masquerade as an empty list — show the error.
      setGroups([]);
      setError(err?.response?.data?.message
        || (err?.response?.status ? `Failed to load variant link groups (HTTP ${err.response.status}).` : 'Failed to load variant link groups — is the backend reachable?'));
    } finally {
      setLoading(false);
    }
  };

  const memberCount = (g: VariantLinkGroup): number =>
    typeof g.member_count === 'number' ? g.member_count
      : Array.isArray(g.members) ? g.members.length
      : g.products?.length ?? 0;

  const searchProducts = async (q: string) => {
    if (!q.trim()) { setProductResults([]); setShowProductDropdown(false); return; }
    setProductSearching(true);
    try {
      const res = await api.get('/products', { params: { search: q, limit: 10 } });
      const raw = res.data;
      let items: any[] = [];
      if (Array.isArray(raw)) items = raw;
      else if (Array.isArray(raw?.data)) items = raw.data;
      const opts = items
        .map((p: any) => ({ id: p.id ?? p._id ?? '', name: p.name ?? '', slug: p.slug ?? '', sku: p.sku ?? '' }))
        .filter((p: any) => p.id);
      setProductResults(opts);
      setShowProductDropdown(opts.length > 0);
    } catch {
      setProductResults([]);
    } finally {
      setProductSearching(false);
    }
  };

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(value), 350);
  };

  const selectProduct = (product: any) => {
    setMembers(prev => {
      if (prev.some(m => m.productId === product.id)) return prev;
      return [...prev, {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        attributeValue: '',
        isDefault: prev.length === 0,
      }];
    });
    setProductSearch('');
    setProductResults([]);
    setShowProductDropdown(false);
  };

  const removeMember = (productId: string) => {
    setMembers(prev => {
      const next = prev.filter(m => m.productId !== productId);
      // Keep exactly one default when possible.
      if (next.length && !next.some(m => m.isDefault)) next[0] = { ...next[0], isDefault: true };
      return next;
    });
  };

  const updateMember = (idx: number, patch: Partial<MemberRow>) => {
    setMembers(prev => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const setDefaultMember = (idx: number) => {
    setMembers(prev => prev.map((m, i) => ({ ...m, isDefault: i === idx })));
  };

  const moveMember = (idx: number, dir: -1 | 1) => {
    setMembers(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setMembers([]);
    setFormError(null);
    setProductSearch('');
    setShowModal(true);
  };

  const openEdit = async (group: VariantLinkGroup) => {
    setEditId(group.id);
    setForm({
      name: group.name,
      display_attribute_slug: group.display_attribute_slug ?? '',
      is_active: group.is_active,
    });
    setFormError(null);
    setProductSearch('');
    setMembers([]);
    setShowModal(true);

    // ONE hydrated fetch — GET /variant-groups/:id returns members with
    // name/sku/attribute_value/sort_order/is_default (no per-product N+1).
    setMembersLoading(true);
    try {
      const g: any = await variantGroupsAPI.getById(group.id);
      const fresh = g?.id ? g : (g?.data?.id ? g.data : null);
      if (!fresh) throw new Error('Group not found');
      const rows: MemberRow[] = (fresh.members || [])
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((m: any) => ({
          productId: m.product_id ?? m.productId ?? '',
          name: m.name ?? m.product_id ?? '',
          slug: m.slug ?? '',
          sku: m.sku ?? '',
          attributeValue: m.attribute_value ?? m.attributeValue ?? '',
          isDefault: !!(m.is_default ?? m.isDefault),
        }))
        .filter((m: MemberRow) => m.productId);
      setMembers(rows);
      setForm({
        name: fresh.name ?? group.name,
        display_attribute_slug: fresh.display_attribute_slug ?? '',
        is_active: fresh.is_active !== false,
      });
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to load the group\'s members — editing them now could wipe the list. Close and retry.');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Group name is required'); return; }

    setSaving(true);
    setFormError(null);

    // NEW payload contract: { name, displayAttributeSlug, isActive, members }
    const payload: Record<string, any> = {
      name: form.name.trim(),
      displayAttributeSlug: form.display_attribute_slug.trim() || undefined,
      isActive: form.is_active,
      members: members.map((m, i) => ({
        productId: m.productId,
        attributeValue: m.attributeValue.trim(),
        sortOrder: i,
        isDefault: m.isDefault,
      })),
    };

    try {
      if (editId) {
        await variantGroupsAPI.update(editId, payload);
      } else {
        await variantGroupsAPI.create(payload);
      }
      setShowModal(false);
      fetchGroups();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: VariantLinkGroup) => {
    if (!confirm(`Delete variant link group "${group.name}"?`)) return;
    try {
      await variantGroupsAPI.delete(group.id);
      fetchGroups();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete group');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Variant Link Groups</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Link products together so customers can switch between variants (e.g. same medicine in different brands) on the product page.
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchGroups}>Retry</Button>
        </div>
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold px-4 py-3">Group Name</TableHead>
                <TableHead className="font-semibold px-4 py-3">Display Attribute</TableHead>
                <TableHead className="font-semibold px-4 py-3">Products</TableHead>
                <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Couldn't load groups — see the error above.
                  </TableCell>
                </TableRow>
              ) : groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                    No variant link groups yet. Create one to link products together.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map(group => (
                  <TableRow key={group.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3 font-medium">{group.name}</TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-muted-foreground">
                      {group.display_attribute_slug || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {memberCount(group)} product{memberCount(group) !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {group.is_active
                        ? <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">Active</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => openEdit(group)}>
                          <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(group)}>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editId ? 'Edit Variant Link Group' : 'New Variant Link Group'}</h2>
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
                  <Label htmlFor="group-name">Group Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="group-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Arnica Montana - All Brands"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display-attr">Display Attribute</Label>
                  {attributes.length > 0 ? (
                    <select
                      id="display-attr"
                      value={form.display_attribute_slug}
                      onChange={e => setForm(f => ({ ...f, display_attribute_slug: e.target.value }))}
                      className="w-full h-9 px-3 border border-input rounded-md text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— none —</option>
                      {attributes.map(a => {
                        const slug = a.slug || a.name || '';
                        return <option key={a._id || a.id || slug} value={slug}>{a.name || slug}</option>;
                      })}
                      {form.display_attribute_slug && !attributes.some(a => (a.slug || a.name) === form.display_attribute_slug) && (
                        <option value={form.display_attribute_slug}>{form.display_attribute_slug}</option>
                      )}
                    </select>
                  ) : (
                    <Input
                      id="display-attr"
                      value={form.display_attribute_slug}
                      onChange={e => setForm(f => ({ ...f, display_attribute_slug: e.target.value }))}
                      placeholder="e.g. brand or potency"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">The attribute whose value is shown in the variant selector on the product page.</p>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="group-active"
                    checked={form.is_active}
                    onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))}
                  />
                  <Label htmlFor="group-active" className="cursor-pointer">Group is active</Label>
                </div>

                {/* Members — value / default / order editable per row */}
                <div className="space-y-2">
                  <Label>Linked Products</Label>

                  {membersLoading ? (
                    <p className="text-xs text-muted-foreground py-2">Loading members…</p>
                  ) : members.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {members.map((m, idx) => (
                        <div key={m.productId} className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.name}</p>
                            {m.sku && <p className="text-[11px] font-mono text-muted-foreground truncate">{m.sku}</p>}
                          </div>
                          <Input
                            value={m.attributeValue}
                            onChange={e => updateMember(idx, { attributeValue: e.target.value })}
                            placeholder="Attribute value"
                            className="w-36 h-8 text-xs"
                          />
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer shrink-0"
                            title="Shown first on the product page">
                            <input type="radio" name="vlg-default" checked={m.isDefault}
                              onChange={() => setDefaultMember(idx)} className="w-3.5 h-3.5" />
                            default
                          </label>
                          <div className="flex flex-col shrink-0">
                            <button type="button" onClick={() => moveMember(idx, -1)} disabled={idx === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-25 p-0.5" title="Move up">
                              <FaArrowUp className="h-2.5 w-2.5" />
                            </button>
                            <button type="button" onClick={() => moveMember(idx, 1)} disabled={idx === members.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-25 p-0.5" title="Move down">
                              <FaArrowDown className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMember(m.productId)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            aria-label={`Remove ${m.name}`}
                          >
                            <FaTimes className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <div ref={dropdownRef} className="relative">
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={productSearch}
                        onChange={e => handleProductSearchChange(e.target.value)}
                        onFocus={() => productResults.length > 0 && setShowProductDropdown(true)}
                        placeholder="Search and add products..."
                        className="pl-9"
                      />
                      {productSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                        </div>
                      )}
                    </div>

                    {showProductDropdown && productResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {productResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProduct(p)}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${members.find(sp => sp.productId === p.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={Boolean(members.find(sp => sp.productId === p.id))}
                          >
                            <span className="font-medium">{p.name}</span>
                            {p.slug && <span className="text-muted-foreground ml-2 font-mono text-xs">{p.slug}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t">
                <Button type="submit" disabled={saving || membersLoading} className="flex-1">
                  {saving ? 'Saving...' : editId ? 'Update Group' : 'Create Group'}
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

export default VariantLinkGroups;
