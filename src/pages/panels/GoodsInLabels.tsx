import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PackageCheck, Search, Printer, Tag, Boxes, CheckCircle2, AlertTriangle, Barcode, Download, Info,
} from 'lucide-react';
import { api, searchAPI, blobErrorMessage, type SearchResult } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import { Page, PageHeader, Btn } from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';

/**
 * Goods in: packs, lots and stickers (program 11).
 *
 * The owner, 2026-09-21: "sometimes a product doesn't come with any batch no.,
 * MRP, expiry or even a barcode, so it should print a sticker slip according to
 * quantity" and "a box of 12 comes — we buy packs but sell the inner items
 * individually, sometimes loose — so verify the inner quantity."
 *
 * One screen, in the order it happens at the dock:
 *   1. the product            what arrived
 *   2. how it came            N packs of M, or loose pieces — pieces worked out
 *   3. check the packs        open some, count the inners; a mismatch is recorded
 *   4. the lot                an existing lot, the number on the goods, or one we
 *                             generate — never printed until a batch record holds it
 *   5. print                  one sticker per piece, one carton label per pack
 * Nothing here writes stock except step 4's explicit "receiving now".
 */

interface Conversion { uom_id: string; uom_code: string; uom_name: string; is_base: boolean; to_base_factor: number | null; scope: string }
interface Lot { id: string; batch_number: string; mrp: number | null; mfg_date: string | null; expiry_date: string | null; qty_on_hand: number }

const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
const input = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
const Step: React.FC<{ n: number; title: string; hint?: string; children: React.ReactNode; muted?: boolean }> = ({ n, title, hint, children, muted }) => (
  <section className={`${card} ${muted ? 'opacity-60' : ''}`}>
    <div className="mb-3 flex items-baseline gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
    {children}
  </section>
);
const L: React.FC<{ children: React.ReactNode; hint?: string; tip?: string }> = ({ children, hint, tip }) => (
  <span className="mb-1 block text-xs font-medium text-slate-700">
    {children}
    {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
    {tip && <InfoTip className="ml-1" text={tip} />}
  </span>
);
const dateOnly = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');
const errOf = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

const GoodsInLabels: React.FC = () => {
  const { hasPerm } = useAuth();
  const canAdjust = hasPerm('inventory.adjust');

  const [q, setQ] = useState(''); const [hits, setHits] = useState<SearchResult[]>([]);
  const [sku, setSku] = useState<SearchResult | null>(null);
  const [convs, setConvs] = useState<Conversion[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [barcodes, setBarcodes] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  // 2. how it came
  const [unitId, setUnitId] = useState(''); const [qtyIn, setQtyIn] = useState('1');
  // 3. pack check
  const [counts, setCounts] = useState<string[]>(['']);
  const [checkResult, setCheckResult] = useState<any | null>(null);
  // 4. lot
  const [lotMode, setLotMode] = useState<'existing' | 'carried' | 'generate'>('existing');
  const [lotId, setLotId] = useState('');
  const [carried, setCarried] = useState('');
  const [mrp, setMrp] = useState(''); const [mfg, setMfg] = useState(''); const [exp, setExp] = useState('');
  const [stockAction, setStockAction] = useState<'receive' | 'assign' | 'none'>('receive');
  const [needBarcode, setNeedBarcode] = useState(false);
  const [busy, setBusy] = useState(false);
  // 5. print
  const [pieceCopies, setPieceCopies] = useState(''); const [cartonCopies, setCartonCopies] = useState('');
  const [size, setSize] = useState('50x25mm'); const [codeSource, setCodeSource] = useState('barcode');
  const [extra, setExtra] = useState('');
  const [preview, setPreview] = useState<any | null>(null);

  const fail = (e: any) => { setError(errOf(e)); setNotice(''); };
  const flash = (m: string) => { setNotice(m); setError(''); };

  // search — the unified service, never ad-hoc (COMMON_MISTAKES #16)
  useEffect(() => {
    const t = setTimeout(async () => setHits(q.trim().length >= 3 ? await searchAPI.query('variation', q, 8) : []), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadSku = async (v: SearchResult) => {
    setSku(v); setHits([]); setQ(''); setCheckResult(null); setPreview(null); setError('');
    const [u, b, c, pc] = await Promise.all([
      api.get(`/uom/variation/${v.id}`).catch(() => null),
      api.get('/purchasing/batches', { params: { variationId: v.id, limit: 50 } }).catch(() => null),
      api.get('/wms/barcodes', { params: { variationId: v.id } }).catch(() => null),
      api.get('/wms/pack-checks', { params: { variationId: v.id, limit: 10 } }).catch(() => null),
    ]);
    const uom = u ? payload<any>(u) : null;
    const cv: Conversion[] = uom?.conversions ?? [];
    setConvs(cv);
    const purchase = uom?.variation?.purchase_uom_id;
    setUnitId(purchase && cv.find((x) => x.uom_id === purchase && x.to_base_factor) ? purchase : cv.find((x) => x.is_base)?.uom_id ?? '');
    const lotRows: Lot[] = (b?.data?.rows ?? payload<any>(b)?.rows ?? []);
    setLots(lotRows);
    setLotMode(lotRows.length ? 'existing' : 'generate');
    setLotId(lotRows[0]?.id ?? '');
    setBarcodes(c?.data?.rows ?? payload<any>(c)?.rows ?? payload<any>(c) ?? []);
    setChecks(pc ? (payload<any>(pc)?.rows ?? []) : []);
  };

  const unit = convs.find((c) => c.uom_id === unitId);
  const factor = unit?.is_base ? 1 : unit?.to_base_factor ?? null;
  const isPack = !!unit && !unit.is_base && !!factor && factor > 1;
  const packs = Math.max(0, parseInt(qtyIn) || 0);
  const pieces = factor ? packs * factor : 0;
  const lot = lots.find((l) => l.id === lotId) ?? null;
  const hasBarcode = barcodes.some((b: any) => (b.pack_qty ?? 1) <= 1);

  // Default copies follow what arrived, until the person types their own.
  useEffect(() => { setPieceCopies(pieces ? String(pieces) : ''); setCartonCopies(isPack ? String(packs) : ''); }, [pieces, packs, isPack]);
  useEffect(() => { setCounts(isPack ? [String(factor)] : ['']); setCheckResult(null); }, [unitId]); // eslint-disable-line
  // "Only print" exists for a number the goods carry. A number we generate must
  // be backed by a batch record, so leaving "carried" resets that choice.
  useEffect(() => { if (lotMode !== 'carried' && stockAction === 'none') setStockAction('receive'); }, [lotMode]); // eslint-disable-line
  useEffect(() => {
    if (lotMode === 'existing' && lot) { setMrp(lot.mrp != null ? String(lot.mrp) : ''); setMfg(dateOnly(lot.mfg_date)); setExp(dateOnly(lot.expiry_date)); }
  }, [lotMode, lotId]); // eslint-disable-line

  const recordCheck = async () => {
    if (!sku || !unit) return;
    const cs = counts.map((c) => parseInt(c)).filter((n) => Number.isFinite(n));
    if (!cs.length) { setError('Count what is inside at least one pack.'); return; }
    try {
      const r = await api.post('/wms/pack-checks', { variationId: sku.id, uomId: unit.uom_id, packsReceived: packs, counts: cs });
      const out = payload<any>(r);
      setCheckResult(out);
      setChecks((x) => [out.check, ...x].slice(0, 10));
    } catch (e) { fail(e); }
  };

  const createLot = async () => {
    if (!sku) return;
    setBusy(true); setError('');
    try {
      const qty = stockAction === 'none' ? null : pieces || null;
      const r = await api.post('/wms/labels/lot', {
        variationId: sku.id, mode: stockAction, qty,
        batchNumber: lotMode === 'carried' ? carried.trim() : null,
        mrp: mrp.trim() ? Number(mrp) : null, mfgDate: mfg || null, expiryDate: exp || null,
        ensureBarcode: needBarcode,
      });
      const out = payload<any>(r);
      flash(`${out.generated ? 'Lot' : 'Batch'} ${out.batchNumber} ${stockAction === 'receive' ? `received — ${qty} pieces added to stock` : stockAction === 'assign' ? 'labelled on stock already on the shelf' : 'noted for printing'}${out.barcodeAllocated ? ` · internal barcode ${out.barcode}` : ''}`);
      await loadSku(sku);
      if (out.batchId) { setLotMode('existing'); setLotId(out.batchId); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const items = () => {
    const common = {
      variationId: sku!.id, batchId: lotMode === 'existing' ? lotId || null : null,
      batchNumber: lotMode === 'carried' ? carried.trim() || null : null,
      mrp: mrp.trim() ? Number(mrp) : null, mfgDate: mfg || null, expiryDate: exp || null,
      codeSource, extraLines: extra.trim() ? [extra.trim()] : [],
    };
    const out: any[] = [];
    if (parseInt(pieceCopies) > 0) out.push({ ...common, copies: parseInt(pieceCopies) });
    if (isPack && parseInt(cartonCopies) > 0) out.push({ ...common, copies: parseInt(cartonCopies), packOf: factor });
    return out;
  };
  const canPrint = !!sku && items().length > 0 && (lotMode !== 'generate');

  const doPreview = async () => {
    try { setPreview(payload<any>(await api.post('/wms/labels/stickers', { format: 'preview', size, items: items() }))); } catch (e) { fail(e); }
  };
  const doPrint = async (format: 'pdf' | 'zpl') => {
    try {
      const r = await api.post('/wms/labels/stickers', { format, size, items: items() }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: format === 'pdf' ? 'application/pdf' : 'text/plain' }));
      if (format === 'pdf') window.open(url, '_blank');
      else { const a = document.createElement('a'); a.href = url; a.download = `stickers-${sku?.sublabel ?? 'sku'}.zpl`; a.click(); URL.revokeObjectURL(url); }
    } catch (e: any) { setError(await blobErrorMessage(e, 'Could not make the stickers')); }
  };

  const summary = useMemo(() => (isPack ? `${packs} × ${unit?.uom_code} of ${factor} = ${pieces} pieces` : `${pieces} pieces`), [isPack, packs, unit, factor, pieces]);

  return (
    <Page>
      <PageHeader icon={PackageCheck} title="Goods in — packs, lots & stickers"
        description="Check what arrived, give it a lot number if it has none, and print a sticker for every piece and every carton." />
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Step n={1} title="Which product came in?">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input className={`${input} pl-8`} value={q} onChange={(e) => setQ(e.target.value)}
                aria-label="Search for the product that arrived" data-testid="goodsin-search"
                placeholder="Name or SKU — 3 letters or more" autoFocus />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                  {hits.map((h) => (
                    <button key={h.id} onClick={() => loadSku(h)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <span className="font-medium">{h.label}</span>{h.sublabel && <span className="ml-2 font-mono text-xs text-slate-500">{h.sublabel}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sku && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-900">{sku.label}</span>
                {sku.sublabel && <span className="font-mono text-xs text-slate-500">{sku.sublabel}</span>}
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${hasBarcode ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  <Barcode className="mr-1 inline h-3 w-3" />{hasBarcode ? `barcode ${barcodes.find((b: any) => (b.pack_qty ?? 1) <= 1)?.barcode}` : 'no barcode on file'}
                </span>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700">{lots.length} lot{lots.length === 1 ? '' : 's'}</span>
              </div>
            )}
          </Step>

          <Step n={2} title="How did it come?" hint="packs or loose pieces" muted={!sku}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label><L tip="How many of the unit on the right arrived — 3 boxes, or 36 loose pieces.">Quantity received</L><input className={input} inputMode="numeric" value={qtyIn} onChange={(e) => setQtyIn(e.target.value)} disabled={!sku} /></label>
              <label className="sm:col-span-2"><L tip="The thing you counted. A box of 12 is one pack; the 12 inside it are the pieces you sell.">Unit</L>
                <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!sku}>
                  {convs.map((c) => (
                    <option key={c.uom_id} value={c.uom_id} disabled={!c.is_base && !c.to_base_factor}>
                      {c.is_base ? `${c.uom_name} (loose pieces)` : c.to_base_factor ? `${c.uom_name} of ${c.to_base_factor}` : `${c.uom_name} — pack size not set`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {sku && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900">{factor ? summary : 'Choose a unit'}</span>
                <Link to="/panel/inventory/uom" className="text-xs text-slate-500 underline hover:text-slate-800">Set pack sizes for this product</Link>
              </div>
            )}
          </Step>

          {isPack && (
            <Step n={3} title={`Check the ${unit?.uom_name.toLowerCase()}es`} hint={`open some and count — each should hold ${factor}`}>
              <div className="flex flex-wrap items-end gap-2">
                {counts.map((c, i) => (
                  <label key={i} className="w-24"><L>{unit?.uom_code} {i + 1}</L>
                    <input className={input} inputMode="numeric" value={c} onChange={(e) => setCounts((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))} />
                  </label>
                ))}
                {counts.length < packs && <Btn size="sm" variant="outline" onClick={() => setCounts((cs) => [...cs, String(factor)])}>+ opened another</Btn>}
                {canAdjust && <Btn size="sm" onClick={recordCheck}>Record check</Btn>}
              </div>
              {checkResult && (
                <div className={`mt-3 flex gap-2 rounded-lg px-3 py-2 text-sm ${checkResult.result === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                  {checkResult.result === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{checkResult.message}</span>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">A check records what was counted — it never changes stock. If boxes are short, receive what is really there in step 4.</p>
            </Step>
          )}

          <Step n={isPack ? 4 : 3} title="Which lot is it?" muted={!sku}>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              {([
                ['existing', 'A lot already on file', lots.length ? `${lots.length} on file` : 'none on file'],
                ['carried', 'The goods carry a batch no.', 'type what is printed'],
                ['generate', 'No batch no. on the goods', 'we make one — LOT/…'],
              ] as const).map(([k, t, s]) => (
                <button key={k} onClick={() => setLotMode(k)} disabled={!sku || (k === 'existing' && !lots.length)}
                  className={`rounded-lg border p-2.5 text-left text-sm disabled:opacity-40 ${lotMode === k ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}>
                  <span className="block font-medium text-slate-900">{t}</span><span className="text-[11px] text-slate-500">{s}</span>
                </button>
              ))}
            </div>
            {lotMode === 'existing' && lots.length > 0 && (
              <select className={input} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                {lots.map((l) => <option key={l.id} value={l.id}>{l.batch_number} · MRP {l.mrp ?? '—'} · exp {dateOnly(l.expiry_date) || '—'} · {l.qty_on_hand} on hand</option>)}
              </select>
            )}
            {lotMode === 'carried' && (
              <label className="block"><L>Batch number as printed</L><input className={`${input} font-mono`} value={carried} onChange={(e) => setCarried(e.target.value)} /></label>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label><L hint="₹, as printed" tip="The price printed on THIS pack. Two lots of the same medicine can carry different MRPs.">MRP</L><input className={input} inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} disabled={!sku} /></label>
              <label><L>Manufactured</L><input type="date" className={input} value={mfg} onChange={(e) => setMfg(e.target.value)} disabled={!sku} /></label>
              <label><L>Expires</L><input type="date" className={input} value={exp} onChange={(e) => setExp(e.target.value)} disabled={!sku} /></label>
            </div>
            {lotMode !== 'existing' && canAdjust && (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-xs font-semibold text-slate-700">Stock</div>
                {([
                  ['receive', `Receiving now — add ${pieces || 'the'} pieces to stock`],
                  ['assign', 'Already on the shelf — just label them as this lot'],
                  ...(lotMode === 'carried' ? [['none', 'Only print — no batch record'] as const] : []),
                ] as Array<readonly [string, string]>).map(([k, t]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" checked={stockAction === k} onChange={() => setStockAction(k as any)} />{t}
                  </label>
                ))}
                {!hasBarcode && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={needBarcode} onChange={(e) => setNeedBarcode(e.target.checked)} />
                    No barcode on the goods — give this product an internal barcode
                  </label>
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500">
                    {lotMode === 'generate' ? 'A number we make up is only printed once a batch record carries it.' : ''}
                  </span>
                  <Btn size="sm" onClick={createLot} disabled={busy || (lotMode === 'carried' && !carried.trim()) || (stockAction === 'receive' && !pieces)}>
                    <Tag className="mr-1 h-3.5 w-3.5" />{busy ? 'Saving…' : lotMode === 'generate' ? 'Create lot' : stockAction === 'none' ? 'Use this number' : 'Save batch'}
                  </Btn>
                </div>
              </div>
            )}
          </Step>

          <Step n={isPack ? 5 : 4} title="Print" hint="one per piece, one per carton" muted={!canPrint}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label><L tip="One per item you will sell. Filled in from what arrived; type over it to print fewer.">Piece stickers</L><input className={input} inputMode="numeric" value={pieceCopies} onChange={(e) => setPieceCopies(e.target.value)} /></label>
              {isPack && <label><L hint={`pack of ${factor}`}>Carton labels</L><input className={input} inputMode="numeric" value={cartonCopies} onChange={(e) => setCartonCopies(e.target.value)} /></label>}
              <label><L>Sticker size</L>
                <select className={input} value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="50x25mm">50 × 25 mm</option><option value="2x1">2 × 1 in</option><option value="4x6">4 × 6 in</option>
                </select>
              </label>
              <label><L tip="What the bars on the sticker encode. Use the lot number when a scan on the floor must identify the exact batch.">Barcode shows</L>
                <select className={input} value={codeSource} onChange={(e) => setCodeSource(e.target.value)}>
                  <option value="barcode">Product barcode</option><option value="sku">SKU</option><option value="batch">Lot number</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block"><L hint="optional">Extra line</L>
              <input className={input} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Distributed by … · Store below 25 °C" maxLength={80} />
            </label>
            {lotMode === 'generate' && <p className="mt-2 flex gap-1.5 text-xs text-amber-700"><Info className="h-3.5 w-3.5" />Create the lot first — then print.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="outline" onClick={doPreview} disabled={!canPrint}>Check before printing</Btn>
              <Btn onClick={() => doPrint('pdf')} disabled={!canPrint}><Printer className="mr-1 h-4 w-4" />Print (PDF)</Btn>
              <Btn variant="outline" onClick={() => doPrint('zpl')} disabled={!canPrint}><Download className="mr-1 h-4 w-4" />Thermal printer (ZPL)</Btn>
            </div>
          </Step>
        </div>

        <div className="space-y-4">
          <div className={card}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">The sticker</div>
            {preview?.sample ? (
              <>
                <div className="mx-auto w-full max-w-[300px] rounded-md border-2 border-slate-800 bg-white p-3 font-sans shadow-inner">
                  <div className="text-sm font-bold leading-tight text-slate-900">{preview.sample.title}</div>
                  {preview.sample.line2 && <div className="text-[11px] text-slate-600">{preview.sample.line2}</div>}
                  <div className="mt-1 text-[11px] leading-snug text-slate-800">
                    {[preview.sample.mrp != null && `MRP ₹${Number(preview.sample.mrp).toFixed(2)} (incl. all taxes)`,
                      preview.sample.batchNumber && `B.No ${preview.sample.batchNumber}`,
                      preview.sample.mfg && `MFG ${preview.sample.mfg}`, preview.sample.expiry && `EXP ${preview.sample.expiry}`,
                      preview.sample.packOf && `PACK OF ${preview.sample.packOf}`].filter(Boolean).join('   ')}
                  </div>
                  {(preview.sample.extraLines ?? []).map((x: string) => <div key={x} className="text-[10px] text-slate-600">{x}</div>)}
                  <div className="mt-2 h-10 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px,var(--ink) 4px 5px,transparent 5px 8px)' }} />
                  <div className="text-center font-mono text-[10px]">{preview.sample.code}</div>
                </div>
                <div className="mt-2 text-center text-sm font-medium text-slate-800">{preview.total} sticker{preview.total === 1 ? '' : 's'} will print</div>
                {(preview.warnings ?? []).map((w: string, i: number) => (
                  <div key={i} className="mt-2 flex gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</div>
                ))}
              </>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400"><Tag className="mx-auto mb-2 h-6 w-6" />Choose a product and lot, then “Check before printing”.</div>
            )}
          </div>

          {sku && (
            <div className={card}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Boxes className="h-3.5 w-3.5" />Recent pack checks</div>
              {checks.length === 0 && <div className="text-xs text-slate-500">None yet for this product.</div>}
              {checks.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
                  <span>{c.packs_opened} of {c.packs_received} {c.uom_code} · counted {c.counted_inner}/{c.expected_inner}</span>
                  <span className={`rounded px-1.5 py-0.5 font-medium ${c.result === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{c.result}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
};

export default GoodsInLabels;
