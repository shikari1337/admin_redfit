import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, FileText, Eye, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { invoicesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Invoice customiser.
 *
 * Collects the seller-side legal details a GST tax invoice needs but the rest of
 * the admin never asks for, and previews the real PDF (rendered server-side from
 * the same code that issues invoices, so what you see is what customers get).
 */

type Missing = { field: string; label: string };

const TABS = ['Business', 'Licences', 'GST registrations', 'Bank', 'Numbering', 'Design', 'Wording'] as const;
type Tab = typeof TABS[number];

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; required?: boolean; missing?: boolean }> =
  ({ label, hint, children, required, missing }) => (
    <div className="space-y-1.5">
      <Label className={missing ? 'text-red-600' : ''}>
        {label}{required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

const InvoiceSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [tab, setTab] = useState<Tab>('Business');
  const [cfg, setCfg] = useState<any>(null);
  const [original, setOriginal] = useState<string>('');
  const [missing, setMissing] = useState<Missing[]>([]);
  const [stateCodes, setStateCodes] = useState<Record<string, string>>({});
  /** The licence vocabulary and the expiry countdown both come from the SERVER —
   *  "has this drug licence expired" is a store-calendar question, and a browser
   *  in another timezone must not be the thing that answers it (rule 8). */
  const [licenceTypes, setLicenceTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [expiringLicences, setExpiringLicences] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => { load(); return () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }; }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await invoicesAPI.getConfig();
      const d = res?.data ?? res;
      setCfg(d.config);
      setOriginal(JSON.stringify(d.config));
      setMissing(d.missing ?? []);
      setStateCodes(d.state_codes ?? {});
      setLicenceTypes(d.licence_types ?? []);
      setExpiringLicences(d.expiring_licences ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load invoice settings');
    } finally { setLoading(false); }
  };

  const dirty = useMemo(() => cfg && JSON.stringify(cfg) !== original, [cfg, original]);
  const isMissing = (field: string) => missing.some((m) => m.field === field);

  const set = (path: string, value: any) => {
    setCfg((prev: any) => {
      const next = { ...prev };
      const [a, b] = path.split('.');
      if (b) next[a] = { ...next[a], [b]: value };
      else next[a] = value;
      return next;
    });
  };

  const save = async () => {
    try {
      setSaving(true); setError(null);
      const res = await invoicesAPI.updateConfig(cfg);
      const d = res?.data ?? res;
      setCfg(d.config); setOriginal(JSON.stringify(d.config)); setMissing(d.missing ?? []);
      setNotice('Invoice settings saved.');
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  /** Render the real PDF from the CURRENT (unsaved) form values. */
  const preview = async () => {
    try {
      setPreviewing(true); setError(null);
      const blob = await invoicesAPI.preview(cfg);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      window.open(previewUrl.current, '_blank');
    } catch {
      setError('Could not render the preview.');
    } finally { setPreviewing(false); }
  };

  // ── GST registrations ────────────────────────────────────────────────────
  const regs: any[] = cfg?.gst_registrations ?? [];
  const setRegs = (next: any[]) => set('gst_registrations', next);
  const addReg = () => setRegs([...regs, {
    id: `reg_${Date.now().toString(36)}`, label: '', gstin: '', state: '', state_code: '',
    address_line1: '', address_line2: '', city: '', pincode: '', is_default: regs.length === 0,
    warehouse_ids: [],
  }]);
  const patchReg = (i: number, k: string, v: any) =>
    setRegs(regs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  // ── Statutory licences ───────────────────────────────────────────────────
  const licences: any[] = cfg?.seller?.licences ?? [];
  const setLicences = (next: any[]) => set('seller.licences', next);
  const addLicence = () => setLicences([...licences, {
    id: `lic_${Date.now().toString(36)}`, type: 'drug_licence', label: '', number: '',
    valid_till: '', show_on_documents: true,
  }]);
  const patchLicence = (i: number, k: string, v: any) =>
    setLicences(licences.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const licenceTypeLabel = (t: string) => licenceTypes.find((x) => x.value === t)?.label ?? 'Licence';
  /** The server's countdown for a licence already saved; a row typed just now has none yet. */
  const licenceWarning = (l: any) => expiringLicences.find((x) => x.number && x.number === l.number);

  /** `theme.titles.<kind>` is three levels deep; `set()` handles two. */
  const setTitle = (kind: string, v: string) =>
    setCfg((prev: any) => ({ ...prev, theme: { ...prev.theme, titles: { ...(prev.theme?.titles ?? {}), [kind]: v } } }));

  if (loading || !cfg) {
    return <div className="flex items-center justify-center p-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 pb-16">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="mb-3 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-5 w-5" /> Invoice settings</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Who you are, what you trade under, and how every tax document looks — invoice,
              proforma and credit note all print from these settings.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={preview} disabled={previewing}>
              {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Preview PDF
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {/* Completeness — a store shouldn't unknowingly issue a non-compliant invoice */}
      {missing.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {missing.length} required detail{missing.length > 1 ? 's' : ''} still missing
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Invoices can't be sent until these are filled: {missing.map((m) => m.label).join(', ')}.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" /> All required invoice details are filled.
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === tb ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {tb}
            {tb === 'GST registrations' && regs.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-80">({regs.length + 1})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Business' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered business</CardTitle>
            <CardDescription>Printed in the invoice header. Must match your GST registration.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Registered legal name" required missing={isMissing('seller.legal_name')}>
              <Input value={cfg.seller.legal_name} onChange={(e) => set('seller.legal_name', e.target.value)} placeholder="ACME ENTERPRISES" />
            </Field>
            <Field label="Trade / brand name" hint="Shown large at the top. Leave blank to use the legal name.">
              <Input value={cfg.seller.trade_name} onChange={(e) => set('seller.trade_name', e.target.value)} placeholder="Acme" />
            </Field>
            <Field label="GSTIN" required missing={isMissing('seller.gstin')} hint="Primary registration. Add more under GST registrations.">
              <Input value={cfg.seller.gstin} onChange={(e) => set('seller.gstin', e.target.value.toUpperCase())} placeholder="07AAAAA0000A1Z5" />
            </Field>
            <Field label="PAN"><Input value={cfg.seller.pan} onChange={(e) => set('seller.pan', e.target.value.toUpperCase())} placeholder="AAAAA0000A" /></Field>
            <Field
              label="CIN"
              hint="Company Identification Number, from your MCA certificate. A company or an LLP must print it on every bill; a proprietorship or a partnership has none — leave it blank and nothing prints."
            >
              <Input
                value={cfg.seller.cin ?? ''}
                onChange={(e) => set('seller.cin', e.target.value.toUpperCase())}
                placeholder="U12345DL2020PTC123456"
                maxLength={21}
              />
            </Field>
            <Field label="Address line 1" required missing={isMissing('seller.address_line1')}>
              <Input value={cfg.seller.address_line1} onChange={(e) => set('seller.address_line1', e.target.value)} />
            </Field>
            <Field label="Address line 2"><Input value={cfg.seller.address_line2} onChange={(e) => set('seller.address_line2', e.target.value)} /></Field>
            <Field label="City" required missing={isMissing('seller.city')}>
              <Input value={cfg.seller.city} onChange={(e) => set('seller.city', e.target.value)} />
            </Field>
            <Field label="PIN code" required missing={isMissing('seller.pincode')}>
              <Input value={cfg.seller.pincode} onChange={(e) => set('seller.pincode', e.target.value)} />
            </Field>
            <Field label="State" required missing={isMissing('seller.state')}
              hint="Decides CGST+SGST (same state as buyer) vs IGST.">
              <Select value={cfg.seller.state || undefined} onValueChange={(v) => {
                set('seller.state', v);
                const code = Object.entries(stateCodes).find(([, n]) => n === v)?.[0] ?? '';
                set('seller.state_code', code);
              }}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(stateCodes).map(([code, name]) => (
                    <SelectItem key={code} value={name}>{name} ({code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Country"><Input value={cfg.seller.country} onChange={(e) => set('seller.country', e.target.value)} /></Field>
            <Field label="Phone"><Input value={cfg.seller.phone} onChange={(e) => set('seller.phone', e.target.value)} /></Field>
            <Field label="Email"><Input value={cfg.seller.email} onChange={(e) => set('seller.email', e.target.value)} /></Field>
          </CardContent>
        </Card>
      )}

      {tab === 'Licences' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">
                Statutory licences{licences.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({licences.length})</span>}
              </CardTitle>
              <CardDescription>
                FSSAI, drug licences, BIS, ISO — the numbers you trade under. Add as many as you
                hold: a pharmacy usually has <strong>several drug licences</strong> (one per form,
                per premises or per state), and each gets its own row. They print on every document
                you issue — invoices, proformas and credit notes. Add the expiry date and this page
                warns you before one runs out.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addLicence}><Plus className="mr-1.5 h-4 w-4" /> Add licence</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {expiringLicences.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {expiringLicences.some((l) => l.days_left < 0)
                    ? 'A licence on your invoices has expired'
                    : 'A licence on your invoices is about to expire'}
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                  {expiringLicences.map((l) => (
                    <li key={l.id ?? l.number}>
                      {l.label || licenceTypeLabel(l.type)} <span className="font-mono">{l.number}</span>
                      {l.days_left < 0
                        ? ` expired ${-l.days_left} day(s) ago`
                        : l.days_left === 0 ? ' expires today' : ` expires in ${l.days_left} day(s)`}
                      {' '}({l.valid_till})
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px]">
                  Renew it and update the date here, or switch it off until you do — an expired
                  number printed on today's invoice is a compliance problem nobody notices.
                </p>
              </div>
            )}

            {licences.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No licences recorded. Nothing extra prints on your invoices.
              </p>
            )}

            {licences.map((l, i) => {
              const warn = licenceWarning(l);
              return (
                <div key={l.id ?? i} className={`rounded-lg border p-4 space-y-3 ${warn ? 'border-amber-300 bg-amber-50/40' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Select value={l.type || 'other'} onValueChange={(v) => patchLicence(i, 'type', v)}>
                        <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(licenceTypes.length ? licenceTypes : [{ value: 'other', label: 'Licence' }]).map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* The store's own calendar decides this, so the badge shows
                          exactly what the SERVER said — never a browser countdown. */}
                      {warn && warn.days_left < 0 && (
                        <Badge variant="outline" className="border-red-400 bg-red-50 text-red-700">
                          expired {-warn.days_left} day(s) ago
                        </Badge>
                      )}
                      {warn && warn.days_left >= 0 && (
                        <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                          {warn.days_left === 0 ? 'expires today' : `${warn.days_left} day(s) left`}
                        </Badge>
                      )}
                      {!warn && l.valid_till && (
                        <Badge variant="outline" className="text-muted-foreground">valid to {l.valid_till}</Badge>
                      )}
                      {!l.valid_till && (
                        <Badge variant="outline" className="text-muted-foreground">no expiry</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <Switch checked={l.show_on_documents !== false}
                          onCheckedChange={(v) => patchLicence(i, 'show_on_documents', v)} />
                        Print it
                      </label>
                      <Button variant="ghost" size="sm" className="text-red-600"
                        onClick={() => setLicences(licences.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Number" hint="Exactly as issued. A licence with no number is not saved.">
                      <Input value={l.number ?? ''} onChange={(e) => patchLicence(i, 'number', e.target.value)}
                        placeholder="e.g. 20B/DL/2024/0193" />
                    </Field>
                    <Field label="Granted on" hint="The date on the certificate. Kept on file, never printed.">
                      <Input type="date" value={l.issued_on ?? ''} onChange={(e) => patchLicence(i, 'issued_on', e.target.value)} />
                    </Field>
                    <Field label="Valid until" hint="Leave blank if it does not expire.">
                      <Input type="date" value={l.valid_till ?? ''} onChange={(e) => patchLicence(i, 'valid_till', e.target.value)} />
                    </Field>
                    <Field label="Issued by" hint="Who granted it — a state FDA, a municipal body, a certification house.">
                      <Input value={l.issuing_authority ?? ''} onChange={(e) => patchLicence(i, 'issuing_authority', e.target.value)}
                        placeholder="e.g. Drugs Control Department, Delhi" />
                    </Field>
                    <Field label="Applies in" hint="Where it is valid. A drug licence is issued by a state and only covers that state.">
                      <Input value={l.jurisdiction ?? ''} onChange={(e) => patchLicence(i, 'jurisdiction', e.target.value)}
                        placeholder="e.g. Delhi" />
                    </Field>
                    <Field label="Printed as" hint={`Blank prints "${licenceTypeLabel(l.type)}".`}>
                      <Input value={l.label ?? ''} onChange={(e) => patchLicence(i, 'label', e.target.value)}
                        placeholder={licenceTypeLabel(l.type)} />
                    </Field>
                  </div>
                  <Field label="Your own note" hint="Never printed. Where the paper copy is, who renews it, anything the desk needs.">
                    <Input value={l.notes ?? ''} onChange={(e) => patchLicence(i, 'notes', e.target.value)} />
                  </Field>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {tab === 'GST registrations' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Additional GST registrations</CardTitle>
              <CardDescription>
                Registered in more than one state? Add each GSTIN here. The invoice uses the
                registration for the state the goods ship from — which also decides CGST+SGST vs IGST.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addReg}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Primary:</span>{' '}
              {cfg.seller.gstin || <span className="text-muted-foreground">not set</span>}
              {cfg.seller.state ? ` · ${cfg.seller.state}` : ''}
              <span className="ml-2 text-xs text-muted-foreground">(used when nothing else matches)</span>
            </div>

            {regs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No extra registrations. Single-state businesses can leave this empty.
              </p>
            )}

            {regs.map((r, i) => (
              <div key={r.id ?? i} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Input className="max-w-xs font-medium" placeholder="Label (e.g. Bengaluru warehouse)"
                    value={r.label} onChange={(e) => patchReg(i, 'label', e.target.value)} />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={!!r.is_default}
                        onCheckedChange={(v) => setRegs(regs.map((x, idx) => ({ ...x, is_default: idx === i ? v : false })))} />
                      Default
                    </label>
                    <Button variant="ghost" size="sm" className="text-red-600"
                      onClick={() => setRegs(regs.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="GSTIN"><Input value={r.gstin} onChange={(e) => patchReg(i, 'gstin', e.target.value.toUpperCase())} /></Field>
                  <Field label="State">
                    <Select value={r.state || undefined} onValueChange={(v) => {
                      patchReg(i, 'state', v);
                      patchReg(i, 'state_code', Object.entries(stateCodes).find(([, n]) => n === v)?.[0] ?? '');
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(stateCodes).map(([code, name]) => (
                          <SelectItem key={code} value={name}>{name} ({code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Address line 1"><Input value={r.address_line1} onChange={(e) => patchReg(i, 'address_line1', e.target.value)} /></Field>
                  <Field label="Address line 2"><Input value={r.address_line2} onChange={(e) => patchReg(i, 'address_line2', e.target.value)} /></Field>
                  <Field label="City"><Input value={r.city} onChange={(e) => patchReg(i, 'city', e.target.value)} /></Field>
                  <Field label="PIN code"><Input value={r.pincode} onChange={(e) => patchReg(i, 'pincode', e.target.value)} /></Field>
                  <div className="md:col-span-2">
                    <Field label="Warehouse IDs dispatching under this GSTIN"
                      hint="Comma-separated. Orders shipped from these warehouses invoice under this registration.">
                      <Input value={(r.warehouse_ids ?? []).join(', ')}
                        onChange={(e) => patchReg(i, 'warehouse_ids', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'Bank' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Payment details</CardTitle>
              <CardDescription>Printed at the foot of the invoice so customers can pay you.</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cfg.bank.show_on_invoice} onCheckedChange={(v) => set('bank.show_on_invoice', v)} />
              Show
            </label>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Account name"><Input value={cfg.bank.account_name} onChange={(e) => set('bank.account_name', e.target.value)} /></Field>
            <Field label="Account number" required={cfg.bank.show_on_invoice} missing={isMissing('bank.account_number')}>
              <Input value={cfg.bank.account_number} onChange={(e) => set('bank.account_number', e.target.value)} />
            </Field>
            <Field label="IFSC" required={cfg.bank.show_on_invoice} missing={isMissing('bank.ifsc')}>
              <Input value={cfg.bank.ifsc} onChange={(e) => set('bank.ifsc', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Bank name"><Input value={cfg.bank.bank_name} onChange={(e) => set('bank.bank_name', e.target.value)} /></Field>
            <Field label="Branch"><Input value={cfg.bank.branch} onChange={(e) => set('bank.branch', e.target.value)} /></Field>
            <Field label="UPI ID"><Input value={cfg.bank.upi_id} onChange={(e) => set('bank.upi_id', e.target.value)} /></Field>
          </CardContent>
        </Card>
      )}

      {tab === 'Numbering' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice numbering</CardTitle>
            <CardDescription>
              Invoices have their own running series, separate from order numbers. A number is
              assigned once and never changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Prefix"><Input value={cfg.numbering.prefix} onChange={(e) => set('numbering.prefix', e.target.value)} placeholder="INV-" /></Field>
            <Field label="Digits" hint="6 → 000081">
              <Input type="number" min={0} max={12} value={cfg.numbering.padding}
                onChange={(e) => set('numbering.padding', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Start at">
              <Input type="number" min={1} value={cfg.numbering.start}
                onChange={(e) => set('numbering.start', Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Restart counter">
              <Select value={cfg.numbering.reset} onValueChange={(v) => set('numbering.reset', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="yearly">Every financial year</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Pattern" hint="Tokens: {PREFIX} {SEQ} {YYYY} {YY} {MM}">
                <Input className="font-mono text-sm" value={cfg.numbering.format}
                  onChange={(e) => set('numbering.format', e.target.value)} />
              </Field>
            </div>
            <Field label="Payment due (days after invoice date)" hint="0 = due immediately">
              <Input type="number" min={0} value={cfg.due_days} onChange={(e) => set('due_days', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Default HSN/SAC" hint="Used when a product has none of its own.">
              <Input value={cfg.default_hsn} onChange={(e) => set('default_hsn', e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      )}

      {tab === 'Design' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design</CardTitle>
            <CardDescription>Use “Preview PDF” to see changes on a real document.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Document title"><Input value={cfg.document_title} onChange={(e) => set('document_title', e.target.value)} /></Field>
            <Field label="Accent colour">
              <div className="flex gap-2">
                <input type="color" className="h-9 w-12 rounded border" value={cfg.theme.accent}
                  onChange={(e) => set('theme.accent', e.target.value)} />
                <Input value={cfg.theme.accent} onChange={(e) => set('theme.accent', e.target.value)} />
              </div>
            </Field>
            <Field label="Table style" hint="Lines is airier; boxed draws a full grid.">
              <Select value={cfg.theme.table_style} onValueChange={(v) => set('theme.table_style', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lines">Lines (recommended)</SelectItem>
                  <SelectItem value="boxed">Boxed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Logo (data URI)" hint="Paste a data:image/... URI. Remote URLs can't be embedded.">
              <Input value={cfg.theme.logo_url} onChange={(e) => set('theme.logo_url', e.target.value)} placeholder="data:image/png;base64,…" />
            </Field>
            <div className="flex items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cfg.theme.show_logo} onCheckedChange={(v) => set('theme.show_logo', v)} /> Show logo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cfg.theme.show_hsn} onCheckedChange={(v) => set('theme.show_hsn', v)} /> HSN/SAC column
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cfg.theme.show_signature} onCheckedChange={(v) => set('theme.show_signature', v)} /> Signature block
              </label>
            </div>
            <Field label="Signature image (data URI)">
              <Input value={cfg.theme.signature_url} onChange={(e) => set('theme.signature_url', e.target.value)} placeholder="data:image/png;base64,…" />
            </Field>
            <Field label="Signature label"><Input value={cfg.theme.signature_label} onChange={(e) => set('theme.signature_label', e.target.value)} /></Field>

            {/* ── Columns ─────────────────────────────────────────────────── */}
            <div className="md:col-span-2 space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium">Columns on the item table</p>
                <p className="text-[11px] text-muted-foreground">
                  A column appears only when a line actually has that value, so switching them all
                  on costs a services business nothing — and a pharmacy's invoice grows Batch and
                  Expiry without anybody configuring it.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.theme.show_batch !== false} onCheckedChange={(v) => set('theme.show_batch', v)} /> Batch number
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.theme.show_expiry !== false} onCheckedChange={(v) => set('theme.show_expiry', v)} /> Expiry
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.theme.show_discount !== false} onCheckedChange={(v) => set('theme.show_discount', v)} /> Discount
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.theme.show_mrp !== false} onCheckedChange={(v) => set('theme.show_mrp', v)} /> MRP under the rate
                </label>
              </div>
            </div>

            {/* ── Licences ────────────────────────────────────────────────── */}
            <div className="md:col-span-2 grid gap-4 border-t pt-4 md:grid-cols-2">
              <Field label="Print statutory licences" hint="Add them on the Licences tab.">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.theme.show_licences !== false} onCheckedChange={(v) => set('theme.show_licences', v)} />
                  {licences.length ? `${licences.filter((l: any) => l.show_on_documents !== false).length} licence(s) will print` : 'None recorded yet'}
                </label>
              </Field>
              <Field label="Where they print">
                <Select value={cfg.theme.licence_position === 'footer' ? 'footer' : 'header'}
                  onValueChange={(v) => set('theme.licence_position', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">In the header, under the GSTIN</SelectItem>
                    <SelectItem value="footer">In the footer, beside the terms</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* ── Free text + per-kind titles ─────────────────────────────── */}
            <div className="md:col-span-2 grid gap-4 border-t pt-4 md:grid-cols-2">
              <Field label="Line under your business name" hint="A tagline, a branch, or 'Original for recipient'.">
                <Input value={cfg.theme.header_text ?? ''} maxLength={240}
                  onChange={(e) => set('theme.header_text', e.target.value)} />
              </Field>
              <Field label="Line in the page footer" hint="Printed beside the declaration on every page.">
                <Input value={cfg.theme.footer_text ?? ''} maxLength={400}
                  onChange={(e) => set('theme.footer_text', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">What each document is called</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Invoice"><Input placeholder={cfg.document_title || 'TAX INVOICE'}
                    value={cfg.theme.titles?.invoice ?? ''} onChange={(e) => setTitle('invoice', e.target.value)} /></Field>
                  <Field label="Proforma"><Input placeholder="PROFORMA INVOICE"
                    value={cfg.theme.titles?.proforma ?? ''} onChange={(e) => setTitle('proforma', e.target.value)} /></Field>
                  <Field label="Credit note"><Input placeholder="CREDIT NOTE"
                    value={cfg.theme.titles?.credit_note ?? ''} onChange={(e) => setTitle('credit_note', e.target.value)} /></Field>
                  <Field label="Purchase order"><Input placeholder="PURCHASE ORDER"
                    value={cfg.theme.titles?.purchase_order ?? ''} onChange={(e) => setTitle('purchase_order', e.target.value)} /></Field>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Leave blank to keep the standard wording. The same layout prints all four — there
                  is no second template to keep in step.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'Wording' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wording</CardTitle>
            <CardDescription>Notes and terms print under the totals; the declaration runs along the page foot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Notes"><Textarea rows={2} value={cfg.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            <Field label="Terms & conditions"><Textarea rows={4} value={cfg.terms} onChange={(e) => set('terms', e.target.value)} /></Field>
            <Field label="Declaration" hint="Legally required statement printed at the foot of every page.">
              <Textarea rows={3} value={cfg.declaration} onChange={(e) => set('declaration', e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        {dirty && <Badge variant="outline" className="mr-auto">Unsaved changes</Badge>}
        <Button variant="outline" onClick={() => setCfg(JSON.parse(original))} disabled={!dirty || saving}>Reset</Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};

export default InvoiceSettings;
