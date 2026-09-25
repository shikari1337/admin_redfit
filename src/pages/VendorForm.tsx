import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vendorsAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { CustomFieldsCard } from '@/components/erp';
import InfoTip from '../components/common/InfoTip';
import VendorLicenceEditor, { type LicenceRow, type LicenceType } from '../components/vendor/VendorLicenceEditor';
import { usePincodeLookup } from '../hooks/usePincodeLookup';

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
    // Tax & compliance (real vendor columns — mig 052 TDS, mig 053 MSME).
    // Only persisted on EDIT: createVendor uses a fixed INSERT column list.
    payment_terms_days: '',
    msme_classification: '' as '' | 'micro' | 'small' | 'medium',
    udyam_number: '',
    tds_section: '',
    tds_rate_pct: '', // percent in the UI; stored as milli-percent (×1000)
    lower_deduction_cert: '',
    // Terms and licences (migration 216). Every one of these DIFFERS per
    // supplier — that is the whole point of the owner's ask — and a purchase
    // order takes a snapshot of them the moment it is raised.
    payment_terms_mode: '',
    credit_limit: '',
    payment_notes: '',
    delivery_lead_days: '',
    freight_terms: '',
    incoterm: '',
    default_transporter: '',
    min_order_value: '',
    delivery_notes: '',
    default_currency: '',
    gst_treatment: '',
    // The legal identity of the company behind the supplier (migration 230).
    // NULL/blank is the honest answer for a proprietorship, which most
    // suppliers on a homeopathy store are — it is never a required field.
    cin: '',
    reg_line1: '', reg_line2: '', reg_city: '', reg_state: '', reg_pincode: '',
  });
  /**
   * EVERY licence, as a list (migration 230). The two single columns 216 gave
   * (`drug_licence_no`, `fssai_licence_no`) are folded into this list by the
   * server's one reader, so a supplier recorded before 230 opens with their
   * licences already in it and saving simply writes them back as list entries.
   */
  const [licences, setLicences] = useState<LicenceRow[]>([]);
  const [licenceTypes, setLicenceTypes] = useState<LicenceType[]>([]);
  const [multiLicence, setMultiLicence] = useState(false);
  /**
   * The term vocabulary comes from the SERVER (`GET /vendors/terms/meta`), so a
   * word like "freight to pay" is defined once and this form cannot drift from
   * what the API will accept. `available: false` means the store has not had
   * migration 216 yet — the section then says so instead of saving into a void.
   */
  const [termsMeta, setTermsMeta] = useState<{
    available: boolean;
    paymentModes: { code: string; label: string; help?: string }[];
    freightTerms: { code: string; label: string; help?: string }[];
    gstTreatments: { code: string; label: string }[];
    licenceTypes?: LicenceType[];
    multiLicence?: boolean;
  } | null>(null);
  const [expiring, setExpiring] = useState<{ label: string; number: string; expiry: string; daysLeft: number }[]>([]);

  useEffect(() => {
    vendorsAPI.termsMeta()
      .then((m: any) => {
        setTermsMeta(m ?? null);
        setLicenceTypes(Array.isArray(m?.licenceTypes) ? m.licenceTypes : []);
        setMultiLicence(Boolean(m?.multiLicence));
      })
      .catch(() => setTermsMeta(null));
  }, []);

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
        payment_terms_days: data.payment_terms_days != null ? String(data.payment_terms_days) : '',
        msme_classification: (data.msme_classification || '') as '' | 'micro' | 'small' | 'medium',
        udyam_number: data.udyam_number || '',
        tds_section: data.tds_section || '',
        tds_rate_pct: data.tds_rate_milli_pct != null ? String(Number(data.tds_rate_milli_pct) / 1000) : '',
        lower_deduction_cert: data.lower_deduction_cert || '',
        payment_terms_mode: data.payment_terms_mode || '',
        credit_limit: data.credit_limit_minor != null ? String(Number(data.credit_limit_minor) / 100) : '',
        payment_notes: data.payment_notes || '',
        delivery_lead_days: data.delivery_lead_days != null ? String(data.delivery_lead_days) : '',
        freight_terms: data.freight_terms || '',
        incoterm: data.incoterm || '',
        default_transporter: data.default_transporter || '',
        min_order_value: data.min_order_value_minor != null ? String(Number(data.min_order_value_minor) / 100) : '',
        delivery_notes: data.delivery_notes || '',
        default_currency: data.default_currency || '',
        gst_treatment: data.gst_treatment || '',
        cin: data.cin || '',
        reg_line1: data.registered_address?.line1 || '',
        reg_line2: data.registered_address?.line2 || '',
        reg_city: data.registered_address?.city || '',
        reg_state: data.registered_address?.state || '',
        reg_pincode: data.registered_address?.pincode || '',
      });
      // `licence_set.list` is the ONE composed list (230's list + the two 216
      // columns + other_licences), so this editor never has to know there were
      // ever three places a licence could be written.
      const set = data.licence_set ?? {};
      setLicences((Array.isArray(set.list) ? set.list : []).map((l: any) => ({
        type: l.type ?? 'other', number: l.number ?? '',
        label: l.label ?? '', issued_by: l.issued_by ?? '', state: l.state ?? '',
        valid_from: (l.valid_from ?? '').slice(0, 10), valid_till: (l.valid_till ?? '').slice(0, 10),
        daysLeft: l.daysLeft ?? null, status: l.status,
      })));
      if (typeof data.multi_licence === 'boolean') setMultiLicence(data.multi_licence);
      const fromSet = [...(set.expired ?? []), ...(set.expiring ?? [])]
        .map((l: any) => ({ label: l.title ?? l.type, number: l.number, expiry: l.valid_till, daysLeft: l.daysLeft ?? 0 }));
      setExpiring(fromSet);
    }).catch(() => setError('Failed to load vendor'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  /**
   * The registered office's city and state from the pincode — the SAME India
   * Post lookup the storefront checkout and the manual-order composer use, so
   * there is one lookup on this platform and not a third. A value somebody
   * typed by hand is never overwritten; correcting the pincode re-fills.
   */
  const { result: regPin } = usePincodeLookup(form.reg_pincode);
  const lastRegFill = React.useRef<{ city: string; state: string } | null>(null);
  useEffect(() => {
    if (!regPin) return;
    setForm((f) => {
      const last = lastRegFill.current;
      const city = !f.reg_city || f.reg_city === last?.city ? regPin.district : f.reg_city;
      const state = !f.reg_state || f.reg_state === last?.state ? regPin.state : f.reg_state;
      lastRegFill.current = { city: regPin.district, state: regPin.state };
      if (city === f.reg_city && state === f.reg_state) return f;
      return { ...f, reg_city: city, reg_state: state };
    });
  }, [regPin]);

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
    // Tax, compliance and terms. These used to be sent on EDIT only, because
    // createVendor hand-listed 10 columns and silently dropped everything added
    // after them (#199/#226). It introspects now, so a vendor created here keeps
    // every field it was given the FIRST time.
    payload.payment_terms_days = form.payment_terms_days === '' ? null : parseInt(form.payment_terms_days, 10) || 0;
    payload.msme_classification = form.msme_classification || null;
    payload.udyam_number = form.udyam_number.trim() || null;
    payload.tds_section = form.tds_section.trim() || null;
    payload.tds_rate_milli_pct = form.tds_rate_pct === '' ? null : Math.round(Number(form.tds_rate_pct) * 1000);
    payload.lower_deduction_cert = form.lower_deduction_cert.trim() || null;
    if (termsMeta?.available) {
      payload.payment_terms_mode = form.payment_terms_mode || null;
      payload.creditLimit = form.credit_limit === '' ? null : Number(form.credit_limit);
      payload.payment_notes = form.payment_notes.trim() || null;
      payload.delivery_lead_days = form.delivery_lead_days === '' ? null : parseInt(form.delivery_lead_days, 10) || 0;
      payload.freight_terms = form.freight_terms || null;
      payload.incoterm = form.incoterm.trim() || null;
      payload.default_transporter = form.default_transporter.trim() || null;
      payload.minOrderValue = form.min_order_value === '' ? null : Number(form.min_order_value);
      payload.delivery_notes = form.delivery_notes.trim() || null;
      payload.default_currency = form.default_currency.trim() || null;
      payload.gst_treatment = form.gst_treatment || null;
    }
    // 230's own fields. Sent only when the store carries them, so an older
    // store's save is byte-for-byte what it was; the server refuses them by
    // name anyway and says so in `withheld`.
    if (multiLicence) {
      payload.cin = form.cin.trim() || null;
      payload.licences = licences
        .filter((l) => String(l.number ?? '').trim())
        .map((l) => ({
          type: l.type, number: String(l.number).trim(),
          label: l.label || null, issued_by: l.issued_by || null, state: l.state || null,
          valid_from: l.valid_from || null, valid_till: l.valid_till || null,
        }));
      const reg = {
        line1: form.reg_line1.trim(), line2: form.reg_line2.trim(),
        city: form.reg_city.trim(), state: form.reg_state.trim(), pincode: form.reg_pincode.trim(),
      };
      payload.registered_address = Object.values(reg).some(Boolean) ? reg : null;
    }
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

            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium">
                Company number (CIN)
                <InfoTip text="The 21-character Corporate Identity Number the Registrar of Companies issues, e.g. U24239MH2005PTC123456. Leave it blank for a proprietorship or a partnership — most suppliers have none." />
              </label>
              <input
                type="text"
                value={form.cin}
                disabled={!multiLicence}
                onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value.toUpperCase().replace(/\s+/g, '') }))}
                maxLength={21}
                placeholder="U24239MH2005PTC123456"
                className="w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
              {form.cin.trim() !== '' && form.cin.trim().length !== 21 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-bad-ink">
                  <AlertTriangle className="h-3 w-3" /> A CIN is exactly 21 characters — this one has {form.cin.trim().length}.
                </p>
              )}
              {!multiLicence && (
                <p className="mt-1 text-xs text-ink-soft">
                  Not set up on this store yet, so it cannot be saved.
                </p>
              )}
            </div>

            <fieldset disabled={!multiLicence} className="disabled:opacity-60">
              <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
                Registered office
                <InfoTip text="The address on the supplier's own registration. It is printed on the purchase order so the document is addressed correctly." />
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.reg_line1} placeholder="Address line 1"
                  onChange={(e) => setForm((f) => ({ ...f, reg_line1: e.target.value }))}
                  className="col-span-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input type="text" value={form.reg_line2} placeholder="Address line 2"
                  onChange={(e) => setForm((f) => ({ ...f, reg_line2: e.target.value }))}
                  className="col-span-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input type="text" value={form.reg_pincode} placeholder="Pincode" inputMode="numeric"
                  onChange={(e) => setForm((f) => ({ ...f, reg_pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input type="text" value={form.reg_city} placeholder="City / district"
                  onChange={(e) => setForm((f) => ({ ...f, reg_city: e.target.value }))}
                  className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input type="text" value={form.reg_state} placeholder="State"
                  onChange={(e) => setForm((f) => ({ ...f, reg_state: e.target.value }))}
                  className="col-span-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                The city and state fill themselves in from the pincode.
              </p>
            </fieldset>

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

        {/*
          Tax & Compliance — real vendor columns (payment terms, MSME/Udyam,
          TDS). Shown on CREATE as well as EDIT now that createVendor
          introspects its columns (#199/#226): what is typed here is saved the
          FIRST time. These drive the Payables 43B(h) warning and 26Q register.
        */}
        <div className="rounded-md border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-base">Tax &amp; Compliance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Payment terms &amp; MSME status feed the Payables 45-day (Section 43B(h)) warning; TDS details feed the 26Q register.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Payment terms (days)</label>
                <input
                  type="number"
                  min="0"
                  value={form.payment_terms_days}
                  onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: e.target.value }))}
                  placeholder="e.g. 45"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MSME classification</label>
                <select
                  value={form.msme_classification}
                  onChange={(e) => setForm((f) => ({ ...f, msme_classification: e.target.value as '' | 'micro' | 'small' | 'medium' }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Not MSME</option>
                  <option value="micro">Micro</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Udyam number</label>
                <input
                  type="text"
                  value={form.udyam_number}
                  onChange={(e) => setForm((f) => ({ ...f, udyam_number: e.target.value.toUpperCase() }))}
                  maxLength={30}
                  placeholder="UDYAM-XX-00-0000000"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">TDS section</label>
                <input
                  type="text"
                  value={form.tds_section}
                  onChange={(e) => setForm((f) => ({ ...f, tds_section: e.target.value.toUpperCase() }))}
                  maxLength={30}
                  placeholder="194C / 194Q / 194J"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">TDS rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.tds_rate_pct}
                  onChange={(e) => setForm((f) => ({ ...f, tds_rate_pct: e.target.value }))}
                  placeholder="e.g. 2"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">Overrides the statutory rate for this vendor. Leave blank to use the default.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lower-deduction certificate</label>
                <input
                  type="text"
                  value={form.lower_deduction_cert}
                  onChange={(e) => setForm((f) => ({ ...f, lower_deduction_cert: e.target.value }))}
                  maxLength={40}
                  placeholder="Certificate no. (if any)"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>
          </div>

        {/*
          TERMS — the owner's ask A6, in his words: "vendor invoice with
          payment/delivery terms; they differ per vendor". A purchase order
          INHERITS what is set here the moment it is raised and may override it
          on that one order; changing a supplier afterwards never rewrites an
          order already placed. Everything on this card prints on the PO.
        */}
        <div className="rounded-md border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-base">Terms with this supplier</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              A purchase order takes a copy of these when it is raised, prints them, and can change them for that one
              order. Editing them here never changes an order already placed.
            </p>
          </div>

          {termsMeta && !termsMeta.available && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Delivery terms and licences are not set up on this store yet, so nothing on this card can be saved.
              Everything above saves as usual.
            </div>
          )}

          {!!expiring.length && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {expiring.map((l) => (
                <div key={`${l.label}-${l.number}`}>
                  <strong>{l.label} {l.number}</strong>{' '}
                  {l.daysLeft < 0 ? `expired ${-l.daysLeft} day(s) ago` : `expires in ${l.daysLeft} day(s)`} ({l.expiry}).
                </div>
              ))}
            </div>
          )}

          <fieldset disabled={!termsMeta?.available} className="space-y-4 disabled:opacity-60">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">When we pay</label>
                <select
                  value={form.payment_terms_mode}
                  onChange={(e) => setForm((f) => ({ ...f, payment_terms_mode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                >
                  <option value="">Not agreed</option>
                  {(termsMeta?.paymentModes ?? []).map((m) => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
                {form.payment_terms_mode === 'net_days' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Set the number of days in <strong>Payment terms (days)</strong> above — it is the same figure the
                    MSME 45-day warning reads, so it is only recorded once.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Credit limit (₹)</label>
                <input type="number" min="0" step="0.01" value={form.credit_limit}
                  onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Who pays the freight</label>
                <select value={form.freight_terms}
                  onChange={(e) => setForm((f) => ({ ...f, freight_terms: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background">
                  <option value="">Not agreed</option>
                  {(termsMeta?.freightTerms ?? []).map((m) => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Delivery time (days)</label>
                <input type="number" min="0" max="365" value={form.delivery_lead_days}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_lead_days: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
                <p className="text-xs text-muted-foreground mt-1">How long they usually take from the order date.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Usual transporter</label>
                <input type="text" maxLength={120} value={form.default_transporter}
                  onChange={(e) => setForm((f) => ({ ...f, default_transporter: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Minimum order (₹)</label>
                <input type="number" min="0" step="0.01" value={form.min_order_value}
                  onChange={(e) => setForm((f) => ({ ...f, min_order_value: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">GST treatment</label>
                <select value={form.gst_treatment}
                  onChange={(e) => setForm((f) => ({ ...f, gst_treatment: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background">
                  <option value="">Not stated</option>
                  {(termsMeta?.gstTreatments ?? []).map((m) => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Currency</label>
                  <input type="text" maxLength={3} placeholder="INR" value={form.default_currency}
                    onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Incoterm</label>
                  <input type="text" maxLength={12} placeholder="EXW / FOB / CIF" value={form.incoterm}
                    onChange={(e) => setForm((f) => ({ ...f, incoterm: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono" />
                  <p className="text-xs text-muted-foreground mt-1">Imports only.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Note on payment</label>
                <input type="text" value={form.payment_notes}
                  onChange={(e) => setForm((f) => ({ ...f, payment_notes: e.target.value }))}
                  placeholder="e.g. 2% off if paid within 10 days"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Note on delivery</label>
                <input type="text" value={form.delivery_notes}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_notes: e.target.value }))}
                  placeholder="e.g. deliveries accepted 9am–1pm only"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background" />
              </div>
            </div>

          </fieldset>
        </div>

        {/* LICENCES — its own card, because it is not a commercial term: it is
            what makes the supplier legally able to ship what is being ordered,
            and it prints on the purchase order for exactly that reason. */}
        <div className="rounded-md border border-line bg-surface p-5">
          <VendorLicenceEditor
            rows={licences} types={licenceTypes} available={multiLicence} onChange={setLicences} />
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

      {/*
        Custom fields (spec §19) — the owner's own boxes on a vendor, e.g.
        "License number". Deliberately OUTSIDE this form: the card loads and
        saves itself through /custom-fields, so this page's own save path is
        untouched and a store with no custom fields sees nothing at all.
      */}
      {isEdit && <CustomFieldsCard entityType="vendor" entityId={id} />}
    </div>
  );
};

export default VendorForm;
