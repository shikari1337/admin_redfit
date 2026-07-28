import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Loader2, Save, Search, Calculator, Package } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, SectionCard, StatCard, StatGrid, SearchInput, Field,
  SelectInput, TextInput, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * Units of measure — pack sizes (migration 066, spec §6). Plain-language screen:
 * "You buy in boxes and cases but stock and sell in single pieces. Tell us how
 * many pieces are in each pack, and we do the maths for you." Search a SKU →
 * set "1 Box = 12 pieces", "1 Case = 144 pieces" → live "so 5 boxes = 60 pieces"
 * preview → pick the default unit to buy in / sell in.
 */

interface Uom { id: string; code: string; name: string; is_base: boolean }
interface Conversion { uom_id: string; uom_code: string; uom_name: string; is_base: boolean; to_base_factor: number | null; scope: 'base' | 'variation' | 'global' | 'unset' }
interface VariationUom {
  variation: { id: string; sku: string | null; name: string | null; stock: number; purchase_uom_id: string | null; sales_uom_id: string | null };
  conversions: Conversion[];
}

const SCOPE_TONE: Record<string, any> = { base: 'blue', variation: 'green', global: 'amber', unset: 'neutral' };
const SCOPE_LABEL: Record<string, string> = { base: 'Base unit', variation: 'This product', global: 'Applies to all', unset: 'Not set' };

const UomSettings: React.FC = () => {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [sel, setSel] = useState<VariationUom | null>(null);
  const [factors, setFactors] = useState<Record<string, string>>({});
  const [purchaseUom, setPurchaseUom] = useState('');
  const [salesUom, setSalesUom] = useState('');
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // preview calculator
  const [calcUom, setCalcUom] = useState('');
  const [calcQty, setCalcQty] = useState('5');

  const baseCode = useMemo(() => uoms.find((u) => u.is_base)?.code ?? 'pieces', [uoms]);

  useEffect(() => { api.get('/uom/uoms').then((r) => setUoms(payload<Uom[]>(r) ?? [])).catch(() => {}); }, []);

  const search = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep last */ }
    }, 250);
  };

  const loadVariation = async (variationId: string) => {
    setMsg(''); setOk(''); setResults([]);
    try {
      const v = payload<VariationUom>(await api.get(`/uom/variation/${variationId}`));
      setSel(v);
      const f: Record<string, string> = {};
      (v?.conversions ?? []).forEach((c) => { if (!c.is_base) f[c.uom_id] = c.to_base_factor != null ? String(c.to_base_factor) : ''; });
      setFactors(f);
      setPurchaseUom(v?.variation.purchase_uom_id ?? '');
      setSalesUom(v?.variation.sales_uom_id ?? '');
      setCalcUom(v?.conversions.find((c) => !c.is_base && c.to_base_factor)?.uom_id ?? '');
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const saveFactor = async (uomId: string) => {
    if (!sel) return;
    const raw = factors[uomId];
    if (raw === undefined || raw === '') { setMsg('Enter how many pieces are in one pack.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      await api.post('/uom/conversions', { variationId: sel.variation.id, uomId, toBaseFactor: Math.round(Number(raw)) });
      setOk('Pack size saved.');
      await loadVariation(sel.variation.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const saveDefaults = async () => {
    if (!sel) return;
    setBusy(true); setMsg(''); setOk('');
    try {
      await api.post('/uom/defaults', { variationId: sel.variation.id, purchaseUomId: purchaseUom || null, salesUomId: salesUom || null });
      setOk('Default buy/sell units saved.');
      await loadVariation(sel.variation.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  // Live preview computed client-side from the loaded factors (no round-trip).
  const factorFor = (uomId: string): number | null => {
    const c = sel?.conversions.find((x) => x.uom_id === uomId);
    if (!c) return null;
    if (c.is_base) return 1;
    const edited = factors[uomId];
    if (edited !== undefined && edited !== '') return Math.round(Number(edited)) || null;
    return c.to_base_factor;
  };
  const calcFactor = calcUom ? factorFor(calcUom) : null;
  const calcQtyN = Math.round(Number(calcQty) || 0);
  const calcBase = calcFactor && calcQtyN > 0 ? calcQtyN * calcFactor : null;
  const calcCode = uoms.find((u) => u.id === calcUom)?.code ?? '';

  return (
    <Page>
      <PageHeader
        title="Units of Measure"
        icon={Boxes}
        description="You buy in boxes and cases but stock and sell in single pieces. Tell us how many pieces are in each pack — we do the maths so a purchase of '5 boxes' is stocked as the right number of pieces."
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* Pick a product */}
      <SectionCard>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><Search className="h-4 w-4" />Find a product</div>
        <SearchInput placeholder="Search product name, brand or SKU…" onChange={(e) => search(e.target.value)} />
        {results.length > 0 && (
          <div className="mt-1 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
            {results.map((r: any) => {
              const vid = r.variation_id ?? r.id;
              return (
                <button key={vid} onClick={() => loadVariation(vid)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {!sel ? (
        <EmptyState title="No product selected" description="Search for a product above to set its pack sizes (1 box = N pieces) and default buy/sell units." />
      ) : (
        <>
          <StatGrid cols={3}>
            <StatCard label="Product" value={<span className="text-base">{sel.variation.name ?? '—'}</span>} sub={sel.variation.sku ? `SKU ${sel.variation.sku}` : undefined} icon={Package} />
            <StatCard label={`In stock (${baseCode})`} value={sel.variation.stock.toLocaleString('en-IN')} sub="counted in single pieces" tone="info" />
            <StatCard label="Base unit" value={baseCode} sub="what the ledger and stock count in" />
          </StatGrid>

          {/* Pack sizes */}
          <SectionCard>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><Boxes className="h-4 w-4" />Pack sizes for this product</div>
            <p className="mb-3 text-xs text-gray-500">Set how many <b>{baseCode}</b> are in one of each pack. Leave blank if you never use that pack. "Applies to all" means a size already applies to every product (you can override it here).</p>
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Unit</Th><Th>Pack size</Th><Th>Where from</Th><Th></Th></THead>
                <TBody>
                  {sel.conversions.filter((c) => !c.is_base).length === 0 ? (
                    <EmptyRow colSpan={4}>No pack units are configured for this store.</EmptyRow>
                  ) : sel.conversions.filter((c) => !c.is_base).map((c) => (
                    <Tr key={c.uom_id}>
                      <Td><span className="font-medium">{c.uom_name}</span> <span className="font-mono text-xs text-gray-500">{c.uom_code}</span></Td>
                      <Td>
                        <span className="mr-1 text-xs text-gray-500">1 {c.uom_code} =</span>
                        <TextInput type="number" min={1} className="w-24 text-right inline-block"
                          value={factors[c.uom_id] ?? ''} placeholder="—"
                          onChange={(e) => setFactors({ ...factors, [c.uom_id]: e.target.value })} />
                        <span className="ml-1 text-xs text-gray-500">{baseCode}</span>
                      </Td>
                      <Td><Chip tone={SCOPE_TONE[c.scope]}>{SCOPE_LABEL[c.scope]}</Chip></Td>
                      <Td><Btn variant="outline" disabled={busy} onClick={() => saveFactor(c.uom_id)}><Save className="h-4 w-4" />Save</Btn></Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>

          {/* Live preview */}
          <SectionCard>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><Calculator className="h-4 w-4" />Check the maths</div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Quantity"><TextInput type="number" min={0} className="w-28" value={calcQty} onChange={(e) => setCalcQty(e.target.value)} /></Field>
              <Field label="Unit">
                <SelectInput value={calcUom} onChange={(e) => setCalcUom(e.target.value)}>
                  <option value="">Choose a unit…</option>
                  {sel.conversions.filter((c) => !c.is_base).map((c) => <option key={c.uom_id} value={c.uom_id}>{c.uom_name} ({c.uom_code})</option>)}
                </SelectInput>
              </Field>
              <div className="flex-1 min-w-[220px] rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm">
                {calcBase != null ? (
                  <span className="text-blue-800">So <b>{calcQtyN} {calcCode}</b> = <b>{calcBase.toLocaleString('en-IN')} {baseCode}</b> <span className="text-blue-500">(1 {calcCode} = {calcFactor} {baseCode})</span></span>
                ) : (
                  <span className="text-gray-500">Pick a unit with a pack size to see the conversion.</span>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Defaults */}
          <SectionCard>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><Package className="h-4 w-4" />Default units</div>
            <p className="mb-3 text-xs text-gray-500">The unit this product is usually bought in and sold in. Purchasing and sales screens can start from these.</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Buy in (purchase unit)">
                <SelectInput value={purchaseUom} onChange={(e) => setPurchaseUom(e.target.value)}>
                  <option value="">— none —</option>
                  {uoms.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                </SelectInput>
              </Field>
              <Field label="Sell in (sales unit)">
                <SelectInput value={salesUom} onChange={(e) => setSalesUom(e.target.value)}>
                  <option value="">— none —</option>
                  {uoms.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                </SelectInput>
              </Field>
              <Btn variant="primary" disabled={busy} onClick={saveDefaults}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save defaults</Btn>
            </div>
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default UomSettings;
