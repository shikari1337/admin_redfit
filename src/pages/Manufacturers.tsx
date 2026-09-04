import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FaPlus, FaTimes, FaEdit, FaTrash } from 'react-icons/fa';

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  address?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  license_no?: string;
  logo_url?: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  address: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  license_no: '',
  logo_url: '',
  is_active: true,
};

const toKebab = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');

const Manufacturers: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend requires products.manage for create/update, products.delete for
  // removal (routes/manufacturers.ts) — this page had NO client-side gating
  // before.
  const canManageManufacturers = hasPerm('products.manage');
  const canDeleteManufacturers = hasPerm('products.delete');
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => { fetchManufacturers(); }, []);

  const fetchManufacturers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/manufacturers');
      const data = res.data;
      if (Array.isArray(data)) setManufacturers(data);
      else if (Array.isArray(data?.data)) setManufacturers(data.data);
      else setManufacturers([]);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setManufacturers([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load manufacturers. The endpoint may not be available yet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setSlugManuallyEdited(false);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (mfr: Manufacturer) => {
    setEditId(mfr.id);
    setForm({
      name: mfr.name,
      slug: mfr.slug,
      address: mfr.address ?? '',
      country: mfr.country ?? '',
      phone: mfr.phone ?? '',
      email: mfr.email ?? '',
      website: mfr.website ?? '',
      license_no: mfr.license_no ?? '',
      logo_url: mfr.logo_url ?? '',
      is_active: mfr.is_active,
    });
    setSlugManuallyEdited(true);
    setFormError(null);
    setShowModal(true);
  };

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      slug: slugManuallyEdited ? f.slug : toKebab(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required'); return; }

    setSaving(true);
    setFormError(null);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      slug: form.slug.trim() || toKebab(form.name),
      address: form.address.trim() || undefined,
      country: form.country.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      website: form.website.trim() || undefined,
      license_no: form.license_no.trim() || undefined,
      logo_url: form.logo_url.trim() || undefined,
      is_active: form.is_active,
    };

    try {
      if (editId) {
        await api.put(`/manufacturers/${editId}`, payload);
      } else {
        await api.post('/manufacturers', payload);
      }
      setShowModal(false);
      fetchManufacturers();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save manufacturer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mfr: Manufacturer) => {
    if (!confirm(`Delete manufacturer "${mfr.name}"?`)) return;
    try {
      await api.delete(`/manufacturers/${mfr.id}`);
      fetchManufacturers();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete manufacturer');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Manufacturers</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage product manufacturers and suppliers.</p>
        </div>
        {canManageManufacturers && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <FaPlus className="h-4 w-4" />
            Add Manufacturer
          </Button>
        )}
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
                <TableHead className="font-semibold px-4 py-3 w-12">Logo</TableHead>
                <TableHead className="font-semibold px-4 py-3">Name</TableHead>
                <TableHead className="font-semibold px-4 py-3">Country</TableHead>
                <TableHead className="font-semibold px-4 py-3">Phone</TableHead>
                <TableHead className="font-semibold px-4 py-3">Email</TableHead>
                <TableHead className="font-semibold px-4 py-3">License No.</TableHead>
                <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : manufacturers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    No manufacturers found. Add your first manufacturer.
                  </TableCell>
                </TableRow>
              ) : (
                manufacturers.map(mfr => (
                  <TableRow key={mfr.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3">
                      {mfr.logo_url ? (
                        <img
                          src={mfr.logo_url}
                          alt={mfr.name}
                          className="h-9 w-9 rounded border object-contain bg-white"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-9 w-9 rounded border bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {mfr.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="font-medium">{mfr.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{mfr.slug}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{mfr.country || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{mfr.phone || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{mfr.email || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-muted-foreground">{mfr.license_no || '—'}</TableCell>
                    <TableCell className="px-4 py-3">
                      {mfr.is_active
                        ? <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">Active</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canManageManufacturers && (
                          <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => openEdit(mfr)}>
                            <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Button>
                        )}
                        {canDeleteManufacturers && (
                          <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(mfr)}>
                            <FaTrash className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
              <h2 className="text-lg font-semibold">{editId ? 'Edit Manufacturer' : 'Add Manufacturer'}</h2>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="mfr-name">Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="mfr-name"
                      value={form.name}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder="Manufacturer name"
                      required
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="mfr-slug">Slug</Label>
                    <Input
                      id="mfr-slug"
                      value={form.slug}
                      onChange={e => { setSlugManuallyEdited(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                      placeholder="auto-generated"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="mfr-address">Address</Label>
                    <Input
                      id="mfr-address"
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="Full address"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-country">Country</Label>
                    <Input
                      id="mfr-country"
                      value={form.country}
                      onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                      placeholder="India"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-phone">Phone</Label>
                    <Input
                      id="mfr-phone"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-email">Email</Label>
                    <Input
                      id="mfr-email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="contact@manufacturer.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-website">Website</Label>
                    <Input
                      id="mfr-website"
                      value={form.website}
                      onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-license">License No.</Label>
                    <Input
                      id="mfr-license"
                      value={form.license_no}
                      onChange={e => setForm(f => ({ ...f, license_no: e.target.value }))}
                      placeholder="MFG/2024/..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfr-logo">Logo URL</Label>
                    <Input
                      id="mfr-logo"
                      value={form.logo_url}
                      onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                {form.logo_url && (
                  <img
                    src={form.logo_url}
                    alt="Logo preview"
                    className="h-16 w-16 rounded border object-contain bg-white"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                <div className="flex items-center gap-3">
                  <Switch
                    id="mfr-active"
                    checked={form.is_active}
                    onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))}
                  />
                  <Label htmlFor="mfr-active" className="cursor-pointer">Manufacturer is active</Label>
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Saving...' : editId ? 'Update Manufacturer' : 'Create Manufacturer'}
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

export default Manufacturers;
