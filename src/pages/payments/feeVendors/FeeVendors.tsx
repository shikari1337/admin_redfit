/**
 * Fee vendors in Books — the store owner's screens (DEC-072 / DEC-073; lane ADMIN-PAY-1), mounted on
 * Accounting ▸ Settings and (compact held panel) on Payment analytics:
 *
 *   FeeVendorsSection     which Books vendor Razorpay and each courier is, and the record source
 *   HeldFeesPanel         fees Books is holding, why, and where to fix it
 *   GatewayTaxInvoices    attached gateway/courier tax invoices vs the automatic journals; attach, void
 *   AttachTaxInvoiceOffer the 409 "attach it as the tax invoice instead" offer on bills and expenses
 *
 * Permissions: read accounting.read; attach/void accounting.post; vendor settings settings.manage.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, PauseCircle, Truck, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Btn, Chip, EmptyRow, Field, FilterBar, SectionCard, SelectInput, TableShell, TBody, Td, TextInput, Th, THead, Tr,
} from '@/components/erp';
import InfoTip from '@/components/common/InfoTip';
import { useAuth } from '@/contexts/AuthContext';
import { majorToMinor } from '@/lib/v2/money';
import { formatDay, isoDaysFromToday, todayIso } from '@/utils/date';
import { errText, failureOf, isGap, money, type LoadFailure } from '../data';
import { FailureNotice } from '../common';
import {
  DEFAULT_MODE, FEE_VENDORS_ANCHOR, TAX_INVOICES_ANCHOR, feeVendorsAPI,
  type CourierOption, type FeeMode, type FeeTaxInvoice, type FeeVendorOffer, type FeeVendorsValue, type HeldFees, type VendorOption,
} from './data';

const GATEWAYS = [{ code: 'razorpay', label: 'Razorpay' }];
const FALLBACK_COURIERS = ['shiprocket', 'delhivery'];

const MODE_HELP: Record<FeeMode, string> = {
  automatic: 'Automatic: the exact fee (and its GST) of every settlement or payout is posted daily. The vendor’s monthly invoice is attached as the GST document — never entered as a bill.',
  vendor_bill: 'From the vendor’s bill: the bill carries the expense and the GST; the deductions in its settlements or payouts only settle what you owe the vendor.',
};

const titleOf = (code: string) => code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Links like `…/settings#fee-vendors` scroll to their section once it has rendered (SPA navigation does not). */
function useHashScroll(id: string, ready: boolean) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [id, ready]);
}

/* ── vendor settings ───────────────────────────────────────────────────────── */

type Group = keyof FeeVendorsValue;

export const FeeVendorsSection: React.FC = () => {
  const { hasPerm } = useAuth();
  const canEdit = hasPerm('settings.manage');
  const [value, setValue] = useState<FeeVendorsValue | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setFail(null); setValue(null); setDirty(false);
    feeVendorsAPI.read().then(setValue).catch((e) => setFail(failureOf(e, 'the fee vendor settings could not be read')));
    feeVendorsAPI.vendors().then(setVendors).catch(() => setVendors([]));
    feeVendorsAPI.couriers().then(setCouriers).catch(() => setCouriers([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!value) return [] as Array<{ group: Group; code: string; label: string; note?: string }>;
    type Row = { group: Group; code: string; label: string; note?: string };
    const g: Row[] = GATEWAYS.map((x) => ({ group: 'gatewayFeeVendor' as Group, code: x.code, label: x.label }));
    for (const code of Object.keys(value.gatewayFeeVendor)) if (!g.some((x) => x.code === code)) g.push({ group: 'gatewayFeeVendor', code, label: titleOf(code) });
    const known = couriers.length ? couriers : FALLBACK_COURIERS.map((code) => ({ code, label: titleOf(code), configured: false }));
    const c: Row[] = known.map((x) => ({ group: 'courierVendor' as Group, code: x.code, label: x.label || titleOf(x.code), note: x.configured ? undefined : 'not connected' }));
    for (const code of Object.keys(value.courierVendor)) if (!c.some((x) => x.code === code)) c.push({ group: 'courierVendor', code, label: titleOf(code), note: undefined });
    return [...g, ...c];
  }, [value, couriers]);

  const set = (group: Group, code: string, patch: { vendorId?: string; mode?: FeeMode }) => {
    setValue((v) => {
      if (!v) return v;
      const cur = { ...(v[group][code] ?? {}) };
      if ('vendorId' in patch) { if (patch.vendorId) cur.vendorId = patch.vendorId; else delete cur.vendorId; }
      if (patch.mode) cur.mode = patch.mode;
      return { ...v, [group]: { ...v[group], [code]: cur } };
    });
    setDirty(true); setOk(''); setErr('');
  };

  const save = async () => {
    if (!value) return;
    setSaving(true); setErr(''); setOk('');
    try {
      // The COMPLETE value: a patch of this setting replaces the whole group.
      await feeVendorsAPI.save(value);
      setOk('Saved. The change applies to fees not posted yet; nothing already posted is changed.');
      setDirty(false);
    } catch (e: any) {
      setErr(isGap(e) ? 'Fee vendor settings are not available on this server yet.' : `Not saved: ${errText(e, 'the server refused it')}`);
    } finally { setSaving(false); }
  };

  const vendorOf = (id?: string) => vendors.find((v) => v.id === id) ?? null;
  useHashScroll('fee-vendors', !!value || !!fail);

  return (
    <div id="fee-vendors">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-gray-500" />Gateway and courier vendors</span>}
        description="Who your payment gateway and each courier are in the books, and which record carries their charges — so a cost is never counted twice."
        action={canEdit && value ? <Btn size="sm" onClick={save} disabled={saving || !dirty}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</Btn> : undefined}
      >
        <div className="mb-3 grid gap-2 text-xs text-gray-600 md:grid-cols-2">
          <p className="rounded-lg bg-gray-50 px-3 py-2"><strong className="text-gray-800">Automatic from settlements / payouts.</strong> {MODE_HELP.automatic.replace(/^Automatic: /, '')}</p>
          <p className="rounded-lg bg-gray-50 px-3 py-2"><strong className="text-gray-800">From the vendor’s bill.</strong> {MODE_HELP.vendor_bill.replace(/^From the vendor’s bill: /, '')}</p>
        </div>
        {fail && (fail.forbidden
          ? <p className="text-sm text-amber-800">Choosing these needs the “manage settings” permission.</p>
          : <FailureNotice failure={fail} what="Fee vendor settings are not on this server yet." onRetry={load} />)}
        {err && <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        {ok && <p role="status" className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p>}
        {!value && !fail && <div className="h-20 animate-pulse rounded bg-gray-50" aria-busy="true" />}
        {value && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr><th className="py-2 pr-3">Charges from</th><th className="py-2 pr-3">Books vendor</th><th className="py-2 pr-3">Record source</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const e = value[r.group][r.code] ?? {};
                  const mode: FeeMode = e.mode ?? DEFAULT_MODE[r.group];
                  const v = vendorOf(e.vendorId);
                  return (
                    <tr key={`${r.group}:${r.code}`} className="align-top">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                          {r.group === 'gatewayFeeVendor' ? <Wallet className="h-3.5 w-3.5 text-gray-400" /> : <Truck className="h-3.5 w-3.5 text-gray-400" />}{r.label}
                        </span>
                        <span className="block text-xs text-gray-500">{r.group === 'gatewayFeeVendor' ? 'Payment gateway fees' : 'Courier COD charges and deductions'}{r.note ? ` · ${r.note}` : ''}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <SelectInput value={e.vendorId ?? ''} disabled={!canEdit} aria-label={`${r.label}: Books vendor`} className="w-full min-w-[14rem]"
                          onChange={(ev) => set(r.group, r.code, { vendorId: ev.target.value || undefined })}>
                          <option value="">— not chosen (fees wait) —</option>
                          {e.vendorId && !v && <option value={e.vendorId}>Vendor {e.vendorId.slice(0, 8)}…</option>}
                          {vendors.map((x) => <option key={x.id} value={x.id}>{x.name}{x.gstin ? ` · ${x.gstin}` : ' · no GSTIN'}</option>)}
                        </SelectInput>
                        {!e.vendorId && <p className="mt-1 text-xs text-amber-700">No vendor chosen: these fees wait and are not posted.</p>}
                        {v && !v.gstin && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{v.name} has no GSTIN: no GST input credit can be claimed; fees will wait. Add the GSTIN on the vendor record.</p>
                        )}
                        {vendors.length === 0 && <p className="mt-1 text-xs text-gray-500">No vendors yet. <Link to="/vendors" className="underline">Add the vendor</Link> first.</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <SelectInput value={mode} disabled={!canEdit} aria-label={`${r.label}: record source`}
                          onChange={(ev) => set(r.group, r.code, { mode: ev.target.value as FeeMode })}>
                          <option value="automatic">Automatic from {r.group === 'gatewayFeeVendor' ? 'settlements' : 'payouts'}</option>
                          <option value="vendor_bill">From the vendor’s bill</option>
                        </SelectInput>
                        <span className="ml-1 align-middle"><InfoTip text={MODE_HELP[mode]} /></span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!canEdit && <p className="mt-2 text-xs text-gray-500">Changing these needs the “manage settings” permission.</p>}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

/* ── fees waiting to post ──────────────────────────────────────────────────── */

const KIND_LABEL: Record<string, string> = { gateway_fee: 'Gateway fee', courier_cod_charge: 'Courier charge' };

export const HeldFeesPanel: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { hasPerm } = useAuth();
  const [held, setHeld] = useState<HeldFees | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const load = useCallback(() => {
    setFail(null);
    feeVendorsAPI.held(50).then(setHeld).catch((e) => setFail(failureOf(e, 'the waiting fees could not be read')));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!hasPerm('accounting.read')) return null;
  if (compact) {
    if (fail || !held || (held.count === 0 && held.notes.length === 0)) return null;
    const reasons = [...new Set(held.items.map((i) => i.reason).filter(Boolean))].slice(0, 2);
    return (
      <div role="status" className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          {held.count > 0 && <p><strong>{held.count} fee{held.count === 1 ? '' : 's'} waiting to post to the books.</strong> {reasons.join(' · ')}</p>}
          {held.notes.map((n) => <p key={n} className="text-xs">{n}</p>)}
        </div>
        <Link to={FEE_VENDORS_ANCHOR} className="shrink-0 text-xs font-medium underline underline-offset-2">Fix in Accounting settings</Link>
      </div>
    );
  }

  return (
    <div id="fees-waiting">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><PauseCircle className="h-4 w-4 text-gray-500" />Fees waiting to post</span>}
        description="Gateway fees and courier charges the books are holding, and why. Fix the reason and they post on the next daily run."
        flush
      >
        {fail ? <div className="p-4"><FailureNotice failure={fail} what="Held fees are not reported by this server yet." onRetry={load} /></div> : (
          <>
            {held && held.notes.length > 0 && (
              <ul className="space-y-1 border-b border-gray-100 px-5 py-3 text-sm text-amber-800">
                {held.notes.map((n) => <li key={n} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{n}</li>)}
              </ul>
            )}
            {held && held.count === 0 && held.notes.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Nothing waiting — every fee has posted.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-2">What</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Why it waits</th><th className="px-4 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!held ? <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr> : held.items.map((h, i) => (
                      <tr key={`${h.source_id ?? i}`}>
                        <td className="px-4 py-2">{KIND_LABEL[h.kind] ?? titleOf(h.kind)}<span className="block text-xs text-gray-500">{h.provider ? titleOf(h.provider) : ''}</span></td>
                        <td className="px-4 py-2 font-mono text-xs">{h.reference ?? '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(h.amount_minor, h.currency)}</td>
                        <td className="px-4 py-2 text-gray-700">{h.reason}</td>
                        <td className="px-4 py-2 text-right">
                          <a href="#fee-vendors" className="whitespace-nowrap text-xs font-medium underline underline-offset-2">Fix</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {held && held.count > held.items.length && <p className="px-5 py-2 text-xs text-gray-500">Showing {held.items.length} of {held.count}.</p>}
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
};

/* ── gateway tax invoices ──────────────────────────────────────────────────── */

/** Attach a gateway's / courier's tax invoice to its automatic journals of a period. */
export const AttachTaxInvoiceDialog: React.FC<{
  open: boolean; onClose: () => void; onDone?: () => void; vendorId?: string | null;
}> = ({ open, onClose, onDone, vendorId }) => {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [f, setF] = useState({ vendor_id: '', gstin: '', invoice_number: '', invoice_date: todayIso(), period_from: isoDaysFromToday(-30), period_to: todayIso(), taxable: '', tax: '', note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    feeVendorsAPI.vendors().then((vs) => {
      setVendors(vs);
      const v = vs.find((x) => x.id === vendorId);
      setF((s) => ({ ...s, vendor_id: vendorId ?? s.vendor_id, gstin: v?.gstin ?? s.gstin }));
    }).catch(() => setVendors([]));
  }, [open, vendorId]);

  const pickVendor = (id: string) => {
    const v = vendors.find((x) => x.id === id);
    setF((s) => ({ ...s, vendor_id: id, gstin: v?.gstin ?? '' }));
  };

  const submit = async () => {
    if (!f.vendor_id) { setErr('Choose the vendor this invoice is from.'); return; }
    const taxable = f.taxable.trim() ? majorToMinor(f.taxable) : undefined;
    const tax = f.tax.trim() ? majorToMinor(f.tax) : undefined;
    if (taxable === null || tax === null) { setErr('Amounts must be numbers, e.g. 1234.50.'); return; }
    setBusy(true); setErr('');
    try {
      await feeVendorsAPI.attach({
        vendor_id: f.vendor_id, gstin: f.gstin.trim().toUpperCase(), invoice_number: f.invoice_number.trim(),
        invoice_date: f.invoice_date, period_from: f.period_from, period_to: f.period_to,
        ...(taxable !== undefined ? { taxable_minor: taxable } : {}), ...(tax !== undefined ? { tax_minor: tax } : {}),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      });
      onDone?.(); onClose();
      setF((s) => ({ ...s, invoice_number: '', taxable: '', tax: '', note: '' }));
    } catch (e: any) {
      setErr(isGap(e) ? 'Attaching tax invoices is not available on this server yet.' : errText(e, 'The invoice could not be attached.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach a tax invoice</DialogTitle>
          <DialogDescription>
            For a vendor whose charges post automatically: the monthly invoice is the GST document for those entries.
            It is attached to them — not entered as a bill, which would count the cost twice.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendor *" className="sm:col-span-2">
            <SelectInput value={f.vendor_id} onChange={(e) => pickVendor(e.target.value)}>
              <option value="">— choose —</option>
              {f.vendor_id && !vendors.some((v) => v.id === f.vendor_id) && <option value={f.vendor_id}>Vendor {f.vendor_id.slice(0, 8)}…</option>}
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gstin ? ` · ${v.gstin}` : ' · no GSTIN'}</option>)}
            </SelectInput>
          </Field>
          <Field label="GSTIN on the invoice *"><TextInput value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} placeholder="29ABCDE1234F1Z5" /></Field>
          <Field label="Invoice number *"><TextInput value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>
          <Field label="Invoice date *"><TextInput type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value })} /></Field>
          <div />
          <Field label="Period from *"><TextInput type="date" value={f.period_from} onChange={(e) => setF({ ...f, period_from: e.target.value })} /></Field>
          <Field label="Period to *"><TextInput type="date" value={f.period_to} onChange={(e) => setF({ ...f, period_to: e.target.value })} /></Field>
          <Field label="Taxable value (₹, as printed)"><TextInput inputMode="decimal" value={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.value })} /></Field>
          <Field label="GST (₹, as printed)"><TextInput inputMode="decimal" value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} /></Field>
          <Field label="Note" className="sm:col-span-2"><TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <DialogFooter>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}Attach</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Invoice vs journals: equal, different (by how much), or nothing to compare. */
const Compare: React.FC<{ inv: number | null; jr: number | null; cur: string }> = ({ inv, jr, cur }) => {
  if (inv === null) return <span className="text-gray-400">—</span>;
  const d = inv - (jr ?? 0);
  return d === 0
    ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Same</span>
    : <span className="inline-flex items-center gap-1 text-red-700" title="The invoice and the posted journals differ"><AlertTriangle className="h-3.5 w-3.5" />Differs by {money(Math.abs(d), cur)}</span>;
};

export const GatewayTaxInvoices: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const [rows, setRows] = useState<FeeTaxInvoice[] | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [flt, setFlt] = useState({ vendor_id: '', from: isoDaysFromToday(-365), to: todayIso() });
  const [attaching, setAttaching] = useState(false);
  const [voiding, setVoiding] = useState<FeeTaxInvoice | null>(null);
  const [reason, setReason] = useState(''); const [vErr, setVErr] = useState(''); const [vBusy, setVBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null); setFail(null);
    feeVendorsAPI.taxInvoices(flt).then(setRows).catch((e) => { setRows([]); setFail(failureOf(e, 'the tax invoices could not be read')); });
  }, [flt]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { feeVendorsAPI.vendors().then(setVendors).catch(() => setVendors([])); }, []);

  const doVoid = async () => {
    if (!voiding) return;
    if (!reason.trim()) { setVErr('Say why the invoice is detached.'); return; }
    setVBusy(true); setVErr('');
    try { await feeVendorsAPI.voidInvoice(voiding.id, reason.trim()); setVoiding(null); setReason(''); load(); }
    catch (e: any) { setVErr(errText(e, 'The invoice could not be detached.')); }
    finally { setVBusy(false); }
  };

  useHashScroll('gateway-tax-invoices', rows !== null);
  if (!hasPerm('accounting.read')) return null;

  return (
    <div id="gateway-tax-invoices">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-gray-500" />Gateway and courier tax invoices</span>}
        description="The monthly invoices of vendors whose charges post automatically, attached to those entries. The invoice’s taxable value and GST should equal what the books posted for its period."
        action={canPost ? <Btn size="sm" onClick={() => setAttaching(true)}><Paperclip className="h-4 w-4" />Attach invoice</Btn> : undefined}
      >
        <FilterBar className="mb-3">
          <Field label="Vendor">
            <SelectInput value={flt.vendor_id} onChange={(e) => setFlt({ ...flt, vendor_id: e.target.value })}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Invoice date from"><TextInput type="date" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} /></Field>
          <Field label="to"><TextInput type="date" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} /></Field>
        </FilterBar>
        {fail && <FailureNotice failure={fail} what="Attaching gateway tax invoices is not on this server yet." onRetry={load} />}
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Invoice</Th><Th>Vendor</Th><Th>Period</Th>
              <Th num>Invoice taxable</Th><Th num>Books expense</Th><Th>Check</Th>
              <Th num>Invoice GST</Th><Th num>Books GST</Th><Th>Check</Th><Th> </Th>
            </THead>
            <TBody>
              {rows === null ? <EmptyRow colSpan={10}>Loading…</EmptyRow> : rows.length === 0 ? (
                <EmptyRow colSpan={10}>{fail ? 'Nothing to show.' : 'No tax invoice attached in these dates.'}</EmptyRow>
              ) : rows.map((r) => (
                <Tr key={r.id} className={r.voided_at ? 'opacity-60' : ''}>
                  <Td>
                    <span className="font-medium">{r.invoice_number}</span>
                    <span className="block text-xs text-gray-500">{formatDay(r.invoice_date)}</span>
                    {r.voided_at && <Chip tone="neutral">Detached</Chip>}
                    {r.void_reason && <span className="block text-xs text-gray-500">{r.void_reason}</span>}
                  </Td>
                  <Td>{r.vendor_name ?? '—'}<span className="block font-mono text-[11px] text-gray-400">{r.vendor_gstin ?? ''}</span></Td>
                  <Td className="whitespace-nowrap text-xs">{formatDay(r.period_from)} – {formatDay(r.period_to)}<span className="block text-gray-500">{r.journal_count} journal{r.journal_count === 1 ? '' : 's'}</span></Td>
                  <Td num>{money(r.invoice_taxable_minor, r.currency)}</Td>
                  <Td num muted>{money(r.journals_expense_minor, r.currency)}</Td>
                  <Td className="text-xs"><Compare inv={r.invoice_taxable_minor} jr={r.journals_expense_minor} cur={r.currency} /></Td>
                  <Td num>{money(r.invoice_tax_minor, r.currency)}</Td>
                  <Td num muted>{money(r.journals_tax_minor, r.currency)}</Td>
                  <Td className="text-xs"><Compare inv={r.invoice_tax_minor} jr={r.journals_tax_minor} cur={r.currency} /></Td>
                  <Td>{canPost && !r.voided_at && <Btn size="sm" variant="ghost" onClick={() => { setVoiding(r); setReason(''); setVErr(''); }}>Detach</Btn>}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        {!canPost && <p className="mt-2 text-xs text-gray-500">Attaching or detaching needs the “post to the books” permission.</p>}
      </SectionCard>

      <AttachTaxInvoiceDialog open={attaching} onClose={() => setAttaching(false)} onDone={load} />
      <Dialog open={!!voiding} onOpenChange={(o) => { if (!o) setVoiding(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detach invoice {voiding?.invoice_number}</DialogTitle>
            <DialogDescription>The journals stay as posted; only the link to this invoice is removed, and the reason is kept.</DialogDescription>
          </DialogHeader>
          <Field label="Why *"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong period" /></Field>
          {vErr && <p role="alert" className="text-sm text-red-700">{vErr}</p>}
          <DialogFooter>
            <Btn variant="outline" onClick={() => setVoiding(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={doVoid} disabled={vBusy}>{vBusy && <Loader2 className="h-4 w-4 animate-spin" />}Detach</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── the 409 offer on bills and expenses ───────────────────────────────────── */

/** "Already posted automatically — attach it as the tax invoice instead", with the form prefilled. */
export const AttachTaxInvoiceOffer: React.FC<{ offer: FeeVendorOffer | null; onDismiss: () => void }> = ({ offer, onDismiss }) => {
  const { hasPerm } = useAuth();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!offer) return null;
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>{offer.message}</p>
      {done ? <p className="text-emerald-700">Attached. <Link to={TAX_INVOICES_ANCHOR} className="underline">See it in Accounting settings</Link>.</p> : (
        <div className="flex flex-wrap items-center gap-2">
          {hasPerm('accounting.post')
            ? <Btn size="sm" variant="outline" onClick={() => setOpen(true)}><Paperclip className="h-4 w-4" />Attach as tax invoice</Btn>
            : <span className="text-xs">Attaching needs the “post to the books” permission.</span>}
          <Btn size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Btn>
          <Link to={FEE_VENDORS_ANCHOR} className="text-xs underline">Vendor settings</Link>
        </div>
      )}
      <AttachTaxInvoiceDialog open={open} onClose={() => setOpen(false)} onDone={() => setDone(true)} vendorId={offer.vendorId} />
    </div>
  );
};
