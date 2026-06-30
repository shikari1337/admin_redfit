import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FaPlus, FaTimes, FaEdit, FaTrash, FaSearch } from 'react-icons/fa';

interface ProductOption {
  id: string;
  name: string;
  slug: string;
}

interface VariantLinkGroup {
  id: string;
  name: string;
  display_attribute_slug?: string;
  is_active: boolean;
  products?: string[];
}

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
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchGroups(); }, []);

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
      const res = await api.get('/variant-link-groups');
      const data = res.data;
      if (Array.isArray(data)) setGroups(data);
      else if (Array.isArray(data?.data)) setGroups(data.data);
      else setGroups([]);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setGroups([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load variant link groups. The endpoint may not be available yet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = async (q: string) => {
    if (!q.trim()) { setProductResults([]); setShowProductDropdown(false); return; }
    setProductSearching(true);
    try {
      const res = await api.get('/products', { params: { search: q, limit: 10 } });
      const raw = res.data;
      let items: any[] = [];
      if (Array.isArray(raw)) items = raw;
      else if (Array.isArray(raw?.data)) items = raw.data;
      const opts: ProductOption[] = items.map((p: any) => ({
        id: p.id ?? p._id ?? '',
        name: p.name ?? '',
        slug: p.slug ?? '',
      }));
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

  const selectProduct = (product: ProductOption) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts(prev => [...prev, product]);
    }
    setProductSearch('');
    setProductResults([]);
    setShowProductDropdown(false);
  };

  const removeProduct = (id: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== id));
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setSelectedProducts([]);
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
    setShowModal(true);

    // Load linked products
    if (group.products && group.products.length > 0) {
      try {
        const opts: ProductOption[] = [];
        for (const pid of group.products) {
          try {
            const res = await api.get(`/products/${pid}`);
            const d = res.data?.data ?? res.data;
            if (d) opts.push({ id: d.id ?? d._id ?? pid, name: d.name ?? pid, slug: d.slug ?? '' });
          } catch {
            opts.push({ id: pid, name: pid, slug: '' });
          }
        }
        setSelectedProducts(opts);
      } catch {
        setSelectedProducts([]);
      }
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Group name is required'); return; }

    setSaving(true);
    setFormError(null);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      display_attribute_slug: form.display_attribute_slug.trim() || undefined,
      is_active: form.is_active,
      products: selectedProducts.map(p => p.id),
    };

    try {
      if (editId) {
        await api.put(`/variant-link-groups/${editId}`, payload);
      } else {
        await api.post('/variant-link-groups', payload);
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
      await api.delete(`/variant-link-groups/${group.id}`);
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
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
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
                      {group.products?.length ?? 0} product{(group.products?.length ?? 0) !== 1 ? 's' : ''}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <Label htmlFor="display-attr">Display Attribute Slug</Label>
                  <Input
                    id="display-attr"
                    value={form.display_attribute_slug}
                    onChange={e => setForm(f => ({ ...f, display_attribute_slug: e.target.value }))}
                    placeholder="e.g. brand or potency"
                  />
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

                {/* Product Multi-Select */}
                <div className="space-y-2">
                  <Label>Linked Products</Label>

                  {/* Selected products */}
                  {selectedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30 min-h-[2.5rem]">
                      {selectedProducts.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                        >
                          {p.name}
                          <button
                            type="button"
                            onClick={() => removeProduct(p.id)}
                            className="hover:text-destructive transition-colors"
                            aria-label={`Remove ${p.name}`}
                          >
                            <FaTimes className="h-3 w-3" />
                          </button>
                        </span>
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
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${selectedProducts.find(sp => sp.id === p.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={Boolean(selectedProducts.find(sp => sp.id === p.id))}
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
                <Button type="submit" disabled={saving} className="flex-1">
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
