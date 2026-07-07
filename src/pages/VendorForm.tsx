import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vendorsAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const BANK_FIELDS = ['account_number', 'ifsc_code', 'bank_name', 'account_holder'];

const VendorForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    business_name: '',
    slug: '',
    gst_number: '',
    pan_number: '',
    commission_pct: '0',
    logo_url: '',
    is_active: true,
    status: 'pending' as 'pending' | 'approved' | 'suspended' | 'rejected',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_name: '',
    bank_account_holder: '',
  });

  useEffect(() => {
    if (!isEdit) return;
    vendorsAPI.getById(id!).then((data: any) => {
      if (!data) { setError('Vendor not found'); return; }
      const bd = data.bank_details || {};
      setForm({
        business_name: data.business_name || '',
        slug: data.slug || '',
        gst_number: data.gst_number || '',
        pan_number: data.pan_number || '',
        commission_pct: String(data.commission_pct ?? 0),
        logo_url: data.logo_url || '',
        is_active: data.is_active !== false,
        status: data.status || 'pending',
        bank_account_number: bd.account_number || '',
        bank_ifsc_code: bd.ifsc_code || '',
        bank_name: bd.bank_name || '',
        bank_account_holder: bd.account_holder || '',
      });
    }).catch(() => setError('Failed to load vendor'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, business_name: name, slug: f.slug || toSlug(name) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name.trim() || !form.slug.trim()) {
      setError('Business name and slug are required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload: any = {
      business_name: form.business_name.trim(),
      slug: form.slug.trim(),
      gst_number: form.gst_number.trim() || undefined,
      pan_number: form.pan_number.trim() || undefined,
      commission_pct: parseFloat(form.commission_pct) || 0,
      logo_url: form.logo_url.trim() || undefined,
      is_active: form.is_active,
    };
    if (isEdit) payload.status = form.status;
    // Bank details
    const bank: Record<string, string> = {};
    if (form.bank_account_number) bank.account_number = form.bank_account_number;
    if (form.bank_ifsc_code) bank.ifsc_code = form.bank_ifsc_code;
    if (form.bank_name) bank.bank_name = form.bank_name;
    if (form.bank_account_holder) bank.account_holder = form.bank_account_holder;
    if (Object.keys(bank).length) payload.bank_details = bank;

    try {
      if (isEdit) {
        await vendorsAPI.update(id!, payload);
      } else {
        await vendorsAPI.create(payload);
      }
      navigate('/vendors');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{isEdit ? 'Edit Vendor' : 'Add Vendor'}</h1>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-md border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">Basic Information</h2>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Business Name <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">URL-friendly identifier. Auto-generated from business name.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">GST Number</label>
                <input
                  type="text"
                  value={form.gst_number}
                  onChange={(e) => setForm((f) => ({ ...f, gst_number: e.target.value.toUpperCase() }))}
                  maxLength={15}
                  placeholder="22AAAAA0000A1Z5"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PAN Number</label>
                <input
                  type="text"
                  value={form.pan_number}
                  onChange={(e) => setForm((f) => ({ ...f, pan_number: e.target.value.toUpperCase() }))}
                  maxLength={10}
                  placeholder="AAAAA0000A"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Commission %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.commission_pct}
                  onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logo URL</label>
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium">Active</span>
              </label>

              {isEdit && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}
                    className="px-2 py-1 text-sm border rounded bg-background"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="suspended">Suspended</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="rounded-md border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">Bank Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Account Number</label>
              <input type="text" value={form.bank_account_number} onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">IFSC Code</label>
              <input type="text" value={form.bank_ifsc_code} onChange={(e) => setForm((f) => ({ ...f, bank_ifsc_code: e.target.value.toUpperCase() }))}
                placeholder="SBIN0001234"
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bank Name</label>
              <input type="text" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Account Holder</label>
              <input type="text" value={form.bank_account_holder} onChange={(e) => setForm((f) => ({ ...f, bank_account_holder: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : isEdit ? 'Update Vendor' : 'Create Vendor'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/vendors')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default VendorForm;
