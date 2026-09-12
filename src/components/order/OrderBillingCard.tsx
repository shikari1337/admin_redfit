import React from 'react';
import { FaFileInvoice, FaUpload, FaTrash, FaCheck } from 'react-icons/fa';
import { invoicesAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

/**
 * BILLING DETAILS — the bridge between this order and the store's own books.
 *
 * Two independent things live here, and they are deliberately separate:
 *
 *  • The INVOICE NUMBER + salesperson. A store that bills in its own accounting
 *    software types that software's number here; it then becomes THE invoice
 *    number everywhere (one order, one number — the system series simply stops
 *    minting for this order). Changing a number that was already issued is
 *    audited into the order timeline.
 *
 *  • The INVOICE PDF. Uploading one replaces the generated invoice for every
 *    reader: this panel's download, the emailed attachment, and the customer's
 *    own order page. Remove it and the generated invoice applies again.
 */

interface Props {
  orderId: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceNumberSource?: 'system' | 'manual' | null;
  manualInvoiceUrl?: string | null;
  manualInvoiceFilename?: string | null;
  manualInvoiceUploadedBy?: string | null;
  /** Seller GSTIN and CGST/SGST-vs-IGST for this order — the invoice header facts. */
  gstin?: string | null;
  taxType?: string | null;
  /**
   * The BUYER's GSTIN, from the order's own `customer_gstin` column. When it is
   * present the invoice is a B2B supply the buyer can claim input credit on, so
   * it is tagged as such — that is what decides whether this document has to
   * carry the buyer's number at all.
   */
  customerGstin?: string | null;
  /** Registered business name behind `customerGstin` (order's billing address). */
  customerCompany?: string | null;
  canManage: boolean;
  onSaved: () => void;
}

const dateForInput = (v?: string | null): string => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const OrderBillingCard: React.FC<Props> = ({
  orderId, invoiceNumber, invoiceDate, invoiceNumberSource,
  manualInvoiceUrl, manualInvoiceFilename, manualInvoiceUploadedBy,
  gstin, taxType, customerGstin, customerCompany, canManage, onSaved,
}) => {
  const { toast } = useToast();
  const [num, setNum] = React.useState(invoiceNumber ?? '');
  const [date, setDate] = React.useState(dateForInput(invoiceDate));
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<'upload' | 'remove' | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Re-seed when the order reloads under the card after a save.
  React.useEffect(() => {
    setNum(invoiceNumber ?? '');
    setDate(dateForInput(invoiceDate));
  }, [invoiceNumber, invoiceDate]);

  const dirty = (num ?? '') !== (invoiceNumber ?? '')
    || date !== dateForInput(invoiceDate);

  const save = async () => {
    setSaving(true);
    try {
      // `salesperson` is deliberately NOT sent: the route writes that column
      // whenever the key is present, so passing an empty one would wipe the
      // credit the Sales & Team card owns.
      await invoicesAPI.saveDetails(orderId, {
        invoiceNumber: num.trim(),
        invoiceDate: date || undefined,
      });
      toast({ title: 'Billing details saved' });
      onSaved();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        // 409 = the number is already on another order; say which problem it is.
        description: e?.response?.data?.message || 'Please try again.',
      });
    } finally { setSaving(false); }
  };

  const upload = async (file?: File | null) => {
    if (!file) return;
    setBusy('upload');
    try {
      await invoicesAPI.uploadManual(orderId, file);
      toast({ title: 'Invoice uploaded', description: 'Customers now receive this PDF instead of the generated one.' });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: e?.response?.data?.message || 'Only PDF files are accepted.' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!confirm('Remove the uploaded invoice? The system-generated invoice will be used again.')) return;
    setBusy('remove');
    try {
      await invoicesAPI.removeManual(orderId);
      toast({ title: 'Uploaded invoice removed' });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not remove', description: e?.response?.data?.message || 'Please try again.' });
    } finally { setBusy(null); }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <span className="flex items-center gap-2">
            <FaFileInvoice className="h-3.5 w-3.5 text-slate-400" /> Billing details
          </span>
          {invoiceNumberSource === 'manual' && (
            <Badge variant="outline" className="text-[10px] font-semibold uppercase text-slate-500">Own number</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">

        {/* Who the invoice is raised by, and under which tax treatment — the
            header facts of the document these fields number. */}
        {(gstin || taxType || customerGstin || customerCompany) && (
          <div className="space-y-1 rounded-md border bg-slate-50 px-2.5 py-1.5 text-xs">
            {gstin && (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-500">Seller GSTIN</span>
                <span className="font-mono font-medium text-slate-900">{gstin}</span>
                {taxType && <span className="font-medium text-slate-900">· {taxType}</span>}
              </div>
            )}
            {customerGstin && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-slate-500">Buyer GSTIN</span>
                <span className="font-mono font-medium text-slate-900">{customerGstin}</span>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[9px] font-medium uppercase tracking-wide text-emerald-700">
                  GST input
                </Badge>
              </div>
            )}
            {/* The entity the invoice is addressed to — a GST invoice is raised
                to the registered business, which is regularly not the name the
                parcel ships to. */}
            {customerCompany && (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-500">Billed to</span>
                <span className="font-medium text-slate-900">{customerCompany}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Invoice number + date ── */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500">Invoice number</label>
            <Input value={num} onChange={(e) => setNum(e.target.value)} disabled={!canManage}
              placeholder="From your billing software" className="mt-1" />
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {invoiceNumberSource === 'manual'
                ? 'Entered by your team.'
                : invoiceNumber
                  ? 'Generated by this system — type over it to use your own.'
                  : 'Leave blank to let this system generate one.'}
            </p>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500">Invoice date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canManage} className="mt-1" />
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save billing details'}
            </Button>
            {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          </div>
        )}

        {/* ── Uploaded invoice PDF ── */}
        <div className="border-t pt-3">
          <p className="text-[13px] font-medium text-slate-900">Invoice document</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Upload your own PDF and it replaces the generated invoice everywhere — this page,
            the customer&apos;s email, and their order page.
          </p>

          {manualInvoiceUrl ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200">
                <FaCheck className="mr-1 h-2.5 w-2.5" /> Your invoice is in use
              </Badge>
              <a href={manualInvoiceUrl} target="_blank" rel="noreferrer"
                className="text-sm text-primary hover:underline truncate max-w-[16rem]">
                {manualInvoiceFilename || 'invoice.pdf'}
              </a>
              {manualInvoiceUploadedBy && (
                <span className="text-xs text-muted-foreground">uploaded by {manualInvoiceUploadedBy}</span>
              )}
              <span className="flex-1" />
              {canManage && (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={remove} disabled={busy !== null}>
                  <FaTrash className="mr-1.5 h-3 w-3" /> {busy === 'remove' ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs font-medium text-slate-500">
              No upload — the system-generated invoice is being used.
            </p>
          )}

          {canManage && (
            <div className="mt-3">
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={(e) => upload(e.target.files?.[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                <FaUpload className="mr-1.5 h-3 w-3" />
                {busy === 'upload' ? 'Uploading…' : manualInvoiceUrl ? 'Replace PDF' : 'Upload invoice PDF'}
              </Button>
              <span className="ml-2 text-[11px] text-muted-foreground">PDF only, up to 10 MB.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderBillingCard;
