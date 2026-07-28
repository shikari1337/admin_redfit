import React, { useEffect, useRef, useState } from 'react';
import {
  Boxes, Loader2, Plus, Hammer, Trash2, Package, CheckCircle2, AlertTriangle, X, ArrowLeft, Layers,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, SectionCard, StatCard, StatGrid, SearchInput, Field, TextInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Chip, TabBar, inrMinor,
} from '../../components/erp';

/**
 * Bill of Materials / Kits / Assembly (migration 068, spec §6). Plain-language:
 * a RECIPE says what a combo/kit is MADE OF ("2× A + 1× B → makes 1 Combo"), and
 * a BUILD takes the parts off the shelf and puts the finished good on. This is a
 * physical build that MOVES stock (unlike a pricing bundle) and is always
 * inventory-value-neutral — the value of the parts consumed becomes the cost of
 * the finished good, so the books stay balanced.
 */

interface Comp {
  id?: string;
  component_variation_id: string;
  sku: string | null;
  product_name: string | null;
  qty_per: number;
  scrap_pct: number;
  on_hand?: number;
  available?: number;
  avg_cost_minor?: string;
}
interface Bom {
  id: string; name: string; finished_variation_id: string; finished_sku?: string | null;
  finished_name?: string | null; output_qty: number; active: boolean; component_count?: number;
  components?: Comp[]; estimated_cost_minor?: string; notes?: string | null;
}
interface Assembly {
  id: string; assembly_number: string | null; status: string; bom_name?: string | null;
  finished_sku?: string | null; finished_name?: string | null; qty_to_produce: number;
  output_qty_produced: number; total_cost_minor: string; unit_cost_minor: string; created_at: string;
  parent_assembly_id?: string | null; build_level?: number;
}
// ── multi-level (075): what a build REALLY needs, all the way down ─────────────
interface FlatReq {
  variation_id: string; sku: string | null; product_name: string | null; label: string;
  qty_required: number; available: number; short_by: number;
}
interface BuildStep {
  bom_id: string; bom_name: string | null; finished_variation_id: string; label: string;
  runs: number; produced_qty: number; level: number;
}
interface Explosion {
  has_subassemblies: boolean; max_depth: number; produced_qty: number;
  flat_requirements: FlatReq[]; intermediates: FlatReq[]; plan: BuildStep[];
  buildable_with_autobuild: boolean; buildable_without_autobuild: boolean;
  shortage_message: string | null;
}

// ── shared product picker ──────────────────────────────────────────────────────
const ProductPicker: React.FC<{ onPick: (v: any) => void; placeholder?: string }> = ({ onPick, placeholder }) => {
  const [results, setResults] = useState<any[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (term: string) => {
    if (timer.current) clearTimeout(timer.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep last */ }
    }, 250);
  };
  return (
    <div>
      <SearchInput placeholder={placeholder ?? 'Search product name, brand or SKU…'} onChange={(e) => search(e.target.value)} />
      {results.length > 0 && (
        <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
          {results.map((r: any) => {
            const vid = r.variation_id ?? r.id;
            return (
              <button key={vid} type="button" onClick={() => { onPick({ ...r, variation_id: vid }); setResults([]); }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const needFor = (c: Comp, runs: number) => Math.ceil(Number(c.qty_per) * runs * (1 + Number(c.scrap_pct || 0)));

const BillOfMaterials: React.FC = () => {
  const [tab, setTab] = useState('recipes');
  const [boms, setBoms] = useState<Bom[]>([]);
  const [builds, setBuilds] = useState<Assembly[]>([]);
  const [detail, setDetail] = useState<Bom | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');

  // create-recipe form
  const [finished, setFinished] = useState<any>(null);
  const [outputQty, setOutputQty] = useState('1');
  const [name, setName] = useState('');
  const [newComps, setNewComps] = useState<Comp[]>([]);

  // build form
  const [buildQty, setBuildQty] = useState('1');
  // multi-level (075): the "what does this really need?" preview + auto-build choice
  const [explosion, setExplosion] = useState<Explosion | null>(null);
  const [autobuild, setAutobuild] = useState(true);
  const explodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBoms = async () => {
    try { setBoms(payload<Bom[]>(await api.get('/bom')) ?? []); } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  const loadBuilds = async () => {
    try { setBuilds(payload<Assembly[]>(await api.get('/bom/assemblies')) ?? []); } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { loadBoms(); loadBuilds(); }, []);

  /**
   * Ask the server what building N of this recipe REALLY means, all the way
   * down: which middle items (sub-assemblies) would have to be made first and
   * what raw parts that costs. Debounced because it re-runs as the qty is typed.
   */
  const loadExplosion = (id: string, runs: number) => {
    if (explodeTimer.current) clearTimeout(explodeTimer.current);
    explodeTimer.current = setTimeout(async () => {
      try { setExplosion(payload<Explosion>(await api.post(`/bom/${id}/explode`, { qty: runs }))); }
      catch { setExplosion(null); }
    }, 300);
  };

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setBuildQty('1'); setExplosion(null);
    try { setDetail(payload<Bom>(await api.get(`/bom/${id}`))); loadExplosion(id, 1); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const resetCreate = () => { setCreating(false); setFinished(null); setOutputQty('1'); setName(''); setNewComps([]); };

  const addComp = (v: any) => {
    if (newComps.some((c) => c.component_variation_id === v.variation_id)) return;
    if (finished && v.variation_id === finished.variation_id) { setMsg('A product cannot be a component of itself.'); return; }
    setNewComps([...newComps, { component_variation_id: v.variation_id, sku: v.sku ?? null, product_name: v.name ?? null, qty_per: 1, scrap_pct: 0 }]);
  };

  const saveRecipe = async () => {
    if (!finished) { setMsg('Choose the finished product this recipe builds.'); return; }
    if (newComps.length === 0) { setMsg('Add at least one component.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      await api.post('/bom', {
        finishedVariationId: finished.variation_id,
        name: name.trim() || undefined,
        outputQty: Math.max(1, Math.round(Number(outputQty) || 1)),
        components: newComps.map((c) => ({ componentVariationId: c.component_variation_id, qtyPer: c.qty_per, scrapPct: c.scrap_pct })),
      });
      setOk('Recipe saved.'); resetCreate(); await loadBoms();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const runBuild = async () => {
    if (!detail) return;
    const runs = Math.max(1, Math.round(Number(buildQty) || 0));
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = payload<any>(await api.post(`/bom/${detail.id}/assemble`, { qty: runs, autobuildSubassemblies: autobuild }));
      const subs: any[] = Array.isArray(r?.sub_assemblies) ? r.sub_assemblies : [];
      const also = subs.length > 0
        ? ` It made ${subs.map((s) => `${s.output_qty_produced}× ${s.assembly_number ?? 'sub-assembly'}`).join(', ')} first.`
        : '';
      setOk(`Built ${r?.output_qty_produced ?? ''} finished units — ${r?.assembly_number ?? 'done'}. Cost ${inrMinor(r?.total_cost_minor ?? 0)}.${also}`);
      await openDetail(detail.id); await loadBuilds();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const runs = Math.max(1, Math.round(Number(buildQty) || 1));
  const anyShort = detail?.components?.some((c) => (c.available ?? 0) < needFor(c, runs));
  // with sub-assemblies the SERVER's explosion is the truth (the direct-component
  // stock check above can't see parts two levels down)
  const nested = !!explosion?.has_subassemblies;
  const blocked = nested
    ? !(autobuild ? explosion!.buildable_with_autobuild : explosion!.buildable_without_autobuild)
    : !!anyShort;

  return (
    <Page>
      <PageHeader
        title="Kits & Assembly (Bill of Materials)"
        icon={Boxes}
        description="Build a combo or kit from single products. Write the recipe once — 'this Combo is made of 2× A + 1× B' — then press Build: the parts come off the shelf and the finished kit goes on. The parts' value becomes the kit's cost, so your stock value always balances."
      />

      {msg && <div className="flex items-start gap-2 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{msg}</div>}
      {ok && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{ok}</div>}

      <TabBar
        tabs={[{ key: 'recipes', label: 'Recipes' }, { key: 'builds', label: 'Build history' }]}
        active={tab}
        onChange={(k) => { setTab(k); setDetail(null); resetCreate(); }}
      />

      {tab === 'recipes' && !detail && !creating && (
        <>
          <div className="flex justify-end">
            <Btn variant="primary" onClick={() => { setCreating(true); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />New recipe</Btn>
          </div>
          <SectionCard>
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Recipe</Th><Th>Makes</Th><Th>Parts</Th><Th>Cost / run (est.)</Th><Th>Status</Th><Th></Th></THead>
                <TBody>
                  {boms.length === 0 ? (
                    <EmptyRow colSpan={6}>No recipes yet. Create one to build kits and combos from single products.</EmptyRow>
                  ) : boms.map((b) => (
                    <Tr key={b.id}>
                      <Td><div className="font-medium">{b.name}</div><div className="text-xs text-gray-500">{b.finished_name ?? ''} {b.finished_sku ? `· ${b.finished_sku}` : ''}</div></Td>
                      <Td>{b.output_qty} per build</Td>
                      <Td>{b.component_count ?? 0}</Td>
                      <Td>{b.estimated_cost_minor ? inrMinor(b.estimated_cost_minor) : '—'}</Td>
                      <Td><Chip tone={b.active ? 'green' : 'neutral'}>{b.active ? 'Active' : 'Off'}</Chip></Td>
                      <Td><Btn variant="outline" onClick={() => openDetail(b.id)}><Hammer className="h-4 w-4" />Open / build</Btn></Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>
        </>
      )}

      {/* ── create recipe ── */}
      {tab === 'recipes' && creating && (
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Plus className="h-4 w-4" />New recipe</div>
            <Btn variant="ghost" onClick={resetCreate}><X className="h-4 w-4" />Cancel</Btn>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">1 · What are you building?</div>
          {finished ? (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm">
              <span><Package className="mr-1 inline h-4 w-4 text-blue-600" /><b>{finished.name}</b> <span className="font-mono text-xs text-gray-500">{finished.sku}</span></span>
              <Btn variant="ghost" onClick={() => setFinished(null)}><X className="h-4 w-4" /></Btn>
            </div>
          ) : (
            <div className="mb-4"><ProductPicker placeholder="Search the finished kit/combo product…" onPick={(v) => { setFinished(v); if (!name) setName(`${v.name} recipe`); }} /></div>
          )}

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Recipe name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Immunity Combo recipe" className="w-64" /></Field>
            <Field label="One build makes"><div className="flex items-center gap-1"><TextInput type="number" min={1} value={outputQty} onChange={(e) => setOutputQty(e.target.value)} className="w-20 text-right" /><span className="text-xs text-gray-500">finished units</span></div></Field>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">2 · What is it made of?</div>
          <div className="mb-2"><ProductPicker placeholder="Search a component/part to add…" onPick={addComp} /></div>
          <TableShell>
            <table className="w-full text-sm">
              <THead><Th>Component</Th><Th>Qty per build</Th><Th>Scrap %</Th><Th></Th></THead>
              <TBody>
                {newComps.length === 0 ? (
                  <EmptyRow colSpan={4}>Search above to add the parts this recipe consumes.</EmptyRow>
                ) : newComps.map((c, i) => (
                  <Tr key={c.component_variation_id}>
                    <Td><span className="font-medium">{c.product_name}</span> <span className="font-mono text-xs text-gray-500">{c.sku}</span></Td>
                    <Td><TextInput type="number" min={1} value={String(c.qty_per)} className="w-20 text-right"
                      onChange={(e) => setNewComps(newComps.map((x, j) => j === i ? { ...x, qty_per: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x))} /></Td>
                    <Td><div className="flex items-center gap-1"><TextInput type="number" min={0} step={1} value={String(Math.round(Number(c.scrap_pct) * 100))} className="w-16 text-right"
                      onChange={(e) => setNewComps(newComps.map((x, j) => j === i ? { ...x, scrap_pct: Math.max(0, Number(e.target.value) || 0) / 100 } : x))} /><span className="text-xs text-gray-400">%</span></div></Td>
                    <Td><Btn variant="ghost" onClick={() => setNewComps(newComps.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-red-500" /></Btn></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          <div className="mt-4 flex justify-end">
            <Btn variant="primary" disabled={busy} onClick={saveRecipe}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save recipe</Btn>
          </div>
        </SectionCard>
      )}

      {/* ── recipe detail + build ── */}
      {tab === 'recipes' && detail && (
        <>
          <Btn variant="ghost" onClick={() => setDetail(null)}><ArrowLeft className="h-4 w-4" />Back to recipes</Btn>
          <StatGrid cols={3}>
            <StatCard label="Recipe" value={<span className="text-base">{detail.name}</span>} sub={detail.finished_sku ? `SKU ${detail.finished_sku}` : undefined} icon={Package} />
            <StatCard label="One build makes" value={`${detail.output_qty} finished`} />
            <StatCard label="Cost per run (now)" value={detail.estimated_cost_minor ? inrMinor(detail.estimated_cost_minor) : '—'} sub="at current stock cost" tone="info" />
          </StatGrid>

          <SectionCard>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="How many to build?"><TextInput type="number" min={1} value={buildQty} onChange={(e) => { setBuildQty(e.target.value); loadExplosion(detail.id, Math.max(1, Math.round(Number(e.target.value) || 1))); }} className="w-24 text-right" /></Field>
              <Btn variant="primary" disabled={busy || blocked} onClick={runBuild}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}Build {runs}</Btn>
              {blocked && !nested && <span className="text-sm text-red-600"><AlertTriangle className="mr-1 inline h-4 w-4" />Not enough stock for one or more parts.</span>}
            </div>

            {/* ── multi-level preview: what this build has to make FIRST ── */}
            {nested && (
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <Layers className="h-4 w-4" />
                  Some parts of this recipe are made from other recipes ({explosion!.max_depth} levels deep)
                </div>
                {explosion!.plan.length > 0 ? (
                  <p className="mt-1 text-sm text-blue-900">
                    This will also build: {explosion!.plan.map((s) => `${s.produced_qty}× ${s.label}`).join(', ')}.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-blue-900">Everything it needs is already on the shelf — nothing extra to make.</p>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm text-blue-900">
                  <input type="checkbox" className="h-4 w-4 rounded border-blue-300" checked={autobuild} onChange={(e) => setAutobuild(e.target.checked)} />
                  Also build what's missing (make the middle items first, in one go)
                </label>
                {explosion!.shortage_message && autobuild && (
                  <div className="mt-2 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{explosion!.shortage_message}</div>
                )}
                {!autobuild && !explosion!.buildable_without_autobuild && (
                  <div className="mt-2 text-sm text-red-700">
                    You don't have enough of the middle items on the shelf. Tick the box above and they'll be made first.
                  </div>
                )}
                {explosion!.flat_requirements.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-800">Full parts list (all levels)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {explosion!.flat_requirements.map((r) => (
                        <Chip key={r.variation_id} tone={r.short_by > 0 ? 'red' : 'neutral'}>
                          {r.qty_required}× {r.label}{r.short_by > 0 ? ` — short ${r.short_by}` : ''}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="mb-2 text-xs text-gray-500">This build will consume:</p>
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Component</Th><Th>Will consume</Th><Th>In stock</Th><Th>Status</Th></THead>
                <TBody>
                  {(detail.components ?? []).map((c) => {
                    const need = needFor(c, runs);
                    const have = c.available ?? 0;
                    const short = have < need;
                    // a component that another recipe MAKES is not really "short" —
                    // it just has to be built first (when auto-build is on).
                    const step = explosion?.plan.find((s) => s.finished_variation_id === c.component_variation_id);
                    return (
                      <Tr key={c.component_variation_id}>
                        <Td><span className="font-medium">{c.product_name}</span> <span className="font-mono text-xs text-gray-500">{c.sku}</span>
                          <div className="text-xs text-gray-400">{c.qty_per}× per build{Number(c.scrap_pct) > 0 ? ` + ${Math.round(Number(c.scrap_pct) * 100)}% scrap` : ''}</div></Td>
                        <Td className="font-medium">{need}</Td>
                        <Td>{have}</Td>
                        <Td>{!short ? <Chip tone="green">OK</Chip>
                          : step && autobuild ? <Chip tone="blue">Will be built ({step.produced_qty})</Chip>
                          : <Chip tone="red">Short by {need - have}</Chip>}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>
        </>
      )}

      {/* ── build history ── */}
      {tab === 'builds' && (
        <SectionCard>
          <TableShell>
            <table className="w-full text-sm">
              <THead><Th>Build #</Th><Th>Recipe</Th><Th>Finished</Th><Th>Made</Th><Th>Total cost</Th><Th>Unit cost</Th><Th>Status</Th></THead>
              <TBody>
                {builds.length === 0 ? (
                  <EmptyRow colSpan={7}>No builds yet.</EmptyRow>
                ) : builds.map((a) => (
                  <Tr key={a.id}>
                    <Td className="font-mono text-xs">{a.assembly_number ?? '—'}
                      {a.parent_assembly_id && <div className="mt-0.5"><Chip tone="blue">made for another build</Chip></div>}</Td>
                    <Td>{a.bom_name ?? '—'}</Td>
                    <Td>{a.finished_name ?? ''} <span className="font-mono text-xs text-gray-500">{a.finished_sku}</span></Td>
                    <Td>{a.output_qty_produced}</Td>
                    <Td>{inrMinor(a.total_cost_minor)}</Td>
                    <Td>{inrMinor(a.unit_cost_minor)}</Td>
                    <Td><Chip tone={a.status === 'completed' ? 'green' : a.status === 'cancelled' ? 'neutral' : 'amber'}>{a.status}</Chip></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      )}
    </Page>
  );
};

export default BillOfMaterials;
