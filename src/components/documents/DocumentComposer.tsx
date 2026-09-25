import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Trash2, UserRound, X } from 'lucide-react';
import { api, documentsAPI, type DocumentDraft, type DocumentLineDraft } from '@/services/api';
import { payload } from '@/lib/unwrap';
import { fmtMinor } from '@/lib/money';
import InfoTip from '@/components/common/InfoTip';
import {
  SectionCard, Btn, Field, TextInput, SelectInput, SearchInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '@/components/erp';

/**
 * THE ONE COMPOSER for every document-kernel document (migration 156):
 * a tax invoice, a proforma, and anything else `documents.kind` grows into.
 *
 * ── Why this is not the Quotations composer ─────────────────────────────────
 * A quotation (`/quotations`, migration 050) is a catalogue offer that becomes
 * an ORDER: its lines are `{productId, variationId, quantity}` and the server's
 * B2B waterfall decides the price. A kernel document is a tax document that
 * becomes a LEDGER ENTRY: its lines are `{description, HSN/SAC, qty, rate,
 * discount, GST%}` and the rate is what you state. Folding the two into one
 * form would give a form that can do neither properly — so this one serves
 * every KERNEL kind, and the quotation screen keeps its own. Recorded in
 * WS-G G.7.16 for the same reason.
 *
 * ── The browser never adds tax up ───────────────────────────────────────────
 * Every figure on the totals rail comes from `POST /documents/preview`, which
 * runs the SAME `computeDocumentTotals` the save will run. So the CGST/SGST vs
 * IGST split, the place of supply and the rounding shown while typing are the
 * ones the document will actually carry — not a second derivation that can
 * drift (COMMON_MISTAKES #308, and CLAUDE.md rule 7a's "one totals brain").
 *
 * ── Nothing here reserves a number ──────────────────────────────────────────
 * `GET /documents/next-number` is a PREVIEW. Two open forms see the same
 * number and the second to issue takes the one after — which is why the form
 * says "will be numbered when you issue it" rather than showing it as fact.
 */

export type ComposerKind = 'invoice' | 'proforma';

const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

/** A line as the form holds it. Everything is a string so a half-typed number never becomes NaN. */
interface FormLine {
  key: string;
  description: string;
  item_ref: string | null;
  item_kind: 'good' | 'service';
  tax_code: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount: string;
  tax_rate: string;
  batch_number: string;
  expiry_date: string;
}

const blankLine = (): FormLine => ({
  key: Math.random().toString(36).slice(2),
  description: '', item_ref: null, item_kind: 'service', tax_code: '',
  quantity: '1', unit: '', unit_price: '', discount: '', tax_rate: '',
  batch_number: '', expiry_date: '',
});

interface PartyForm {
  ref: string | null;
  name: string; company: string; gstin: string; email: string; phone: string;
  line1: string; line2: string; city: string; state: string; pincode: string;
}

const blankParty = (): PartyForm => ({
  ref: null, name: '', company: '', gstin: '', email: '', phone: '',
  line1: '', line2: '', city: '', state: '', pincode: '',
});

const KIND_COPY: Record<ComposerKind, { title: string; blurb: string; cta: string; issueCta: string }> = {
  invoice: {
    title: 'New tax invoice',
    blurb: 'A tax invoice is the bill itself — it is what the customer owes, what goes into your GSTR-1 and what your books post.',
    cta: 'Save as draft',
    issueCta: 'Save and issue',
  },
  proforma: {
    title: 'New proforma invoice',
    blurb: 'A proforma is what you send BEFORE the sale — a priced offer the buyer can pay or raise a PO against. It is not a tax invoice, claims no GST, and moves no stock. Turn it into the real invoice in one click once they accept.',
    cta: 'Save as draft',
    issueCta: 'Save and issue',
  },
};

/** "18" → 18, "" → null (meaning: use the store's default rate). */
const numOrUndef = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

export interface DocumentComposerProps {
  kind: ComposerKind;
  onSaved: (doc: any) => void;
  onCancel: () => void;
  /** Prefill the party (e.g. "invoice this customer" from elsewhere). */
  initialParty?: Partial<PartyForm>;
}

const DocumentComposer: React.FC<DocumentComposerProps> = ({ kind, onSaved, onCancel, initialParty }) => {
  const copy = KIND_COPY[kind];

  const [party, setParty] = useState<PartyForm>({ ...blankParty(), ...(initialParty ?? {}) });
  const [documentDate, setDocumentDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<FormLine[]>([blankLine()]);

  const [preview, setPreview] = useState<any>(null);
  const [previewErr, setPreviewErr] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [nextNumber, setNextNumber] = useState<string>('');
  const [saving, setSaving] = useState<'' | 'draft' | 'issue'>('');
  const [err, setErr] = useState('');

  // ── The draft the server sees. One place, so preview and save cannot differ ──
  const draft: DocumentDraft = useMemo(() => ({
    kind,
    document_date: documentDate,
    due_date: dueDate || undefined,
    party_kind: 'customer',
    party_ref: party.ref || undefined,
    party: {
      name: party.name || undefined,
      company: party.company || undefined,
      gstin: party.gstin ? party.gstin.trim().toUpperCase() : undefined,
      email: party.email || undefined,
      phone: party.phone || undefined,
      address: {
        line1: party.line1 || undefined, line2: party.line2 || undefined,
        city: party.city || undefined, state: party.state || undefined,
        pincode: party.pincode || undefined,
      },
    },
    tax_inclusive: taxInclusive,
    notes: notes || undefined,
    terms: terms || undefined,
    lines: lines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l): DocumentLineDraft => ({
        description: l.description.trim(),
        item_kind: l.item_kind,
        item_ref: l.item_ref || undefined,
        tax_code: l.tax_code.trim() || undefined,
        quantity: l.quantity,
        unit: l.unit.trim() || undefined,
        unit_price: l.unit_price || 0,
        discount: l.discount || 0,
        tax_rate: numOrUndef(l.tax_rate),
        batch_number: l.batch_number.trim() || undefined,
        expiry_date: l.expiry_date || undefined,
      })),
  }), [kind, documentDate, dueDate, party, taxInclusive, notes, terms, lines]);

  const readyLines = draft.lines.length;

  // ── The live totals rail (debounced; the last request in wins) ─────────────
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!readyLines || !(party.name.trim() || party.company.trim())) { setPreview(null); setPreviewErr(''); return; }
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const data = await documentsAPI.preview(draft);
        if (seq === previewSeq.current) { setPreview(data); setPreviewErr(''); }
      } catch (e: any) {
        if (seq === previewSeq.current) { setPreview(null); setPreviewErr(errText(e)); }
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [draft, readyLines, party.name, party.company]);

  // The series preview — read once per date, because it reserves nothing.
  useEffect(() => {
    let alive = true;
    documentsAPI.nextNumber(kind, documentDate)
      .then((d) => { if (alive) setNextNumber(d?.number ?? d?.next_number ?? ''); })
      .catch(() => { if (alive) setNextNumber(''); });
    return () => { alive = false; };
  }, [kind, documentDate]);

  // ── Party search: pick a customer and their details fill themselves in ─────
  const [partyQuery, setPartyQuery] = useState('');
  const [partyHits, setPartyHits] = useState<any[]>([]);
  const [partyBusy, setPartyBusy] = useState(false);
  const partySeq = useRef(0);

  const searchParty = useCallback((q: string) => {
    setPartyQuery(q);
    const term = q.trim();
    if (term.length < 2) { setPartyHits([]); return; }
    const seq = ++partySeq.current;
    setPartyBusy(true);
    window.setTimeout(async () => {
      if (seq !== partySeq.current) return;
      try {
        const r = await api.get('/customers', { params: { search: term, limit: 8 } });
        // The interceptor has already unwrapped {success,data} → `payload` reads both shapes.
        const got = payload<any>(r);
        const rows = Array.isArray(got) ? got : (got?.customers ?? []);
        if (seq === partySeq.current) setPartyHits(Array.isArray(rows) ? rows : []);
      } catch { if (seq === partySeq.current) setPartyHits([]); }
      finally { if (seq === partySeq.current) setPartyBusy(false); }
    }, 300);
  }, []);

  /** Fill from a chosen customer. Anything already typed by a person is kept. */
  const choosePartyRow = async (row: any) => {
    const id = row.customer_id ?? row.id;
    setPartyHits([]); setPartyQuery('');
    setParty((p) => ({
      ...p, ref: id ?? null,
      name: p.name || row.name || '',
      email: p.email || row.email || '',
      phone: p.phone || row.phone || '',
    }));
    if (!id) return;
    try {
      const d = payload<any>(await api.get(`/customers/${id}`));
      const addr = d?.default_address ?? d?.addresses?.[0] ?? null;
      setParty((p) => ({
        ...p,
        ref: id,
        name: p.name || d?.name || '',
        company: p.company || d?.b2b?.company_name || d?.b2b?.company || '',
        gstin: p.gstin || d?.gstin || d?.b2b?.gstin || '',
        email: p.email || d?.email || '',
        phone: p.phone || d?.phone || '',
        line1: p.line1 || addr?.line1 || '',
        line2: p.line2 || addr?.line2 || '',
        city: p.city || addr?.district || '',
        state: p.state || addr?.state || '',
        pincode: p.pincode || addr?.pincode || '',
      }));
    } catch { /* the customer detail is a convenience; typing by hand still works */ }
  };

  // ── Last rate to THIS party — history, not memory ──────────────────────────
  const [lastRates, setLastRates] = useState<any[]>([]);
  useEffect(() => {
    if (!party.ref) { setLastRates([]); return; }
    let alive = true;
    documentsAPI.lastRates(party.ref)
      .then((rows) => { if (alive) setLastRates(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setLastRates([]); });
    return () => { alive = false; };
  }, [party.ref]);

  const rateHistoryFor = (l: FormLine) => {
    const key = (l.item_ref || l.description.trim().toLowerCase());
    if (!key) return null;
    return lastRates.find((r) => (r.item_ref || String(r.description ?? '').toLowerCase()) === key) ?? null;
  };

  // ── Item picker: catalogue rows carry the HSN and the price ────────────────
  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<any[]>([]);
  const [itemsUnavailable, setItemsUnavailable] = useState(false);
  const itemSeq = useRef(0);

  const searchItems = (q: string) => {
    setItemQuery(q);
    const term = q.trim();
    if (term.length < 2) { setItemHits([]); return; }
    const seq = ++itemSeq.current;
    window.setTimeout(async () => {
      if (seq !== itemSeq.current) return;
      try {
        const r = await api.get('/inventory', { params: { search: term, limit: 8 } });
        const rows = payload<any>(r)?.rows ?? payload<any>(r) ?? [];
        if (seq === itemSeq.current) { setItemHits(Array.isArray(rows) ? rows : []); setItemsUnavailable(false); }
      } catch {
        // The catalogue is a convenience on a tax document — a services store
        // may not even have the inventory module. Say so rather than look broken.
        if (seq === itemSeq.current) { setItemHits([]); setItemsUnavailable(true); }
      }
    }, 300);
  };

  const addCatalogueLine = (row: any) => {
    const name = [row.product_name, row.variation_name].filter(Boolean).join(' · ') || row.sku || 'Item';
    const rate = Number(row.selling_price ?? row.mrp ?? 0) || 0;
    const prior = lastRates.find((r) => r.item_ref === row.id);
    setLines((ls) => [
      ...ls.filter((l) => l.description.trim() || l.unit_price.trim()),
      {
        ...blankLine(),
        description: name,
        item_ref: row.id ?? null,
        item_kind: 'good',
        tax_code: String(row.hsn_code ?? ''),
        unit_price: String(prior ? Number(prior.unit_price_minor) / 100 : rate),
        tax_rate: prior?.tax_rate != null ? String(prior.tax_rate) : '',
      },
    ]);
    setItemQuery(''); setItemHits([]);
  };

  const patchLine = (key: string, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dropLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blankLine()]));

  const anyGoods = lines.some((l) => l.item_kind === 'good');

  // Per-line money comes from the preview, matched by position among the
  // lines that were actually submitted — never recomputed here.
  const submittedIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const l of lines) if (l.description.trim() && Number(l.quantity) > 0) map.set(l.key, i++);
    return map;
  }, [lines]);
  const previewLine = (l: FormLine) => {
    const i = submittedIndex.get(l.key);
    return i === undefined ? null : preview?.lines?.[i] ?? null;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async (mode: 'draft' | 'issue') => {
    if (!readyLines) { setErr('Add at least one line with a description and a quantity.'); return; }
    if (!party.name.trim() && !party.company.trim()) { setErr('Say who this is for — a name or a company.'); return; }
    setSaving(mode); setErr('');
    try {
      const doc = await documentsAPI.create(draft);
      const final = mode === 'issue' ? await documentsAPI.issue(doc.id) : doc;
      onSaved(final);
    } catch (e: any) { setErr(errText(e)); }
    finally { setSaving(''); }
  };

  const posLabel = preview
    ? `${preview.place_of_supply}${preview.interstate ? ' — outside your state, so this is IGST' : ' — your own state, so this is CGST + SGST'}`
    : '';

  return (
    <div className="space-y-5">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* ── Who it is for ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Who it is for"
        description="Search a customer and their details fill themselves in. Anything you have already typed is kept."
      >
        <div className="max-w-xl">
          <SearchInput
            placeholder="Search a customer by name, phone or email…"
            value={partyQuery}
            onChange={(e) => searchParty(e.target.value)}
          />
          {partyBusy && <div className="mt-1 text-xs text-gray-500">Searching…</div>}
          {partyHits.length > 0 && (
            <div className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
              {partyHits.map((h) => (
                <button
                  key={h.customer_id ?? h.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => choosePartyRow(h)}
                >
                  <UserRound className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{h.name || h.email || h.phone || 'Customer'}</span>
                  <span className="text-xs text-gray-500">{[h.phone, h.email].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {party.ref && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-600/20">Known customer attached</span>
            <span className="text-gray-500">Their past rates fill new lines automatically.</span>
            <button type="button" className="text-gray-500 underline" onClick={() => setParty((p) => ({ ...p, ref: null }))}>
              detach
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name"><TextInput value={party.name} onChange={(e) => setParty({ ...party, name: e.target.value })} placeholder="Person the bill is addressed to" /></Field>
          <Field label="Company"><TextInput value={party.company} onChange={(e) => setParty({ ...party, company: e.target.value })} /></Field>
          <Field label={<span className="inline-flex items-center gap-1">GSTIN <InfoTip text="Their GST number. Leave it blank for an unregistered buyer — the invoice is still valid, it just carries no buyer GSTIN." where="Fills the place of supply when no address state is set." /></span>}>
            <TextInput value={party.gstin} onChange={(e) => setParty({ ...party, gstin: e.target.value.toUpperCase() })} placeholder="27AAAAA0000A1Z5" maxLength={15} />
          </Field>
          <Field label="Phone"><TextInput value={party.phone} onChange={(e) => setParty({ ...party, phone: e.target.value })} /></Field>
          <Field label="Email"><TextInput type="email" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} /></Field>
          <Field label="Pincode"><TextInput value={party.pincode} onChange={(e) => setParty({ ...party, pincode: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><TextInput value={party.line1} onChange={(e) => setParty({ ...party, line1: e.target.value })} /></Field>
          <Field label="Area / landmark"><TextInput value={party.line2} onChange={(e) => setParty({ ...party, line2: e.target.value })} /></Field>
          <Field label="City"><TextInput value={party.city} onChange={(e) => setParty({ ...party, city: e.target.value })} /></Field>
          <Field label={<span className="inline-flex items-center gap-1">State <InfoTip text="The state the goods or service are supplied to. This alone decides IGST versus CGST + SGST, so it is the one address field that changes the money." /></span>}>
            <TextInput value={party.state} onChange={(e) => setParty({ ...party, state: e.target.value })} placeholder="e.g. Maharashtra" />
          </Field>
        </div>

        {preview && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-medium text-gray-800">Place of supply:</span> {posLabel}
          </div>
        )}
      </SectionCard>

      {/* ── Dates and terms ───────────────────────────────────────────────── */}
      <SectionCard title="Dates and terms">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Document date"><TextInput type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} /></Field>
          <Field label={<span className="inline-flex items-center gap-1">Due date <InfoTip text={preview?.due_days ? `Blank uses your payment terms — ${preview.due_days} day(s) after the document date.` : 'Blank means due on the document date. Set your default under Invoice settings.'} /></span>}>
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder={preview?.due_date ?? ''} />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1">Prices include GST <InfoTip text="On: the rate you type already has GST in it and the tax is extracted out of it. Off: GST is added on top of the rate." /></span>}>
            <SelectInput value={taxInclusive ? 'yes' : 'no'} onChange={(e) => setTaxInclusive(e.target.value === 'yes')}>
              <option value="no">No — add GST on top</option>
              <option value="yes">Yes — GST is inside the rate</option>
            </SelectInput>
          </Field>
          <Field label={<span className="inline-flex items-center gap-1">Number <InfoTip text="Nothing is reserved while you type. The number is taken the moment you issue it, so two people drafting at once cannot take the same one." /></span>}>
            <div className="flex h-9 items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 font-mono text-sm text-gray-600">
              {nextNumber || 'on issue'}
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* ── Lines ─────────────────────────────────────────────────────────── */}
      <SectionCard
        title="What is being supplied"
        description="Search your catalogue to pull in the HSN and the price, or type a line by hand for a service."
        action={<Btn variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" /> Add a line</Btn>}
      >
        <div className="mb-4 max-w-xl">
          <SearchInput placeholder="Search your catalogue by name or SKU…" value={itemQuery} onChange={(e) => searchItems(e.target.value)} />
          {itemsUnavailable && (
            <div className="mt-1 text-xs text-gray-500">
              The catalogue could not be searched here. Type the line by hand — a document line needs only a description, a quantity and a rate.
            </div>
          )}
          {itemHits.length > 0 && (
            <div className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
              {itemHits.map((h) => (
                <button key={h.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => addCatalogueLine(h)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">{[h.product_name, h.variation_name].filter(Boolean).join(' · ')}</span>
                    <span className="block font-mono text-[11px] text-gray-500">{h.sku}{h.hsn_code ? ` · HSN ${h.hsn_code}` : ''}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-gray-700">{fmtMinor(Number(h.selling_price ?? h.mrp ?? 0) * 100)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th className="w-[26%]">Description</Th>
              <Th className="w-[9%]">HSN / SAC</Th>
              <Th num className="w-[7%]">Qty</Th>
              <Th className="w-[7%]">Unit</Th>
              <Th num className="w-[10%]">Rate ₹</Th>
              <Th num className="w-[9%]">Discount ₹</Th>
              <Th num className="w-[7%]">GST %</Th>
              {anyGoods && <Th className="w-[9%]">Batch</Th>}
              {anyGoods && <Th className="w-[9%]">Expiry</Th>}
              <Th num className="w-[11%]">Amount ₹</Th>
              <Th className="w-8" />
            </THead>
            <TBody>
              {lines.length === 0 && <EmptyRow colSpan={anyGoods ? 11 : 9}>Add a line to begin.</EmptyRow>}
              {lines.map((l) => {
                const pl = previewLine(l);
                const prior = rateHistoryFor(l);
                return (
                  <Tr key={l.key}>
                    <Td>
                      <TextInput className="w-full" value={l.description} placeholder="What you are billing for"
                        onChange={(e) => patchLine(l.key, { description: e.target.value })} />
                      {prior && (
                        <button type="button"
                          className="mt-1 text-[11px] text-gray-500 underline decoration-dotted"
                          onClick={() => patchLine(l.key, { unit_price: String(Number(prior.unit_price_minor) / 100), tax_rate: prior.tax_rate != null ? String(prior.tax_rate) : l.tax_rate })}>
                          Last billed to them at {fmtMinor(prior.unit_price_minor)} on {prior.document_date} ({prior.number}) — use it
                        </button>
                      )}
                    </Td>
                    <Td><TextInput className="w-full" value={l.tax_code} onChange={(e) => patchLine(l.key, { tax_code: e.target.value, item_kind: e.target.value.trim() ? 'good' : l.item_kind })} /></Td>
                    <Td num><TextInput className="w-full text-right" inputMode="decimal" value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: e.target.value })} /></Td>
                    <Td><TextInput className="w-full" value={l.unit} placeholder="pcs" onChange={(e) => patchLine(l.key, { unit: e.target.value })} /></Td>
                    <Td num><TextInput className="w-full text-right" inputMode="decimal" value={l.unit_price} onChange={(e) => patchLine(l.key, { unit_price: e.target.value })} /></Td>
                    <Td num><TextInput className="w-full text-right" inputMode="decimal" value={l.discount} onChange={(e) => patchLine(l.key, { discount: e.target.value })} /></Td>
                    <Td num>
                      <TextInput className="w-full text-right" inputMode="decimal" value={l.tax_rate}
                        placeholder={preview?.default_tax_rate != null ? String(preview.default_tax_rate) : ''}
                        onChange={(e) => patchLine(l.key, { tax_rate: e.target.value })} />
                    </Td>
                    {anyGoods && <Td><TextInput className="w-full" value={l.batch_number} onChange={(e) => patchLine(l.key, { batch_number: e.target.value })} /></Td>}
                    {anyGoods && <Td><TextInput className="w-full" type="date" value={l.expiry_date} onChange={(e) => patchLine(l.key, { expiry_date: e.target.value })} /></Td>}
                    <Td num className="font-medium">{pl ? fmtMinor(pl.total_minor) : '—'}</Td>
                    <Td>
                      <button type="button" aria-label="Remove this line" className="text-gray-400 hover:text-red-600" onClick={() => dropLine(l.key)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>

        {anyGoods && (
          <p className="mt-2 text-xs text-gray-500">
            Batch and expiry print on the document because a medicine has to carry them. Naming a batch here
            states what was supplied — it allocates no stock.
          </p>
        )}
      </SectionCard>

      {/* ── Totals + notes ────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Notes and terms" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Notes (printed)"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the customer should read" /></Field>
            <Field label="Terms (printed)"><TextInput value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, warranty…" /></Field>
          </div>
        </SectionCard>

        <SectionCard
          title={<span className="inline-flex items-center gap-1">Totals <InfoTip text="Every figure here is calculated by the server with the same code that will save the document — nothing on this page is added up in your browser." /></span>}
        >
          {previewErr && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{previewErr}</div>}
          {!preview && !previewErr && (
            <div className="text-sm text-gray-500">Fill in who it is for and one line, and the totals appear here.</div>
          )}
          {preview && (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Taxable value</dt><dd className="tabular-nums">{fmtMinor(preview.taxable_minor)}</dd></div>
              {Number(preview.discount_minor) > 0 && (
                <div className="flex justify-between"><dt className="text-gray-500">Discount</dt><dd className="tabular-nums">− {fmtMinor(preview.discount_minor)}</dd></div>
              )}
              {Number(preview.cgst_minor) > 0 && <div className="flex justify-between"><dt className="text-gray-500">CGST</dt><dd className="tabular-nums">{fmtMinor(preview.cgst_minor)}</dd></div>}
              {Number(preview.sgst_minor) > 0 && <div className="flex justify-between"><dt className="text-gray-500">SGST</dt><dd className="tabular-nums">{fmtMinor(preview.sgst_minor)}</dd></div>}
              {Number(preview.igst_minor) > 0 && <div className="flex justify-between"><dt className="text-gray-500">IGST</dt><dd className="tabular-nums">{fmtMinor(preview.igst_minor)}</dd></div>}
              {Number(preview.round_off_minor) !== 0 && (
                <div className="flex justify-between"><dt className="text-gray-500">Rounded off</dt><dd className="tabular-nums">{fmtMinor(preview.round_off_minor)}</dd></div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
                <dt>Total</dt><dd className="tabular-nums">{fmtMinor(preview.total_minor)}</dd>
              </div>
              {previewing && <div className="pt-1 text-[11px] text-gray-400">recalculating…</div>}
            </dl>
          )}

          <div className="mt-4 space-y-2">
            <Btn className="w-full" variant="success" disabled={!!saving || !readyLines} onClick={() => save('issue')}>
              {saving === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {copy.issueCta}
            </Btn>
            <Btn className="w-full" variant="outline" disabled={!!saving || !readyLines} onClick={() => save('draft')}>
              {saving === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {copy.cta}
            </Btn>
            <Btn className="w-full" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /> Cancel</Btn>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            {kind === 'proforma'
              ? 'Issuing a proforma numbers it in its own PF/ series and posts nothing to your books. The tax-invoice series does not move.'
              : 'Issuing takes the next invoice number and makes the document immutable — a mistake after that is corrected with a credit note.'}
          </p>
        </SectionCard>
      </div>

      <p className="text-xs text-gray-500">
        {copy.blurb}{' '}
        {kind === 'proforma' && (
          <>Looking for a catalogue quote that becomes an order instead? Use <Link className="underline" to="/panel/orders/quotations">Quotations</Link>.</>
        )}
      </p>
    </div>
  );
};

export default DocumentComposer;
