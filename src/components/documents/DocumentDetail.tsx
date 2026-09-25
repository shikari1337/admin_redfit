import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Ban, Check, Download, FileCheck2, Loader2, Mail, Receipt, Send,
} from 'lucide-react';
import SendDocumentDialog from './SendDocumentDialog';
import { documentsAPI } from '@/services/api';
import { fmtMinor } from '@/lib/money';
import InfoTip from '@/components/common/InfoTip';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, type Tone,
} from '@/components/erp';

/**
 * ONE DOCUMENT, exactly as the PDF prints it.
 *
 * The line table below carries the same columns the printer draws — batch and
 * expiry appear only when a line actually has them, which is the same rule
 * `invoicePdf.ts` applies, so the screen and the paper never disagree about
 * what is on the document (WS-G G.4.3).
 *
 * Every amount is the one the SERVER stored in paise. Nothing is recomputed
 * here: an issued document is immutable, and a screen that re-derives its
 * totals is a second opinion about a legal figure.
 */

const STATUS_TONE: Record<string, Tone> = {
  draft: 'amber', proposed: 'blue', issued: 'blue', paid: 'green', cancelled: 'red',
};

const KIND_LABEL: Record<string, string> = {
  invoice: 'Tax invoice', proforma: 'Proforma invoice', credit_note: 'Credit note',
};

const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

export interface DocumentDetailProps {
  id: string;
  canPost: boolean;
  onBack: () => void;
  onChanged?: (doc: any) => void;
}

const DocumentDetail: React.FC<DocumentDetailProps> = ({ id, canPost, onBack, onChanged }) => {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  /** What the messaging hub recorded for this document — the dispatch ids. */
  const [dispatches, setDispatches] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      setDoc(await documentsAPI.get(id));
      documentsAPI.dispatches(id).then(setDispatches).catch(() => setDispatches([]));
    }
    catch (e: any) { setErr(errText(e)); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (label: string, fn: () => Promise<any>, ok: string) => {
    setBusy(label); setErr(''); setMsg('');
    try {
      const next = await fn();
      setMsg(ok);
      await load();
      onChanged?.(next ?? doc);
    } catch (e: any) { setErr(errText(e)); }
    finally { setBusy(''); }
  };

  const openPdf = async () => {
    try {
      const blob = await documentsAPI.pdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { setErr(errText(e)); }
  };

  if (loading) {
    return (
      <Page>
        <PageHeader title="Loading the document…" actions={<Btn variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Btn>} />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
      </Page>
    );
  }

  if (!doc) {
    return (
      <Page>
        <PageHeader title="Document not found" description={err || 'It may have been cancelled or removed.'}
          actions={<Btn variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Btn>} />
      </Page>
    );
  }

  const lines: any[] = doc.lines ?? [];
  const showBatch = lines.some((l) => l.batch_number);
  const showExpiry = lines.some((l) => l.expiry_date);
  const showDiscount = lines.some((l) => Number(l.discount_minor ?? 0) > 0);
  const p = doc.party ?? {};
  const a = p.address ?? {};

  return (
    <Page>
      <PageHeader
        icon={doc.kind === 'credit_note' ? FileCheck2 : Receipt}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {KIND_LABEL[doc.kind] ?? doc.kind}
            <span className="font-mono text-base text-gray-500">{doc.number ?? '(not numbered yet)'}</span>
            <StatusChip status={doc.status === 'proposed' ? 'To review' : doc.status} tone={STATUS_TONE[doc.status] ?? 'neutral'} />
          </span>
        }
        description={`Dated ${doc.document_date}${doc.due_date ? ` · due ${doc.due_date}` : ''} · place of supply ${doc.place_of_supply ?? '—'}`}
        actions={<Btn variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to the list</Btn>}
      />

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

      {/* Actions — each one says what it does to the document, not just a verb. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <Btn variant="outline" onClick={openPdf}><Download className="h-4 w-4" /> Open the PDF</Btn>
        {canPost && ['issued', 'paid'].includes(doc.status) && (
          <Btn variant="outline" onClick={() => setSendOpen(true)}><Mail className="h-4 w-4" /> Send</Btn>
        )}
        {canPost && doc.status === 'draft' && (
          <Btn variant="success" disabled={!!busy} onClick={() => act('issue', () => documentsAPI.issue(doc.id), 'Issued — it now has its number and cannot be edited.')}>
            {busy === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Issue it
          </Btn>
        )}
        {canPost && doc.kind === 'proforma' && doc.status !== 'cancelled' && (
          <Btn variant="primary" disabled={!!busy}
            onClick={() => act('convert', () => documentsAPI.convert(doc.id, { issue: true }), 'The tax invoice has been raised from this proforma.')}>
            {busy === 'convert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Invoice it
          </Btn>
        )}
        {canPost && doc.kind === 'invoice' && doc.status === 'issued' && (
          <>
            <Btn variant="outline" disabled={!!busy} onClick={() => act('paid', () => documentsAPI.markPaid(doc.id), 'Recorded as paid.')}>
              <Check className="h-4 w-4" /> Record payment
            </Btn>
            <Btn variant="outline" disabled={!!busy}
              onClick={() => act('cn', () => documentsAPI.creditNote(doc.id, { reason: 'Raised from the accounting desk' }), 'Credit note drafted — review it, then issue it.')}>
              <FileCheck2 className="h-4 w-4" /> Credit this invoice
            </Btn>
          </>
        )}
        {canPost && ['draft', 'proposed'].includes(doc.status) && (
          <Btn variant="dangerOutline" disabled={!!busy} onClick={() => act('cancel', () => documentsAPI.cancel(doc.id, 'Cancelled from the accounting desk'), 'Cancelled.')}>
            <Ban className="h-4 w-4" /> Cancel this draft
          </Btn>
        )}
        {doc.kind === 'proforma' && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500">
            Not a tax invoice
            <InfoTip text="A proforma is an offer. It claims no GST, posts no journal and takes no invoice number — “Invoice it” is what turns it into the real document." />
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Billed to" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{p.company || p.name || '—'}</div>
              {p.company && p.name && <div className="text-gray-600">{p.name}</div>}
              {[a.line1, a.line2, [a.city, a.pincode].filter(Boolean).join(' '), a.state].filter(Boolean).map((l: string, i: number) => (
                <div key={i} className="text-gray-600">{l}</div>
              ))}
              {(p.phone || p.email) && <div className="mt-1 text-gray-500">{[p.phone, p.email].filter(Boolean).join(' · ')}</div>}
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Their GSTIN</dt><dd className="font-mono">{doc.party_gstin ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Your GSTIN</dt><dd className="font-mono">{doc.seller_gstin ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Place of supply</dt><dd>{doc.place_of_supply ?? '—'}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Prices include GST</dt><dd>{doc.tax_inclusive ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>
        </SectionCard>

        <SectionCard title="Totals">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Taxable value</dt><dd className="tabular-nums">{fmtMinor(doc.taxable_minor)}</dd></div>
            {Number(doc.discount_minor) > 0 && <div className="flex justify-between"><dt className="text-gray-500">Discount</dt><dd className="tabular-nums">− {fmtMinor(doc.discount_minor)}</dd></div>}
            {Number(doc.gst?.cgst ?? 0) > 0 && <div className="flex justify-between"><dt className="text-gray-500">CGST</dt><dd className="tabular-nums">{fmtMinor(Number(doc.gst.cgst) * 100)}</dd></div>}
            {Number(doc.gst?.sgst ?? 0) > 0 && <div className="flex justify-between"><dt className="text-gray-500">SGST</dt><dd className="tabular-nums">{fmtMinor(Number(doc.gst.sgst) * 100)}</dd></div>}
            {Number(doc.gst?.igst ?? 0) > 0 && <div className="flex justify-between"><dt className="text-gray-500">IGST</dt><dd className="tabular-nums">{fmtMinor(Number(doc.gst.igst) * 100)}</dd></div>}
            {Number(doc.round_off_minor) !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Rounded off</dt><dd className="tabular-nums">{fmtMinor(doc.round_off_minor)}</dd></div>}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtMinor(doc.total_minor)}</dd></div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title="Lines" description="Exactly the columns the printed document carries." flush>
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th className="w-10">#</Th>
              <Th>Description</Th>
              <Th>HSN / SAC</Th>
              {showBatch && <Th>Batch</Th>}
              {showExpiry && <Th>Expiry</Th>}
              <Th num>Qty</Th>
              <Th>Unit</Th>
              <Th num>Rate ₹</Th>
              {showDiscount && <Th num>Discount ₹</Th>}
              <Th num>Taxable ₹</Th>
              <Th num>GST %</Th>
              <Th num>GST ₹</Th>
              <Th num>Amount ₹</Th>
            </THead>
            <TBody>
              {lines.length === 0 && <EmptyRow colSpan={13}>This document has no lines.</EmptyRow>}
              {lines.map((l) => (
                <Tr key={l.id ?? l.line_no}>
                  <Td muted>{l.line_no}</Td>
                  <Td>{l.description}</Td>
                  <Td className="font-mono text-xs">{l.tax_code ?? '—'}</Td>
                  {showBatch && <Td className="font-mono text-xs">{l.batch_number ?? '—'}</Td>}
                  {showExpiry && <Td>{l.expiry_date ?? '—'}</Td>}
                  <Td num>{Number(l.quantity)}</Td>
                  <Td muted>{l.unit ?? '—'}</Td>
                  <Td num>{fmtMinor(l.unit_price_minor)}</Td>
                  {showDiscount && <Td num>{Number(l.discount_minor) ? fmtMinor(l.discount_minor) : '—'}</Td>}
                  <Td num>{fmtMinor(l.taxable_minor)}</Td>
                  <Td num>{Number(l.tax_rate ?? 0)}%</Td>
                  <Td num>{fmtMinor(l.tax_minor)}</Td>
                  <Td num className="font-medium">{fmtMinor(l.total_minor)}</Td>
                </Tr>
              ))}
            </TBody>
            {lines.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900">
                <tr>
                  <td className="px-4 py-2.5" colSpan={showBatch && showExpiry ? 9 : showBatch || showExpiry ? 8 : 7}>
                    {lines.length} line{lines.length === 1 ? '' : 's'}
                  </td>
                  {showDiscount && <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(doc.discount_minor)}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(doc.taxable_minor)}</td>
                  <td />
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(doc.tax_minor)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(doc.total_minor)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableShell>
      </SectionCard>

      <SectionCard
        title={<span className="inline-flex items-center gap-1.5">Sent <InfoTip text="Every message the store's messaging hub recorded for this document, with its own status and — when it did not go — its own reason." /></span>}
        flush
      >
        {dispatches.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-500">
            Not sent yet.{canPost && ['issued', 'paid'].includes(doc.status) ? ' Use Send to email the PDF or message a summary.' : ''}
          </div>
        ) : (
          <TableShell className="rounded-none border-0 shadow-none">
            <table className="w-full text-sm">
              <THead><Th>When</Th><Th>Channel</Th><Th>To</Th><Th>Status</Th><Th>Why not</Th><Th>Dispatch</Th></THead>
              <TBody>
                {dispatches.map((d) => (
                  <Tr key={d.id}>
                    <Td muted>{String(d.created_at ?? '').replace('T', ' ').slice(0, 16)}</Td>
                    <Td className="capitalize">{d.channel}</Td>
                    <Td muted className="font-mono text-xs">{d.recipient ?? '—'}</Td>
                    <Td><StatusChip status={d.status} tone={d.status === 'sent' || d.status === 'delivered' ? 'green' : d.status === 'failed' || d.status === 'skipped' ? 'red' : 'amber'} /></Td>
                    <Td muted className="max-w-[18rem] truncate" title={d.error ?? d.skipped_reason ?? ''}>{d.error ?? d.skipped_reason ?? '—'}</Td>
                    <Td className="font-mono text-xs">{String(d.id).slice(0, 8)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        )}
      </SectionCard>

      <SendDocumentDialog
        open={sendOpen}
        documentId={doc.id}
        label={`${KIND_LABEL[doc.kind] ?? 'document'} ${doc.number ?? ''}`.trim()}
        onOpenChange={setSendOpen}
        onSent={() => { documentsAPI.dispatches(doc.id).then(setDispatches).catch(() => {}); }}
      />

      {(doc.notes || doc.terms || doc.cancel_reason) && (
        <SectionCard title="Notes">
          {doc.notes && <p className="text-sm text-gray-700">{doc.notes}</p>}
          {doc.terms && <p className="mt-2 text-sm text-gray-600"><span className="font-medium">Terms: </span>{doc.terms}</p>}
          {doc.cancel_reason && <p className="mt-2 text-sm text-red-700"><span className="font-medium">Cancelled: </span>{doc.cancel_reason}</p>}
        </SectionCard>
      )}
    </Page>
  );
};

export default DocumentDetail;
