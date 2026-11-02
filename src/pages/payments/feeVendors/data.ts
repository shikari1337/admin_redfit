/**
 * Fee vendors in Books (DEC-072 / DEC-073; lane ADMIN-PAY-1): which Books vendor each payment gateway and
 * each courier is, and which record carries its cost — "automatic" (Books posts every fee/deduction with
 * its GST from the gateway's settlements / the courier's payouts; the vendor's monthly invoice is ATTACHED
 * as the GST document, never entered as a bill) or "vendor_bill" (the bill carries the expense and GST; the
 * payout deductions only settle it). Plus the fees Books is holding, and the attached tax invoices.
 *
 * Paths: `FEE_VENDOR_PATHS` in src/lib/v2/areas/payments.ts. Calls are raw (Money stays `{minor, currency}`).
 */
import { FEE_VENDOR_PATHS as F } from '@/lib/v2/areas/payments';
import { vendorsAPI } from '@/services/api';
import { minorOf, v2raw } from '../data';

export type FeeMode = 'automatic' | 'vendor_bill';
export interface FeeVendorEntry { vendorId?: string; mode?: FeeMode }
export interface FeeVendorsValue {
  gatewayFeeVendor: Record<string, FeeVendorEntry>;
  courierVendor: Record<string, FeeVendorEntry>;
}
/** Books' defaults when a mode is not chosen: gateways automatic, couriers from the bill. */
export const DEFAULT_MODE = { gatewayFeeVendor: 'automatic', courierVendor: 'vendor_bill' } as const;

export interface VendorOption { id: string; name: string; gstin: string | null }
export interface CourierOption { code: string; label: string; configured: boolean }

export interface HeldFee {
  kind: string; source_id: string | null; provider: string | null; reference: string | null;
  amount_minor: number | null; currency: string; reason: string;
}
export interface HeldFees { items: HeldFee[]; count: number; notes: string[] }

export interface FeeTaxInvoice {
  id: string; vendor_id: string; vendor_name: string | null; vendor_gstin: string | null;
  invoice_number: string; invoice_date: string | null; period_from: string | null; period_to: string | null;
  invoice_taxable_minor: number | null; invoice_tax_minor: number | null;
  journals_expense_minor: number | null; journals_tax_minor: number | null; journal_count: number;
  currency: string; note: string | null; created_at: string | null; voided_at: string | null; void_reason: string | null;
}
export interface AttachInput {
  vendor_id: string; gstin: string; invoice_number: string; invoice_date: string; period_from: string; period_to: string;
  taxable_minor?: number; tax_minor?: number; note?: string;
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const rowsOf = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []);
const cleanGroup = (g: unknown): Record<string, FeeVendorEntry> => {
  const out: Record<string, FeeVendorEntry> = {};
  if (g && typeof g === 'object' && !Array.isArray(g)) {
    for (const [k, v] of Object.entries(g as Record<string, any>)) {
      const e: FeeVendorEntry = {};
      if (v?.vendorId) e.vendorId = String(v.vendorId);
      if (v?.mode === 'automatic' || v?.mode === 'vendor_bill') e.mode = v.mode;
      out[k.toLowerCase()] = e;
    }
  }
  return out;
};

export const feeVendorsAPI = {
  /** The stored value (empty groups when never set). */
  async read(): Promise<FeeVendorsValue> {
    const d: any = await v2raw('GET', F.accountingGroup);
    const v = (d?.settings ?? d ?? {}).booksFeeVendors ?? {};
    return { gatewayFeeVendor: cleanGroup(v.gatewayFeeVendor), courierVendor: cleanGroup(v.courierVendor) };
  },
  /** The COMPLETE value — a patch replaces the whole group. */
  async save(value: FeeVendorsValue): Promise<void> {
    await v2raw('PATCH', F.feeVendorsSetting, { data: value });
  },
  async vendors(): Promise<VendorOption[]> {
    const rows: any[] = await vendorsAPI.list();
    return (Array.isArray(rows) ? rows : [])
      .map((r) => ({ id: String(r?.id ?? ''), name: String(r?.business_name ?? r?.name ?? 'Vendor'), gstin: str(r?.gst_number ?? r?.gstin) }))
      .filter((v) => v.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async couriers(): Promise<CourierOption[]> {
    const d: any = await v2raw('GET', F.couriers);
    const list = Array.isArray(d?.data) ? d.data : rowsOf(d);
    return list.map((c: any) => ({ code: String(c?.provider ?? c?.code ?? '').toLowerCase(), label: String(c?.label ?? c?.provider ?? ''), configured: !!c?.configured }))
      .filter((c: CourierOption) => c.code);
  },
  async held(limit = 50): Promise<HeldFees> {
    const d: any = await v2raw('GET', F.held, { params: { limit } });
    const items = rowsOf(d).map((r: any): HeldFee => {
      const currency = String(r?.currency || r?.amount?.currency || 'INR');
      return {
        kind: String(r?.kind ?? ''), source_id: str(r?.source_id), provider: str(r?.provider), reference: str(r?.reference),
        amount_minor: minorOf(r, 'amount', currency), currency, reason: String(r?.reason ?? ''),
      };
    });
    return { items, count: Number.isFinite(Number(d?.count)) ? Number(d.count) : items.length, notes: (Array.isArray(d?.notes) ? d.notes : []).map(String) };
  },
  async taxInvoices(f: { vendor_id?: string; from?: string; to?: string }): Promise<FeeTaxInvoice[]> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v) params[k] = v;
    const d: any = await v2raw('GET', F.taxInvoices, { params });
    return rowsOf(d).map((r: any): FeeTaxInvoice => {
      const currency = String(r?.currency || 'INR');
      return {
        id: String(r?.id ?? ''), vendor_id: String(r?.vendor_id ?? ''), vendor_name: str(r?.vendor_name), vendor_gstin: str(r?.vendor_gstin),
        invoice_number: String(r?.invoice_number ?? ''), invoice_date: str(r?.invoice_date), period_from: str(r?.period_from), period_to: str(r?.period_to),
        invoice_taxable_minor: minorOf(r, 'invoice_taxable', currency), invoice_tax_minor: minorOf(r, 'invoice_tax', currency),
        journals_expense_minor: minorOf(r, 'journals_expense', currency), journals_tax_minor: minorOf(r, 'journals_tax', currency),
        journal_count: Number(r?.journal_count ?? 0) || 0, currency, note: str(r?.note), created_at: str(r?.created_at),
        voided_at: str(r?.voided_at), void_reason: str(r?.void_reason),
      };
    });
  },
  async attach(body: AttachInput): Promise<void> {
    await v2raw('POST', F.taxInvoices, { data: body });
  },
  async voidInvoice(id: string, reason: string): Promise<void> {
    await v2raw('POST', F.voidTaxInvoice(id), { data: { reason } });
  },
};

/** A bill/expense refused because the vendor's fees post automatically (409, `details.alternative`). */
export interface FeeVendorOffer { vendorId: string | null; message: string }
export function feeVendorAlternative(e: any): FeeVendorOffer | null {
  const d = e?.response?.data;
  const det = d?.details ?? d?.error?.details;
  if (e?.response?.status !== 409 || det?.alternative !== 'attach_tax_invoice') return null;
  return { vendorId: str(det?.vendor_id), message: String(d?.message ?? d?.error?.message ?? 'This vendor’s charges are already posted automatically.') };
}

export const FEE_VENDORS_ANCHOR = '/panel/accounting/settings#fee-vendors';
export const TAX_INVOICES_ANCHOR = '/panel/accounting/settings#gateway-tax-invoices';
