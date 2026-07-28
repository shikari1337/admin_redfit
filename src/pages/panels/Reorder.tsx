import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TabBar,
  FilterBar, Field, TextInput, SearchInput, StatusChip, EmptyState, inrMinor,
} from '../../components/erp';
import { PackageSearch, ChevronDown, ChevronRight } from 'lucide-react';

const TABS = [
  { key: 'report', label: 'Reorder report' },
  { key: 'setup', label: 'Thresholds & vendors' },
] as const;

const HISTORY_LABEL: Record<string, { label: string; tone: string; hint: string }> = {
  good: { label: 'Good', tone: 'text-emerald-700', hint: 'A year or more of sales history — the seasonal pattern is this product\'s own.' },
  thin: { label: 'Thin', tone: 'text-amber-700', hint: 'Less than a year of sales history — the pattern is borrowed from the category, or left flat.' },
  none: { label: 'None', tone: 'text-gray-400', hint: 'No sales in the last year, so no economic order size can be worked out.' },
};

const Reorder: React.FC = () => {
  const [tab, setTab] = useState<string>('report');

  // ── Reorder report ──
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [draftResult, setDraftResult] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  // ── EOQ + seasonality config (opt-in; absent = plain top-up quantities) ──
  const [cfg, setCfg] = useState<any>(null);
  const [cfgForm, setCfgForm] = useState<{ orderingCostRupees: string; holdingCostPctAnnual: string; seasonalityEnabled: boolean }>(
    { orderingCostRupees: '', holdingCostPctAnnual: '', seasonalityEnabled: true });
  const [cfgMsg, setCfgMsg] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);

  const loadConfig = async () => {
    try {
      const c = payload<any>(await api.get('/reorder/config'));
      setCfg(c);
      setCfgForm({
        orderingCostRupees: String(Number(c?.orderingCostMinor ?? 0) / 100),
        holdingCostPctAnnual: String(c?.holdingCostPctAnnual ?? ''),
        seasonalityEnabled: c?.seasonalityEnabled !== false,
      });
      if (c && !c.configured) setCfgOpen(true);
    } catch { /* config is advisory — the report still works without it */ }
  };

  const saveConfig = async () => {
    setCfgSaving(true); setCfgMsg('');
    try {
      await api.put('/reorder/config', {
        orderingCostRupees: cfgForm.orderingCostRupees === '' ? 0 : Number(cfgForm.orderingCostRupees),
        holdingCostPctAnnual: cfgForm.holdingCostPctAnnual === '' ? 0 : Number(cfgForm.holdingCostPctAnnual),
        seasonalityEnabled: cfgForm.seasonalityEnabled,
      });
      setCfgMsg('Saved. Order quantities below are now sized economically from your own sales history.');
      await Promise.all([loadConfig(), loadReport()]);
    } catch (e: any) {
      setCfgMsg(e?.response?.data?.message ?? e.message);
    } finally { setCfgSaving(false); }
  };

  const turnOffConfig = async () => {
    setCfgSaving(true); setCfgMsg('');
    try {
      await api.delete('/reorder/config');
      setCfgMsg('Turned off. Quantities are back to the plain top-up-to-target numbers.');
      await Promise.all([loadConfig(), loadReport()]);
    } catch (e: any) { setCfgMsg(e?.response?.data?.message ?? e.message); }
    finally { setCfgSaving(false); }
  };

  const loadReport = async () => {
    setLoading(true);
    try { setReport(payload(await api.get('/reorder/report'))); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadReport(); loadConfig(); }, []);

  const createDraftPos = async () => {
    setCreating(true); setDraftResult(null);
    try {
      setDraftResult(payload(await api.post('/reorder/draft-pos', {})));
      await loadReport();
    } catch (e: any) { setDraftResult({ error: e?.response?.data?.message ?? e.message }); }
    finally { setCreating(false); }
  };

  // ── Thresholds & vendor mapping ──
  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [sel, setSel] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [thresholds, setThresholds] = useState<any>({ reorderPoint: '', reorderQty: '', safetyStock: '', maxStock: '' });
  const [savedMsg, setSavedMsg] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [newVendorId, setNewVendorId] = useState('');
  const [newCost, setNewCost] = useState('');

  const searchSkus = async (q: string) => {
    setSkuQuery(q);
    if (q.trim().length < 2) { setSkuResults([]); return; }
    try {
      const list = payload<any>(await api.get('/inventory', { params: { search: q, limit: 8 } }));
      setSkuResults(Array.isArray(list) ? list : []);
    } catch { setSkuResults([]); }
  };

  const pickSku = async (r: any) => {
    setSel({ id: r.id, name: r.name ?? r.product_name, sku: r.sku });
    setSkuResults([]); setSkuQuery(''); setSavedMsg('');
    const [s, m] = await Promise.all([
      api.get(`/reorder/settings/${r.id}`),
      api.get('/reorder/vendors', { params: { variationId: r.id } }),
    ]);
    const sv = payload<any>(s);
    setThresholds({
      reorderPoint: sv.reorderPoint ?? '', reorderQty: sv.reorderQty ?? '',
      safetyStock: sv.safetyStock ?? '', maxStock: sv.maxStock ?? '',
    });
    setMappings(payload<any>(m) ?? []);
    if (!vendors.length) {
      const v = payload<any>(await api.get('/vendors', { params: { limit: 100 } }));
      setVendors(Array.isArray(v) ? v : (v?.rows ?? v?.data ?? []));
    }
  };

  const saveThresholds = async () => {
    if (!sel) return;
    const body = Object.fromEntries(Object.entries(thresholds).map(([k, v]) => [k, v === '' ? null : Number(v)]));
    await api.put(`/reorder/settings/${sel.id}`, body);
    setSavedMsg('Saved. This SKU will now appear on the reorder report when its available stock drops to the reorder point.');
  };

  const addMapping = async () => {
    if (!sel || !newVendorId) return;
    await api.post('/reorder/vendors', {
      vendorId: newVendorId, variationId: sel.id,
      lastPurchaseCostRupees: Number(newCost) || 0,
      isPreferred: mappings.length === 0,
    });
    setNewVendorId(''); setNewCost('');
    setMappings(payload<any>(await api.get('/reorder/vendors', { params: { variationId: sel.id } })) ?? []);
  };
  const makePreferred = async (id: string) => {
    await api.post(`/reorder/vendors/${id}/preferred`, {});
    setMappings(payload<any>(await api.get('/reorder/vendors', { params: { variationId: sel!.id } })) ?? []);
  };
  const removeMapping = async (id: string) => {
    await api.delete(`/reorder/vendors/${id}`);
    setMappings(payload<any>(await api.get('/reorder/vendors', { params: { variationId: sel!.id } })) ?? []);
  };

  return (
    <Page>
      <PageHeader
        icon={PackageSearch}
        title="Reorder"
        description="Which products are running low, how many to buy, and one click to draft purchase orders to your preferred vendors."
      />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'report' && (
        <>
          {report && (
            <StatGrid cols={4}>
              <StatCard label="Below reorder point" value={report.summary.belowThreshold}
                tone={report.summary.belowThreshold > 0 ? 'warn' : 'good'} />
              <StatCard label="With a preferred vendor" value={report.summary.withPreferredVendor} tone="info" />
              <StatCard label="Total units to order" value={report.summary.totalOrderUnits ?? report.summary.totalSuggestedUnits} />
              <StatCard
                label={report.summary.eoqConfigured ? 'Sized economically' : 'Economic sizing'}
                value={report.summary.eoqConfigured ? `${report.summary.withEoq ?? 0} of ${report.summary.belowThreshold}` : 'Off'}
                tone={report.summary.eoqConfigured ? 'good' : 'default'} />
            </StatGrid>
          )}

          {/* ── EOQ + seasonality settings (small card, collapsible) ── */}
          <SectionCard
            title="How much to order at a time"
            description="Ordering costs money each time, and holding stock costs money all year. We use both — plus your own sales history — to work out the cheapest quantity to buy at a time, and nudge it up before your busy months."
            action={
              <Btn variant="outline" onClick={() => setCfgOpen((o) => !o)}>
                {cfgOpen ? 'Hide' : cfg?.configured ? 'Edit costs' : 'Set up'}
              </Btn>
            }
          >
            {!cfgOpen && (
              <div className="text-sm text-gray-600">
                {cfg?.configured
                  ? <>Ordering cost <span className="font-medium text-gray-900">{inrMinor(cfg.orderingCostMinor)}</span> per order ·
                      holding cost <span className="font-medium text-gray-900">{cfg.holdingCostPctAnnual}%</span> a year ·
                      seasonal adjustment <span className="font-medium text-gray-900">{cfg.seasonalityEnabled ? 'on' : 'off'}</span>.</>
                  : <>Not set up yet — the quantities below are the plain "top back up to target" numbers. Set your two costs and we will also suggest the most economic order size.</>}
              </div>
            )}
            {cfgOpen && (
              <>
                <FilterBar>
                  <Field label="Cost of raising one order (₹)">
                    <TextInput type="number" min={0} step="1" className="w-36"
                      title="Everything one purchase order costs you regardless of size: staff time, paperwork, inbound handling."
                      value={cfgForm.orderingCostRupees}
                      onChange={(e) => setCfgForm((f) => ({ ...f, orderingCostRupees: e.target.value }))} />
                  </Field>
                  <Field label="Cost of holding stock (% a year)">
                    <TextInput type="number" min={0} step="0.5" className="w-36"
                      title="What it costs to keep ₹100 of stock sitting for a year: money tied up, storage, shrinkage, expiry."
                      value={cfgForm.holdingCostPctAnnual}
                      onChange={(e) => setCfgForm((f) => ({ ...f, holdingCostPctAnnual: e.target.value }))} />
                  </Field>
                  <Field label="Adjust for the season">
                    <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={cfgForm.seasonalityEnabled}
                        onChange={(e) => setCfgForm((f) => ({ ...f, seasonalityEnabled: e.target.checked }))} />
                      Order more before busy months
                    </label>
                  </Field>
                  <Field label="&nbsp;">
                    <div className="flex items-center gap-2">
                      <Btn onClick={saveConfig} disabled={cfgSaving}>{cfgSaving ? 'Saving…' : 'Save'}</Btn>
                      {cfg?.configured && (
                        <Btn variant="ghost" onClick={turnOffConfig} disabled={cfgSaving}>Turn off</Btn>
                      )}
                    </div>
                  </Field>
                </FilterBar>
                <div className="mt-2 text-xs text-gray-500">
                  {cfg?.configured
                    ? 'These are your figures — tune them whenever your costs change.'
                    : <>Starting suggestions: <span className="font-medium">₹{Number(cfg?.defaults?.orderingCostMinor ?? 20000) / 100}</span> per order
                        and <span className="font-medium">{cfg?.defaults?.holdingCostPctAnnual ?? 20}%</span> a year. They are only defaults —
                        replace them with your real costs before relying on the quantities.</>}
                </div>
                {cfgMsg && <div className="mt-2 text-xs text-emerald-700">{cfgMsg}</div>}
              </>
            )}
          </SectionCard>

          <SectionCard
            title="Products to reorder"
            description="A product appears here when its available stock has dropped to or below its reorder point."
            action={
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={loadReport}>Refresh</Btn>
                <Btn variant="success" onClick={createDraftPos}
                  disabled={creating || !report?.summary.withPreferredVendor}>
                  {creating ? 'Creating…' : 'Create draft POs'}
                </Btn>
              </div>
            }
          >
            {draftResult && (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {draftResult.error
                  ? <span className="text-red-700">{draftResult.error}</span>
                  : <>
                      <div className="font-medium">
                        Created {draftResult.createdPos?.length ?? 0} draft purchase order(s).
                        {draftResult.skipped?.length ? ` Skipped ${draftResult.skipped.length} SKU(s).` : ''}
                      </div>
                      {(draftResult.createdPos ?? []).map((p: any) => (
                        <div key={p.poId} className="mt-0.5 text-xs">
                          {p.vendorName}: {p.lineCount} line(s), {p.units} unit(s) — review &amp; issue it under Purchasing.
                        </div>
                      ))}
                      {(draftResult.skipped ?? []).length > 0 && (
                        <div className="mt-1 text-xs text-amber-700">
                          Skipped (no preferred vendor / zero qty): {draftResult.skipped.map((s: any) => s.sku || s.variationId).join(', ')}
                        </div>
                      )}
                    </>}
              </div>
            )}
            <TableShell>
              <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th>
                <Th num>On hand</Th><Th num>Available</Th>
                <Th num>Reorder point</Th><Th num>Top-up qty</Th>
                <Th num title="Units sold in the last 365 days">Sold / yr</Th>
                <Th num title="Economic order quantity: the cheapest number to buy at a time">EOQ</Th>
                <Th num title="How busy next month usually is, compared with an average month">Season</Th>
                <Th num title="What the one-click draft PO will order">Order qty</Th>
                <Th title="How much sales history this product has">History</Th>
                <Th>Preferred vendor</Th><Th num>Last cost</Th><Th></Th>
              </THead>
              <TBody>
                {loading && <EmptyRow colSpan={14}>Loading…</EmptyRow>}
                {!loading && (!report || report.rows.length === 0) && (
                  <EmptyRow colSpan={14}>Nothing to reorder — every managed SKU is above its reorder point. Set thresholds under "Thresholds &amp; vendors".</EmptyRow>
                )}
                {!loading && report?.rows.map((r: any) => {
                  const hist = HISTORY_LABEL[r.historyQuality] ?? HISTORY_LABEL.none;
                  const open = openWhy === r.variationId;
                  return (
                  <React.Fragment key={r.variationId}>
                  <Tr>
                    <Td>{r.productName}</Td>
                    <Td className="font-mono text-xs text-gray-500">{r.sku}</Td>
                    <Td num>{r.onHand}</Td>
                    <Td num className={r.available <= 0 ? 'text-red-600 font-semibold' : ''}>{r.available}</Td>
                    <Td num>{r.reorderPoint}</Td>
                    <Td num muted>{r.suggestedQty}</Td>
                    <Td num muted>{r.annualDemand ?? 0}</Td>
                    <Td num>{r.eoq ?? <span className="text-gray-300">—</span>}</Td>
                    <Td num className={r.seasonalBasis === 'off' || r.eoq === null ? 'text-gray-300'
                      : r.seasonalIndex > 1 ? 'text-emerald-700' : r.seasonalIndex < 1 ? 'text-amber-700' : ''}>
                      {r.eoq === null || r.seasonalBasis === 'off' ? '—' : `${Number(r.seasonalIndex).toFixed(2)}×`}
                    </Td>
                    <Td num className="font-semibold">{r.orderQty ?? r.suggestedQty}</Td>
                    <Td><span className={`text-xs font-medium ${hist.tone}`} title={hist.hint}>{hist.label}</span></Td>
                    <Td>{r.preferredVendorName
                      ? r.preferredVendorName
                      : <StatusChip status="pending" label="No vendor" />}</Td>
                    <Td num>{inrMinor(r.lastPurchaseCostMinor)}</Td>
                    <Td>
                      <button type="button"
                        className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-700 hover:underline"
                        onClick={() => setOpenWhy(open ? null : r.variationId)}>
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        How this number was made
                      </button>
                    </Td>
                  </Tr>
                  {open && (
                    <tr className="bg-blue-50/40">
                      <td colSpan={14} className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{r.explain?.sentence}</div>
                        {(r.explain?.notes ?? []).length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                            {r.explain.notes.map((note: string, i: number) => <li key={i}>{note}</li>)}
                          </ul>
                        )}
                        <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-500 sm:grid-cols-2 lg:grid-cols-4">
                          <div>Sold last year: <span className="tabular-nums text-gray-800">{r.explain?.annualUnits ?? 0}</span> units
                            (about <span className="tabular-nums text-gray-800">{r.explain?.monthlyUnits ?? 0}</span> a month)</div>
                          <div>{r.explain?.nextMonthLabel || 'Next month'} in a normal year:
                            <span className="tabular-nums text-gray-800"> {r.explain?.nextMonthUnits ?? 0}</span> units</div>
                          <div>Unit cost used: <span className="tabular-nums text-gray-800">{inrMinor(r.unitCostMinor ?? 0)}</span>
                            {' '}({r.costBasis === 'wac' ? 'weighted average of your receipts'
                                : r.costBasis === 'vendor' ? 'vendor\'s last purchase cost' : 'not on record'})</div>
                          <div>Seasonal pattern from: {r.seasonalBasis === 'sku' ? 'this product\'s own history'
                            : r.seasonalBasis === 'category' ? 'its category (own history too short)'
                            : r.seasonalBasis === 'off' ? 'switched off' : 'not enough history'}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </TBody>
              </table>
            </TableShell>
          </SectionCard>
        </>
      )}

      {tab === 'setup' && (
        <SectionCard
          title="Set reorder thresholds & preferred vendors"
          description="Search a product, set when to reorder and how many, and pick which vendor to buy from."
        >
          <div className="max-w-md">
            <SearchInput placeholder="Search by product name or SKU…" value={skuQuery}
              onChange={(e) => searchSkus(e.target.value)} />
            {skuResults.length > 0 && (
              <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-sm">
                {skuResults.map((r: any) => (
                  <button key={r.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => pickSku(r)}>
                    {r.name ?? r.product_name} <span className="font-mono text-xs text-gray-400">{r.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {sel && (
            <div className="mt-5 space-y-5">
              <div className="text-sm font-medium text-gray-900">
                {sel.name} <span className="font-mono text-xs text-gray-400">{sel.sku}</span>
              </div>

              <FilterBar>
                {[
                  ['reorderPoint', 'Reorder point', 'Reorder when available drops to this'],
                  ['safetyStock', 'Safety stock', 'Buffer to keep above zero'],
                  ['maxStock', 'Max stock', 'Top-up target (optional)'],
                  ['reorderQty', 'Reorder qty', 'Fixed order lot (optional)'],
                ].map(([key, label, hint]) => (
                  <Field key={key} label={label}>
                    <TextInput type="number" min={0} className="w-32" title={hint as string}
                      value={(thresholds as any)[key]}
                      onChange={(e) => setThresholds((t: any) => ({ ...t, [key]: e.target.value }))} />
                  </Field>
                ))}
                <Field label="&nbsp;"><Btn onClick={saveThresholds}>Save thresholds</Btn></Field>
              </FilterBar>
              {savedMsg && <div className="text-xs text-emerald-700">{savedMsg}</div>}

              <div>
                <div className="mb-2 text-sm font-semibold text-gray-900">Vendors for this product</div>
                <TableShell>
                  <table className="w-full text-sm">
                  <THead>
                    <Th>Vendor</Th><Th num>Last cost</Th><Th>Preferred</Th><Th></Th>
                  </THead>
                  <TBody>
                    {mappings.length === 0 && <EmptyRow colSpan={4}>No vendors mapped yet. Add one below.</EmptyRow>}
                    {mappings.map((m: any) => (
                      <Tr key={m.id}>
                        <Td>{m.vendorName}</Td>
                        <Td num>{inrMinor(m.lastPurchaseCostMinor)}</Td>
                        <Td>{m.isPreferred
                          ? <StatusChip status="completed" label="Preferred" />
                          : <Btn variant="ghost" size="sm" onClick={() => makePreferred(m.id)}>Make preferred</Btn>}</Td>
                        <Td><Btn variant="ghost" size="sm" onClick={() => removeMapping(m.id)}>Remove</Btn></Td>
                      </Tr>
                    ))}
                  </TBody>
                  </table>
                </TableShell>
                <FilterBar className="mt-3">
                  <Field label="Add vendor">
                    <select className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                      value={newVendorId} onChange={(e) => setNewVendorId(e.target.value)}>
                      <option value="">Select a vendor…</option>
                      {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.business_name ?? v.businessName ?? v.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Last purchase cost (₹)">
                    <TextInput type="number" min={0} className="w-32" value={newCost}
                      onChange={(e) => setNewCost(e.target.value)} />
                  </Field>
                  <Field label="&nbsp;"><Btn variant="outline" onClick={addMapping} disabled={!newVendorId}>Add</Btn></Field>
                </FilterBar>
              </div>
            </div>
          )}

          {!sel && <div className="mt-4"><EmptyState title="Search for a product to begin"
            description="Set its reorder point and choose a preferred vendor — then it will show up on the reorder report." /></div>}
        </SectionCard>
      )}
    </Page>
  );
};

export default Reorder;
