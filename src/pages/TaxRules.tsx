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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FaPlus, FaTimes, FaEdit, FaTrash, FaChevronDown } from 'react-icons/fa';
import { Info, Plus, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxComponent {
  name: string;   // e.g. "CGST", "SGST", "IGST", "VAT", "Cess"
  rate: number;   // percentage
  inter_state: boolean; // applies when customer ≠ warehouse state?
}

interface TaxRuleMeta {
  hsn_code?: string;
  components: TaxComponent[];
}

interface TaxRule {
  id: string;
  name: string;
  rate: number;
  is_inclusive: boolean;
  applies_to: string;
  country?: string;
  state?: string;
  priority: number;
  is_active: boolean;
  meta: TaxRuleMeta;
}

// ─── Default component presets ────────────────────────────────────────────────

const PRESET_COMPONENTS: Record<string, TaxComponent[]> = {
  gst: [
    { name: 'CGST', rate: 0, inter_state: false },
    { name: 'SGST', rate: 0, inter_state: false },
    { name: 'IGST', rate: 0, inter_state: true },
  ],
  vat: [
    { name: 'VAT', rate: 0, inter_state: false },
  ],
  cess: [
    { name: 'CGST', rate: 0, inter_state: false },
    { name: 'SGST', rate: 0, inter_state: false },
    { name: 'IGST', rate: 0, inter_state: true },
    { name: 'Cess', rate: 0, inter_state: false },
  ],
};

const COMPONENT_SUGGESTIONS = ['CGST', 'SGST', 'IGST', 'VAT', 'Cess', 'CST', 'Surcharge'];

const APPLIES_TO_OPTIONS = [
  { value: 'all',      label: 'All Products' },
  { value: 'category', label: 'By Category' },
  { value: 'product',  label: 'Specific Products' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build default GST components from a total rate (intra CGST+SGST, inter IGST) */
function defaultGstComponents(rate: number): TaxComponent[] {
  const half = parseFloat((rate / 2).toFixed(2));
  return [
    { name: 'CGST', rate: half,   inter_state: false },
    { name: 'SGST', rate: half,   inter_state: false },
    { name: 'IGST', rate: rate,   inter_state: true  },
  ];
}

function formatComponents(components: TaxComponent[], short = false): string {
  if (!components?.length) return '—';
  const intra = components.filter(c => !c.inter_state);
  const inter  = components.filter(c =>  c.inter_state);
  if (short) {
    const parts: string[] = [];
    if (intra.length) parts.push(intra.map(c => `${c.name} ${c.rate}%`).join(' + '));
    if (inter.length)  parts.push(inter.map(c =>  `${c.name} ${c.rate}%`).join(' + '));
    return parts.join(' / ');
  }
  return components.map(c => `${c.name} ${c.rate}%`).join(' · ');
}

// ─── Component ────────────────────────────────────────────────────────────────

const TaxRules: React.FC = () => {
  const [rules, setRules]           = useState<TaxRule[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state
  const [name,        setName]        = useState('');
  const [rate,        setRate]        = useState('');
  const [hsnCode,     setHsnCode]     = useState('');
  const [isInclusive, setIsInclusive] = useState(false);
  const [appliesTo,   setAppliesTo]   = useState('all');
  const [country,     setCountry]     = useState('IN');
  const [state,       setState]       = useState('');
  const [priority,    setPriority]    = useState('0');
  const [isActive,    setIsActive]    = useState(true);
  const [components,  setComponents]  = useState<TaxComponent[]>(defaultGstComponents(18));

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/tax');
      const data = res.data;
      if (Array.isArray(data)) setRules(data);
      else if (Array.isArray(data?.data)) setRules(data.data);
      else setRules([]);
    } catch (err: any) {
      if (err?.response?.status === 404) setRules([]);
      else setError(err?.response?.data?.message || 'Failed to load tax rules.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setRate('18'); setHsnCode('');
    setIsInclusive(false); setAppliesTo('all');
    setCountry('IN'); setState(''); setPriority('0'); setIsActive(true);
    setComponents(defaultGstComponents(18));
    setFormError(null);
    setShowAdvanced(false);
  };

  const openCreate = () => {
    setEditId(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (rule: TaxRule) => {
    setEditId(rule.id);
    setName(rule.name);
    setRate(String(rule.rate));
    setHsnCode(rule.meta?.hsn_code ?? '');
    setIsInclusive(rule.is_inclusive);
    setAppliesTo(rule.applies_to ?? 'all');
    setCountry(rule.country ?? 'IN');
    setState(rule.state ?? '');
    setPriority(String(rule.priority ?? 0));
    setIsActive(rule.is_active);
    setComponents(
      rule.meta?.components?.length
        ? rule.meta.components
        : defaultGstComponents(rule.rate)
    );
    setFormError(null);
    setShowAdvanced(!!(rule.state || (rule.country && rule.country !== 'IN')));
    setShowModal(true);
  };

  // When total rate changes, auto-update GST components proportionally
  const handleRateChange = (val: string) => {
    setRate(val);
    const r = parseFloat(val) || 0;
    setComponents(prev => {
      // only auto-update if it looks like a standard GST setup
      const hasIgst = prev.some(c => c.name === 'IGST');
      const hasOnlyGst = prev.every(c => ['CGST','SGST','IGST'].includes(c.name));
      if (!hasOnlyGst) return prev;
      const half = parseFloat((r / 2).toFixed(2));
      return prev.map(c => {
        if (c.name === 'CGST') return { ...c, rate: half };
        if (c.name === 'SGST') return { ...c, rate: half };
        if (c.name === 'IGST') return { ...c, rate: r };
        return c;
      });
    });
  };

  const applyPreset = (preset: string) => {
    const r = parseFloat(rate) || 18;
    if (preset === 'gst') {
      const half = parseFloat((r / 2).toFixed(2));
      setComponents([
        { name: 'CGST', rate: half, inter_state: false },
        { name: 'SGST', rate: half, inter_state: false },
        { name: 'IGST', rate: r,    inter_state: true },
      ]);
    } else if (preset === 'vat') {
      setComponents([{ name: 'VAT', rate: r, inter_state: false }]);
    } else if (preset === 'cess') {
      const half = parseFloat((r / 2).toFixed(2));
      setComponents([
        { name: 'CGST', rate: half, inter_state: false },
        { name: 'SGST', rate: half, inter_state: false },
        { name: 'IGST', rate: r,    inter_state: true },
        { name: 'Cess', rate: 0,    inter_state: false },
      ]);
    }
  };

  const addComponent = () => {
    setComponents(prev => [...prev, { name: '', rate: 0, inter_state: false }]);
  };

  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  };

  const updateComponent = (idx: number, field: keyof TaxComponent, value: any) => {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim())   { setFormError('Name is required'); return; }
    if (!rate)           { setFormError('Total rate is required'); return; }
    if (!components.length) { setFormError('Add at least one tax component'); return; }
    if (components.some(c => !c.name.trim())) { setFormError('All components must have a name'); return; }

    setSaving(true);
    setFormError(null);

    const meta: TaxRuleMeta = {
      components,
      ...(hsnCode.trim() ? { hsn_code: hsnCode.trim() } : {}),
    };

    const payload: Record<string, any> = {
      name: name.trim(),
      rate: parseFloat(rate),
      is_inclusive: isInclusive,
      applies_to: appliesTo,
      country: country || 'IN',
      state: state.trim() || null,
      priority: parseInt(priority) || 0,
      is_active: isActive,
      meta,
    };

    try {
      if (editId) await api.put(`/tax/${editId}`, payload);
      else        await api.post('/tax', payload);
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
      await api.delete(`/tax/${rule.id}`);
      fetchRules();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete tax rule');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Tax Rules</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Define tax rates per product / category. The tax type (GST vs IGST) is determined automatically at checkout from customer and warehouse state.
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2 flex-shrink-0">
          <FaPlus className="h-4 w-4" />
          Add Tax Rule
        </Button>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Auto GST/IGST determination:</strong> Mark each component as intra-state or inter-state. At checkout the system picks the right set automatically.
          <br />
          <span className="text-blue-600 text-xs">You can also add VAT, Cess, Surcharge etc. as additional components.</span>
        </div>
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
                <TableHead className="font-semibold px-4 py-3">Total Rate</TableHead>
                <TableHead className="font-semibold px-4 py-3">Intra-state</TableHead>
                <TableHead className="font-semibold px-4 py-3">Inter-state</TableHead>
                <TableHead className="font-semibold px-4 py-3">HSN</TableHead>
                <TableHead className="font-semibold px-4 py-3">Scope</TableHead>
                <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    No tax rules yet. Add your first rule to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map(rule => {
                  const comps: TaxComponent[] = rule.meta?.components ?? defaultGstComponents(rule.rate);
                  const intra = comps.filter(c => !c.inter_state);
                  const inter  = comps.filter(c =>  c.inter_state);
                  return (
                    <TableRow key={rule.id} className="hover:bg-muted/50 transition-colors align-top">
                      <TableCell className="px-4 py-3 font-medium">{rule.name}</TableCell>
                      <TableCell className="px-4 py-3 font-semibold">{rule.rate}%</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {intra.length ? intra.map(c => `${c.name} ${c.rate}%`).join(' + ') : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {inter.length  ? inter.map(c  => `${c.name} ${c.rate}%`).join(' + ')  : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-mono text-muted-foreground">
                        {rule.meta?.hsn_code || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {rule.state ?? (rule.country ?? 'All')}
                        {rule.applies_to !== 'all' && (
                          <span className="ml-1 text-xs text-muted-foreground/70">· {rule.applies_to}</span>
                        )}
                        {rule.is_inclusive && <Badge variant="secondary" className="text-xs ml-1">Inclusive</Badge>}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {rule.is_active
                          ? <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">Active</Badge>
                          : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => openEdit(rule)}>
                            <FaEdit className="h-3.5 w-3.5 mr-1.5" />Edit
                          </Button>
                          <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(rule)}>
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
        </CardContent>
      </Card>

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
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

                {/* Name + HSN */}
                <div className="space-y-2">
                  <Label htmlFor="tax-name">Rule Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="tax-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. GST 18% — Medicines"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax-rate">Total Rate (%) <span className="text-destructive">*</span></Label>
                    <Input
                      id="tax-rate"
                      type="number" min={0} max={100} step={0.01}
                      value={rate}
                      onChange={e => handleRateChange(e.target.value)}
                      placeholder="18"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-hsn">HSN Code</Label>
                    <Input
                      id="tax-hsn"
                      value={hsnCode}
                      onChange={e => setHsnCode(e.target.value)}
                      placeholder="3004"
                    />
                  </div>
                </div>

                {/* ── Tax Components ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Tax Components <span className="text-destructive">*</span></Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Add each component separately. Mark which apply inter-state vs intra-state.
                      </p>
                    </div>
                    {/* Presets */}
                    <div className="flex gap-1.5">
                      {[
                        { key: 'gst',  label: 'GST' },
                        { key: 'vat',  label: 'VAT' },
                        { key: 'cess', label: '+ Cess' },
                      ].map(p => (
                        <Button
                          key={p.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => applyPreset(p.key)}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_80px_auto] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Component Name</span>
                      <span>Rate %</span>
                      <span className="w-28">Applies when</span>
                    </div>

                    {components.map((comp, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_80px_auto] gap-2 items-center px-3 py-2 border-t">
                        {/* Name with datalist suggestions */}
                        <div>
                          <Input
                            list="comp-suggestions"
                            value={comp.name}
                            onChange={e => updateComponent(idx, 'name', e.target.value)}
                            placeholder="CGST, VAT, Cess…"
                            className="h-8 text-sm"
                          />
                          <datalist id="comp-suggestions">
                            {COMPONENT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                          </datalist>
                        </div>

                        <Input
                          type="number" min={0} max={100} step={0.01}
                          value={comp.rate}
                          onChange={e => updateComponent(idx, 'rate', parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />

                        <div className="flex items-center gap-2 w-28">
                          <Select
                            value={comp.inter_state ? 'inter' : 'intra'}
                            onValueChange={v => updateComponent(idx, 'inter_state', v === 'inter')}
                          >
                            <SelectTrigger className="h-8 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="intra">Intra-state</SelectItem>
                              <SelectItem value="inter">Inter-state</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => removeComponent(idx)}
                            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            aria-label="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addComponent}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 border-t transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add component (VAT, Cess, Surcharge…)
                    </button>
                  </div>
                </div>

                {/* Applies To */}
                <div className="space-y-2">
                  <Label>Applies To</Label>
                  <Select value={appliesTo} onValueChange={setAppliesTo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPLIES_TO_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Advanced */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full flex items-center gap-2 text-muted-foreground">
                      <FaChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                      Advanced: restrict to state, priority, inclusive
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country Code</Label>
                        <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="IN" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State Code (blank = all)</Label>
                        <Input id="state" value={state} onChange={e => setState(e.target.value)} placeholder="MH, DL…" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority (higher = matched first)</Label>
                      <Input id="priority" type="number" value={priority} onChange={e => setPriority(e.target.value)} placeholder="0" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch id="tax-inclusive" checked={isInclusive} onCheckedChange={setIsInclusive} />
                      <Label htmlFor="tax-inclusive" className="cursor-pointer">
                        Tax is already included in the listed price
                      </Label>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex items-center gap-3 pt-1 border-t">
                  <Switch id="tax-active" checked={isActive} onCheckedChange={setIsActive} />
                  <Label htmlFor="tax-active" className="cursor-pointer">Rule is active</Label>
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Saving…' : editId ? 'Update Rule' : 'Create Rule'}
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
