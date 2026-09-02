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
  salesperson?: string | null;
  manualInvoiceUrl?: string | null;
  manualInvoiceFilename?: string | null;
  manualInvoiceUploadedBy?: string | null;
  canManage: boolean;
  onSaved: () => void;
}

const dateForInput = (v?: string | null): string => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const OrderBillingCard: React.FC<Props> = ({
  orderId, invoiceNumber, invoiceDate, invoiceNumberSource, salesperson,
  manualInvoiceUrl, manualInvoiceFilename, manualInvoiceUploadedBy, canManage, onSaved,
}) => {
  const { toast } = useToast();
  const [num, setNum] = React.useState(invoiceNumber ?? '');
  const [date, setDate] = React.useState(dateForInput(invoiceDate));
  const [rep, setRep] = React.useState(salesperson ?? '');
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<'upload' | 'remove' | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Re-seed when the order reloads under the card after a save.
  React.useEffect(() => {
    setNum(invoiceNumber ?? '');
    setDate(dateForInput(invoiceDate));
    setRep(salesperson ?? '');
  }, [invoiceNumber, invoiceDate, salesperson]);

  const dirty = (num ?? '') !== (invoiceNumber ?? '')
    || date !== dateForInput(invoiceDate)
    || (rep ?? '') !== (salesperson ?? '');

  const save = async () => {
    setSaving(true);
    try {
      await invoicesAPI.saveDetails(orderId, {
        invoiceNumber: num.trim(),
        invoiceDate: date || undefined,
        salesperson: rep.trim(),
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
      <CardHeader className="px-4 py-2.5 border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <FaFileInvoice className="h-4 w-4 text-muted-foreground" /> Billing details
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">

        {/* ── Invoice number + salesperson ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Invoice number</label>
            <Input value={num} onChange={(e) => setNum(e.target.value)} disabled={!canManage}
              placeholder="From your billing software" className="mt-1" />
            <p className="text-[11px] text-muted-foreground mt-1">
              {invoiceNumberSource === 'manual'
                ? 'Entered by your team.'
                : invoiceNumber
                  ? 'Generated by this system — type over it to use your own.'
                  : 'Leave blank to let this system generate one.'}
            </p>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Invoice date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canManage} className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Salesperson</label>
            <Input value={rep} onChange={(e) => setRep(e.target.value)} disabled={!canManage}
              placeholder="Who sold this order" className="mt-1" />
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
          <p className="text-[13px] font-medium">Invoice document</p>
          <p className="text-xs text-muted-foreground mt-0.5">
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
            <p className="mt-2 text-xs text-muted-foreground">
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
