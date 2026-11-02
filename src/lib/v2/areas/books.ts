/**
 * Books (books ROUTE_MAP): the chart, journals and reports, GST returns and HSN, receivables and payables, bank accounts, statements, reconciliation and rules, expenses (one-off and recurring), fixed assets, TDS/TCS and direct taxes, FX, dunning and credit control, marketplace settlements, scheduled jobs and report schedules, tax rules and return policies.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route, V2Ctx } from '../routes';
import { v2call, asList, backendGap, mapList } from '../http';
import { majorToMinor, minorToMajor } from '../money';
import { pageAs, shapeQuery, shapeBody, scaleDecimal } from '../shape';

/**
 * The Node books answers carried paise (`x_minor`, shown with `fmtMinor`); a v2 books view reads that same row key and
 * answers Money `x` instead (books views/macros.rs: `x: minor @ "x_minor"`), already rupees here (http.ts).
 * `paise('x', …)` adds `x_minor` (paise) beside every named rupee field at any depth; the legacy aliases add `xMinor`.
 */
const paise = (...keys: string[]) => {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return mapList(v, walk);
    if (!v || typeof v !== 'object') return v;
    const out: any = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    for (const k of keys) if (typeof v[k] === 'number' && v[`${k}_minor`] === undefined) out[`${k}_minor`] = majorToMinor(v[k]);
    return out;
  };
  return walk;
};
/** A bare v2 list → the `{rows, total}` object the page reads, its rows given their paise twins. */
const rowsPaise = (...keys: string[]) => { const p = paise(...keys); return (d: any) => pageAs('rows')(p(d)); };

/** ExpensesView {items, total, monthly} (books views/expenses.rs:89, a Page here) → `{rows, total, monthly}` + `*_minor` (Expenses.tsx:107). */
const expensePaise = paise('amount', 'gst', 'total');
const expenseList = (d: any) => (Array.isArray(d) ? { ...(pageAs('rows')(expensePaise(d)) as object), monthly: expensePaise((d as any).monthly ?? []) } : expensePaise(d));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** EinvoiceApplicabilityView (books api/einvoice.rs:96) → the credentials card's status (`CredStatus`); no secret is ever read back. */
const irpStatus = (d: any) => {
  const irp = d?.irp ?? {};
  return {
    configured: !!irp.configured, source: irp.source ?? null, missing: Array.isArray(irp.missing) ? irp.missing : [],
    environment: irp.environment ?? '', provider: '', gstin: '', username: '', baseUrl: '', pathPrefix: '',
    passwordSet: false, clientSecretSet: false, publicKeySet: false, enabled: d?.setting?.enabled ?? true,
    mode: irp.mode ?? null, note: irp.note ?? null,
  };
};

/** A v2 worklist row (books db/einvoice.rs:1406) → the row the e-invoicing table reads (`document_*`, `days_remaining`, `escalation_level`). */
const irnRow = (r: any) => ({
  ...r,
  document_id: r?.id, document_type: r?.kind, document_number: r?.number,
  state: r?.state ?? r?.einvoice_status ?? null, days_remaining: r?.days_left ?? null, escalation_level: r?.escalation ?? null,
});

/** EinvoiceGenerateView {outcome, message, state} (books api/einvoice.rs:334) → `{queued, state, validations}` the card reads. v2 asks the IRP on the click; "queued" = it has not answered yet. */
const irnGenerated = (d: any) => (d && typeof d === 'object' && 'outcome' in d
  ? { ...d, queued: d.outcome === 'pending' || d.outcome === 'busy', state: d.state?.status ?? d.outcome, validations: d.state?.validations ?? [], einvoice: d.state }
  : d);

/** GSTR-9: the v2 report names its parts `part_ii`…`part_vi`; the page (and the Node reply) read `partII`…`partVI`. */
const gstr9Parts = (d: any) => {
  if (!d || typeof d !== 'object') return d;
  const out: any = { ...d };
  for (const n of ['ii', 'iii', 'iv', 'v', 'vi']) {
    const snake = `part_${n}`;
    const camel = `part${n.toUpperCase()}`;
    if (out[camel] === undefined && out[snake] !== undefined) out[camel] = out[snake];
  }
  return out;
};

/** Series & gaps: v2 answers the series / gap list as `items`; the page reads `rows`. */
// GapSummaryView / GapListView carry `items` + a numeric `limit` (books views/ledger.rs:283, :315; api/gap_register.rs:85 `paged`), so
// the envelope normaliser has already made them an array with the rest (register_present, totals, counts …) as list metadata.
const itemsAsRows = (d: any) => (Array.isArray(d) ? pageAs('rows')(d) : (d && typeof d === 'object' && d.rows === undefined && Array.isArray(d.items) ? { ...d, rows: d.items } : d));

/**
 * A write the page still sends under its Node names: `fix` renames the body first, then the row's own typed `bs`
 * shapes it (that shaper drops unknown keys, so the old names never reached v2, which refuses a missing amount).
 */
const sendAs = (r: V2Route, fix: (b: any) => any): V2Route => ({ ...r, body: (c) => shapeBody(r.bs ?? null)({ ...c, body: fix(c.body) }) });
/** Rename body keys (a JSON body or multipart parts), e.g. `{ amountRupees: 'amount' }`; a key already sent under the new name wins. */
const renameKeys = (names: Record<string, string>) => (b: any) => {
  if (typeof FormData !== 'undefined' && b instanceof FormData) { const out = new FormData(); b.forEach((v, k) => out.append(names[k] ?? k, v)); return out; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
  const out: any = {};
  for (const [k, v] of Object.entries(b)) { const t = names[k]; if (!t) out[k] = v; else if (b[t] === undefined) out[t] = v; }
  return out;
};
/**
 * Node-era bodies send paise (`debitMinor`, `amountMinor`, `match.amount_min_minor`, `grossMinor` …) where the v2 input takes
 * Money `debit` / `amount_min` / `gross` (books api/ledger.rs:183, api/chart_of_accounts.rs:175-189, api/bank_rules.rs:105,
 * api/marketplace_settlement.rs:136-157): each `xMinor` / `x_minor` → `x` in rupees at any depth; the row's `m` makes it Money again.
 */
const minorKeysAsRupees = (v: any): any => {
  if (Array.isArray(v)) return v.map(minorKeysAsRupees);
  if (!v || typeof v !== 'object' || (typeof FormData !== 'undefined' && v instanceof FormData)) return v;
  const out: any = {};
  for (const [k, x] of Object.entries(v)) {
    const base = /^(.+?)(?:Minor|_minor)$/.exec(k)?.[1];
    if (base && (typeof x === 'number' || (typeof x === 'string' && x.trim() !== ''))) { if (v[base] === undefined) out[base] = minorToMajor(x); } else out[k] = minorKeysAsRupees(x);
  }
  return out;
};
const rupeeBody = (r: V2Route): V2Route => sendAs(r, minorKeysAsRupees);

/** A "server CSV" download (ExportMenu `format: 'csv'`, responseType blob) is the report's own v2 `…/export` route, same query struct. */
const csvOr = (path: string) => (c: V2Ctx) => `${path}${c.query.format === 'csv' ? '/export' : ''}`.replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(c.params[k] ?? ''));
/** Report screens send `comparePrior=1`; v2 reads a query flag only as `true`/`false` (kernel resource/src/request/typed.rs:446, a 400 otherwise). */
const comparePrior = (qs: readonly string[]) => shapeQuery(qs, (c) => ({ compare_prior: ['1', 'true', 1, true].includes(c.query.comparePrior as any) || undefined }));

/** OpeningBalancesView (books views/ledger.rs:47): the page reads `debitMinor` / `amountMinor` and a party's `ref` (v2 `party_ref`, views/ledger.rs:39). */
const openingPaise = paise('debit', 'credit', 'amount');
const openingReply = (d: any) => {
  const o = openingPaise(d);
  if (!o || typeof o !== 'object') return o;
  const party = (p: any) => (p && typeof p === 'object' && p.ref === undefined ? { ...p, ref: p.party_ref } : p);
  return { ...o, customers: Array.isArray(o.customers) ? o.customers.map(party) : o.customers, vendors: Array.isArray(o.vendors) ? o.vendors.map(party) : o.vendors };
};

/** CategoryTotalView {money_in, money_out} (books views/banking.rs:337, read from the row's `in_minor`/`out_minor`) → the paise `in_minor`/`out_minor` the category totals read (BankRules.tsx:117). */
const bankTotals = (d: any) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, in_minor: r?.in_minor ?? majorToMinor(r?.money_in), out_minor: r?.out_minor ?? majorToMinor(r?.money_out) })) : d);

/** SettlementView + SettlementLineView (books views/receivables.rs:394,412) → the paise the Marketplace payouts page reads (`net_minor`, `matched_amount_minor`, `lines[].expected_net_minor` …). */
const settlementPaise = paise('gross', 'commission', 'fees', 'tcs', 'tds', 'net', 'matched_amount', 'order_gross', 'expected_net');

/** Milli-percent back from the percent the row's `rs` produced: the tax pages divide `*_milli_pct` by 1000 themselves. */
const milli = (pct: unknown) => (typeof pct === 'number' ? scaleDecimal(pct, 3) : null);
/** A `(TaxBucketView)` list, one bucket per `key` (books views/direct_tax.rs:6) → the `{[key]: bucket}` map the pages walk with `Object.entries` (Tds.tsx:122, TcsRegister.tsx:98). */
const keyedBuckets = (list: unknown) => (Array.isArray(list) ? Object.fromEntries(list.map((b: any) => [String(b?.key ?? ''), b])) : list);
/** TdsRegisterView / TcsRegisterView (books views/direct_tax.rs:102, :182) → paise twins, each row's `<rateKey>` milli-percent, the summary buckets keyed. */
const taxRegister = (rateKey: string, ...keys: string[]) => {
  const p = paise(...keys);
  return (d: any) => {
    const x = p(d);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
    const rows = Array.isArray(x.rows) ? mapList(x.rows, (r: any) => ({ ...r, [rateKey]: r?.[rateKey] ?? milli(r?.rate) })) : x.rows;
    const s = x.summary;
    const sum = s && typeof s === 'object'
      ? { ...s, ...(s.by_section !== undefined ? { by_section: keyedBuckets(s.by_section) } : {}), ...(s.by_country !== undefined ? { by_country: keyedBuckets(s.by_country) } : {}) }
      : s;
    return { ...x, rows, summary: sum };
  };
};
/** TdsPreviewView / TcsComputationView (books views/direct_tax.rs:27, :120) → the `tdsMinor` / `tcsMinor` / `ratePct` the preview cards read (Tds.tsx:408, TcsRegister.tsx:226). */
const taxPreview = (d: any) => {
  const x = paise('tds', 'tcs', 'threshold', 'prior_fy_base', 'cumulative_base', 'taxable_base')(d);
  return x && typeof x === 'object' && !Array.isArray(x) ? { ...x, rate_pct: x.rate_pct ?? x.rate ?? null } : x;
};
/** TdsVendorView.tds_rate (milli, books views/direct_tax.rs:59) → `tds_rate_milli_pct`, which the vendor grid divides by 1000 (Tds.tsx:282). */
const tdsVendors = (d: any) => (Array.isArray(d) ? mapList(d, (v: any) => ({ ...v, tds_rate_milli_pct: v?.tds_rate_milli_pct ?? milli(v?.tds_rate) })) : d);
const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase());
/** The preview pages send rupees (`amount`) and `asOfDate`; v2 takes `amount_minor` (required) and `as_of` (books api/tds.rs:88, api/direct_taxes.rs:124). */
const previewQuery = (...pass: string[]) => (c: V2Ctx): Record<string, unknown> => {
  const q: any = c.query ?? {};
  const out: Record<string, unknown> = { amount_minor: q.amount_minor ?? majorToMinor(q.amount), as_of: q.as_of ?? q.asOf ?? q.asOfDate };
  for (const k of pass) out[k] = q[k] ?? q[camelKey(k)];
  return out;
};

/** AssetView / AssetTotalsView / DepreciationRowView (books views/expenses.rs:192-246) → `*_minor` paise and `wdv_rate_pct` (FixedAssets.tsx:162, :310, :354-376). */
const assetPaise = paise('cost', 'salvage', 'accumulated_depreciation', 'book_value', 'monthly', 'disposal_amount', 'accumulated', 'depreciation');
const assetRow = (a: any) => (a && typeof a === 'object' ? { ...a, wdv_rate_pct: a.wdv_rate_pct ?? a.wdv_rate ?? null } : a);
const assetRegister = (d: any) => { const x = assetPaise(d); return x && Array.isArray(x.rows) ? { ...x, rows: mapList(x.rows, assetRow) } : x; };
const assetSchedule = (d: any) => { const x = assetPaise(d); return x && x.asset ? { ...x, asset: assetRow(x.asset) } : x; };

/** FxRevaluationCurrencyView / FxRevaluationRecordView (books views/fx.rs:106, :136) name the INR legs `open_booked` / `open_at_period_rate`; the page reads the Node paise `openInrBookedMinor` / `openInrPeriodMinor` / `unrealised_minor` (FxRates.tsx:473-479, :515). */
const fxRevalRow = (c: any) => (c && typeof c === 'object' ? {
  ...c,
  open_inr_booked_minor: c.open_inr_booked_minor ?? majorToMinor(c.open_booked),
  open_inr_period_minor: c.open_inr_period_minor ?? majorToMinor(c.open_at_period_rate),
  unrealised_minor: c.unrealised_minor ?? majorToMinor(c.unrealised),
} : c);
const fxRevaluation = (d: any) => (d && typeof d === 'object' && !Array.isArray(d)
  ? { ...d, currencies: Array.isArray(d.currencies) ? mapList(d.currencies, fxRevalRow) : d.currencies, total_unrealised_minor: d.total_unrealised_minor ?? majorToMinor(d.total_unrealised) }
  : d);
/** FxConvertView {resolved, foreign, converted} (books views/fx.rs:82) → the Node `inrMajor` the converter prints (FxRates.tsx:214, :433). */
const fxConverted = (d: any) => (d && typeof d === 'object' && !Array.isArray(d)
  ? { ...d, inr_major: d.inr_major ?? (typeof d.converted === 'number' ? d.converted.toFixed(2) : null) }
  : d);

export const BOOKS_ROUTES: V2Route[] = [
  { m: 'GET', from: '/accounting/accounts', row: 'books accounting.ts', to: '/api/v2/books/accounts' },
  { m: 'GET', from: '/accounting/audit/verify', row: 'books accounting.ts', to: '/api/v2/books/audit/verify' },
  { m: 'GET', from: '/accounting/balance-sheet', row: 'books accounting.ts (dropped duplicate → reports/balance-sheet)', to: '/api/v2/books/reports/balance-sheet', query: (c) => ({ as_of: c.query.asOf ?? c.query.as_of ?? c.query.to }) },
  { m: 'GET', from: '/accounting/bills', row: 'books — no row', gap: 'the accounting bills list has no v2 route (books ROUTE_MAP: no row; vendor bills are make /bills)' },
  { m: 'GET', from: '/accounting/cash-flow', row: 'books accounting.ts (dropped duplicate → reports/cash-flow, method direct)', to: '/api/v2/books/reports/cash-flow', query: (c) => ({ from: c.query.from ?? c.query.startDate, to: c.query.to ?? c.query.endDate, method: c.query.method ?? 'direct' }) },
  { m: 'GET', from: '/accounting/coa/accounts', row: 'books accounting.ts', to: '/api/v2/books/accounts' },
  { m: 'POST', from: '/accounting/coa/accounts', row: 'books accounting.ts', to: '/api/v2/books/accounts', bs: {'account_type':'s','code':'s','name':'s','parent_code':'s'} },
  { m: 'PATCH', from: '/accounting/coa/accounts/:code', row: 'books accounting.ts', to: '/api/v2/books/accounts/{code}', bs: {'is_active':'b','name':'s','parent_code':'s'} },
  { m: 'DELETE', from: '/accounting/coa/accounts/:code', row: 'books accounting.ts', to: '/api/v2/books/accounts/{code}' },
  { m: 'GET', from: '/accounting/coa/opening-balances', row: 'books accounting.ts', to: '/api/v2/books/opening-balances', reply: openingReply }, // OpeningBalancesView views/ledger.rs:47; OpeningBalances.tsx:54-60 reads debitMinor/amountMinor/ref
  rupeeBody({ m: 'POST', from: '/accounting/coa/opening-balances', row: 'books accounting.ts', to: '/api/v2/books/opening-balances', bs: {'accounts':[{'code':'s','credit':'m','debit':'m'}],'customers':[{'amount':'m','label':'s','ref':'s'}],'opening_date':'s','vendors':[{'amount':'m','label':'s','ref':'s'}]}, reply: paise('total_debit', 'total_credit', 'opening_equity') }), // OpeningBalances.tsx:87 sends debitMinor/amountMinor (api/chart_of_accounts.rs:175-189 takes Money); OpeningPostedView views/ledger.rs:59, page reads totalDebitMinor
  { m: 'GET', from: '/accounting/config', row: 'books accounting.ts', to: '/api/v2/books/config' },
  { m: 'PUT', from: '/accounting/config', row: 'books accounting.ts', method: 'PATCH', to: '/api/v2/books/config', bs: {'gl_auto_posting':'b'} },
  // The IRP account's STATE is served (EinvoiceApplicabilityView.irp {configured, source, environment, missing}, books
  // api/einvoice.rs:96); its credentials are not: v2 has no route that reads or writes them.
  { m: 'GET', from: '/accounting/einvoice/credentials', row: 'books einvoice.rs:42 (applicability.irp)', to: '/api/v2/books/einvoice/applicability', reply: irpStatus },
  { m: 'PUT', from: '/accounting/einvoice/credentials', row: 'books — no row', gap: 'saving IRP / GSP credentials has no v2 route (the e-invoice API account is set up by Growcord; the status above is live)' },
  { m: 'POST', from: '/accounting/einvoice/credentials/test', row: 'books — no row', gap: 'testing IRP / GSP credentials has no v2 route (the e-invoice API account is set up by Growcord; the status above is live)' },
  {
    // v2 reports an IRN per BOOKS DOCUMENT (POST /books/einvoice/documents/{id}/generate, einvoice.rs:52; no body). The
    // worklist's "Generate" sends the row's document id; an order number typed in the card has no v2 lookup.
    m: 'POST', from: '/accounting/einvoice/generate', row: 'books einvoice.rs:52',
    run: async (c) => {
      const id = String(c.body?.documentId ?? c.body?.document_id ?? c.body?.orderId ?? '').trim();
      if (!UUID.test(id)) backendGap('Generating an IRN by order number has no v2 route: v2 reports an IRN per Books document — press "Generate" on the document in the worklist');
      return v2call('POST', `/api/v2/books/einvoice/documents/${encodeURIComponent(id)}/generate`, { data: {} });
    },
    reply: irnGenerated,
  },
  { m: 'GET', from: '/accounting/einvoice/pending', row: 'books accounting.ts', to: '/api/v2/books/einvoices/pending' },
  {
    // EinvoiceWorklistView {rows, counts, …} per tab (einvoice.rs:43, db/einvoice.rs:1281). The panel lists the open
    // documents with their countdown AND the IRNs generated, as one table.
    m: 'GET', from: '/accounting/einvoice/worklist', row: 'books einvoice.rs:43',
    run: async () => {
      const tabs = await Promise.all(['pending', 'failed', 'generated'].map((status) => v2call<any>('GET', '/api/v2/books/einvoice/worklist', { params: { status, limit: 100 } })));
      const rows = tabs.flatMap((t) => (Array.isArray(t?.rows) ? t.rows : []));
      return asList(rows.map(irnRow), { total: rows.length });
    },
  },
  { m: 'GET', from: '/accounting/gst-rates', row: 'books accounting.ts', to: '/api/v2/books/gst/rates', qs: ['as_of'], rs: {'registry_codes':[{'current_rate_pct':'r','versions':[{'rate_pct':'r'}]}],'tax_rules':[{'effective_rate':'r','static_rate':'r'}]} },
  { m: 'PUT', from: '/accounting/gst-rates/config', row: 'books accounting.ts', method: 'PATCH', to: '/api/v2/books/gst/rates/config', bs: {'date_effective_rates':'b','pos_rule':'s'} },
  { m: 'GET', from: '/accounting/gst-rates/preview', row: 'books accounting.ts', to: '/api/v2/books/gst/rates/preview', qs: ['as_of','tax_rule_id'], rs: {'rate':'r','static_rate':'r'} },
  { m: 'PUT', from: '/accounting/gst-rates/tax-rules/:id', row: 'books accounting.ts', method: 'PATCH', to: '/api/v2/books/gst/rates/tax-rules/{id}', bs: {'rule_code':'s'}, rs: {'rate':'r'} },
  { m: 'GET', from: '/accounting/gst-rates/timeline', row: 'books accounting.ts', to: '/api/v2/books/gst/rates/timeline', qs: ['as_of','code'] },
  { m: 'GET', from: '/accounting/gst/calendar', row: 'books accounting.ts', to: '/api/v2/books/gst/calendar', qs: ['months'] },
  { m: 'GET', from: '/accounting/gst/gstr1-draft', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr1', qs: ['from','gstin','to'] },
  { m: 'GET', from: '/accounting/gst/gstr1-portal-json', row: 'books returns.rs:27', to: '/api/v2/books/returns/gstr1/portal-json', qs: ['from','gstin','to'] }, // download (Gstr1.tsx ExportMenu)
  { m: 'POST', from: '/accounting/gst/gstr2b-reconcile', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr2b/reconcile', bs: {'entries':'j','file_name':'s','from':'s','gstin':'s','portal_json':'j','source':'s','to':'s'} },
  { m: 'GET', from: '/accounting/gst/gstr3b-summary', row: 'books accounting.ts', to: csvOr('/api/v2/books/gst/gstr3b'), qs: ['from','gstin','to'] }, // ?format=csv = the "Server CSV" download (Gstr3b.tsx:89) → books api/gst.rs:68 export
  { m: 'POST', from: '/accounting/gst/ims/auto-match', row: 'books accounting.ts', to: '/api/v2/books/gst/ims/auto-match', bs: {'from':'s','to':'s'} },
  { m: 'POST', from: '/accounting/gst/ims/decision', row: 'books accounting.ts', to: '/api/v2/books/gst/ims/decisions', bs: {'bucket':'s','decision':'s','doc_number':'s','from':'s','gstin':'s','match_key':'s','portal_done':'b','reason':'s','subject_type':'s','to':'s'} },
  { m: 'POST', from: '/accounting/gst/ims/import', row: 'books accounting.ts', to: '/api/v2/books/gst/ims/imports', bs: {'entries':'j','file_name':'s','from':'s','gstin':'s','portal_json':'j','source':'s','to':'s'} },
  { m: 'GET', from: '/accounting/gst/ims/itc-at-risk', row: 'books accounting.ts', to: '/api/v2/books/gst/ims/itc-at-risk', qs: ['from','to'] },
  { m: 'GET', from: '/accounting/gst/ims/worklist', row: 'books accounting.ts', to: csvOr('/api/v2/books/gst/ims/worklist'), qs: ['from','to'] }, // ?format=csv = the worklist CSV download (Itc2b.tsx:215) → books api/gst.rs:104 export
  { m: 'GET', from: '/accounting/gst/itc-register', row: 'books accounting.ts', to: '/api/v2/books/gst/itc-register', qs: ['from','gstin','to'] },
  { m: 'GET', from: '/accounting/gst/rate-check', row: 'books accounting.ts', to: '/api/v2/books/gst/rate-check', qs: ['as_of'] },
  { m: 'GET', from: '/accounting/gst/registrations', row: 'books accounting.ts', to: '/api/v2/books/gst/registrations' },
  { m: 'GET', from: '/accounting/gstr9/:fy', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr9/{fy}', qs: ['gstin'], reply: gstr9Parts },
  { m: 'GET', from: '/accounting/gstr9/:fy/9c', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr9/{fy}/reconciliation', qs: ['gstin'] },
  { m: 'GET', from: '/accounting/gstr9/:fy/csv', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr9/{fy}/export', qs: ['gstin'] }, // download
  { m: 'GET', from: '/accounting/gstr9/:fy/filing', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr9/{fy}/filing' },
  { m: 'POST', from: '/accounting/gstr9/:fy/save', row: 'books accounting.ts', to: '/api/v2/books/gst/gstr9/{fy}/save', bs: 'j' },
  { m: 'GET', from: '/accounting/hsn-summary', row: 'books accounting.ts', to: csvOr('/api/v2/books/gst/hsn-summary'), qs: ['from','to'] }, // ?format=csv = the "Server CSV" download (HsnSummary.tsx:100) → books api/hsn_summary.rs:32 export
  { m: 'GET', from: '/accounting/journals', row: 'books accounting.ts', to: '/api/v2/books/journals', qs: ['limit','offset'], reply: paise('total_debit') }, // Page<JournalRowView> views/ledger.rs:95; Journals.tsx:207 + AccountingDashboard read total_debit_minor
  rupeeBody({ m: 'POST', from: '/accounting/journals', row: 'books accounting.ts', to: '/api/v2/books/journals', bs: {'journal_date':'s','lines':[{'account_code':'s','credit':'m','debit':'m','narration':'s'}],'narration':'s'} }), // JournalLineIn api/ledger.rs:183 (Money debit/credit); Journals.tsx:102 sends lines[].debitMinor
  { m: 'GET', from: '/accounting/journals/:id', row: 'books accounting.ts', to: '/api/v2/books/journals/{id}', reply: paise('debit', 'credit') }, // JournalView views/ledger.rs:121; Journals.tsx:223 reads entries[].debit_minor
  { m: 'POST', from: '/accounting/journals/:id/reverse', row: 'books accounting.ts', to: '/api/v2/books/journals/{id}/reverse', bs: {'journal_date':'s','narration':'s'} },
  { m: 'GET', from: '/accounting/ops/invariants', row: 'books accounting.ts', to: '/api/v2/books/ops/invariants', qs: ['run'] },
  { m: 'GET', from: '/accounting/ops/outbox', row: 'books accounting.ts', to: '/api/v2/books/ops/outbox' },
  { m: 'GET', from: '/accounting/period-lock', row: 'books accounting.ts', to: '/api/v2/books/period-lock' },
  { m: 'POST', from: '/accounting/period-lock', row: 'books accounting.ts', to: '/api/v2/books/period-lock', bs: {'date':'s','note':'s'} },
  { m: 'GET', from: '/accounting/reconciliation/stock', row: 'books accounting.ts', to: '/api/v2/books/reconciliation/stock' },
  { m: 'GET', from: '/accounting/reports/account-ledger', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/account-ledger'), qs: ['account_code','from','to'], reply: paise('opening_balance', 'opening_natural', 'closing_balance', 'closing_natural', 'period_debit', 'period_credit', 'debit', 'credit', 'running_balance') }, // AccountLedgerView views/reports.rs:190; GeneralLedger.tsx reads openingBalanceMinor, lines[].debitMinor
  { m: 'GET', from: '/accounting/reports/balance-sheet', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/balance-sheet'), qs: ['as_of','compare_prior'], query: comparePrior(['as_of','compare_prior']), reply: paise('total_assets', 'total_liabilities', 'total_equity', 'retained_earnings', 'current_period_earnings', 'imbalance', 'cash_and_bank', 'subtotal', 'prior_subtotal', 'balance', 'prior_balance') }, // BalanceSheetView views/reports.rs:68; FinancialStatements.tsx:156-186 reads totalAssetsMinor, sections' subtotalMinor, accounts' balanceMinor
  { m: 'GET', from: '/accounting/reports/cash-flow', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/cash-flow'), qs: ['from','method','to'], reply: paise('opening_cash', 'closing_cash', 'net_change', 'net', 'amount', 'prior_amount') }, // CashFlowView views/reports.rs:99; FinancialStatements.tsx:336,399-402 reads openingCashMinor, bucket netMinor, lines' amountMinor
  { m: 'GET', from: '/accounting/reports/equity-statement', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/equity-statement'), qs: ['from','to'], reply: paise('capital', 'retained_earnings', 'current_earnings', 'total', 'profit_for_period', 'owner_contributions', 'transfer_to_retained', 'other_movements') }, // EquityStatementView views/reports.rs:127; FinancialStatements.tsx:452-488 reads capitalMinor, totalMinor, profitForPeriodMinor
  { m: 'GET', from: '/accounting/reports/p-and-l', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/profit-and-loss'), qs: ['compare_prior','from','to'], query: comparePrior(['compare_prior','from','to']), reply: paise('amount', 'prior_amount', 'subtotal', 'prior_subtotal', 'total_income', 'total_expense', 'gross_profit', 'net_profit') }, // ProfitLossView views/reports.rs:28; FinancialStatements.tsx:217-250 reads lines' amountMinor, subtotalMinor, netProfitMinor
  { m: 'GET', from: '/accounting/reports/ratios', row: 'books accounting.ts', to: csvOr('/api/v2/books/reports/ratios'), qs: ['from','to'] }, // server CSV → /reports/ratios/export (api/financial_reports.rs:54); the JSON (RatiosView views/reports.rs:155, `inputs` json keeps *Minor) already matches
  { m: 'GET', from: '/accounting/series', row: 'books accounting.ts', to: '/api/v2/books/document-series' },
  { m: 'GET', from: '/accounting/series-gaps', row: 'books accounting.ts', to: '/api/v2/books/series-gaps', qs: ['doc_type','fy','limit','series_code','unadjudicated'], reply: itemsAsRows },
  { m: 'POST', from: '/accounting/series-gaps/adjudicate-all', row: 'books accounting.ts', to: '/api/v2/books/series-gaps/adjudicate', bs: {'doc_type':'s','reason':'s'} },
  { m: 'GET', from: '/accounting/series-gaps/detect', row: 'books accounting.ts', to: '/api/v2/books/series-gaps/detect', qs: ['doc_type','only_with_gaps'] },
  { m: 'POST', from: '/accounting/series-gaps/record', row: 'books accounting.ts', to: '/api/v2/books/series-gaps', bs: {'doc_type':'s','fy':'s','gap_numbers':['i'],'reason':'s','series_code':'s'} },
  { m: 'GET', from: '/accounting/series-gaps/summary', row: 'books accounting.ts', to: '/api/v2/books/series-gaps/summary', reply: itemsAsRows },
  { m: 'GET', from: '/accounting/statutory-rules', row: 'books accounting.ts', to: '/api/v2/books/statutory-rules' },
  { m: 'GET', from: '/accounting/trial-balance', row: 'books accounting.ts', to: '/api/v2/books/reports/trial-balance', qs: ['as_of'], reply: paise('debit', 'credit', 'total_debit', 'total_credit') }, // TrialBalanceView views/ledger.rs:85; TrialBalance.tsx reads *_minor
  { m: 'POST', from: '/accounting/year-end-close', row: 'books accounting.ts', to: '/api/v2/books/year-end-close', bs: {'fy_end':'s'} },
  { m: 'GET', from: '/ap/ageing', row: 'books ar.ts', to: csvOr('/api/v2/books/payables/ageing'), qs: ['as_of'] }, // "Server CSV" (format=csv, Payables.tsx:163) → GET /payables/ageing/export (books api/ap.rs:33); the JSON route answered JSON into the .csv
  { m: 'GET', from: '/ap/msme-exposure', row: 'books ar.ts', to: csvOr('/api/v2/books/payables/msme-exposure'), qs: ['as_of'] }, // format=csv (Payables.tsx:164,194) → /payables/msme-exposure/export (books api/ap.rs:36)
  { m: 'GET', from: '/ap/vendors', row: 'books ar.ts', to: '/api/v2/books/payables/vendors', qs: ['q'], reply: pageAs('vendors') }, // bare Vec<VendorMsmeView> (books views/receivables.rs:163); Payables.tsx:297 reads .vendors
  { m: 'PUT', from: '/ap/vendors/:id/msme', row: 'books ar.ts', method: 'PATCH', to: '/api/v2/books/payables/vendors/{id}/msme', bs: {'msme_classification':'s','payment_terms_days':'i','udyam_number':'s'} },
  { m: 'GET', from: '/ar/statement/:customerId', row: 'books ar.ts', to: csvOr('/api/v2/books/customers/{customerId}/statement'), qs: ['from','to'] }, // format=csv (Receivables.tsx:275) → /statement/export (books api/ar.rs:43)
  { m: 'GET', from: '/ar/statement/:customerId/pdf', row: 'books ar.ts', to: '/api/v2/books/customers/{customerId}/statement/pdf', qs: ['from','inline','to'] }, // download
  { m: 'POST', from: '/ar/statement/:customerId/send', row: 'books ar.ts', to: '/api/v2/books/customers/{customerId}/statement/send', bs: {'channel':'s','from':'s','to':'s','to_date':'s'} },
  { m: 'GET', from: '/assets', row: 'books expenses.ts', to: '/api/v2/books/assets', qs: ['category','status'], rs: {'rows':[{'wdv_rate':'r'}]}, reply: assetRegister }, // AssetRegisterView views/expenses.rs:229; FixedAssets.tsx:74 reads rows[].cost_minor, totals.accumulated_minor
  sendAs({ m: 'POST', from: '/assets', row: 'books expenses.ts', to: '/api/v2/books/assets', bs: {'category':'s','cost':'m','method':'s','name':'s','notes':'s','paid_from':'s','purchase_date':'s','salvage':'m','useful_life_months':'i','wdv_rate':'r'} }, (b) => ({ ...b, cost: b?.cost ?? b?.costRupees, salvage: b?.salvage ?? b?.salvageRupees, wdv_rate: b?.wdv_rate ?? b?.wdvRate ?? b?.wdvRatePct })), // AssetIn api/assets.rs:133 (cost required); FixedAssets.tsx:107 sends costRupees/salvageRupees/wdvRatePct
  sendAs({ m: 'POST', from: '/assets/:id/dispose', row: 'books expenses.ts', to: '/api/v2/books/assets/{id}/dispose', bs: {'disposal_date':'s','proceeds':'m','proceeds_to':'s'} }, renameKeys({ proceedsRupees: 'proceeds' })), // DisposeIn api/assets.rs:189; FixedAssets.tsx:402 sends proceedsRupees
  { m: 'GET', from: '/assets/:id/schedule', row: 'books expenses.ts', to: '/api/v2/books/assets/{id}/schedule', rs: {'asset':{'wdv_rate':'r'}}, reply: assetSchedule }, // AssetScheduleView views/expenses.rs:249; FixedAssets.tsx:354-376 reads asset.*_minor, wdv_rate_pct, rows[].depreciation_minor
  { m: 'GET', from: '/assets/categories', row: 'books expenses.ts', to: '/api/v2/books/assets/categories' },
  { m: 'POST', from: '/assets/run-depreciation', row: 'books expenses.ts', to: '/api/v2/books/assets/depreciation', bs: {'period':'s'}, reply: paise('total_depreciated', 'amount') }, // DepreciationRunView views/expenses.rs:288; FixedAssets.tsx:139 reads totalDepreciatedMinor
  { m: 'GET', from: '/bank-accounts', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts', reply: paise('balance', 'opening_balance') }, // BankAccountView views/banking.rs:6; BankAccounts.tsx:93 reads balance_minor
  sendAs({ m: 'POST', from: '/bank-accounts', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts', bs: {'account_number':'s','account_type':'s','bank_code':'s','gl_account_code':'s','ifsc':'s','name':'s','opening_balance':'m','owner_scope':'s'} }, renameKeys({ openingRupees: 'opening_balance' })), // NewAccountIn api/bank_accounts.rs:124; BankAccounts.tsx:378 sends openingRupees
  { m: 'PATCH', from: '/bank-accounts/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}', bs: {'account_number':'s','bank_code':'s','ifsc':'s','is_active':'b','name':'s','owner_scope':'s','statement_password':'s'} },
  { m: 'GET', from: '/bank-accounts/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}' },
  { m: 'PUT', from: '/bank-accounts/:id', row: 'books bankAccounts.ts (dropped second registration → PATCH)', method: 'PATCH', to: '/api/v2/books/bank-accounts/{id}', bs: { account_number: 's', bank_code: 's', ifsc: 's', is_active: 'b', name: 's', owner_scope: 's', statement_password: 's' } },
  sendAs({ m: 'POST', from: '/bank-accounts/:id/card-payment', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}/card-payment', bs: {'amount':'m','contra_account_code':'s','date':'s','narration':'s','reference':'s'} }, renameKeys({ amountRupees: 'amount' })), // MovementIn api/bank_accounts.rs:298 (Money amount required); BankAccounts.tsx:445 sends amountRupees
  sendAs({ m: 'POST', from: '/bank-accounts/:id/deposit', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}/deposit', bs: {'amount':'m','contra_account_code':'s','date':'s','narration':'s','reference':'s'} }, renameKeys({ amountRupees: 'amount' })), // MovementIn api/bank_accounts.rs:298 (Money amount required); BankAccounts.tsx:445 sends amountRupees
  { m: 'GET', from: '/bank-accounts/:id/transactions', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}/transactions', qs: ['from','limit','offset','to'], reply: paise('amount') }, // Page<BankTxnView> views/banking.rs:29; BankAccounts.tsx:295 reads amount_minor
  sendAs({ m: 'POST', from: '/bank-accounts/:id/withdraw', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/{id}/withdraw', bs: {'amount':'m','contra_account_code':'s','date':'s','narration':'s','reference':'s'} }, renameKeys({ amountRupees: 'amount' })), // MovementIn api/bank_accounts.rs:298 (Money amount required); BankAccounts.tsx:445 sends amountRupees
  { m: 'GET', from: '/bank-accounts/meta/banks', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/banks' },
  sendAs({ m: 'POST', from: '/bank-accounts/transfer', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-accounts/transfers', bs: {'amount':'m','date':'s','dest_bank_account_id':'s','narration':'s','reference':'s','source_bank_account_id':'s'} }, renameKeys({ amountRupees: 'amount' })), // TransferIn api/bank_accounts.rs:370; BankAccounts.tsx:438 sends amountRupees
  { m: 'POST', from: '/bank-recon/lines/:lineId/book', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/book', bs: {'contra_account_code':'s'} },
  { m: 'POST', from: '/bank-recon/lines/:lineId/ignore', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/ignore', bs: {'reason':'s'} },
  { m: 'POST', from: '/bank-recon/lines/:lineId/match', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/match', bs: {'gl_entry_id':'s'} },
  { m: 'POST', from: '/bank-recon/lines/:lineId/unmatch', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/unmatch', bs: 'j' },
  { m: 'GET', from: '/bank-recon/statements', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements', qs: ['account','bank_account_id'] },
  { m: 'DELETE', from: '/bank-recon/statements/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}' },
  { m: 'GET', from: '/bank-recon/statements/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}', reply: paise('debit', 'credit') }, // StatementDetailView views/banking.rs:107; BankRecon.tsx:530 reads lines[].credit_minor/debit_minor
  { m: 'PATCH', from: '/bank-recon/statements/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}', bs: {'bank_account_id':'s'} },
  { m: 'POST', from: '/bank-recon/statements/:id/auto-match', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}/auto-match', bs: 'j' },
  { m: 'POST', from: '/bank-recon/statements/:id/book-suggested', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}/book-suggested', bs: {'line_ids':['s']} },
  { m: 'GET', from: '/bank-recon/statements/:id/summary', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}/summary', reply: paise('difference') }, // ReconSummaryView views/banking.rs:136 (statement/book/closing_check JSON already carry *Minor); BankRecon.tsx:389 reads differenceMinor
  { m: 'GET', from: '/bank-recon/statements/:id/unmatched', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements/{id}/unmatched', reply: paise('debit', 'credit') }, // UnmatchedView views/banking.rs:128; BankRecon.tsx:479,498 read *_minor
  sendAs({ m: 'POST', from: '/bank-recon/upload', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-statements', bs: {'#mp':'j','account':'s','bank_account_id':'s','bank_code':'s','closing':'s','file':'f','opening':'s','password':'s'} }, renameKeys({ openingRupees: 'opening', closingRupees: 'closing' })), // parts opening/closing (major-unit text) api/bank_recon.rs:277-282; BankRecon.tsx:207 sends openingRupees/closingRupees
  { m: 'GET', from: '/bank-rules', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules', qs: ['active_only'], reply: paise('amount_min', 'amount_max') }, // BankRuleView.match views/banking.rs:226; BankRules.tsx:104 reads match.amount_min_minor
  rupeeBody({ m: 'POST', from: '/bank-rules', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules', bs: {'action':{'account_code':'s','category':'s','label':'s','mark_as':'s'},'active':'b','match':{'amount_max':'m','amount_min':'m','contains':'s','direction':'s','regex':'s'},'name':'s','priority':'i'} }), // MatchIn api/bank_rules.rs:97 (Money amount_min/max); BankRules.tsx:86 sends match.amount_min_minor paise
  { m: 'DELETE', from: '/bank-rules/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/{id}' },
  rupeeBody({ m: 'PUT', from: '/bank-rules/:id', row: 'books bankAccounts.ts', method: 'PATCH', to: '/api/v2/books/bank-rules/{id}', bs: {'action':{'account_code':'s','category':'s','label':'s','mark_as':'s'},'active':'b','match':{'amount_max':'m','amount_min':'m','contains':'s','direction':'s','regex':'s'},'name':'s','priority':'i'} }), // MatchIn api/bank_rules.rs:97 (Money amount_min/max); BankRules.tsx:86 sends match.amount_min_minor paise
  { m: 'GET', from: '/bank-rules/:id', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/{id}' },
  { m: 'POST', from: '/bank-rules/apply', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/apply', bs: {'only_uncategorised':'b','statement_id':'s'} },
  { m: 'POST', from: '/bank-rules/describe', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/describe', bs: {'action':{'account_code':'s','category':'s','label':'s','mark_as':'s'},'match':{'amount_max':'m','amount_min':'m','contains':'s','direction':'s','regex':'s'}} },
  { m: 'POST', from: '/bank-rules/lines/:lineId/clear', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/clear', bs: 'j' },
  { m: 'POST', from: '/bank-rules/lines/:lineId/confirm', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/{lineId}/confirm', bs: {'account_code':'s','category':'s','label':'s','mark_as':'s'} },
  { m: 'GET', from: '/bank-rules/lines/list', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines', qs: ['limit','state','statement_id'], reply: paise('debit', 'credit') }, // RuleLinesView views/banking.rs:298; BankRules.tsx:592 reads lines[].credit_minor
  { m: 'GET', from: '/bank-rules/lines/totals', row: 'books bankAccounts.ts', to: '/api/v2/books/statement-lines/totals', qs: ['confirmed_only','from','to'], reply: bankTotals }, // CategoryTotalView views/banking.rs:337 (money_in/money_out); BankRules.tsx:712 reads in_minor/out_minor
  { m: 'GET', from: '/bank-rules/options', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/options' },
  rupeeBody({ m: 'POST', from: '/bank-rules/preview', row: 'books bankAccounts.ts', to: '/api/v2/books/bank-rules/preview', bs: {'action':{'account_code':'s','category':'s','label':'s','mark_as':'s'},'active':'b','match':{'amount_max':'m','amount_min':'m','contains':'s','direction':'s','regex':'s'},'name':'s','priority':'i','sample_size':'i','statement_id':'s'}, reply: paise('debit', 'credit') }), // RulePreviewView views/banking.rs:306; BankRules.tsx:439 reads sample[].credit_minor
  { m: 'PUT', from: '/credit-control/hold/:customerId', row: 'books ar.ts', method: 'POST', to: '/api/v2/books/credit-control/customers/{customerId}/hold', bs: {'on_hold':'b','reason':'s'} },
  { m: 'PUT', from: '/credit-control/settings/:customerId', row: 'books ar.ts', method: 'PATCH', to: '/api/v2/books/credit-control/customers/{customerId}', bs: {'credit_limit':'m','note':'s','payment_terms_days':'i'} },
  { m: 'GET', from: '/credit-control/status/:customerId', row: 'books ar.ts', to: '/api/v2/books/credit-control/customers/{customerId}' },
  { m: 'GET', from: '/credit-control/watchlist', row: 'books ar.ts', to: '/api/v2/books/credit-control/watchlist' },
  { m: 'GET', from: '/direct-taxes/challans', row: 'books directTaxes.ts', to: '/api/v2/books/tax-challans', qs: ['challan_type','fy'], reply: paise('total_base', 'total_tax', 'interest', 'fee') }, // Vec<TaxChallanView> views/direct_tax.rs:190; Tds.tsx:523 reads total_base_minor/total_tax_minor
  { m: 'GET', from: '/direct-taxes/challans/:id', row: 'books directTaxes.ts', to: '/api/v2/books/tax-challans/{id}' },
  { m: 'PUT', from: '/direct-taxes/challans/:id/deposit', row: 'books directTaxes.ts', method: 'POST', to: '/api/v2/books/tax-challans/{id}/deposit', bs: {'bsr_code':'s','challan_serial':'s','deposited_on':'s','fee':'m','interest':'m','note':'s','status':'s'} },
  { m: 'GET', from: '/direct-taxes/challans/:id/pdf', row: 'books directTaxes.ts', to: '/api/v2/books/tax-challans/{id}/pdf', qs: ['inline'] }, // download
  { m: 'POST', from: '/direct-taxes/challans/generate', row: 'books directTaxes.ts', to: '/api/v2/books/tax-challans', bs: {'challan_type':'s','deductor_name':'s','form':'s','from':'s','note':'s','tan':'s','to':'s'} },
  { m: 'GET', from: '/direct-taxes/form16a/:vendorId', row: 'books directTaxes.ts', to: '/api/v2/books/form16a/{vendorId}', qs: ['form','inline','quarter'], rs: {'rows':[{'rate':'r'}]} },
  { m: 'POST', from: '/direct-taxes/form16a/:vendorId/issue', row: 'books directTaxes.ts', to: '/api/v2/books/form16a/{vendorId}/issue', bs: {'form':'s','quarter':'s'} },
  { m: 'GET', from: '/direct-taxes/form16a/:vendorId/pdf', row: 'books directTaxes.ts', to: '/api/v2/books/form16a/{vendorId}/pdf', qs: ['form','inline','quarter'] }, // download
  { m: 'GET', from: '/direct-taxes/form16a/deductees', row: 'books directTaxes.ts', to: '/api/v2/books/form16a/deductees', qs: ['quarter'], reply: paise('base', 'tds') }, // Vec<Form16aDeducteeView> views/direct_tax.rs:216; Tds.tsx:645 reads base_minor/tds_minor
  { m: 'POST', from: '/direct-taxes/tcs/collect', row: 'books directTaxes.ts', to: '/api/v2/books/tcs/collections', bs: {'amount':'m','collected_on':'s','collectee_id':'s','collectee_name':'s','invoice_ref':'s','nature':'s','note':'s','order_id':'s','pan':'s'}, rs: {'computation':{'rate':'r'}} },
  { m: 'GET', from: '/direct-taxes/tcs/natures', row: 'books directTaxes.ts', to: '/api/v2/books/tcs/natures' },
  { m: 'GET', from: '/direct-taxes/tcs/preview', row: 'books directTaxes.ts', to: '/api/v2/books/tcs/preview', qs: ['amount_minor','as_of','collectee_id','nature','pan'], rs: {'rate':'r'}, query: previewQuery('nature', 'pan', 'collectee_id'), reply: taxPreview }, // TcsPreviewIn api/direct_taxes.rs:124 + TcsComputationView views/direct_tax.rs:120; TcsRegister.tsx:205 sends amount (rupees)/asOfDate, reads tcsMinor/ratePct
  { m: 'GET', from: '/direct-taxes/tcs/register', row: 'books directTaxes.ts', to: csvOr('/api/v2/books/tcs/register'), qs: ['from','fy','include_zero','quarter','to'], rs: {'rows':[{'rate':'r'}]}, reply: taxRegister('tcs_rate_milli_pct', 'base', 'tcs', 'tds', 'tax', 'total_base', 'total_tcs') }, // TcsRegisterView views/direct_tax.rs:182; TcsRegister.tsx:97-160 reads *_minor, tcs_rate_milli_pct, Object.entries(by_section)
  { m: 'GET', from: '/direct-taxes/tds-receivable', row: 'books directTaxes.ts', to: '/api/v2/books/tds-receivable', qs: ['from','fy','quarter','to'], rs: {'rows':[{'rate':'r'}]} },
  { m: 'POST', from: '/direct-taxes/tds-receivable', row: 'books directTaxes.ts', to: '/api/v2/books/tds-receivable', bs: {'base':'m','customer_id':'s','customer_name':'s','deductor_tan':'s','invoice_ref':'s','note':'s','order_id':'s','received_on':'s','section_code':'s','tds':'m'} },
  { m: 'GET', from: '/dunning/log', row: 'books ar.ts', to: '/api/v2/books/dunning/log', qs: ['limit','order_id'] },
  { m: 'POST', from: '/dunning/policies', row: 'books ar.ts', to: '/api/v2/books/dunning/policies', bs: {'active':'b','name':'s','note':'s','send_after_hour':'i','send_before_hour':'i','steps':[{'channel':'s','offset_days':'i','template_key':'s'}]} },
  { m: 'GET', from: '/dunning/policies', row: 'books ar.ts', to: '/api/v2/books/dunning/policies' },
  { m: 'PUT', from: '/dunning/policies/:id', row: 'books ar.ts', method: 'PATCH', to: '/api/v2/books/dunning/policies/{id}', bs: {'active':'b','name':'s','note':'s','send_after_hour':'i','send_before_hour':'i','steps':[{'channel':'s','offset_days':'i','template_key':'s'}]} },
  { m: 'DELETE', from: '/dunning/policies/:id', row: 'books ar.ts', to: '/api/v2/books/dunning/policies/{id}' },
  { m: 'GET', from: '/dunning/policies/active', row: 'books ar.ts', to: '/api/v2/books/dunning/policies/active' },
  { m: 'GET', from: '/dunning/preview', row: 'books ar.ts', to: '/api/v2/books/dunning/preview', qs: ['as_of'] },
  { m: 'POST', from: '/dunning/send-now', row: 'books ar.ts', to: '/api/v2/books/dunning/send', bs: {'order_id':'s','step_index':'i'} },
  { m: 'GET', from: '/dunning/templates', row: 'books ar.ts', to: '/api/v2/books/dunning/templates' },
  { m: 'GET', from: '/expenses', row: 'books expenses.ts', to: '/api/v2/books/expenses', qs: ['category','from','limit','offset','paid_from','to'], reply: expenseList }, // ExpensesView views/expenses.rs:89
  { m: 'POST', from: '/expenses', row: 'books expenses.ts', to: '/api/v2/books/expenses', bs: {'amount':'m','category':'s','description':'s','expense_date':'s','gst':'m','gst_type':'s','itc_eligible':'b','paid_from':'s','vendor_id':'s','vendor_name':'s'} },
  { m: 'POST', from: '/expenses/:id/pay', row: 'books expenses.ts', to: '/api/v2/books/expenses/{id}/pay', bs: {'paid_from':'s','payment_date':'s'} },
  { m: 'GET', from: '/expenses/bank-book', row: 'books expenses.ts', to: '/api/v2/books/expenses/bank-book', qs: ['account','from','to'], reply: paise('opening', 'closing', 'debit', 'credit', 'balance') }, // CashBookView views/expenses.rs:132 (page reads openingMinor, rows[].debit_minor)
  { m: 'GET', from: '/expenses/categories', row: 'books expenses.ts', to: '/api/v2/books/expenses/categories' },
  { m: 'GET', from: '/expenses/recurring', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses', qs: ['active'], reply: rowsPaise('amount', 'gst', 'total') }, // bare Vec<RecurringExpenseView> views/expenses.rs:143; Expenses.tsx:464 reads .rows[].total_minor
  { m: 'POST', from: '/expenses/recurring', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses', bs: {'active':'b','amount':'m','category':'s','day_of_period':'i','description':'s','frequency':'s','gst':'m','gst_type':'s','itc_eligible':'b','label':'s','next_due':'s','paid_from':'s','vendor_id':'s','vendor_name':'s'} },
  { m: 'DELETE', from: '/expenses/recurring/:id', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/{id}' },
  { m: 'PUT', from: '/expenses/recurring/:id', row: 'books expenses.ts', method: 'PATCH', to: '/api/v2/books/recurring-expenses/{id}', bs: {'active':'b','amount':'m','day_of_period':'i','description':'s','frequency':'s','gst':'m','gst_type':'s','itc_eligible':'b','label':'s','next_due':'s','paid_from':'s','vendor_name':'s'} },
  { m: 'POST', from: '/expenses/recurring/:id/pause', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/{id}/pause', body: () => ({}) },
  { m: 'POST', from: '/expenses/recurring/:id/resume', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/{id}/resume', body: () => ({}) },
  { m: 'POST', from: '/expenses/recurring/:id/pause', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/{id}/pause', bs: 'j' },
  { m: 'POST', from: '/expenses/recurring/:id/resume', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/{id}/resume', bs: 'j' },
  { m: 'GET', from: '/expenses/recurring/frequencies', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/frequencies' },
  { m: 'POST', from: '/expenses/recurring/run', row: 'books expenses.ts', to: '/api/v2/books/recurring-expenses/run', bs: {'as_of':'s'} },
  { m: 'POST', from: '/expenses/scan', row: 'books expenses.ts', to: '/api/v2/books/expenses/scan', bs: {'#mp':'j','file':'f'}, rs: {'proposal':{'lines':[{'tax_rate':'r'}]}} },
  { m: 'GET', from: '/fx', row: 'books fx.ts', to: '/api/v2/books/fx' },
  { m: 'PUT', from: '/fx/config', row: 'books fx.ts', method: 'PATCH', to: '/api/v2/books/fx/config', bs: {'enabled':'b','rate_policy':'s'} },
  { m: 'GET', from: '/fx/convert', row: 'books fx.ts', to: '/api/v2/books/fx/convert', qs: ['amount_minor','as_of','currency'], query: (c) => ({ currency: c.query.currency, amount_minor: c.query.amount_minor ?? majorToMinor(c.query.amount, String(c.query.currency ?? '')), as_of: c.query.as_of ?? c.query.asOf }), reply: fxConverted }, // ConvertIn api/fx.rs:369 (amount_minor required) + FxConvertView views/fx.rs:82; FxRates.tsx:209 sends amount (major)/asOf, reads inrMajor
  { m: 'GET', from: '/fx/currencies', row: 'books fx.ts', to: '/api/v2/books/fx/currencies' },
  { m: 'PUT', from: '/fx/currencies/:code', row: 'books fx.ts', method: 'PATCH', to: '/api/v2/books/fx/currencies/{code}', bs: {'active':'b'} },
  { m: 'POST', from: '/fx/feed/run', row: 'books fx.ts', to: '/api/v2/books/fx/feed/run', bs: 'j' },
  { m: 'GET', from: '/fx/rates', row: 'books fx.ts', to: '/api/v2/books/fx/rates', qs: ['currency','from','limit','offset','to'] },
  sendAs({ m: 'POST', from: '/fx/rates', row: 'books fx.ts', to: '/api/v2/books/fx/rates', bs: {'as_of_date':'s','currency':'s','note':'s','rate':'s','source':'s'} }, renameKeys({ rateToInr: 'rate' })), // RateIn api/fx.rs:260 (rate required); FxRates.tsx:195 sends rateToInr
  { m: 'GET', from: '/fx/rates/latest', row: 'books fx.ts', to: '/api/v2/books/fx/rates/latest', qs: ['as_of'] },
  // POST /api/v2/domains/console/fx/refresh is platform-staff only (domains api/console.rs:383): a store-staff token is 403 there.
  { m: 'POST', from: '/fx/refresh', row: 'domains routes/superAdmin.ts (platform staff only)', gap: 'refreshing the platform FX feed is a Growcord console action (platform staff only); a store uses Books → FX → "Run feed" (POST /books/fx/feed/run)' },
  { m: 'GET', from: '/fx/revaluation', row: 'books fx.ts', to: '/api/v2/books/fx/revaluation', qs: ['as_of','currency'], reply: fxRevaluation }, // FxRevaluationView views/fx.rs:125; FxRates.tsx:473-479 reads openInrBookedMinor/openInrPeriodMinor/unrealisedMinor
  { m: 'POST', from: '/fx/revaluation', row: 'books fx.ts', to: '/api/v2/books/fx/revaluations', bs: {'as_of_date':'s','currency':'s'} },
  { m: 'GET', from: '/fx/revaluations', row: 'books fx.ts', to: '/api/v2/books/fx/revaluations', qs: ['currency','limit'], reply: (d) => (Array.isArray(d) ? mapList(d, fxRevalRow) : d) }, // Vec<FxRevaluationRecordView> views/fx.rs:136; FxRates.tsx:68, :515 read unrealised_minor
  { m: 'GET', from: '/marketplace-settlements', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements', qs: ['channel','limit','offset','status'], reply: settlementPaise }, // Page<SettlementView> views/receivables.rs:412; MarketplaceSettlements.tsx:290-291 reads net_minor / matched_amount_minor
  rupeeBody({ m: 'POST', from: '/marketplace-settlements', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements', bs: {'channel':'s','lines':[{'commission':'m','fees':'m','gross':'m','net':'m','order_ref':'s','tcs':'m'}],'note':'s','period_from':'s','period_to':'s','settlement_ref':'s','tds':'m'}, reply: settlementPaise }), // SettlementIn api/marketplace_settlement.rs:149 (Money); MarketplaceSettlements.tsx:99-111 sends grossMinor/tdsMinor paise
  { m: 'GET', from: '/marketplace-settlements/:id', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements/{id}', reply: settlementPaise }, // SettlementView views/receivables.rs:412; MarketplaceSettlements.tsx:224-227,252-255 read *_minor
  { m: 'POST', from: '/marketplace-settlements/:id/cancel', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/marketplace-settlements/:id/match', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements/{id}/match', bs: 'j' },
  { m: 'POST', from: '/marketplace-settlements/:id/reconcile', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements/{id}/reconcile', bs: 'j' },
  { m: 'GET', from: '/marketplace-settlements/tcs-summary', row: 'books ar.ts', to: '/api/v2/books/marketplace-settlements/tcs-summary', qs: ['from','to'], reply: paise('tcs') }, // TcsSummaryView views/receivables.rs:450 (tcs Money); MarketplaceSettlements.tsx:155 reads tcsMinor (by_channel[].tcsMinor is raw json, already paise)
  { m: 'POST', from: '/tax', row: 'books accounting.ts', to: '/api/v2/books/tax-rules', bs: {'applies_to':'j','category_ids':'j','components':'j','country':'j','hsn_code':'j','is_active':'b','is_inclusive':'b','max_amount':'j','meta':'j','min_amount':'j','name':'s','pincode_pattern':'j','priority':'i','product_ids':'j','rate':'d','state':'j','tax_type':'j'} },
  { m: 'PUT', from: '/tax/:id', row: 'books accounting.ts', method: 'PATCH', to: '/api/v2/books/tax-rules/{id}', bs: {'applies_to':'j','category_ids':'j','components':'j','country':'j','hsn_code':'j','is_active':'b','is_inclusive':'b','max_amount':'j','meta':'j','min_amount':'j','name':'s','pincode_pattern':'j','priority':'i','product_ids':'j','rate':'d','state':'j','tax_type':'j'} },
  { m: 'DELETE', from: '/tax/:id', row: 'books accounting.ts', to: '/api/v2/books/tax-rules/{id}' },
  { m: 'POST', from: '/tax/return-policies', row: 'books R:ReturnPolicy.create', to: '/api/v2/books/return-policies', bs: {'conditions':'j','description':'j','exceptions':'j','is_active':'b','is_default':'b','is_refundable':'b','is_replaceable':'b','is_returnable':'b','name':'s','refund_mode':'j','refund_window_days':'j','replacement_window_days':'j','return_window_days':'j'} },
  { m: 'PUT', from: '/tax/return-policies/:id', row: 'books R:ReturnPolicy.update', method: 'PATCH', to: '/api/v2/books/return-policies/{id}', bs: {'conditions':'j','description':'j','exceptions':'j','is_active':'b','is_default':'b','is_refundable':'b','is_replaceable':'b','is_returnable':'b','name':'s','refund_mode':'j','refund_window_days':'j','replacement_window_days':'j','return_window_days':'j'} },
  { m: 'DELETE', from: '/tax/return-policies/:id', row: 'books accounting.ts', to: '/api/v2/books/return-policies/{id}' },
  { m: 'GET', from: '/tds/preview', row: 'books directTaxes.ts', to: '/api/v2/books/tds/preview', qs: ['amount_minor','as_of','vendor_id'], rs: {'rate':'r'}, query: previewQuery('vendor_id'), reply: taxPreview }, // PreviewIn api/tds.rs:88 + TdsPreviewView views/direct_tax.rs:27; Tds.tsx:310 sends amount (rupees)/asOfDate, reads tdsMinor
  { m: 'GET', from: '/tds/register', row: 'books directTaxes.ts', to: csvOr('/api/v2/books/tds/register'), qs: ['form','from','fy','include_zero','quarter','to'], rs: {'rows':[{'rate':'r'}]}, reply: taxRegister('rate_milli_pct', 'base', 'tds', 'tcs', 'tax', 'total_base', 'total_tds') }, // TdsRegisterView views/direct_tax.rs:102; Tds.tsx:113-245 reads *_minor, rate_milli_pct, Object.entries(by_country)
  { m: 'GET', from: '/tds/register-27q', row: 'books directTaxes.ts', to: csvOr('/api/v2/books/tds/register-27q'), qs: ['form','from','fy','include_zero','quarter','to'], rs: {'rows':[{'rate':'r'}]}, reply: taxRegister('rate_milli_pct', 'base', 'tds', 'tcs', 'tax', 'total_base', 'total_tds') }, // TdsRegisterView views/direct_tax.rs:102 (same shape as /tds/register)
  { m: 'GET', from: '/tds/sections', row: 'books directTaxes.ts', to: '/api/v2/books/tds/sections' },
  { m: 'GET', from: '/tds/vendors', row: 'books directTaxes.ts', to: '/api/v2/books/tds/vendors', qs: ['search'], rs: [{'tds_rate':'r'}], reply: tdsVendors }, // Vec<TdsVendorView> views/direct_tax.rs:52; Tds.tsx:282 reads tds_rate_milli_pct
  sendAs({ m: 'PUT', from: '/tds/vendors/:id', row: 'books directTaxes.ts', method: 'PATCH', to: '/api/v2/books/tds/vendors/{id}', bs: {'country':'s','is_non_resident':'b','lower_deduction_cert':'s','pan':'s','rate':'r','section':'s'} }, (b) => ({ ...b, rate: b?.rate !== undefined ? b.rate : b?.rateMilliPct == null ? b?.rateMilliPct : Number(b.rateMilliPct) / 1000 })), // VendorTdsIn api/tds.rs:140 (rate milli; 'r' re-scales the percent); Tds.tsx:296 sends rateMilliPct
];
