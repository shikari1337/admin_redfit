import React, { useEffect, useState } from 'react';
import {
  Network, Plus, X, Layers, Users, ReceiptIndianRupee, Calculator, Send,
  CheckCircle2, AlertTriangle, Loader2, Power,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, TabBar, SectionCard, FilterBar, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, StatCard, StatGrid, Chip,
} from '../../components/erp';

/**
 * DISTRIBUTOR NETWORK (migration 082, Part V §7) — the Inventory-panel screen for
 * a multi-level trade network and the money it owes back.
 *
 *   LEVELS    "Super Stockist buys at 30% off, Distributor at 20%, Retailer at 10%."
 *             A ladder of named rungs. Put a partner on a rung and every outright
 *             dispatch to them is priced at that depth automatically (an agreed
 *             price on a line still wins, and a partner on no rung keeps their own
 *             margin — nothing changes for anyone until you use this).
 *
 *   PARTNERS  "They owe me 5% of sales plus 2% marketing fund, based on what they
 *             sold." Written as that sentence, with the % boxes inside it.
 *
 *   ROYALTY   Pick a month, PREVIEW what a partner owes (base → royalty → fund →
 *             GST → total, all shown), then issue it. Nothing is ever billed
 *             automatically: the nightly job only prepares DRAFTS.
 *
 * Needs the B2B module (a distributor level is a wholesale price) — the screen
 * says so plainly if the module is off.
 */

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};

interface Tier {
  id: string; code: string; name: string; level: number; discount_pct: number;
  b2b_price_list_id: string | null; is_active: boolean; notes: string | null;
  partner_count?: number;
}
interface NetPartner {
  id: string; code: string; name: string; model: string; is_active: boolean;
  state: string | null; city: string | null; margin_pct: number;
  distributor_tier_id: string | null; tier_name: string | null; tier_level: number | null;
  tier_discount_pct: number | null;
  royalty_pct: number; marketing_fund_pct: number; royalty_base: string;
  open_invoices?: number;
}
interface Preview {
  partner: any; periodFrom: string; periodTo: string; royaltyBase: string;
  baseAmountMinor: string; royaltyMinor: string; marketingFundMinor: string;
  taxableMinor: string; taxMinor: string; totalMinor: string;
  gst: { cgst: number; sgst: number; igst: number; taxType: string; rate: number; rateSource: string; citation?: string | null };
  sourceDocs: Array<{ id: string; number: string | null; on: string; grossMinor: string }>;
  plain: string; advisories: string[];
}
interface Invoice {
  id: string; number: string | null; partner_id: string; partner_name?: string;
  period_from: string; period_to: string; royalty_base: string;
  royalty_pct: number; marketing_fund_pct: number;
  base_amount_minor: string; royalty_minor: string; marketing_fund_minor: string;
  taxable_minor: string; tax_minor: string; total_minor: string; gst_rate: number;
  status: string; created_source: string; gl_journal_id: string | null;
  source_doc_count: number; issued_at?: string | null; note?: string | null;
  advisories?: string[] | null;
}

const BASIS_LABEL: Record<string, string> = {
  sell_through: 'what they sold of your stock',
  outright_purchases: 'what they bought from you',
};
const STATUS_TONE: Record<string, any> = {
  draft: 'neutral', issued: 'amber', paid: 'green', cancelled: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Not sent yet', issued: 'Awaiting payment', paid: 'Paid', cancelled: 'Cancelled',
};
const RATE_SOURCE_LABEL: Record<string, string> = {
  statutory_registry: 'from the cited statutory rule',
  store_config: 'your configured service rate',
  store_default: 'your DEFAULT product rate — probably wrong for a service',
  gst_disabled: 'GST is off for this store',
};

const blankTier = () => ({ name: '', level: '2', discountPct: '', notes: '' });

const DistributorNetwork: React.FC = () => {
  const [tab, setTab] = useState<'levels' | 'partners' | 'royalty'>('levels');
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [partners, setPartners] = useState<NetPartner[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [period, setPeriod] = useState<{ periodFrom: string; periodTo: string }>({ periodFrom: '', periodTo: '' });
  const [msg, setMsg] = useState(''); const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [moduleOff, setModuleOff] = useState(false);

  // level editor
  const [creatingTier, setCreatingTier] = useState(false);
  const [tierForm, setTierForm] = useState(blankTier());

  // partner terms editor
  const [editing, setEditing] = useState<NetPartner | null>(null);
  const [terms, setTerms] = useState({ tierId: '', royaltyPct: '', fundPct: '', basis: 'sell_through' });

  // royalty preview
  const [previewFor, setPreviewFor] = useState<string>('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const err = (e: any) => {
    const status = e?.response?.status;
    if (status === 403) { setModuleOff(true); return; }
    setMsg(e?.response?.data?.message ?? e.message);
  };

  const reload = async () => {
    try {
      const [t, p, i, per] = await Promise.all([
        api.get('/network/tiers'),
        api.get('/network/partners'),
        api.get('/network/royalty-invoices'),
        api.get('/network/royalty/period'),
      ]);
      setTiers(payload<Tier[]>(t) ?? []);
      setPartners(payload<NetPartner[]>(p) ?? []);
      setInvoices(payload<Invoice[]>(i) ?? []);
      const pr = payload<{ periodFrom: string; periodTo: string }>(per);
      if (pr) setPeriod(pr);
    } catch (e: any) { err(e); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ── Levels ────────────────────────────────────────────────────────────────
  const saveTier = async () => {
    if (!tierForm.name.trim()) { setMsg('Give the level a name, e.g. "Super Stockist".'); return; }
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      await api.post('/network/tiers', {
        name: tierForm.name.trim(),
        level: Number(tierForm.level) || 1,
        discountPct: Number(tierForm.discountPct) || 0,
        notes: tierForm.notes.trim() || null,
      });
      setOkMsg(`"${tierForm.name.trim()}" added. Anyone you put on this level now buys at ${Number(tierForm.discountPct) || 0}% off your catalogue price.`);
      setCreatingTier(false); setTierForm(blankTier()); await reload();
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  const patchTier = async (t: Tier, patch: any, note: string) => {
    setBusy(true); setMsg(''); setOkMsg('');
    try { await api.put(`/network/tiers/${t.id}`, patch); setOkMsg(note); await reload(); }
    catch (e: any) { err(e); } finally { setBusy(false); }
  };

  const switchOff = async (t: Tier) => {
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      // The axios interceptor unwraps `{success,data}` and drops sibling keys, so
      // the backend also puts `plain` INSIDE data — payload() reads it either way.
      const out = payload<any>(await api.post(`/network/tiers/${t.id}/deactivate`, {}));
      setOkMsg(out?.plain ?? `"${t.name}" switched off.`);
      await reload();
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  // ── Partner terms ─────────────────────────────────────────────────────────
  const openTerms = (p: NetPartner) => {
    setEditing(p); setMsg(''); setOkMsg('');
    setTerms({
      tierId: p.distributor_tier_id ?? '',
      royaltyPct: String(p.royalty_pct ?? 0),
      fundPct: String(p.marketing_fund_pct ?? 0),
      basis: p.royalty_base ?? 'sell_through',
    });
  };

  const saveTerms = async () => {
    if (!editing) return;
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      const out = payload<any>(await api.put(`/network/partners/${editing.id}/terms`, {
        distributorTierId: terms.tierId || null,
        royaltyPct: Number(terms.royaltyPct) || 0,
        marketingFundPct: Number(terms.fundPct) || 0,
        royaltyBase: terms.basis,
      }));
      setOkMsg(out?.plain ?? 'Saved.');
      const adv: string[] = out?.advisories ?? [];
      if (adv.length) setMsg(adv.join(' '));
      setEditing(null); await reload();
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  // ── Royalty ───────────────────────────────────────────────────────────────
  const runPreview = async (partnerId: string) => {
    setPreviewFor(partnerId); setPreview(null); setMsg(''); setOkMsg('');
    if (!partnerId) return;
    setBusy(true);
    try {
      const r = await api.get('/network/royalty/preview', {
        params: { partnerId, from: period.periodFrom, to: period.periodTo },
      });
      setPreview(payload<Preview>(r) ?? null);
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  const issueNow = async () => {
    if (!previewFor) return;
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      const out = payload<any>(await api.post('/network/royalty-invoices', {
        partnerId: previewFor, periodFrom: period.periodFrom, periodTo: period.periodTo, issueNow: true,
      }));
      setOkMsg(out?.plain ?? `Invoice ${out?.number ?? ''} issued.`);
      setPreview(null); setPreviewFor(''); await reload();
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  const invoiceAction = async (inv: Invoice, action: 'issue' | 'cancel' | 'paid') => {
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      const out = payload<any>(await api.post(`/network/royalty-invoices/${inv.id}/${action}`, {}));
      setOkMsg(
        action === 'issue' ? (out?.plain ?? `Invoice ${out?.number ?? ''} issued.`)
          : action === 'paid' ? 'Marked as paid.'
            : 'Draft cancelled — that period can be billed again.');
      await reload();
    } catch (e: any) { err(e); } finally { setBusy(false); }
  };

  if (moduleOff) {
    return (
      <Page width="narrow">
        <PageHeader title="Distributor network" icon={Network} />
        <EmptyState
          icon={AlertTriangle}
          title="This needs the B2B module switched on"
          description="Distributor levels are wholesale prices and royalties are trade billing, so this screen lives behind the B2B module. Ask your platform administrator to enable B2B for this store."
        />
      </Page>
    );
  }

  const activeTiers = (tiers ?? []).filter((t) => t.is_active);
  const royaltyPartners = (partners ?? []).filter((p) => Number(p.royalty_pct) > 0 || Number(p.marketing_fund_pct) > 0);
  const owed = (invoices ?? []).filter((i) => i.status === 'issued')
    .reduce((s, i) => s + Number(i.total_minor || 0), 0);
  const drafts = (invoices ?? []).filter((i) => i.status === 'draft');

  return (
    <Page>
      <PageHeader
        title="Distributor network — levels, royalty & marketing fund"
        icon={Network}
        description="Set up the levels your network buys at (Super Stockist → Distributor → Retailer), then bill each partner the royalty and marketing-fund share your agreement says they owe. Nothing is ever billed automatically — invoices are only ever prepared for you to check and send."
      />

      {msg && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{okMsg}</div>}

      <StatGrid cols={4}>
        <StatCard label="Buying levels" value={activeTiers.length} sub={activeTiers.length ? activeTiers.map((t) => `${t.name} ${t.discount_pct}%`).join(' · ') : 'No levels yet'} icon={Layers} />
        <StatCard label="Partners paying royalty" value={royaltyPartners.length} sub={`${(partners ?? []).length} partner(s) in the network`} icon={Users} />
        <StatCard label="Royalty owed to you" value={inr(owed)} sub={`${(invoices ?? []).filter((i) => i.status === 'issued').length} invoice(s) awaiting payment`} tone={owed > 0 ? 'warn' : 'default'} icon={ReceiptIndianRupee} />
        <StatCard label="Prepared, not sent" value={drafts.length} sub={drafts.length ? 'Check and issue them' : 'Nothing waiting'} tone={drafts.length ? 'info' : 'default'} />
      </StatGrid>

      <TabBar
        active={tab}
        onChange={(k) => { setTab(k as any); setMsg(''); setOkMsg(''); }}
        tabs={[
          { key: 'levels', label: 'Buying levels' },
          { key: 'partners', label: 'Who is on what level' },
          { key: 'royalty', label: 'Royalty invoices' },
        ]}
      />

      {/* ══ LEVELS ═══════════════════════════════════════════════════════════ */}
      {tab === 'levels' && (
        <SectionCard
          title="The ladder"
          description="Level 1 sits closest to you and normally gets the deepest discount. A partner on a level buys at that level's discount off your catalogue price; an agreed price on a specific dispatch always wins."
          action={
            <Btn variant={creatingTier ? 'outline' : 'primary'} onClick={() => { setCreatingTier((v) => !v); setMsg(''); setOkMsg(''); }}>
              {creatingTier ? <><X className="h-4 w-4" />Cancel</> : <><Plus className="h-4 w-4" />Add a level</>}
            </Btn>
          }
        >
          {creatingTier && (
            <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <FilterBar>
                <Field label="Name" className="w-56">
                  <TextInput placeholder="Super Stockist" value={tierForm.name} onChange={(e) => setTierForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Rung (1 = closest to you)" className="w-40">
                  <TextInput type="number" min={1} max={99} value={tierForm.level} onChange={(e) => setTierForm((f) => ({ ...f, level: e.target.value }))} />
                </Field>
                <Field label="Discount off catalogue %" className="w-48">
                  <TextInput type="number" min={0} max={100} step="0.001" placeholder="30" value={tierForm.discountPct} onChange={(e) => setTierForm((f) => ({ ...f, discountPct: e.target.value }))} />
                </Field>
                <Field label="Note (optional)" className="w-64">
                  <TextInput placeholder="Buys full truckloads" value={tierForm.notes} onChange={(e) => setTierForm((f) => ({ ...f, notes: e.target.value }))} />
                </Field>
                <Btn onClick={saveTier} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save level</Btn>
              </FilterBar>
            </div>
          )}

          {tiers === null ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
          ) : tiers.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No buying levels yet"
              description="Add the levels your network buys at — for example Super Stockist at 30% off, Distributor at 20%, Retailer at 10%."
            />
          ) : (
            <TableShell>
              <THead>
                <tr>
                  <Th>Rung</Th><Th>Level</Th><Th align="right">Buys at</Th>
                  <Th align="right">Partners</Th><Th>Status</Th><Th>Note</Th><Th align="right">Change</Th>
                </tr>
              </THead>
              <TBody>
                {tiers.map((t) => (
                  <Tr key={t.id}>
                    <Td className="font-medium">{t.level}</Td>
                    <Td className="font-medium">{t.name}<span className="ml-2 text-xs text-gray-400">{t.code}</span></Td>
                    <Td align="right">{t.discount_pct}% off</Td>
                    <Td align="right">{t.partner_count ?? 0}</Td>
                    <Td><Chip tone={t.is_active ? 'green' : 'neutral'}>{t.is_active ? 'In use' : 'Switched off'}</Chip></Td>
                    <Td className="max-w-xs truncate text-xs text-gray-500">{t.notes ?? '—'}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <input
                          type="number" min={0} max={100} step="0.001" defaultValue={t.discount_pct}
                          className="h-8 w-20 rounded-lg border border-gray-200 px-2 text-sm"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v !== Number(t.discount_pct)) {
                              patchTier(t, { discountPct: v }, `"${t.name}" now buys at ${v}% off.`);
                            }
                          }}
                        />
                        {t.is_active ? (
                          <Btn variant="outline" size="sm" onClick={() => switchOff(t)} disabled={busy}><Power className="h-3.5 w-3.5" />Switch off</Btn>
                        ) : (
                          <Btn variant="outline" size="sm" onClick={() => patchTier(t, { isActive: true }, `"${t.name}" is back in use.`)} disabled={busy}>Turn back on</Btn>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableShell>
          )}
        </SectionCard>
      )}

      {/* ══ PARTNERS ═════════════════════════════════════════════════════════ */}
      {tab === 'partners' && (
        <SectionCard
          title="Who is on what level, and what they owe you"
          description="Pick a partner's level, then write their royalty in plain numbers. Leave the percentages at 0 and nothing is ever billed."
        >
          {editing && (
            <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <div className="mb-3 text-sm text-gray-700">
                <span className="font-semibold">{editing.name}</span> buys as a{' '}
                <select
                  className="mx-1 h-8 rounded-lg border border-gray-300 px-2 text-sm"
                  value={terms.tierId}
                  onChange={(e) => setTerms((t) => ({ ...t, tierId: e.target.value }))}
                >
                  <option value="">— no level (keeps their own {editing.margin_pct}% margin) —</option>
                  {activeTiers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.discount_pct}% off)</option>)}
                </select>
                , and owes you{' '}
                <input
                  type="number" min={0} max={100} step="0.001"
                  className="mx-1 h-8 w-16 rounded-lg border border-gray-300 px-2 text-sm"
                  value={terms.royaltyPct}
                  onChange={(e) => setTerms((t) => ({ ...t, royaltyPct: e.target.value }))}
                />
                % royalty plus{' '}
                <input
                  type="number" min={0} max={100} step="0.001"
                  className="mx-1 h-8 w-16 rounded-lg border border-gray-300 px-2 text-sm"
                  value={terms.fundPct}
                  onChange={(e) => setTerms((t) => ({ ...t, fundPct: e.target.value }))}
                />
                % marketing fund, based on{' '}
                <select
                  className="mx-1 h-8 rounded-lg border border-gray-300 px-2 text-sm"
                  value={terms.basis}
                  onChange={(e) => setTerms((t) => ({ ...t, basis: e.target.value }))}
                >
                  <option value="sell_through">what they sold of your stock</option>
                  <option value="outright_purchases">what they bought from you</option>
                </select>
                .
              </div>
              <div className="flex gap-2">
                <Btn onClick={saveTerms} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save terms</Btn>
                <Btn variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" />Cancel</Btn>
              </div>
            </div>
          )}

          {partners === null ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
          ) : partners.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No partners yet"
              description="Partners are created on the Consignment screen (Inventory ▸ Consignment). Once they exist, put them on a level here."
            />
          ) : (
            <TableShell>
              <THead>
                <tr>
                  <Th>Partner</Th><Th>Buys as</Th><Th align="right">Their price basis</Th>
                  <Th align="right">Royalty</Th><Th align="right">Marketing fund</Th>
                  <Th>Charged on</Th><Th align="right">Change</Th>
                </tr>
              </THead>
              <TBody>
                {partners.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {p.name}
                      <span className="ml-2 text-xs text-gray-400">{p.code}</span>
                      {!p.is_active && <Chip tone="neutral" className="ml-2">Inactive</Chip>}
                    </Td>
                    <Td>{p.tier_name ? <Chip tone="blue">{p.tier_name}</Chip> : <span className="text-xs text-gray-400">no level</span>}</Td>
                    <Td align="right">
                      {p.tier_name && Number(p.tier_discount_pct) > 0
                        ? `${p.tier_discount_pct}% off catalogue`
                        : `${p.margin_pct}% own margin`}
                    </Td>
                    <Td align="right">{Number(p.royalty_pct) > 0 ? `${p.royalty_pct}%` : '—'}</Td>
                    <Td align="right">{Number(p.marketing_fund_pct) > 0 ? `${p.marketing_fund_pct}%` : '—'}</Td>
                    <Td className="text-xs text-gray-500">{Number(p.royalty_pct) + Number(p.marketing_fund_pct) > 0 ? BASIS_LABEL[p.royalty_base] ?? p.royalty_base : '—'}</Td>
                    <Td align="right"><Btn variant="outline" size="sm" onClick={() => openTerms(p)}>Set terms</Btn></Td>
                  </Tr>
                ))}
              </TBody>
            </TableShell>
          )}
        </SectionCard>
      )}

      {/* ══ ROYALTY ══════════════════════════════════════════════════════════ */}
      {tab === 'royalty' && (
        <>
          <SectionCard
            title="Work out what a partner owes"
            description="Choose the month and the partner. You see the whole calculation before anything is issued."
          >
            <FilterBar className="mb-4">
              <Field label="From" className="w-40">
                <TextInput type="date" value={period.periodFrom} onChange={(e) => { setPeriod((p) => ({ ...p, periodFrom: e.target.value })); setPreview(null); }} />
              </Field>
              <Field label="To" className="w-40">
                <TextInput type="date" value={period.periodTo} onChange={(e) => { setPeriod((p) => ({ ...p, periodTo: e.target.value })); setPreview(null); }} />
              </Field>
              <Field label="Partner" className="w-72">
                <SelectInput value={previewFor} onChange={(e) => runPreview(e.target.value)}>
                  <option value="">— choose a partner —</option>
                  {royaltyPartners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.royalty_pct}% + {p.marketing_fund_pct}%</option>
                  ))}
                </SelectInput>
              </Field>
              <Btn variant="outline" onClick={() => runPreview(previewFor)} disabled={busy || !previewFor}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}Work it out
              </Btn>
            </FilterBar>

            {royaltyPartners.length === 0 && (
              <p className="text-sm text-gray-500">
                No partner owes a royalty yet. Set a partner's royalty % on the “Who is on what level” tab first.
              </p>
            )}

            {preview && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-sm text-gray-800">{preview.plain}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span className="text-gray-500">{BASIS_LABEL[preview.royaltyBase] ?? preview.royaltyBase}</span>
                    <span className="font-semibold tabular-nums">{inr(preview.baseAmountMinor)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span className="text-gray-500">Royalty</span>
                    <span className="font-semibold tabular-nums">{inr(preview.royaltyMinor)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span className="text-gray-500">Marketing fund</span>
                    <span className="font-semibold tabular-nums">{inr(preview.marketingFundMinor)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span className="text-gray-500">GST @ {preview.gst.rate}% ({preview.gst.taxType})</span>
                    <span className="font-semibold tabular-nums">{inr(preview.taxMinor)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-gray-900 px-3 py-2 text-white shadow-sm">
                    <span>They owe you</span>
                    <span className="font-bold tabular-nums">{inr(preview.totalMinor)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                    <span className="text-gray-500">Based on</span>
                    <span className="text-gray-700">{preview.sourceDocs.length} document(s)</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Tax rate: {RATE_SOURCE_LABEL[preview.gst.rateSource] ?? preview.gst.rateSource}
                  {preview.gst.citation ? ` (${preview.gst.citation})` : ''}
                </p>
                {preview.advisories.map((a, i) => (
                  <p key={i} className="mt-2 flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}
                  </p>
                ))}
                {Number(preview.totalMinor) > 0 && (
                  <div className="mt-4">
                    <Btn onClick={issueNow} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Issue this invoice ({inr(preview.totalMinor)})
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Royalty invoices" description="Drafts prepared for you can still be changed or cancelled. Once an invoice is issued it has a number and cannot be taken back — correct it with a credit note.">
            {invoices === null ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
            ) : (
              <TableShell>
                <THead>
                  <tr>
                    <Th>Invoice</Th><Th>Partner</Th><Th>Period</Th>
                    <Th align="right">Sales base</Th><Th align="right">Royalty</Th>
                    <Th align="right">Fund</Th><Th align="right">GST</Th><Th align="right">Total</Th>
                    <Th>Status</Th><Th align="right">Action</Th>
                  </tr>
                </THead>
                <TBody>
                  {invoices.length === 0 && <EmptyRow colSpan={10}>No royalty invoices yet.</EmptyRow>}
                  {invoices.map((i) => (
                    <Tr key={i.id}>
                      <Td className="font-medium">
                        {i.number ?? <span className="text-xs text-gray-400">not issued</span>}
                        {i.created_source === 'scheduler' && <Chip tone="neutral" className="ml-2">prepared for you</Chip>}
                      </Td>
                      <Td>{i.partner_name ?? '—'}</Td>
                      <Td className="text-xs text-gray-600">{i.period_from} → {i.period_to}</Td>
                      <Td align="right">{inr(i.base_amount_minor)}</Td>
                      <Td align="right">{inr(i.royalty_minor)}<span className="ml-1 text-xs text-gray-400">{i.royalty_pct}%</span></Td>
                      <Td align="right">{inr(i.marketing_fund_minor)}</Td>
                      <Td align="right">{inr(i.tax_minor)}</Td>
                      <Td align="right" className="font-semibold">{inr(i.total_minor)}</Td>
                      <Td><Chip tone={STATUS_TONE[i.status] ?? 'neutral'}>{STATUS_LABEL[i.status] ?? i.status}</Chip></Td>
                      <Td align="right">
                        <div className="flex justify-end gap-2">
                          {i.status === 'draft' && (
                            <>
                              <Btn size="sm" onClick={() => invoiceAction(i, 'issue')} disabled={busy}><Send className="h-3.5 w-3.5" />Issue</Btn>
                              <Btn variant="outline" size="sm" onClick={() => invoiceAction(i, 'cancel')} disabled={busy}>Discard</Btn>
                            </>
                          )}
                          {i.status === 'issued' && (
                            <Btn variant="outline" size="sm" onClick={() => invoiceAction(i, 'paid')} disabled={busy}><CheckCircle2 className="h-3.5 w-3.5" />Mark paid</Btn>
                          )}
                          {['paid', 'cancelled'].includes(i.status) && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </TableShell>
            )}
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default DistributorNetwork;
