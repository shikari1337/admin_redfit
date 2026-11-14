/**
 * The pricing policy of one scope (PRICING-AUTO lane D, DEC-089): the whole website, a brand or one
 * item (a product's option, its variation). ONE form for all three, as the server has one shape
 * (`GET`/`PUT /commerce/pricing/policies/{store | brands/{id} | variations/{id}}`).
 *
 * Every field is either INHERITED (not set here: the value in force comes from the brand, the whole
 * website or Growcord's default, and the form says which) or SET HERE. Saving replaces this scope's
 * stored values: an inherited field is sent as null. Money is typed in rupees and sent as minor
 * units; percents are sent as the decimal text typed. The ranges are the server's
 * (`api/pricing/policies.rs` `PolicyBody::checked`); the server checks them again.
 *
 * The form never uses a <form> element: it sits inside the brand editor's and the product form's own
 * forms, so its buttons are type="button" and Enter in its boxes does not submit the outer form.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, MoneyInput, SelectInput, TextInput } from '@/components/erp';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { Segmented } from '@/components/product/FormField';
import InfoTip from '@/components/common/InfoTip';
import { fmtCurrencyMinor } from '@/lib/money';
import { formatDateTime } from '@/utils/date';
import type { Money } from '@/lib/v2/money';
import {
  ORIGIN_WORDS, POLICY_KEYS, getPolicy, minorOf, putPolicy,
  type DecimalText, type Origin, type PolicyBody, type PolicyKey, type PolicyScope, type PolicyView, type Sourced,
} from '@/lib/v2/pricing';

/* ── the fields, in the owner's words ───────────────────────────────────── */

type Kind = 'flag' | 'pct' | 'money' | 'word';

interface Range { min: number; minOpen: boolean; max: number; maxOpen: boolean; words: string }

interface FieldDef {
  key: PolicyKey;
  kind: Kind;
  label: string | ((scope: PolicyScope) => string);
  help: string;
  /** Shown after a percent box. */
  unit?: string;
  range?: Range;
  options?: Array<{ value: string; label: string }>;
  /** The whole website's only (the cost basis). */
  storeOnly?: boolean;
}

const CHARM_OPTIONS = [
  ...['9', '0', '1', '2', '3', '4', '5', '6', '7', '8'].map((d) => ({ value: d, label: `Ending in ${d}` })),
  { value: 'none', label: 'Any ending' },
];

const FIELDS: Record<PolicyKey, FieldDef> = {
  freeze: {
    key: 'freeze', kind: 'flag',
    label: (s) => (s === 'store' ? 'Never change any price' : s === 'brand' ? "Never change this brand's prices" : "Never change this item's price"),
    help: 'The daily run leaves these prices alone. Undoing a change with "freeze" switches this on for that item.',
  },
  auto_reprice: {
    key: 'auto_reprice', kind: 'flag', label: 'Change prices automatically',
    help: 'On: each daily run sets the website price itself, inside the limits below, and logs every change so it can be undone. Off: the run only suggests prices for you to adopt or dismiss.',
  },
  strategy: {
    key: 'strategy', kind: 'word', label: 'How to price against other sellers',
    help: "Undercut: a little below the price Google sees other sellers charge (Google's benchmark). Match: Google's suggested price, else the lowest price seen, when yours is clearly above it.",
    options: [
      { value: 'undercut_benchmark', label: "Undercut Google's benchmark" },
      { value: 'match_lowest', label: 'Match the lowest price seen' },
    ],
  },
  undercut_min: {
    key: 'undercut_min', kind: 'money', label: "Undercut Google's benchmark by at least",
    help: 'The smallest amount below the cheapest other seller. A price below the target is raised toward it too.',
  },
  undercut_max: {
    key: 'undercut_max', kind: 'money', label: "Undercut Google's benchmark by at most",
    help: 'The largest amount below the cheapest other seller. Inside this window the price ends in the digit chosen below.',
  },
  charm_ending: {
    key: 'charm_ending', kind: 'word', label: 'Undercut prices end in',
    help: 'The undercut aims for a whole rupee price ending in this digit, for example 249.',
    options: CHARM_OPTIONS,
  },
  solo_discount_pct: {
    key: 'solo_discount_pct', kind: 'pct', label: 'Discount when nobody else sells this', unit: 'percent off MRP',
    help: 'For items in your Google product list that no other seller is seen selling: the MRP less this percent.',
    range: { min: 0, minOpen: false, max: 100, maxOpen: true, words: 'From 0 to under 100.' },
  },
  cost_basis: {
    key: 'cost_basis', kind: 'word', label: 'Cost of an item comes from', storeOnly: true,
    help: "Where the cost every limit is measured from comes from. The whole website's setting only.",
    options: [
      { value: 'percent_of_mrp', label: 'A percent of its MRP' },
      { value: 'ledger', label: "The stock ledger's average cost" },
    ],
  },
  cost_pct_of_mrp: {
    key: 'cost_pct_of_mrp', kind: 'pct', label: 'Cost as a percent of MRP', unit: 'percent of MRP',
    help: 'Used when cost comes from the MRP. 60 means an item with an MRP of Rs 100 costs Rs 60.',
    range: { min: 0, minOpen: true, max: 100, maxOpen: false, words: 'Above 0 and at most 100.' },
  },
  min_margin_pct: {
    key: 'min_margin_pct', kind: 'pct', label: 'Least margin over cost', unit: 'percent over cost',
    help: 'A price is never set below the cost plus this percent.',
    range: { min: 0, minOpen: false, max: 1000, maxOpen: false, words: 'From 0 to 1000.' },
  },
  floor_price: {
    key: 'floor_price', kind: 'money', label: 'Never sell below',
    help: 'A fixed lowest price, on top of the margin rule. Inherit for none.',
  },
  max_daily_change_pct: {
    key: 'max_daily_change_pct', kind: 'pct', label: 'Most a price may change in a day', unit: 'percent per day',
    help: "Measured from the price the item had when the store's day began, so a second run that day never moves it further.",
    range: { min: 0, minOpen: true, max: 100, maxOpen: false, words: 'Above 0 and at most 100.' },
  },
  google_auto_discounts: {
    key: 'google_auto_discounts', kind: 'flag', label: 'Allow Google automated discounts',
    help: 'Google may show a shopper from your Shopping ads a lower price, never below the cost plus the least margin. Needs the Automated discounts add-on in Merchant Center.',
  },
  google_max_discount_pct: {
    key: 'google_max_discount_pct', kind: 'pct', label: 'Largest Google discount', unit: 'percent off the price',
    help: 'Google may take at most this much off the website price.',
    range: { min: 0, minOpen: false, max: 100, maxOpen: false, words: 'From 0 to 100.' },
  },
};

const GROUPS: Array<{ title: string; keys: PolicyKey[] }> = [
  { title: 'Automatic pricing', keys: ['freeze', 'auto_reprice', 'strategy'] },
  { title: 'Against other sellers', keys: ['undercut_min', 'undercut_max', 'charm_ending', 'solo_discount_pct'] },
  { title: 'Limits that always hold', keys: ['cost_basis', 'cost_pct_of_mrp', 'min_margin_pct', 'floor_price', 'max_daily_change_pct'] },
  { title: 'Google automated discounts', keys: ['google_auto_discounts', 'google_max_discount_pct'] },
];

const labelOf = (f: FieldDef, scope: PolicyScope) => (typeof f.label === 'function' ? f.label(scope) : f.label);
const keysOf = (scope: PolicyScope) => POLICY_KEYS.filter((k) => scope === 'store' || !FIELDS[k].storeOnly);

/* ── values and words ───────────────────────────────────────────────────── */

const CURRENCY = 'INR';

function moneyWords(m: Money | null | undefined): string {
  const minor = minorOf(m);
  return minor === null ? 'None' : fmtCurrencyMinor(minor, m?.currency || CURRENCY, 'en-IN');
}

function valueWords(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return f.kind === 'money' ? 'None' : 'Not set';
  switch (f.kind) {
    case 'flag': return v ? 'On' : 'Off';
    case 'pct': return `${String(v)} ${f.unit ?? 'percent'}`;
    case 'money': return moneyWords(v as Money);
    case 'word': return f.options?.find((o) => o.value === String(v))?.label ?? String(v);
  }
}

/** One field as the form holds it: inherited, or set here with its value. */
interface Draft { set: boolean; flag: boolean; text: string; minor: number | null }
type Drafts = Record<PolicyKey, Draft>;

function draftOf(f: FieldDef, stored: unknown, effective: unknown): Draft {
  const set = stored !== null && stored !== undefined;
  const v = set ? stored : effective;
  return {
    set,
    flag: v === true,
    text: f.kind === 'pct' || f.kind === 'word' ? (v === null || v === undefined ? '' : String(v)) : '',
    minor: f.kind === 'money' ? minorOf(v) : null,
  };
}

function draftsOf(view: PolicyView): Drafts {
  const out = {} as Drafts;
  for (const k of POLICY_KEYS) {
    const eff = (view.effective as unknown as Record<string, Sourced<unknown> | undefined>)[k];
    out[k] = draftOf(FIELDS[k], (view.stored as unknown as Record<string, unknown>)[k], eff?.value);
  }
  return out;
}

/** What is wrong with a field set here, or null. */
function problemOf(f: FieldDef, d: Draft): string | null {
  if (!d.set) return null;
  if (f.kind === 'pct') {
    const t = d.text.trim();
    if (!/^\d+(\.\d{1,4})?$/.test(t)) return 'A number, with at most 4 decimals.';
    const n = Number(t);
    const r = f.range!;
    const low = r.minOpen ? n > r.min : n >= r.min;
    const high = r.maxOpen ? n < r.max : n <= r.max;
    return low && high ? null : r.words;
  }
  if (f.kind === 'money') return d.minor === null || d.minor < 0 ? 'An amount of zero or more, in rupees.' : null;
  if (f.kind === 'word') return f.options?.some((o) => o.value === d.text) ? null : 'Choose one.';
  return null;
}

/** The value one field sends: null when inherited. */
function wireOf(f: FieldDef, d: Draft): string | boolean | Money | null {
  if (!d.set) return null;
  switch (f.kind) {
    case 'flag': return d.flag;
    case 'pct': return d.text.trim();
    case 'word': return d.text;
    case 'money': return d.minor === null ? null : { minor: d.minor, currency: CURRENCY };
  }
}

function storedWire(f: FieldDef, v: unknown): string | boolean | Money | null {
  if (v === null || v === undefined) return null;
  if (f.kind === 'money') {
    const minor = minorOf(v);
    return minor === null ? null : { minor, currency: CURRENCY };
  }
  if (f.kind === 'pct') return String(v as DecimalText);
  return v as string | boolean;
}

/* ── the parent scope (what inheriting gives) ───────────────────────────── */

/** The policy one level up: a variation's brand (else the whole website), a brand's website. */
async function parentPolicy(scope: PolicyScope, view: PolicyView | null): Promise<PolicyView | null> {
  if (!view || scope === 'store') return null;
  const brand = scope === 'variation' ? view.variation?.brand_id : null;
  if (brand) {
    try { return await getPolicy('brand', brand); } catch { /* the website's answer below */ }
  }
  return getPolicy('store');
}

/* ── the form ───────────────────────────────────────────────────────────── */

export interface PolicyFormProps {
  scope: PolicyScope;
  /** The brand id or the variation id (not used for the whole website). */
  id?: string | null;
  /** The person may write (products.manage). */
  canManage: boolean;
  /** Shown above the fields, e.g. the variation's name. */
  heading?: React.ReactNode;
  onSaved?: (view: PolicyView) => void;
  /** Stack each row (a drawer or a narrow column). */
  narrow?: boolean;
  className?: string;
}

const PolicyForm: React.FC<PolicyFormProps> = ({ scope, id, canManage, heading, onSaved, narrow = false, className }) => {
  const enabled = scope === 'store' || !!id;
  const loaded = useLoad(() => getPolicy(scope, id), [scope, id], enabled);
  const [view, setView] = useState<PolicyView | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Another brand or item: forget the last one's answer until the new one arrives.
  useEffect(() => { setView(null); setSavedAt(null); setSaveError(null); }, [scope, id]);
  useEffect(() => { if (loaded.data) setView(loaded.data); }, [loaded.data]);
  useEffect(() => { setDrafts(view ? draftsOf(view) : null); }, [view]);

  const parent = useLoad(
    () => parentPolicy(scope, view),
    [scope, view ? 'loaded' : '', view?.variation?.brand_id ?? ''],
    !!view && scope !== 'store',
  );

  const keys = useMemo(() => keysOf(scope), [scope]);

  const problems = useMemo(() => {
    const out: Partial<Record<PolicyKey, string>> = {};
    if (!drafts) return out;
    for (const k of keys) {
      const p = problemOf(FIELDS[k], drafts[k]);
      if (p) out[k] = p;
    }
    const lo = drafts.undercut_min, hi = drafts.undercut_max;
    if (!out.undercut_min && !out.undercut_max && lo.set && hi.set && lo.minor !== null && hi.minor !== null && lo.minor > hi.minor) {
      out.undercut_min = 'The smallest undercut is at most the largest.';
    }
    return out;
  }, [drafts, keys]);

  const body = useMemo<PolicyBody | null>(() => {
    if (!drafts) return null;
    const b: PolicyBody = {};
    for (const k of keys) b[k] = wireOf(FIELDS[k], drafts[k]);
    return b;
  }, [drafts, keys]);

  const dirty = useMemo(() => {
    if (!view || !body) return false;
    const stored = view.stored as unknown as Record<string, unknown>;
    return keys.some((k) => JSON.stringify(body[k] ?? null) !== JSON.stringify(storedWire(FIELDS[k], stored[k])));
  }, [view, body, keys]);

  if (!enabled) {
    return (
      <Notice tone="info" className={className} title="Save first">
        {scope === 'brand' ? 'Save the brand first; its pricing can be set once it exists.' : 'Save the product first; each option gets its pricing once it is saved.'}
      </Notice>
    );
  }
  if (loaded.loading && !view) return <Loading label="Loading the pricing settings" className={className} />;
  if (loaded.error && !view) return <ErrorNote error={loaded.error} what="Automatic pricing" onRetry={() => void loaded.reload()} className={className} />;
  if (!view || !drafts || !body) return null;

  const invalid = Object.keys(problems).length > 0;
  const blocked = whyDisabled(canManage, [
    !view.tables_present && 'Pricing is not set up on this store yet: it arrives with the next server update.',
    !dirty && 'Nothing has changed.',
    invalid && 'Fix the boxes marked in red first.',
  ], 'Manage products');

  const put = (k: PolicyKey, patch: Partial<Draft>) => {
    setSavedAt(null);
    setDrafts((d) => (d ? { ...d, [k]: { ...d[k], ...patch } } : d));
  };

  const save = async () => {
    if (blocked || !body) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await putPolicy(scope, id, body);
      setView(next);
      setSavedAt(Date.now());
      onSaved?.(next);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const eff = view.effective as unknown as Record<string, Sourced<unknown>>;
  const parentEff = parent.data ? (parent.data.effective as unknown as Record<string, Sourced<unknown>>) : null;

  /** What inheriting this field gives, in words. */
  const inheritedWords = (k: PolicyKey): string => {
    const f = FIELDS[k];
    const here = eff[k];
    if (here && here.from !== scope) return `${valueWords(f, here.value)}, from ${ORIGIN_WORDS[here.from as Origin] ?? here.from}`;
    if (scope === 'store') return "Growcord's default";
    const up = parentEff?.[k];
    if (up) return `${valueWords(f, up.value)}, from ${ORIGIN_WORDS[up.from as Origin] ?? up.from}`;
    return parent.loading ? 'Reading the value one level up' : 'The value one level up';
  };

  const frozen = eff.freeze?.value === true;
  const auto = eff.auto_reprice?.value === true;
  const facts = view.variation;

  return (
    <div
      className={cn('space-y-4', className)}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}
    >
      {heading}

      {!view.tables_present && (
        <Notice tone="warn" title="Not set up on this store yet">
          The pricing tables arrive with the next server update. Until then nothing here can be saved, and the daily run changes no price.
        </Notice>
      )}

      {/* Lead with what is in force now. */}
      {frozen ? (
        <Notice tone="warn" title="Prices here are frozen">
          The daily run leaves {scope === 'variation' ? 'this item' : scope === 'brand' ? "this brand's items" : 'every item'} alone
          ({ORIGIN_WORDS[eff.freeze.from as Origin] ?? eff.freeze.from}).
        </Notice>
      ) : (
        <Notice tone={auto ? 'good' : 'info'} title={auto ? 'Automatic pricing is on' : 'Prices are only suggested'}>
          {auto
            ? 'When price discovery runs, it sets the website price inside the limits below, and every change can be undone under Pricing, Changes.'
            : 'When price discovery runs, it only suggests prices; a person adopts or dismisses each one under Pricing, Recommendations.'}
          {' '}Set by {ORIGIN_WORDS[eff.auto_reprice?.from as Origin] ?? 'Growcord'}.
        </Notice>
      )}

      {facts && <VariationFacts facts={facts} />}
      {scope === 'variation' && id && (
        <p className="text-xs">
          <Link to={`/pricing/changes?variation=${encodeURIComponent(id)}`} className="font-medium text-gray-700 underline">
            See this item's price changes, and undo one
          </Link>
        </p>
      )}

      {GROUPS.map((g) => {
        const rows = g.keys.filter((k) => keys.includes(k));
        if (!rows.length) return null;
        return (
          <fieldset key={g.title} className="rounded-lg border border-gray-200 bg-white">
            <legend className="ml-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.title}</legend>
            <div className="divide-y divide-gray-100">
              {rows.map((k) => (
                <PolicyRow
                  key={k}
                  field={FIELDS[k]}
                  scope={scope}
                  draft={drafts[k]}
                  problem={problems[k] ?? null}
                  inherited={inheritedWords(k)}
                  disabled={!canManage || saving}
                  narrow={narrow}
                  onChange={(patch) => put(k, patch)}
                />
              ))}
            </div>
          </fieldset>
        );
      })}

      {saveError ? <ErrorNote error={saveError} what="Saving the pricing settings" /> : null}
      {savedAt && !dirty && <Notice tone="good">Saved. The next daily run uses these values.</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn type="button" onClick={() => void save()} disabled={!!blocked || saving} title={blocked ?? undefined}>
          {saving ? 'Saving' : 'Save pricing'}
        </Btn>
        <Btn type="button" variant="outline" onClick={() => setDrafts(draftsOf(view))} disabled={!dirty || saving}>
          Undo my edits
        </Btn>
        {!canManage && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> You need the Manage products permission to change these.
          </span>
        )}
        {view.updated_at && (
          <span className="text-xs text-gray-500">Last changed {formatDateTime(view.updated_at, 'not yet')}</span>
        )}
      </div>
    </div>
  );
};

/* ── one row ────────────────────────────────────────────────────────────── */

const PolicyRow: React.FC<{
  field: FieldDef;
  scope: PolicyScope;
  draft: Draft;
  problem: string | null;
  inherited: string;
  disabled: boolean;
  narrow: boolean;
  onChange: (patch: Partial<Draft>) => void;
}> = ({ field, scope, draft, problem, inherited, disabled, narrow, onChange }) => {
  const label = labelOf(field, scope);
  const inputId = `pricing-${scope}-${field.key}`;
  return (
    <div className={cn('grid gap-2 px-3 py-3', !narrow && 'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] md:items-center md:gap-4')}>
      <div className="min-w-0">
        <label htmlFor={inputId} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800">
          {label} <InfoTip text={field.help} />
        </label>
      </div>
      <div>
        <Segmented
          ariaLabel={`${label}: inherit or set here`}
          value={draft.set ? 'set' : 'inherit'}
          onChange={(v) => { if (!disabled) onChange({ set: v === 'set' }); }}
          options={[{ value: 'inherit', label: 'Inherit' }, { value: 'set', label: 'Set here' }]}
          className={disabled ? 'pointer-events-none opacity-60' : ''}
        />
      </div>
      <div className="min-w-0">
        {!draft.set ? (
          <p id={inputId} className="text-sm text-gray-600">Uses {inherited}</p>
        ) : (
          <div className="space-y-1">
            {field.kind === 'flag' && (
              <SelectInput id={inputId} value={draft.flag ? 'on' : 'off'} disabled={disabled}
                onChange={(e) => onChange({ flag: e.target.value === 'on' })} className="w-32">
                <option value="on">On</option>
                <option value="off">Off</option>
              </SelectInput>
            )}
            {field.kind === 'word' && (
              <SelectInput id={inputId} value={draft.text} disabled={disabled}
                onChange={(e) => onChange({ text: e.target.value })} className="w-full max-w-xs">
                {!field.options?.some((o) => o.value === draft.text) && <option value="">Choose</option>}
                {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectInput>
            )}
            {field.kind === 'pct' && (
              <span className="inline-flex items-center gap-1.5">
                <TextInput id={inputId} inputMode="decimal" value={draft.text} disabled={disabled}
                  aria-invalid={!!problem}
                  onChange={(e) => onChange({ text: e.target.value })}
                  className={cn('w-28 text-right tabular-nums', problem && 'border-red-400')} />
                <span className="text-sm text-gray-500">{field.unit ?? 'percent'}</span>
              </span>
            )}
            {field.kind === 'money' && (
              <MoneyInput id={inputId} value={draft.minor} currency={CURRENCY} disabled={disabled}
                aria-label={label}
                onChange={(minor) => onChange({ minor })} />
            )}
            {problem && <p className="text-xs text-red-700">{problem}</p>}
            <p className="text-xs text-gray-500">Without this: {inherited}</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── the item's own facts ───────────────────────────────────────────────── */

const VariationFacts: React.FC<{ facts: NonNullable<PolicyView['variation']> }> = ({ facts }) => {
  const cells: Array<{ label: string; value: Money | null; help: string }> = [
    { label: "Today's price", value: facts.price, help: 'What the website charges now.' },
    { label: 'MRP', value: facts.mrp, help: 'The legal ceiling: the daily run never goes above it.' },
    { label: 'Cost', value: facts.cost, help: "One unit's cost under the website's cost setting." },
    { label: 'Lowest allowed', value: facts.lowest_allowed, help: 'Cost plus the least margin, and the floor price: the daily run never goes below it.' },
  ];
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <dt className="inline-flex items-center gap-1 text-xs text-gray-500">{c.label} <InfoTip text={c.help} /></dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">{c.value ? moneyWords(c.value) : 'Not known'}</dd>
          </div>
        ))}
      </dl>
      {facts.sku && <p className="text-xs text-gray-500">SKU {facts.sku}</p>}
      {!facts.cost && (
        <Notice tone="warn" title="Cost not known">
          Without a cost the daily run does not change this item's price. Give the item an MRP, or set where cost comes from on Pricing, Website settings.
        </Notice>
      )}
    </div>
  );
};

export default PolicyForm;
