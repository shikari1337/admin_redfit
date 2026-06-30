import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FaPlus, FaTimes, FaEdit, FaTrash } from 'react-icons/fa';

interface TaxRule {
  id: string;
  name: string;
  rate: number;
  hsn_code?: string;
  tax_type: 'GST' | 'IGST';
  components?: {
    cgst?: number;
    sgst?: number;
    igst?: number;
  };
  is_active: boolean;
}

const EMPTY_FORM = {
  name: '',
  rate: '',
  hsn_code: '',
  tax_type: 'GST' as 'GST' | 'IGST',
  cgst: '',
  sgst: '',
  igst: '',
  is_active: true,
};

const TaxRules: React.FC = () => {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/tax-rules');
      const data = res.data;
      if (Array.isArray(data)) setRules(data);
      else if (Array.isArray(data?.data)) setRules(data.data);
      else setRules([]);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setRules([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load tax rules. The endpoint may not be available yet.');
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

  const openEdit = (rule: TaxRule) => {
    setEditId(rule.id);
    setForm({
      name: rule.name,
      rate: String(rule.rate),
      hsn_code: rule.hsn_code ?? '',
      tax_type: rule.tax_type,
      cgst: rule.components?.cgst != null ? String(rule.components.cgst) : '',
      sgst: rule.components?.sgst != null ? String(rule.components.sgst) : '',
      igst: rule.components?.igst != null ? String(rule.components.igst) : '',
      is_active: rule.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.rate) { setFormError('Rate is required'); return; }

    setSaving(true);
    setFormError(null);

    const components: Record<string, number> = {};
    if (form.tax_type === 'GST') {
      if (form.cgst) components.cgst = parseFloat(form.cgst);
      if (form.sgst) components.sgst = parseFloat(form.sgst);
    } else {
      if (form.igst) components.igst = parseFloat(form.igst);
    }

    const payload: Record<string, any> = {
      name: form.name.trim(),
      rate: parseFloat(form.rate),
      hsn_code: form.hsn_code.trim() || undefined,
      tax_type: form.tax_type,
      components: Object.keys(components).length > 0 ? components : undefined,
      is_active: form.is_active,
    };

    try {
      if (editId) {
        await api.put(`/tax-rules/${editId}`, payload);
      } else {
        await api.post('/tax-rules', payload);
      }
      setShowModal(false);
      fetchRules();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save tax rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: TaxRule) => {
    if (!confirm(`Delete tax rule "${rule.name}"?`)) return;
    try {
      await api.delete(`/tax-rules/${rule.id}`);
      fetchRules();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete tax rule');
    }
  };

  const formatComponents = (rule: TaxRule) => {
    if (!rule.components) return '—';
    const parts: string[] = [];
    if (rule.components.cgst != null) parts.push(`CGST ${rule.components.cgst}%`);
    if (rule.components.sgst != null) parts.push(`SGST ${rule.components.sgst}%`);
    if (rule.components.igst != null) parts.push(`IGST ${rule.components.igst}%`);
    return parts.join(' + ') || '—';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Tax Rules</h1>
          <p className="text-muted-foreground mt-1 text-sm">Configure GST and IGST tax rates for products.</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          Add Tax Rule
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
                <TableHead className="font-semibold px-4 py-3">Name</TableHead>
                <TableHead className="font-semibold px-4 py-3">Rate</TableHead>
                <TableHead className="font-semibold px-4 py-3">HSN Code</TableHead>
                <TableHead className="font-semibold px-4 py-3">Type</TableHead>
                <TableHead className="font-semibold px-4 py-3">Components</TableHead>
                <TableHead className="font-semibold px-4 py-3">Active</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    No tax rules configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map(rule => (
                  <TableRow key={rule.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3 font-medium">{rule.name}</TableCell>
                    <TableCell className="px-4 py-3 font-semibold">{rule.rate}%</TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-muted-foreground">
                      {rule.hsn_code || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="outline" className="text-xs font-semibold">
                        {rule.tax_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {formatComponents(rule)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {rule.is_active
                        ? <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">Active</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => openEdit(rule)}>
                          <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(rule)}>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editId ? 'Edit Tax Rule' : 'Add Tax Rule'}</h2>
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
                  <Label htmlFor="tax-name">Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="tax-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. GST 18%"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax-rate">Rate (%) <span className="text-destructive">*</span></Label>
                    <Input
                      id="tax-rate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.rate}
                      onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                      placeholder="18"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-hsn">HSN Code</Label>
                    <Input
                      id="tax-hsn"
                      value={form.hsn_code}
                      onChange={e => setForm(f => ({ ...f, hsn_code: e.target.value }))}
                      placeholder="3004"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tax-type">Tax Type</Label>
                  <Select
                    value={form.tax_type}
                    onValueChange={v => setForm(f => ({ ...f, tax_type: v as 'GST' | 'IGST' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GST">GST (CGST + SGST)</SelectItem>
                      <SelectItem value="IGST">IGST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.tax_type === 'GST' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cgst">CGST (%)</Label>
                      <Input
                        id="cgst"
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.cgst}
                        onChange={e => setForm(f => ({ ...f, cgst: e.target.value }))}
                        placeholder="9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sgst">SGST (%)</Label>
                      <Input
                        id="sgst"
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.sgst}
                        onChange={e => setForm(f => ({ ...f, sgst: e.target.value }))}
                        placeholder="9"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="igst">IGST (%)</Label>
                    <Input
                      id="igst"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.igst}
                      onChange={e => setForm(f => ({ ...f, igst: e.target.value }))}
                      placeholder="18"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id="tax-active"
                    checked={form.is_active}
                    onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))}
                  />
                  <Label htmlFor="tax-active" className="cursor-pointer">Rule is active</Label>
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Saving...' : editId ? 'Update Rule' : 'Create Rule'}
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

export default TaxRules;
