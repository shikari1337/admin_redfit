import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Ban, Check, Download, FileCheck2, FilePlus2, FileText, Loader2, Mail, Receipt, Send,
} from 'lucide-react';
import SendDocumentDialog from '@/components/documents/SendDocumentDialog';
import { documentsAPI, exportsAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMinor } from '@/lib/money';
import InfoTip from '@/components/common/InfoTip';
import DocumentComposer, { type ComposerKind } from '@/components/documents/DocumentComposer';
import DocumentDetail from '@/components/documents/DocumentDetail';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  FilterBar, Field, TextInput, SearchInput, TabBar, Pagination,
  ExportMenu, useListControls, FilterChips, ColumnChooser, useColumnChoice, TableSkeleton,
  type CsvColumn, type Tone, type ColumnDef,
} from '@/components/erp';

/**
 * PROFORMAS & TAX INVOICES — the document kernel's own desk in the admin.
 *
 * ── Why a page and not a tab on Quotations or on Credit/Debit Notes ─────────
 * The admin had NO surface for `documents` (migration 156) at all, so the
 * proforma the owner asked for had nowhere to live and, worse, a proforma
 * CONVERTED to an invoice produced a tax invoice nobody could see.
 *
 *  · `/panel/orders/quotations` is the ORDER path (migration 050): a catalogue
 *    quote that becomes an order and moves stock. A proforma is a document that
 *    becomes a tax INVOICE and moves none. Different table, different
 *    destination (WS-G G.7.16).
 *  · `/panel/accounting/documents` is the document LIBRARY (folders and files
 *    you upload) — a different `/documents` router entirely.
 *  · `SalesDocuments` is `/sales-docs`: credit and debit notes raised against an
 *    ORDER, plus delivery challans.
 *
 * Putting kernel documents under any of those headings would file them under a
 * word that means something else. So: one page, three tabs over ONE endpoint
 * and ONE composer.
 */

const STATUS_TONE: Record<string, Tone> = {
  draft: 'amber', proposed: 'blue', issued: 'blue', paid: 'green', cancelled: 'red',
};

type TabKey = 'proforma' | 'invoice' | 'credit_note';

const TABS: Array<{ key: TabKey; label: React.ReactNode }> = [
  { key: 'proforma', label: <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Proformas</span> },
  { key: 'invoice', label: <span className="flex items-center gap-1.5"><Receipt className="h-4 w-4" /> Tax invoices</span> },
  { key: 'credit_note', label: <span className="flex items-center gap-1.5"><FileCheck2 className="h-4 w-4" /> Credit notes</span> },
];

const TAB_BLURB: Record<TabKey, string> = {
  proforma: 'A priced offer you send before the sale. It claims no GST, posts nothing and moves no stock — turn it into the real invoice in one click when the buyer accepts.',
  invoice: 'Tax invoices raised outside the shopping cart — services, plans, usage, anything a catalogue order cannot describe. Once issued, an invoice cannot be edited; correct it with a credit note.',
  credit_note: 'What you give back. A credit note is always raised against the invoice it corrects, so it is created from that invoice rather than from a blank form.',
};

const STATUSES = ['draft', 'proposed', 'issued', 'paid', 'cancelled'] as const;

/** What the table can show. The identity and the money are never hideable. */
const COLUMNS: ColumnDef[] = [
  { key: 'number', label: 'Number', always: true },
  { key: 'date', label: 'Date' },
  { key: 'party', label: 'Customer', always: true },
  { key: 'pos', label: 'Place of supply' },
  { key: 'status', label: 'Status' },
  { key: 'due', label: 'Due' },
  { key: 'taxable', label: 'Taxable', defaultHidden: true },
  { key: 'gst', label: 'GST' },
  { key: 'total', label: 'Total', always: true },
];

const partyName = (d: any) => d?.party?.company || d?.party?.name || '—';
const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';
const today = () => new Date().toISOString().slice(0, 10);

const csvCols: CsvColumn<any>[] = [
  { key: 'number', label: 'Number', format: (d) => d.number ?? '(draft)' },
  { key: 'kind', label: 'Kind' },
  { key: 'document_date', label: 'Date' },
  { key: 'due_date', label: 'Due' },
  { key: 'party', label: 'Party', format: partyName },
  { key: 'party_gstin', label: 'Party GSTIN', format: (d) => d.party_gstin ?? '' },
  { key: 'place_of_supply', label: 'Place of supply', format: (d) => d.place_of_supply ?? '' },
  { key: 'status', label: 'Status' },
  { key: 'taxable_minor', label: 'Taxable', format: (d) => (Number(d.taxable_minor ?? 0) / 100).toFixed(2) },
  { key: 'tax_minor', label: 'GST', format: (d) => (Number(d.tax_minor ?? 0) / 100).toFixed(2) },
  { key: 'total_minor', label: 'Total', format: (d) => (Number(d.total_minor ?? 0) / 100).toFixed(2) },
];

const ProformaInvoices: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [tab, setTab] = useState<TabKey>('proforma');
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');
  const [sendFor, setSendFor] = useState<{ id: string; label: string } | null>(null);

  // `useListControls` already holds search/status/from/to/page and resets to
  // page 1 on every filter change — one state machine, not five useStates.
  const lc = useListControls({ pageSize: 25 });
  const [overdueOnly, setOverdueOnly] = useState(false);
  const cols = useColumnChoice('accounting-documents', COLUMNS);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await documentsAPI.list({
        kind: tab,
        status: lc.status || undefined,
        search: lc.debouncedSearch || undefined,
        from: lc.from || undefined,
        to: lc.to || undefined,
        overdue: overdueOnly ? 1 : undefined,
        limit: lc.pageSize,
        offset: (lc.page - 1) * lc.pageSize,
      });
      setRows(res.rows); setTotal(res.total);
    } catch (e: any) { setErr(errText(e)); setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [tab, lc.status, lc.debouncedSearch, lc.page, lc.pageSize, lc.from, lc.to, overdueOnly]);

  useEffect(() => { if (view === 'list') load(); }, [view, load]);
  // A tab is a different document; page 1 of it, not page 4 of the last one.
  useEffect(() => { lc.setPage(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  // Number + Customer + Total are always drawn, plus the row-action cell.
  const colCount = 4 + ['date', 'pos', 'status', 'due', 'taxable', 'gst'].filter((k) => cols.shows(k)).length;

  const pageTotals = useMemo(() => rows.reduce(
    (a, r) => ({
      taxable: a.taxable + Number(r.taxable_minor ?? 0),
      tax: a.tax + Number(r.tax_minor ?? 0),
      total: a.total + Number(r.total_minor ?? 0),
    }),
    { taxable: 0, tax: 0, total: 0 },
  ), [rows]);

  const act = async (id: string, fn: () => Promise<any>, ok: string) => {
    setBusyId(id); setErr(''); setMsg('');
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setErr(errText(e)); }
    finally { setBusyId(''); }
  };

  const openPdf = async (id: string) => {
    try {
      const blob = await documentsAPI.pdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { setErr(errText(e)); }
  };

  const convert = async (d: any) => {
    await act(d.id, async () => {
      const inv = await documentsAPI.convert(d.id, { issue: true });
      setMsg(`Invoiced as ${inv?.number ?? 'a new draft invoice'}.`);
      setTab('invoice');
    }, 'Converted.');
  };

  // ── Create ────────────────────────────────────────────────────────────────
  if (view === 'create') {
    const kind: ComposerKind = tab === 'invoice' ? 'invoice' : 'proforma';
    return (
      <Page>
        <PageHeader
          icon={FilePlus2}
          title={kind === 'proforma' ? 'New proforma invoice' : 'New tax invoice'}
          description={TAB_BLURB[kind]}
          actions={<Btn variant="ghost" onClick={() => setView('list')}><ArrowLeft className="h-4 w-4" /> Back to the list</Btn>}
        />
        <DocumentComposer
          kind={kind}
          onCancel={() => setView('list')}
          onSaved={(doc) => { setDetailId(doc.id); setView('detail'); setMsg(doc.number ? `${doc.number} saved.` : 'Draft saved.'); }}
        />
      </Page>
    );
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  if (view === 'detail' && detailId) {
    return (
      <DocumentDetail
        id={detailId}
        canPost={canPost}
        onBack={() => { setDetailId(null); setView('list'); }}
        onChanged={(d) => { if (d?.kind) setTab(d.kind as TabKey); }}
      />
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <Page>
      <PageHeader
        icon={FileText}
        title="Proformas & invoices"
        description="Bills that are not orders — a priced offer before the sale, and the tax invoice it becomes."
        actions={canPost && tab !== 'credit_note' && (
          <Btn variant="primary" onClick={() => setView('create')}>
            <FilePlus2 className="h-4 w-4" /> {tab === 'invoice' ? 'New tax invoice' : 'New proforma'}
          </Btn>
        )}
      />

      <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
        <InfoTip
          side="right"
          text="A quotation is a catalogue offer that becomes an ORDER and ships stock. A proforma is a priced document that becomes a TAX INVOICE and ships nothing by itself."
          where="Quotations live under Orders ▸ Quotations."
        />
        <span>{TAB_BLURB[tab]}</span>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

      <SectionCard flush>
        <div className="space-y-3 border-b border-gray-100 px-5 py-3">
          <FilterBar>
            <Field label="Search" className="min-w-[18rem] flex-1">
              <SearchInput
                placeholder="Number, customer, company or GSTIN…"
                value={lc.search}
                onChange={(e) => lc.setSearch(e.target.value)}
              />
            </Field>
            <Field label="From"><TextInput type="date" value={lc.from} onChange={(e) => lc.setFrom(e.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={lc.to} onChange={(e) => lc.setTo(e.target.value)} /></Field>
            <div className="ml-auto flex items-end gap-2">
              <ExportMenu filename={`${tab}-${today()}`} columns={csvCols} rows={rows} canExport={rows.length > 0} />
              <Btn
                variant="outline"
                title="Build the whole list as an Excel workbook. It appears in Downloads when it is ready."
                onClick={async () => {
                  setErr(''); setMsg('');
                  try {
                    await exportsAPI.request('documents', {
                      kind: tab, status: lc.status || undefined,
                      from: lc.from || undefined, to: lc.to || undefined,
                      search: lc.debouncedSearch || undefined,
                    });
                    setMsg('Building your workbook — it will appear in Downloads (Inventory ▸ Downloads) when it is ready.');
                  } catch (e: any) { setErr(errText(e)); }
                }}
              >
                <Download className="h-4 w-4" /> Export all
              </Btn>
            </div>
          </FilterBar>

          <FilterChips
            groups={[
              {
                key: 'status', label: 'Status', value: lc.status, onChange: lc.setStatus,
                help: 'A draft has no number yet. "To review" came in from an import or a relay.',
                options: STATUSES.map((s) => ({ value: s, label: s === 'proposed' ? 'To review' : s[0].toUpperCase() + s.slice(1) })),
              },
              {
                key: 'overdue', label: 'Payment', value: overdueOnly ? 'overdue' : '',
                onChange: (v: string) => { setOverdueOnly(v === 'overdue'); lc.setPage(1); },
                help: 'Overdue means issued, not yet paid, and past its due date.',
                options: [{ value: 'overdue', label: 'Overdue only' }],
              },
            ]}
            onClearAll={() => { lc.reset(); setOverdueOnly(false); }}
          >
            <ColumnChooser columns={COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />
          </FilterChips>
        </div>

        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th>Number</Th>
              {cols.shows('date') && <Th>Date</Th>}
              <Th>Customer</Th>
              {cols.shows('pos') && <Th>Place of supply</Th>}
              {cols.shows('status') && <Th>Status</Th>}
              {cols.shows('due') && <Th>Due</Th>}
              {cols.shows('taxable') && <Th num>Taxable ₹</Th>}
              {cols.shows('gst') && <Th num>GST ₹</Th>}
              <Th num>Total ₹</Th>
              <Th />
            </THead>
            {loading && <TableSkeleton cols={colCount} rows={6} />}
            <TBody>
              {!loading && rows.length === 0 && (
                <EmptyRow colSpan={colCount}>
                  {tab === 'credit_note'
                    ? 'No credit notes yet. Open an issued invoice and use "Credit this invoice".'
                    : lc.search || lc.status || lc.from || lc.to
                      ? 'Nothing matches those filters.'
                      : `No ${tab === 'invoice' ? 'tax invoices' : 'proformas'} yet.${canPost ? ' Use the button above to raise the first one.' : ''}`}
                </EmptyRow>
              )}
              {!loading && rows.map((d) => (
                <Tr key={d.id} className="cursor-pointer" onClick={() => { setDetailId(d.id); setView('detail'); }}>
                  <Td className="font-mono text-xs">{d.number ?? <span className="text-gray-400">(draft)</span>}</Td>
                  {cols.shows('date') && <Td>{d.document_date}</Td>}
                  <Td>
                    <div className="font-medium text-gray-900">{partyName(d)}</div>
                    {d.party_gstin && <div className="font-mono text-[11px] text-gray-500">{d.party_gstin}</div>}
                  </Td>
                  {cols.shows('pos') && <Td muted>{d.place_of_supply ?? '—'}</Td>}
                  {cols.shows('status') && <Td><StatusChip status={d.status === 'proposed' ? 'To review' : d.status} tone={STATUS_TONE[d.status] ?? 'neutral'} /></Td>}
                  {cols.shows('due') && (
                    <Td muted>
                      {d.due_date ?? '—'}
                      {d.status === 'issued' && d.due_date && d.due_date < today() && <Chip tone="red" className="ml-1">overdue</Chip>}
                    </Td>
                  )}
                  {cols.shows('taxable') && <Td num>{fmtMinor(d.taxable_minor)}</Td>}
                  {cols.shows('gst') && <Td num>{fmtMinor(d.tax_minor)}</Td>}
                  <Td num className="font-medium">{fmtMinor(d.total_minor)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Btn variant="ghost" size="sm" title="Open the PDF" onClick={() => openPdf(d.id)}><Download className="h-4 w-4" /></Btn>
                      {canPost && ['issued', 'paid'].includes(d.status) && (
                        <Btn variant="ghost" size="sm" title="Send it by email, WhatsApp or SMS"
                          onClick={() => setSendFor({ id: d.id, label: `${d.kind === 'proforma' ? 'proforma' : d.kind === 'credit_note' ? 'credit note' : 'invoice'} ${d.number ?? ''}`.trim() })}>
                          <Mail className="h-4 w-4" />
                        </Btn>
                      )}
                      {canPost && d.status === 'draft' && (
                        <Btn variant="ghost" size="sm" title="Issue it — this takes the next number" disabled={busyId === d.id}
                          onClick={() => act(d.id, () => documentsAPI.issue(d.id), `${d.number ?? 'Document'} issued.`)}>
                          {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Btn>
                      )}
                      {canPost && d.kind === 'proforma' && d.status !== 'cancelled' && (
                        <Btn variant="outline" size="sm" title="Raise the real tax invoice from this proforma" disabled={busyId === d.id}
                          onClick={() => convert(d)}>
                          {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Invoice it
                        </Btn>
                      )}
                      {canPost && d.kind === 'invoice' && d.status === 'issued' && (
                        <Btn variant="ghost" size="sm" title="Record it as paid" disabled={busyId === d.id}
                          onClick={() => act(d.id, () => documentsAPI.markPaid(d.id), `${d.number} marked paid.`)}>
                          <Check className="h-4 w-4" />
                        </Btn>
                      )}
                      {canPost && ['draft', 'proposed'].includes(d.status) && (
                        <Btn variant="ghost" size="sm" title="Cancel this draft" disabled={busyId === d.id}
                          onClick={() => act(d.id, () => documentsAPI.cancel(d.id, 'Cancelled from the accounting desk'), 'Cancelled.')}>
                          <Ban className="h-4 w-4" />
                        </Btn>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900">
                <tr>
                  <td className="px-4 py-2.5" colSpan={colCount - 1 - (cols.shows('taxable') ? 1 : 0) - (cols.shows('gst') ? 1 : 0) - 1}>
                    This page ({rows.length} of {total})
                  </td>
                  {cols.shows('taxable') && <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(pageTotals.taxable)}</td>}
                  {cols.shows('gst') && <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(pageTotals.tax)}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMinor(pageTotals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </TableShell>

        {sendFor && (
          <SendDocumentDialog
            open={!!sendFor}
            documentId={sendFor.id}
            label={sendFor.label}
            onOpenChange={(o) => { if (!o) setSendFor(null); }}
          />
        )}
        <div className="px-5 py-3">
          <Pagination page={lc.page} pageSize={lc.pageSize} total={total} onPage={lc.setPage} />
        </div>
      </SectionCard>
    </Page>
  );
};

export default ProformaInvoices;
