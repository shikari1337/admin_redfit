import React, { useEffect, useRef, useState } from 'react';
import {
  Handshake, Plus, Send, Store, FileText, IndianRupee, RotateCcw, CheckCircle2, X,
  ShoppingBag, ArrowRightLeft, AlertTriangle, History, Link2, Copy, Check,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, TabBar, FilterBar, Field, TextInput, SelectInput, SearchInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, StatCard, StatGrid, StatusChip, Chip,
} from '../../components/erp';

/**
 * FRANCHISE PARTNERS — BOTH MODELS. The Inventory-panel screen for stock that
 * lives in someone else's shop.
 *
 *   CONSIGNMENT (migration 073, Part V §5.3) — "it stays MINE until they sell it"
 *     Partners      who holds our stock, what margin they keep, and the
 *                   per-agreement TAX POINT (a CA decision — surfaced loudly).
 *     Send stock    pick a partner, add SKUs + quantities, dispatch → challan.
 *     Per-consignment card: sent / sold / returned / still there.
 *     "Partner sold N" → those units leave our books.
 *     "Settle now" → they sold ₹X, keep ₹Y, owe you ₹Z — in those words.
 *
 *   OUTRIGHT (migration 077, Part V §5.2) — "they BUY it, it's theirs on arrival"
 *     One action sends the stock AND raises the money doc. No shelf of ours.
 *
 *   §5.5 MODEL SWITCH — "everything still at their shop becomes a sale TODAY"
 *     A deliberately LOUD confirmation that names the units and the rupees
 *     before anything happens, because the switch cannot be undone by editing a
 *     field — it raises a real deemed-sale invoice.
 */

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};
const num = (n: any) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

interface Partner {
  id: string; code: string; name: string; margin_pct: number; tax_point: string;
  city?: string | null; state?: string | null; gstin?: string | null; is_active: boolean;
  phone?: string | null; contact_name?: string | null;
  /** 077: 'consignment' (stock stays ours) | 'outright' (they buy it). */
  model?: string; model_switched_at?: string | null; customer_id?: string | null;
  /** 085 partner portal. The token itself is hashed at rest and never read back. */
  portal_link_live?: boolean; portal_token_prefix?: string | null;
  portal_token_issued_at?: string | null; portal_token_revoked_at?: string | null;
  portal_last_seen_at?: string | null;
}
interface ShelfSummary {
  partner_id: string; partner_name: string; model: string; margin_pct: number;
  open_consignments: number; draft_consignments: number; qty_at_partner: number;
  value_at_price_minor: string; value_at_cost_minor: string; unsettled_gross_minor: string;
  plain: string;
}
interface OutrightDoc {
  id: string; number: string | null; partner_id: string; partner_name?: string; status: string;
  gross_minor: string; taxable_minor: string; tax_minor: string; total_minor: string;
  cogs_minor: string; qty_total?: number; item_count?: number; note?: string | null;
  dispatched_at?: string | null; created_at: string;
}
interface SwitchEvent {
  id: string; partner_id: string; partner_name: string; from_model: string; to_model: string;
  deemed_qty: number; deemed_gross_minor: string; deemed_invoice_total_minor: string;
  consignments_closed: number; effective_date: string; switched_at: string;
  settlement_number?: string | null; notes?: string | null;
}
interface CustomerHit { customer_id: string; name: string | null; company?: string | null; phone: string | null; }
interface Item {
  id: string; variation_id: string; sku?: string; product_name?: string;
  qty_dispatched: number; qty_sold: number; qty_returned: number; qty_at_partner: number;
  unit_price_minor: string; unit_cost_minor: string;
}
interface Settlement {
  id: string; settlement_number: string; period_from?: string; period_to?: string; qty_sold: number;
  gross_minor: string; margin_pct: number; partner_margin_minor: string; taxable_minor: string;
  tax_minor: string; invoice_total_minor: string; net_due_minor: string; cogs_minor: string;
  status: string; created_at: string; partner_name?: string; consignment_number?: string;
}
interface Consignment {
  id: string; consignment_number: string | null; status: string; partner_id: string;
  partner_name?: string; margin_pct?: number; tax_point?: string;
  dispatch_value_minor: string; dispatch_cost_minor: string;
  dispatched_at?: string | null; note?: string | null; created_at: string;
  qty_dispatched?: number; qty_sold?: number; qty_returned?: number;
  unsettled_gross_minor?: string;
  items?: Item[]; sales?: any[]; settlements?: Settlement[];
}
interface ReportRow {
  partner_id: string; partner_name: string; margin_pct: number; tax_point: string; consignments: number;
  qty_dispatched: number; qty_sold: number; qty_returned: number; qty_at_partner: number;
  sell_through_pct: number; value_at_partner_minor: string; sold_gross_minor: string;
  unsettled_gross_minor: string; settled_net_minor: string;
}

const TAX_POINT_LABEL: Record<string, string> = {
  tax_at_transfer: 'Tax when stock is SENT (conservative)',
  tax_at_sell_through: 'Tax when the partner SELLS',
};

/** Plain-language model labels — no jargon on the screen. */
const MODEL_LABEL: Record<string, string> = {
  consignment: 'Stock stays yours',
  outright: 'They buy it',
};
const ModelBadge: React.FC<{ model?: string }> = ({ model }) => (
  <Chip tone={model === 'outright' ? 'blue' : 'neutral'}>
    {MODEL_LABEL[model ?? 'consignment'] ?? model}
  </Chip>
);

const Consignment: React.FC = () => {
  const [tab, setTab] = useState<'stock' | 'outright' | 'partners' | 'report' | 'settlements'>('stock');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [list, setList] = useState<Consignment[] | null>(null);
  const [detail, setDetail] = useState<Consignment | null>(null);
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // "Send stock to partner" form
  const [creating, setCreating] = useState(false);
  const [partnerId, setPartnerId] = useState(''); const [note, setNote] = useState('');
  const [lines, setLines] = useState<Array<{ variationId: string; sku: string; name: string; qty: string; price: string }>>([]);
  const [results, setResults] = useState<any[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // partner form
  const [pForm, setPForm] = useState<Partial<Partner> | null>(null);
  const [custHits, setCustHits] = useState<CustomerHit[]>([]);
  const [custLabel, setCustLabel] = useState('');
  const custTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 077: outright dispatches + §5.5 model switch ──────────────────────────
  const [outright, setOutright] = useState<OutrightDoc[] | null>(null);
  const [switches, setSwitches] = useState<SwitchEvent[] | null>(null);
  const [oCreating, setOCreating] = useState(false);
  const [oPartnerId, setOPartnerId] = useState('');
  const [oNote, setONote] = useState('');
  const [oLines, setOLines] = useState<Array<{ variationId: string; sku: string; name: string; qty: string; price: string }>>([]);
  const [oResults, setOResults] = useState<any[]>([]);
  const oTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The partner whose model switch is being confirmed, with their shelf. */
  const [switching, setSwitching] = useState<{ partner: Partner; shelf: ShelfSummary | null } | null>(null);

  // ── 085: the partner's private portal link ────────────────────────────────
  // The RAW token comes back exactly once (only its sha256 is stored), so this
  // modal is the ONLY chance to copy it — the copy says so in plain words.
  const [portalLink, setPortalLink] = useState<{ partnerName: string; url: string; plain: string } | null>(null);
  const [portalBusy, setPortalBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // sell-through / return entry
  const [sold, setSold] = useState<Record<string, string>>({});
  const [back, setBack] = useState<Record<string, string>>({});

  const loadPartners = () => api.get('/consignments/partners').then((r) => setPartners(payload<Partner[]>(r) ?? [])).catch(() => {});
  const loadList = () => api.get('/consignments').then((r) => setList(payload<Consignment[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  const loadReport = () => api.get('/consignments/report/sell-through').then((r) => setReport(payload<ReportRow[]>(r) ?? [])).catch(() => setReport([]));
  const loadSettlements = () => api.get('/consignments/settlements').then((r) => setSettlements(payload<Settlement[]>(r) ?? [])).catch(() => setSettlements([]));

  const loadOutright = () => api.get('/consignments/outright').then((r) => setOutright(payload<OutrightDoc[]>(r) ?? [])).catch(() => setOutright([]));
  const loadSwitches = () => api.get('/consignments/model-switches').then((r) => setSwitches(payload<SwitchEvent[]>(r) ?? [])).catch(() => setSwitches([]));

  useEffect(() => { loadPartners(); loadList(); }, []);
  useEffect(() => {
    if (tab === 'report') loadReport();
    if (tab === 'settlements') loadSettlements();
    if (tab === 'outright') loadOutright();
    if (tab === 'partners') loadSwitches();
  }, [tab]);

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setSold({}); setBack({});
    try {
      setDetail(payload<Consignment>(await api.get(`/consignments/${id}`)));
      setCreating(false);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

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

  const addLine = (r: any) => {
    const vid = r.variation_id ?? r.id;
    if (lines.some((l) => l.variationId === vid)) { setResults([]); return; }
    setLines([...lines, { variationId: vid, sku: r.sku ?? '', name: r.name, qty: '1', price: String(r.selling_price ?? r.price ?? '') }]);
    setResults([]);
  };

  const create = async () => {
    if (!partnerId) { setMsg('Choose the partner this stock is going to.'); return; }
    const body = lines
      .map((l) => ({ variationId: l.variationId, qty: Math.round(Number(l.qty) || 0), unitPrice: Number(l.price) || null }))
      .filter((l) => l.qty > 0);
    if (!body.length) { setMsg('Add at least one product with a quantity.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const c = payload<Consignment>(await api.post('/consignments', { partnerId, note: note.trim() || null, lines: body }));
      setOk('Draft created. Check it, then press "Send the stock" to print the challan.');
      setCreating(false); setPartnerId(''); setNote(''); setLines([]);
      loadList(); if (c?.id) openDetail(c.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const act = async (path: string, body?: any, successMsg?: string) => {
    if (!detail || busy) return;
    setBusy(true); setMsg(''); setOk('');
    try {
      const res = await api.post(`/consignments/${detail.id}/${path}`, body ?? {});
      setOk((res.data as any)?.plain || successMsg || 'Done.');
      await openDetail(detail.id); loadList();
      if (tab === 'report') loadReport();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const submitSold = () => {
    const body = Object.entries(sold)
      .map(([itemId, q]) => ({ itemId, qty: Math.round(Number(q) || 0) }))
      .filter((l) => l.qty > 0);
    if (!body.length) { setMsg('Enter how many units the partner sold.'); return; }
    act('sell-through', { lines: body }, 'Recorded — those units have left your stock.');
    setSold({});
  };
  const submitReturn = () => {
    const body = Object.entries(back)
      .map(([itemId, q]) => ({ itemId, qty: Math.round(Number(q) || 0) }))
      .filter((l) => l.qty > 0);
    if (!body.length) { setMsg('Enter how many units came back.'); return; }
    act('return', { lines: body }, 'Recorded — the unsold units are back in your own stock.');
    setBack({});
  };

  const savePartner = async () => {
    if (!pForm?.name?.trim()) { setMsg('Give the partner a name.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const body: any = {
        name: pForm.name, code: pForm.code, contactName: pForm.contact_name, phone: pForm.phone,
        gstin: pForm.gstin, city: pForm.city, state: pForm.state,
        marginPct: Number(pForm.margin_pct) || 0, taxPoint: pForm.tax_point || 'tax_at_transfer',
        isActive: pForm.is_active !== false,
        customerId: pForm.customer_id ?? null,
      };
      // The model can be CHOSEN for a brand-new partner (they hold nothing yet).
      // For an existing one it is deliberately not editable — see §5.5.
      if (!pForm.id) body.model = pForm.model === 'outright' ? 'outright' : 'consignment';
      if (pForm.id) await api.put(`/consignments/partners/${pForm.id}`, body);
      else await api.post('/consignments/partners', body);
      setOk('Partner saved.'); setPForm(null); setCustHits([]); setCustLabel(''); loadPartners();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const searchCustomers = (term: string) => {
    if (custTimer.current) clearTimeout(custTimer.current);
    const q = term.trim();
    if (q.length < 2) { setCustHits([]); return; }
    custTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/customers', { params: { search: q, limit: 6 } });
        const rows = payload<any[]>(res) ?? (res.data as any)?.customers ?? [];
        setCustHits(Array.isArray(rows) ? rows : []);
      } catch { /* keep last */ }
    }, 250);
  };

  // ── 077: outright dispatch ────────────────────────────────────────────────
  const oSearch = (term: string) => {
    if (oTimer.current) clearTimeout(oTimer.current);
    const q = term.trim();
    if (q.length < 2) { setOResults([]); return; }
    oTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setOResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep last */ }
    }, 250);
  };
  const oAddLine = (r: any) => {
    const vid = r.variation_id ?? r.id;
    if (oLines.some((l) => l.variationId === vid)) { setOResults([]); return; }
    setOLines([...oLines, { variationId: vid, sku: r.sku ?? '', name: r.name, qty: '1', price: '' }]);
    setOResults([]);
  };
  const sendOutright = async () => {
    if (!oPartnerId) { setMsg('Choose the partner buying this stock.'); return; }
    const body = oLines
      .map((l) => ({ variationId: l.variationId, qty: Math.round(Number(l.qty) || 0), unitPrice: Number(l.price) || null }))
      .filter((l) => l.qty > 0);
    if (!body.length) { setMsg('Add at least one product with a quantity.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const res = await api.post('/consignments/outright', {
        partnerId: oPartnerId, note: oNote.trim() || null, lines: body, dispatchNow: true,
      });
      setOk((res.data as any)?.plain || 'Sent and invoiced.');
      setOCreating(false); setOPartnerId(''); setONote(''); setOLines([]);
      loadOutright();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  // ── §5.5: open the LOUD confirmation, then do it ───────────────────────────
  const openSwitch = async (p: Partner) => {
    setMsg(''); setOk(''); setSwitching({ partner: p, shelf: null });
    try {
      setSwitching({ partner: p, shelf: payload<ShelfSummary>(await api.get(`/consignments/partners/${p.id}/at-shop`)) ?? null });
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  const confirmSwitch = async () => {
    if (!switching || busy) return;
    const target = switching.partner.model === 'outright' ? 'consignment' : 'outright';
    setBusy(true); setMsg(''); setOk('');
    try {
      const res = await api.post(`/consignments/partners/${switching.partner.id}/switch-model`, { model: target });
      setOk((res.data as any)?.plain || 'Model switched.');
      setSwitching(null);
      loadPartners(); loadList(); loadSwitches();
      if (tab === 'outright') loadOutright();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  // ── 085: share / revoke the partner's portal link ──────────────────────────
  const sharePortalLink = async (p: Partner) => {
    setMsg(''); setOk(''); setCopied(false); setPortalBusy(p.id);
    try {
      const data = payload<any>(await api.post(`/consignments/partners/${p.id}/portal-token`, {}));
      const path = data?.path ?? (data?.token ? `/partner/${data.token}` : '');
      if (!path) { setMsg('Could not create a portal link.'); return; }
      setPortalLink({
        partnerName: data?.partnerName ?? p.name,
        url: `${window.location.origin}${path}`,
        plain: data?.plain ?? '',
      });
      loadPartners();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Could not create a portal link. You need the "inventory.adjust" permission.');
    } finally { setPortalBusy(null); }
  };

  const revokePortalLink = async (p: Partner) => {
    setMsg(''); setOk(''); setPortalBusy(p.id);
    try {
      const data = payload<any>(await api.delete(`/consignments/partners/${p.id}/portal-token`));
      setOk(data?.plain ?? `${p.name}'s link no longer works.`);
      loadPartners();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Could not revoke that link.');
    } finally { setPortalBusy(null); }
  };

  const copyPortalLink = async () => {
    if (!portalLink) return;
    try {
      await navigator.clipboard.writeText(portalLink.url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the input is selectable, that is enough */ }
  };

  const challan = async () => {
    if (!detail) return;
    try {
      const res = await api.get(`/consignments/${detail.id}/challan`, { responseType: 'blob' });
      window.open(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
    } catch (e: any) { setMsg(e?.response?.data?.message ?? 'Could not build the challan'); }
  };

  const totals = (c: Consignment) => {
    const d = Number(c.qty_dispatched ?? 0), s = Number(c.qty_sold ?? 0), r = Number(c.qty_returned ?? 0);
    return { d, s, r, at: d - s - r };
  };

  return (
    <Page>
      <PageHeader
        title="Franchise partners"
        icon={Handshake}
        description="Two ways to work with a shop. CONSIGNMENT: your stock sits on their shelf and stays yours until they sell it. OUTRIGHT: they buy it, it is theirs the moment it ships, and you invoice them straight away."
        actions={
          tab === 'outright' ? (
            <Btn variant={oCreating ? 'outline' : 'primary'} onClick={() => { setOCreating((v) => !v); setMsg(''); setOk(''); }}>
              <Plus className="h-4 w-4" />{oCreating ? 'Cancel' : 'Sell stock to a partner'}
            </Btn>
          ) : (
            <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}>
              <Plus className="h-4 w-4" />{creating ? 'Cancel' : 'Send stock to a partner'}
            </Btn>
          )
        }
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      <TabBar
        active={tab}
        onChange={(k) => { setTab(k as any); setDetail(null); }}
        tabs={[
          { key: 'stock', label: 'Stock at partners' },
          { key: 'outright', label: 'Outright sales' },
          { key: 'partners', label: 'Partners' },
          { key: 'report', label: 'Sell-through report' },
          { key: 'settlements', label: 'Settlements' },
        ]}
      />

      {/* ── 085 PARTNER PORTAL — the share-link, shown ONCE ─────────────────── */}
      {portalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPortalLink(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Portal link for {portalLink.partnerName}</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Send this to the shop (WhatsApp, SMS — anything). No password: they open it on their phone and see
              what is on their shelf, <strong>tell you what they sold</strong>, and see their settlements and royalty bills.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={portalLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm"
              />
              <Btn onClick={copyPortalLink}>
                {copied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy</>}
              </Btn>
            </div>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Copy it now — we cannot show it again.</strong> Only a fingerprint of this link is stored, never the
              link itself, so nobody (including us) can look it up later. Lost it? Press "New portal link" and the old one
              stops working.
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Anyone holding this link can see this partner's shelf and money, and can report sales on their behalf.
              Use "Revoke link" the moment it should stop working.
            </p>
            <div className="mt-5 flex justify-end">
              <Btn variant="outline" onClick={() => setPortalLink(null)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── §5.5 MODEL SWITCH — the LOUD confirmation ───────────────────────── */}
      {switching && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <div className="text-base font-semibold text-amber-900">
                {switching.partner.model === 'outright'
                  ? `Put ${switching.partner.name} back on consignment?`
                  : `Switch ${switching.partner.name} to buying outright?`}
              </div>
              {!switching.shelf ? (
                <div className="text-sm text-amber-800">Checking what is still at their shop…</div>
              ) : (
                <>
                  <p className="text-sm font-medium text-amber-900">{switching.shelf.plain}</p>
                  {switching.partner.model !== 'outright' && switching.shelf.qty_at_partner > 0 && (
                    <StatGrid cols={4}>
                      <StatCard label="Units becoming a sale" value={num(switching.shelf.qty_at_partner)} tone="warn" sub="today" />
                      <StatCard label="Invoiced to them" value={inr(switching.shelf.value_at_price_minor)} tone="warn" sub="+ GST on top" />
                      <StatCard label="Your cost of it" value={inr(switching.shelf.value_at_cost_minor)} sub="leaves your stock value" />
                      <StatCard label="Consignments closing" value={num(switching.shelf.open_consignments)} sub="settled and closed" />
                    </StatGrid>
                  )}
                  <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
                    {switching.partner.model !== 'outright' ? (
                      <>
                        <li>Everything still on their shelf is treated as <strong>sold to them today</strong> — a deemed sale, invoiced with GST.</li>
                        <li>Those units leave your stock for good. Their open consignments are settled and closed.</li>
                        <li>From then on, anything you send them is <strong>theirs on arrival</strong> and invoiced immediately.</li>
                        <li><strong>This cannot be undone by editing a field.</strong> It is recorded permanently in the switch log — ask your CA if you are unsure about the tax date or value.</li>
                      </>
                    ) : (
                      <>
                        <li>Stock you send them from now on <strong>stays yours</strong> until they sell it.</li>
                        <li>No money moves — they hold nothing of yours right now.</li>
                        <li>The change is recorded permanently in the switch log.</li>
                      </>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="danger" onClick={confirmSwitch} disabled={busy || !switching.shelf}>
              <ArrowRightLeft className="h-4 w-4" />
              {switching.partner.model === 'outright'
                ? 'Yes — back to consignment'
                : switching.shelf && switching.shelf.qty_at_partner > 0
                  ? `Yes — sell them the ${switching.shelf.qty_at_partner} units now`
                  : 'Yes — switch to outright'}
            </Btn>
            <Btn variant="outline" onClick={() => setSwitching(null)} disabled={busy}>Keep it as it is</Btn>
          </div>
        </div>
      )}

      {/* ── SEND STOCK ─────────────────────────────────────────────────────── */}
      {creating && tab === 'stock' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Send stock to a partner</h3>
          <FilterBar>
            <Field label="Partner">
              {/* Outright partners are deliberately absent: they BUY their stock,
                  so parking ours on their shelf is a contradiction the backend
                  refuses too. */}
              <SelectInput value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Choose a partner…</option>
                {partners.filter((p) => p.is_active && p.model !== 'outright').map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — keeps {p.margin_pct}%</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Note (optional)">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. festive season stock" />
            </Field>
          </FilterBar>

          <div>
            <SearchInput placeholder="Search product name, brand or SKU to add…" onChange={(e) => search(e.target.value)} />
            {results.length > 0 && (
              <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                {results.map((r: any) => {
                  const vid = r.variation_id ?? r.id;
                  return (
                    <button key={vid} onClick={() => addLine(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Product</Th><Th>SKU</Th><Th num>Units to send</Th><Th num>They sell at (₹)</Th><Th /></THead>
                <TBody>
                  {lines.map((l, i) => (
                    <Tr key={l.variationId}>
                      <Td>{l.name}</Td>
                      <Td muted className="font-mono text-xs">{l.sku}</Td>
                      <Td num>
                        <input className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                          value={l.qty} onChange={(e) => { const n = [...lines]; n[i].qty = e.target.value; setLines(n); }} />
                      </Td>
                      <Td num>
                        <input className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                          value={l.price} placeholder="catalogue price"
                          onChange={(e) => { const n = [...lines]; n[i].price = e.target.value; setLines(n); }} />
                      </Td>
                      <Td num>
                        <button className="text-gray-400 hover:text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                          <X className="h-4 w-4" />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          )}
          <Btn onClick={create} disabled={busy}><Plus className="h-4 w-4" />Create draft</Btn>
        </div>
      )}

      {/* ── STOCK AT PARTNERS ──────────────────────────────────────────────── */}
      {tab === 'stock' && !detail && (
        list === null ? <div className="p-6 text-sm text-gray-500">Loading…</div>
          : list.length === 0
            ? <EmptyState icon={Store} title="No stock is out with a partner yet"
                description="Add a partner, then send them stock. It stays on your books until they sell it." />
            : (
              <TableShell>
                <table className="w-full text-sm">
                  <THead>
                    <Th>Challan no.</Th><Th>Partner</Th><Th>Status</Th>
                    <Th num>Sent</Th><Th num>Sold</Th><Th num>Returned</Th><Th num>Still there</Th>
                    <Th num>Unsettled</Th><Th />
                  </THead>
                  <TBody>
                    {list.map((c) => {
                      const t = totals(c);
                      return (
                        <Tr key={c.id}>
                          <Td className="font-mono text-xs">{c.consignment_number ?? '(draft)'}</Td>
                          <Td>{c.partner_name}</Td>
                          <Td><StatusChip status={c.status} /></Td>
                          <Td num>{num(t.d)}</Td>
                          <Td num>{num(t.s)}</Td>
                          <Td num>{num(t.r)}</Td>
                          <Td num className="font-semibold">{num(t.at)}</Td>
                          <Td num>{inr(c.unsettled_gross_minor)}</Td>
                          <Td num><Btn variant="outline" onClick={() => openDetail(c.id)}>Open</Btn></Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </table>
              </TableShell>
            )
      )}

      {/* ── ONE CONSIGNMENT ────────────────────────────────────────────────── */}
      {tab === 'stock' && detail && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {detail.consignment_number ?? 'Draft consignment'} · {detail.partner_name}
              </div>
              <div className="text-xs text-gray-500">
                Partner keeps {detail.margin_pct}% · {TAX_POINT_LABEL[detail.tax_point ?? ''] ?? detail.tax_point}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" onClick={() => setDetail(null)}>Back</Btn>
              {detail.status === 'draft' && (
                <>
                  <Btn onClick={() => act('dispatch', {}, 'Stock sent. It is still yours — it just sits at the partner now.')} disabled={busy}>
                    <Send className="h-4 w-4" />Send the stock
                  </Btn>
                  <Btn variant="danger" onClick={() => act('cancel', { reason: 'cancelled from admin' }, 'Cancelled.')} disabled={busy}>Cancel</Btn>
                </>
              )}
              {detail.consignment_number && <Btn variant="outline" onClick={challan}><FileText className="h-4 w-4" />Delivery challan</Btn>}
              {['dispatched', 'partially_settled'].includes(detail.status) && (
                <Btn variant="success" onClick={() => act('settle', {}, 'Settled.')} disabled={busy}>
                  <IndianRupee className="h-4 w-4" />Settle now
                </Btn>
              )}
              {['settled', 'partially_settled', 'dispatched'].includes(detail.status) && (
                <Btn variant="outline" onClick={() => act('close', {}, 'Consignment closed.')} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" />Close
                </Btn>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The stock below is still <strong>yours</strong> — it is only being held at {detail.partner_name}. It leaves your books when
            you record that the partner sold it. When GST becomes payable on a consignment depends on your agreement — confirm the
            tax point with your CA.
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>Sent</Th><Th num>Sold</Th><Th num>Returned</Th>
                <Th num>Still there</Th><Th num>They sell at</Th>
                {detail.status !== 'draft' && <><Th num>Sold now</Th><Th num>Came back</Th></>}
              </THead>
              <TBody>
                {(detail.items ?? []).map((it) => (
                  <Tr key={it.id}>
                    <Td>{it.product_name}</Td>
                    <Td muted className="font-mono text-xs">{it.sku}</Td>
                    <Td num>{num(it.qty_dispatched)}</Td>
                    <Td num>{num(it.qty_sold)}</Td>
                    <Td num>{num(it.qty_returned)}</Td>
                    <Td num className="font-semibold">{num(it.qty_at_partner)}</Td>
                    <Td num>{inr(it.unit_price_minor)}</Td>
                    {detail.status !== 'draft' && (
                      <>
                        <Td num>
                          <input className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            placeholder="0" value={sold[it.id] ?? ''}
                            onChange={(e) => setSold({ ...sold, [it.id]: e.target.value })} />
                        </Td>
                        <Td num>
                          <input className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            placeholder="0" value={back[it.id] ?? ''}
                            onChange={(e) => setBack({ ...back, [it.id]: e.target.value })} />
                        </Td>
                      </>
                    )}
                  </Tr>
                ))}
                {(detail.items ?? []).length === 0 && <EmptyRow colSpan={9}>No lines</EmptyRow>}
              </TBody>
            </table>
          </TableShell>

          {detail.status !== 'draft' && (
            <div className="flex flex-wrap gap-2">
              <Btn onClick={submitSold} disabled={busy}><Store className="h-4 w-4" />Partner sold these</Btn>
              <Btn variant="outline" onClick={submitReturn} disabled={busy}><RotateCcw className="h-4 w-4" />These came back</Btn>
            </div>
          )}

          {(detail.settlements ?? []).length > 0 && (
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>Settlement</Th><Th>Period</Th><Th num>Units sold</Th><Th num>They sold</Th>
                  <Th num>Their margin</Th><Th num>GST</Th><Th num>They owe you</Th>
                </THead>
                <TBody>
                  {(detail.settlements ?? []).map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-mono text-xs">{s.settlement_number}</Td>
                      <Td muted>{s.period_from} → {s.period_to}</Td>
                      <Td num>{num(s.qty_sold)}</Td>
                      <Td num>{inr(s.gross_minor)}</Td>
                      <Td num>−{inr(s.partner_margin_minor)}</Td>
                      <Td num>{inr(s.tax_minor)}</Td>
                      <Td num className="font-semibold">{inr(s.net_due_minor)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          )}
        </div>
      )}

      {/* ── OUTRIGHT SALES (077) ───────────────────────────────────────────── */}
      {tab === 'outright' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            An outright dispatch is a <strong>sale</strong>, not a loan of stock: the goods are the partner's the moment they
            ship, the units leave your stock straight away, and the money doc goes onto their account in the same action.
            Leave the price blank to bill them at your catalogue price less their agreed margin.
          </div>

          {oCreating && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Sell stock to a partner — theirs on arrival, invoiced now</h3>
              <FilterBar>
                <Field label="Partner (outright only)">
                  <SelectInput value={oPartnerId} onChange={(e) => setOPartnerId(e.target.value)}>
                    <option value="">Choose a partner…</option>
                    {partners.filter((p) => p.is_active && p.model === 'outright').map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — buys at catalogue −{p.margin_pct}%</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Note (optional)">
                  <TextInput value={oNote} onChange={(e) => setONote(e.target.value)} placeholder="e.g. new store opening order" />
                </Field>
              </FilterBar>
              {partners.filter((p) => p.is_active && p.model === 'outright').length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No partner buys outright yet. Add one on the <strong>Partners</strong> tab, or switch an existing partner over
                  there — switching turns whatever is on their shelf into a sale, so read the confirmation carefully.
                </div>
              )}

              <div>
                <SearchInput placeholder="Search product name, brand or SKU to add…" onChange={(e) => oSearch(e.target.value)} />
                {oResults.length > 0 && (
                  <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                    {oResults.map((r: any) => {
                      const vid = r.variation_id ?? r.id;
                      return (
                        <button key={vid} onClick={() => oAddLine(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                          <span className="min-w-0 truncate">{r.name}</span>
                          <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {oLines.length > 0 && (
                <TableShell>
                  <table className="w-full text-sm">
                    <THead><Th>Product</Th><Th>SKU</Th><Th num>Units they buy</Th><Th num>They pay (₹/unit)</Th><Th /></THead>
                    <TBody>
                      {oLines.map((l, i) => (
                        <Tr key={l.variationId}>
                          <Td>{l.name}</Td>
                          <Td muted className="font-mono text-xs">{l.sku}</Td>
                          <Td num>
                            <input className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                              value={l.qty} onChange={(e) => { const n = [...oLines]; n[i].qty = e.target.value; setOLines(n); }} />
                          </Td>
                          <Td num>
                            <input className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                              value={l.price} placeholder="catalogue − margin"
                              onChange={(e) => { const n = [...oLines]; n[i].price = e.target.value; setOLines(n); }} />
                          </Td>
                          <Td num>
                            <button className="text-gray-400 hover:text-red-600" onClick={() => setOLines(oLines.filter((_, j) => j !== i))}>
                              <X className="h-4 w-4" />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
              )}
              <Btn onClick={sendOutright} disabled={busy}>
                <ShoppingBag className="h-4 w-4" />Send it — theirs on arrival, invoiced now
              </Btn>
            </div>
          )}

          {outright === null ? <div className="p-6 text-sm text-gray-500">Loading…</div>
            : outright.length === 0
              ? <EmptyState icon={ShoppingBag} title="No outright sales yet"
                  description="An outright partner buys your stock upfront — it is theirs on arrival and invoiced immediately." />
              : (
                <>
                  <StatGrid cols={3}>
                    <StatCard label="Sold outright" value={inr(outright.filter((d) => d.status === 'invoiced').reduce((s, d) => s + Number(d.gross_minor), 0))} sub="goods value" />
                    <StatCard label="Invoiced with GST" value={inr(outright.filter((d) => d.status === 'invoiced').reduce((s, d) => s + Number(d.total_minor), 0))} tone="good" sub="on their account" />
                    <StatCard label="Units shipped" value={num(outright.filter((d) => d.status === 'invoiced').reduce((s, d) => s + Number(d.qty_total ?? 0), 0))} sub="no longer yours" />
                  </StatGrid>
                  <TableShell>
                    <table className="w-full text-sm">
                      <THead>
                        <Th>Doc no.</Th><Th>Partner</Th><Th>Status</Th><Th num>Units</Th>
                        <Th num>Goods</Th><Th num>GST</Th><Th num>They owe</Th><Th num>Your cost</Th><Th>When</Th>
                      </THead>
                      <TBody>
                        {outright.map((d) => (
                          <Tr key={d.id}>
                            <Td className="font-mono text-xs">{d.number ?? '(draft)'}</Td>
                            <Td>{d.partner_name}</Td>
                            <Td><StatusChip status={d.status === 'invoiced' ? 'completed' : d.status} label={d.status === 'invoiced' ? 'Sent & invoiced' : undefined} /></Td>
                            <Td num>{num(d.qty_total)}</Td>
                            <Td num>{inr(d.gross_minor)}</Td>
                            <Td num>{inr(d.tax_minor)}</Td>
                            <Td num className="font-semibold">{inr(d.total_minor)}</Td>
                            <Td num muted>{inr(d.cogs_minor)}</Td>
                            <Td muted className="text-xs">{(d.dispatched_at ?? d.created_at ?? '').slice(0, 10)}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </table>
                  </TableShell>
                </>
              )}
        </div>
      )}

      {/* ── PARTNERS ───────────────────────────────────────────────────────── */}
      {tab === 'partners' && (
        <div className="space-y-3">
          <Btn variant={pForm ? 'outline' : 'primary'} onClick={() => setPForm(pForm ? null : { margin_pct: 0, tax_point: 'tax_at_transfer', is_active: true })}>
            <Plus className="h-4 w-4" />{pForm ? 'Cancel' : 'Add partner'}
          </Btn>

          {pForm && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <FilterBar>
                <Field label="Shop / partner name"><TextInput value={pForm.name ?? ''} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} /></Field>
                <Field label="Short code"><TextInput value={pForm.code ?? ''} onChange={(e) => setPForm({ ...pForm, code: e.target.value })} placeholder="auto" /></Field>
                <Field label="Contact person"><TextInput value={pForm.contact_name ?? ''} onChange={(e) => setPForm({ ...pForm, contact_name: e.target.value })} /></Field>
                <Field label="Phone"><TextInput value={pForm.phone ?? ''} onChange={(e) => setPForm({ ...pForm, phone: e.target.value })} /></Field>
                <Field label="GSTIN"><TextInput value={pForm.gstin ?? ''} onChange={(e) => setPForm({ ...pForm, gstin: e.target.value })} /></Field>
                <Field label="City"><TextInput value={pForm.city ?? ''} onChange={(e) => setPForm({ ...pForm, city: e.target.value })} /></Field>
                <Field label="State"><TextInput value={pForm.state ?? ''} onChange={(e) => setPForm({ ...pForm, state: e.target.value })} /></Field>
                <Field label="Margin they keep (%)">
                  <TextInput value={String(pForm.margin_pct ?? 0)} onChange={(e) => setPForm({ ...pForm, margin_pct: Number(e.target.value) as any })} />
                </Field>
                <Field label="When is GST due?">
                  <SelectInput value={pForm.tax_point ?? 'tax_at_transfer'} onChange={(e) => setPForm({ ...pForm, tax_point: e.target.value })}>
                    <option value="tax_at_transfer">{TAX_POINT_LABEL.tax_at_transfer}</option>
                    <option value="tax_at_sell_through">{TAX_POINT_LABEL.tax_at_sell_through}</option>
                  </SelectInput>
                </Field>
                {!pForm.id ? (
                  <Field label="How do they take stock?">
                    <SelectInput value={pForm.model ?? 'consignment'} onChange={(e) => setPForm({ ...pForm, model: e.target.value })}>
                      <option value="consignment">Consignment — it stays yours until they sell it</option>
                      <option value="outright">Outright — they buy it, theirs on arrival</option>
                    </SelectInput>
                  </Field>
                ) : (
                  <Field label="How do they take stock?">
                    <div className="flex h-10 items-center gap-2">
                      <ModelBadge model={pForm.model} />
                      <span className="text-xs text-gray-500">changed only by a switch (see the list)</span>
                    </div>
                  </Field>
                )}
                <Field label="Credit customer (optional)">
                  {pForm.customer_id ? (
                    <div className="flex h-10 items-center gap-2">
                      <span className="truncate text-sm text-gray-700">{custLabel || 'Linked'}</span>
                      <button className="text-xs text-red-600 underline" onClick={() => { setPForm({ ...pForm, customer_id: null }); setCustLabel(''); }}>unlink</button>
                    </div>
                  ) : (
                    <TextInput placeholder="Search a customer to enforce a credit limit…" onChange={(e) => searchCustomers(e.target.value)} />
                  )}
                </Field>
              </FilterBar>
              {custHits.length > 0 && !pForm.customer_id && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                  {custHits.map((h) => (
                    <button key={h.customer_id}
                      onClick={() => { setPForm({ ...pForm, customer_id: h.customer_id }); setCustLabel([h.name, h.company, h.phone].filter(Boolean).join(' · ')); setCustHits([]); }}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="truncate">{h.name ?? h.company ?? 'Customer'}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{h.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Linking a customer lets us stop an <strong>outright</strong> dispatch that would push them past the credit limit
                you set for them under Customers ▸ Credit. Leave it blank and no limit is checked.
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>Ask your CA before you choose.</strong> Under Schedule I of the CGST Act, sending goods to an <em>agent</em> can
                count as a supply the moment they leave your godown — even though no money has changed hands. Whether your agreement is
                agency (tax when sent) or a consignment sale (tax when sold) depends on the contract, in particular whose name the partner
                invoices in. We default to the safer "tax when stock is SENT" and we will never change it silently.
              </div>
              <Btn onClick={savePartner} disabled={busy}>Save partner</Btn>
            </div>
          )}

          {partners.length === 0
            ? <EmptyState icon={Handshake} title="No consignment partners yet" description="A partner is any shop that holds your stock and sells it for a cut." />
            : (
              <TableShell>
                <table className="w-full text-sm">
                  <THead><Th>Partner</Th><Th>Code</Th><Th>How they take stock</Th><Th>Contact</Th><Th>Where</Th><Th num>Their margin</Th><Th>GST due</Th><Th>Their portal</Th><Th>Status</Th><Th /></THead>
                  <TBody>
                    {partners.map((p) => (
                      <Tr key={p.id}>
                        <Td className="font-medium">{p.name}</Td>
                        <Td muted className="font-mono text-xs">{p.code}</Td>
                        <Td>
                          <ModelBadge model={p.model} />
                          {p.model_switched_at && (
                            <div className="mt-0.5 text-[11px] text-gray-500">switched {String(p.model_switched_at).slice(0, 10)}</div>
                          )}
                        </Td>
                        <Td muted>{[p.contact_name, p.phone].filter(Boolean).join(' · ') || '—'}</Td>
                        <Td muted>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</Td>
                        <Td num>{p.margin_pct}%</Td>
                        <Td muted className="text-xs">{p.model === 'outright' ? 'On the sale (invoice on dispatch)' : (TAX_POINT_LABEL[p.tax_point] ?? p.tax_point)}</Td>
                        <Td>
                          {p.portal_link_live ? (
                            <div>
                              <Chip tone="green">Link live</Chip>
                              <div className="mt-0.5 text-[11px] text-gray-500">
                                {p.portal_last_seen_at
                                  ? `opened ${String(p.portal_last_seen_at).slice(0, 10)}`
                                  : 'not opened yet'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">{p.portal_token_revoked_at ? 'revoked' : 'no link'}</span>
                          )}
                        </Td>
                        <Td><StatusChip status={p.is_active ? 'active' : 'inactive'} /></Td>
                        <Td num>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Btn variant="outline" onClick={() => { setPForm(p); setCustLabel(p.customer_id ? 'Linked' : ''); }}>Edit</Btn>
                            <Btn variant="outline" disabled={portalBusy === p.id} onClick={() => sharePortalLink(p)}>
                              <Link2 className="h-4 w-4" />
                              {portalBusy === p.id ? 'Working…' : p.portal_link_live ? 'New portal link' : 'Share portal link'}
                            </Btn>
                            {p.portal_link_live && (
                              <Btn variant="outline" disabled={portalBusy === p.id} onClick={() => revokePortalLink(p)}>Revoke link</Btn>
                            )}
                            <Btn variant="outline" onClick={() => openSwitch(p)}>
                              <ArrowRightLeft className="h-4 w-4" />
                              {p.model === 'outright' ? 'Back to consignment' : 'Switch to outright'}
                            </Btn>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableShell>
            )}
        </div>
      )}

      {/* ── §5.5 SWITCH LOG (permanent, inside the Partners tab) ───────────── */}
      {tab === 'partners' && (switches?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <History className="h-4 w-4 text-gray-500" />Model switches — the permanent record
          </div>
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>When</Th><Th>Partner</Th><Th>Change</Th><Th num>Units deemed sold</Th>
                <Th num>Goods value</Th><Th num>Invoiced</Th><Th>Settlement</Th><Th num>Closed</Th>
              </THead>
              <TBody>
                {(switches ?? []).map((e) => (
                  <Tr key={e.id}>
                    <Td muted className="text-xs">{String(e.effective_date ?? e.switched_at).slice(0, 10)}</Td>
                    <Td>{e.partner_name}</Td>
                    <Td className="text-xs">
                      {MODEL_LABEL[e.from_model] ?? e.from_model} → <strong>{MODEL_LABEL[e.to_model] ?? e.to_model}</strong>
                    </Td>
                    <Td num>{num(e.deemed_qty)}</Td>
                    <Td num>{inr(e.deemed_gross_minor)}</Td>
                    <Td num className="font-semibold">{inr(e.deemed_invoice_total_minor)}</Td>
                    <Td muted className="font-mono text-xs">{e.settlement_number ?? '—'}</Td>
                    <Td num>{num(e.consignments_closed)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}

      {/* ── SELL-THROUGH REPORT ────────────────────────────────────────────── */}
      {tab === 'report' && (
        report === null ? <div className="p-6 text-sm text-gray-500">Loading…</div>
          : report.length === 0
            ? <EmptyState icon={Store} title="Nothing to report yet" description="Send stock to a partner and this shows how much of it is actually selling." />
            : (
              <div className="space-y-4">
                <StatGrid cols={4}>
                  <StatCard label="Units at partners" value={num(report.reduce((s, r) => s + Number(r.qty_at_partner), 0))} sub="still your stock" />
                  <StatCard label="Value sitting there" value={inr(report.reduce((s, r) => s + Number(r.value_at_partner_minor), 0))} sub="at your cost" />
                  <StatCard label="Sold but not settled" value={inr(report.reduce((s, r) => s + Number(r.unsettled_gross_minor), 0))} tone="warn" sub="money to collect" />
                  <StatCard label="Settled so far" value={inr(report.reduce((s, r) => s + Number(r.settled_net_minor), 0))} tone="good" sub="net of their margin" />
                </StatGrid>
                <TableShell>
                  <table className="w-full text-sm">
                    <THead>
                      <Th>Partner</Th><Th num>Sent</Th><Th num>Sold</Th><Th num>Returned</Th><Th num>Still there</Th>
                      <Th num>% sold</Th><Th num>Value there</Th><Th num>Unsettled</Th><Th num>Settled net</Th>
                    </THead>
                    <TBody>
                      {report.map((r) => (
                        <Tr key={r.partner_id}>
                          <Td className="font-medium">{r.partner_name}</Td>
                          <Td num>{num(r.qty_dispatched)}</Td>
                          <Td num>{num(r.qty_sold)}</Td>
                          <Td num>{num(r.qty_returned)}</Td>
                          <Td num className="font-semibold">{num(r.qty_at_partner)}</Td>
                          <Td num>{r.sell_through_pct}%</Td>
                          <Td num>{inr(r.value_at_partner_minor)}</Td>
                          <Td num>{inr(r.unsettled_gross_minor)}</Td>
                          <Td num>{inr(r.settled_net_minor)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
              </div>
            )
      )}

      {/* ── SETTLEMENTS ────────────────────────────────────────────────────── */}
      {tab === 'settlements' && (
        settlements === null ? <div className="p-6 text-sm text-gray-500">Loading…</div>
          : settlements.length === 0
            ? <EmptyState icon={IndianRupee} title="No settlements yet" description="Once a partner reports sales, settle the period and this is your record of it." />
            : (
              <TableShell>
                <table className="w-full text-sm">
                  <THead>
                    <Th>Settlement</Th><Th>Partner</Th><Th>Consignment</Th><Th>Period</Th><Th num>Units</Th>
                    <Th num>They sold</Th><Th num>Their margin</Th><Th num>GST</Th><Th num>They owe you</Th>
                  </THead>
                  <TBody>
                    {settlements.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-mono text-xs">{s.settlement_number}</Td>
                        <Td>{s.partner_name}</Td>
                        <Td muted className="font-mono text-xs">{s.consignment_number}</Td>
                        <Td muted>{s.period_from} → {s.period_to}</Td>
                        <Td num>{num(s.qty_sold)}</Td>
                        <Td num>{inr(s.gross_minor)}</Td>
                        <Td num>−{inr(s.partner_margin_minor)}</Td>
                        <Td num>{inr(s.tax_minor)}</Td>
                        <Td num className="font-semibold">{inr(s.net_due_minor)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableShell>
            )
      )}
    </Page>
  );
};

export default Consignment;
