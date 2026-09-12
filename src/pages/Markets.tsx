import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown, X, Eye, EyeOff,
  AlertTriangle, Star, Globe2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { settingsRegistryAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

/**
 * Markets (Settings Center 1.8) — the store's selling regions.
 *
 * The shape edited here mirrors backend/src/services/markets.ts EXACTLY (Market,
 * MarketsConfig, normalizeMarketsConfig, INTL_MARKET_TEMPLATE) — that file is the
 * one source of truth for what a market IS; this page is only a form over it.
 * Keep the two in sync if that file's shape ever changes.
 *
 * Read/write both go through the Settings Center registry path (registry key
 * `markets`, backend/src/config/settingsRegistry.ts), the same one every other
 * Settings Center field uses: GET /settings/registry for the effective value,
 * PUT /settings/registry/markets with the WHOLE { default, list } to save (the
 * registry deep-merges at the top level, and since `default`/`list` are the
 * only two keys the row has, sending both is a full, unambiguous overwrite).
 *
 * NOTE for future readers: the backend registry entry for `markets` does not
 * currently declare a `page` (unlike e.g. `payment_method_rules`), so the
 * generic Settings Center detail view has no "Full editor" link to this page —
 * it still renders the raw `default`/`list` JSON fields inline. This page is
 * reachable from the sidebar (Settings ▸ Markets) and the Settings directory
 * instead. Adding `page: { path: '/settings/markets', label: 'Markets' }` to
 * that registry entry would let the Settings Center link here too, but that is
 * a backend change outside this page's scope.
 */

type TaxTreatment = 'domestic' | 'export' | 'ca';
type MarketPricingMode = 'fx' | 'price_list';
type RateMode = 'auto' | 'manual';
type RoundingRule = 'psychological' | 'nearest_major' | 'none';
type DgPolicy = 'air_excluded' | 'surface_only' | 'allowed';
type Incoterm = 'DAP' | 'DDP';
type CsbType = 'IV' | 'V';
type MarketingConsentMode = 'implied' | 'express';
type OrderNotifyChannel = 'email' | 'whatsapp' | 'sms';
type OtpNotifyChannel = 'whatsapp' | 'sms' | 'email';

interface MarketPricing {
  mode: MarketPricingMode;
  rateMode: RateMode;
  defaultCurrency: string;
  bufferPct: number;
  roundingRule: RoundingRule;
  manualRates: Record<string, number>;
}
interface MarketAssortment {
  excludePotencies: string[];
  excludeCategorySlugs: string[];
  excludeBrandSlugs: string[];
  requireDimsConfirmed: boolean;
  allowPrescription: boolean;
  dgPolicy: DgPolicy;
}
interface MarketGateway {
  gateway: string;
  priority: number;
  currencies: string[];
  countries: string[];
  methods: string[];
}
interface MarketNotifications {
  orderChannels: OrderNotifyChannel[];
  otpChannels: OtpNotifyChannel[];
  marketingConsent: MarketingConsentMode;
  smsProvider: string | null;
}
interface MarketShipping {
  defaultIncoterm: Incoterm;
  csbType: CsbType;
  flatFee: number | null;
  freeAbove: number | null;
}
interface Market {
  code: string;
  label: string;
  locale: string;
  countries: string[];
  storefrontHost: string;
  fulfilmentWarehouseCode: string | null;
  billingEntity: string | null;
  taxTreatment: TaxTreatment;
  pricing: MarketPricing;
  assortment: MarketAssortment;
  paymentGateways: MarketGateway[];
  notifications: MarketNotifications;
  shipping: MarketShipping;
  enabled: boolean;
}
interface MarketsConfig {
  default: string;
  list: Market[];
}

// ─────────────────────────── defaults (mirror markets.ts) ───────────────────────────

function defaultIndiaMarket(): Market {
  return {
    code: 'in', label: 'India', locale: 'en-IN', countries: ['IN'], storefrontHost: '',
    fulfilmentWarehouseCode: null, billingEntity: null, taxTreatment: 'domestic',
    pricing: { mode: 'fx', rateMode: 'auto', defaultCurrency: 'INR', bufferPct: 0, roundingRule: 'none', manualRates: {} },
    assortment: { excludePotencies: [], excludeCategorySlugs: [], excludeBrandSlugs: [], requireDimsConfirmed: false, allowPrescription: true, dgPolicy: 'allowed' },
    paymentGateways: [
      { gateway: 'razorpay', priority: 1, currencies: ['INR'], countries: [], methods: ['card', 'upi', 'netbanking', 'wallet'] },
      { gateway: 'cod', priority: 2, currencies: ['INR'], countries: ['IN'], methods: ['cod'] },
      { gateway: 'upi', priority: 3, currencies: ['INR'], countries: ['IN'], methods: ['upi'] },
      { gateway: 'manual', priority: 4, currencies: ['INR'], countries: [], methods: ['bank_transfer'] },
    ],
    notifications: { orderChannels: ['whatsapp', 'sms'], otpChannels: ['whatsapp', 'sms'], marketingConsent: 'implied', smsProvider: null },
    shipping: { defaultIncoterm: 'DAP', csbType: 'V', flatFee: null, freeAbove: null },
    enabled: true,
  };
}

function intlMarketTemplate(): Market {
  return {
    code: 'intl', label: 'International', locale: 'en', countries: ['*'], storefrontHost: '',
    fulfilmentWarehouseCode: null, billingEntity: null, taxTreatment: 'export',
    pricing: { mode: 'fx', rateMode: 'auto', defaultCurrency: 'USD', bufferPct: 3, roundingRule: 'psychological', manualRates: {} },
    assortment: { excludePotencies: ['Q'], excludeCategorySlugs: [], excludeBrandSlugs: [], requireDimsConfirmed: false, allowPrescription: false, dgPolicy: 'air_excluded' },
    paymentGateways: [
      { gateway: 'razorpay', priority: 1, currencies: [], countries: [], methods: ['card'] },
      { gateway: 'paypal', priority: 2, currencies: [], countries: [], methods: ['paypal', 'card'] },
    ],
    notifications: { orderChannels: ['email', 'whatsapp'], otpChannels: ['email', 'whatsapp'], marketingConsent: 'express', smsProvider: null },
    shipping: { defaultIncoterm: 'DAP', csbType: 'V', flatFee: null, freeAbove: null },
    enabled: false,
  };
}

const ORDER_NOTIFY_CHANNELS: OrderNotifyChannel[] = ['email', 'whatsapp', 'sms'];
const OTP_NOTIFY_CHANNELS: OtpNotifyChannel[] = ['whatsapp', 'sms', 'email'];

/** Mirrors markets.ts normalizeNotifications: unknown channels are dropped, not
 *  defaulted, and an empty list after filtering falls back to the base chain so
 *  a market can never end up silently notifying nobody. */
function coerceNotifications(raw: any, base: MarketNotifications): MarketNotifications {
  const n = raw && typeof raw === 'object' ? raw : {};
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T[]): T[] => {
    if (!Array.isArray(v)) return fallback;
    const seen = new Set<string>();
    const out: T[] = [];
    for (const x of v) {
      const s = String(x).trim().toLowerCase();
      if ((allowed as readonly string[]).includes(s) && !seen.has(s)) { seen.add(s); out.push(s as T); }
    }
    return out.length ? out : fallback;
  };
  return {
    orderChannels: pick(n.orderChannels, ORDER_NOTIFY_CHANNELS, base.orderChannels),
    otpChannels: pick(n.otpChannels, OTP_NOTIFY_CHANNELS, base.otpChannels),
    marketingConsent: n.marketingConsent === 'express' ? 'express' : n.marketingConsent === 'implied' ? 'implied' : base.marketingConsent,
    smsProvider: typeof n.smsProvider === 'string' && n.smsProvider.trim() ? n.smsProvider.trim() : base.smsProvider,
  };
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

function coerceMarket(raw: any, base: Market): Market {
  if (!raw || typeof raw !== 'object') return base;
  const p = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {};
  const a = raw.assortment && typeof raw.assortment === 'object' ? raw.assortment : {};
  const s = raw.shipping && typeof raw.shipping === 'object' ? raw.shipping : {};
  const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  return {
    code: typeof raw.code === 'string' && raw.code.trim() ? raw.code.trim().toLowerCase() : base.code,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : base.label,
    locale: typeof raw.locale === 'string' && raw.locale.trim() ? raw.locale : base.locale,
    countries: strArr(raw.countries).length ? strArr(raw.countries).map((c) => c.toUpperCase()) : base.countries,
    storefrontHost: typeof raw.storefrontHost === 'string' ? raw.storefrontHost.replace(/^https?:\/\//, '').replace(/\/+$/, '') : base.storefrontHost,
    fulfilmentWarehouseCode: typeof raw.fulfilmentWarehouseCode === 'string' && raw.fulfilmentWarehouseCode ? raw.fulfilmentWarehouseCode : base.fulfilmentWarehouseCode,
    billingEntity: typeof raw.billingEntity === 'string' && raw.billingEntity ? raw.billingEntity : base.billingEntity,
    taxTreatment: (['domestic', 'export', 'ca'] as const).includes(raw.taxTreatment) ? raw.taxTreatment : base.taxTreatment,
    pricing: {
      mode: p.mode === 'price_list' ? 'price_list' : 'fx',
      rateMode: p.rateMode === 'manual' ? 'manual' : 'auto',
      defaultCurrency: typeof p.defaultCurrency === 'string' && p.defaultCurrency ? p.defaultCurrency.toUpperCase() : base.pricing.defaultCurrency,
      bufferPct: Number.isFinite(Number(p.bufferPct)) ? Math.max(0, Number(p.bufferPct)) : base.pricing.bufferPct,
      roundingRule: (['psychological', 'nearest_major', 'none'] as const).includes(p.roundingRule) ? p.roundingRule : base.pricing.roundingRule,
      manualRates: p.manualRates && typeof p.manualRates === 'object'
        ? Object.fromEntries(Object.entries(p.manualRates as Record<string, unknown>).map(([k, v]) => [String(k).toUpperCase(), Number(v)]).filter(([, v]) => Number.isFinite(v as number)))
        : base.pricing.manualRates,
    },
    assortment: {
      excludePotencies: Array.isArray(a.excludePotencies) ? strArr(a.excludePotencies).map((x) => x.toUpperCase()) : base.assortment.excludePotencies,
      excludeCategorySlugs: Array.isArray(a.excludeCategorySlugs) ? strArr(a.excludeCategorySlugs) : base.assortment.excludeCategorySlugs,
      excludeBrandSlugs: Array.isArray(a.excludeBrandSlugs) ? strArr(a.excludeBrandSlugs) : base.assortment.excludeBrandSlugs,
      requireDimsConfirmed: typeof a.requireDimsConfirmed === 'boolean' ? a.requireDimsConfirmed : base.assortment.requireDimsConfirmed,
      allowPrescription: typeof a.allowPrescription === 'boolean' ? a.allowPrescription : base.assortment.allowPrescription,
      dgPolicy: (['air_excluded', 'surface_only', 'allowed'] as const).includes(a.dgPolicy) ? a.dgPolicy : base.assortment.dgPolicy,
    },
    paymentGateways: Array.isArray(raw.paymentGateways) && raw.paymentGateways.length
      ? raw.paymentGateways.map((g: any, i: number): MarketGateway => ({
          gateway: typeof g?.gateway === 'string' ? g.gateway.toLowerCase() : '',
          priority: Number.isFinite(Number(g?.priority)) ? Number(g.priority) : i + 1,
          currencies: strArr(g?.currencies).map((c) => c.toUpperCase()),
          countries: strArr(g?.countries).map((c) => c.toUpperCase()),
          methods: strArr(g?.methods),
        })).filter((g: MarketGateway) => g.gateway)
      : base.paymentGateways,
    notifications: coerceNotifications(raw.notifications, base.notifications),
    shipping: {
      defaultIncoterm: s.defaultIncoterm === 'DDP' ? 'DDP' : 'DAP',
      csbType: s.csbType === 'IV' ? 'IV' : 'V',
      flatFee: numOrNull(s.flatFee),
      freeAbove: numOrNull(s.freeAbove),
    },
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
  };
}

function normalizeConfig(raw: any): MarketsConfig {
  const rawList: any[] = Array.isArray(raw?.list) ? raw.list : [];
  const list: Market[] = [];
  for (const m of rawList) {
    const code = typeof m?.code === 'string' ? m.code.trim().toLowerCase() : '';
    if (!code) continue;
    const base: Market = code === 'in' ? defaultIndiaMarket() : code === 'intl' ? intlMarketTemplate() : { ...intlMarketTemplate(), code, label: code.toUpperCase() };
    list.push(coerceMarket(m, base));
  }
  if (!list.some((m) => m.code === 'in')) list.unshift(defaultIndiaMarket());
  const def = typeof raw?.default === 'string' && raw.default.trim() ? raw.default.trim().toLowerCase() : 'in';
  return { default: list.some((m) => m.code === def) ? def : 'in', list };
}

function validateConfig(cfg: MarketsConfig): string[] {
  const errors: string[] = [];
  const countryRe = /^(\*|[A-Z]{2})$/;
  const currencyRe = /^[A-Z]{3}$/;
  const seen = new Set<string>();
  for (const m of cfg.list) {
    const label = m.label || m.code || '(unnamed market)';
    if (!/^[a-z0-9_-]+$/.test(m.code)) errors.push(`${label}: code must be lowercase letters, numbers, "-" or "_" only.`);
    if (seen.has(m.code)) errors.push(`${label}: the code "${m.code}" is used by more than one market.`);
    seen.add(m.code);
    for (const c of m.countries) if (!countryRe.test(c)) errors.push(`${label}: "${c}" is not a valid country — use a 2-letter code (e.g. IN) or * for everywhere.`);
    if (!currencyRe.test(m.pricing.defaultCurrency)) errors.push(`${label}: default currency "${m.pricing.defaultCurrency}" must be a 3-letter code (e.g. USD).`);
    for (const cur of Object.keys(m.pricing.manualRates)) if (!currencyRe.test(cur)) errors.push(`${label}: manual rate currency "${cur}" must be a 3-letter code.`);
    if (m.enabled && m.paymentGateways.length === 0) errors.push(`${label} is switched on but has no payment gateway — it could not take payment. Add at least one.`);
    m.paymentGateways.forEach((g, i) => {
      const gLabel = `${label} › gateway ${g.gateway || `#${i + 1}`}`;
      for (const c of g.countries) if (!countryRe.test(c)) errors.push(`${gLabel}: "${c}" is not a valid country.`);
      for (const cur of g.currencies) if (!currencyRe.test(cur)) errors.push(`${gLabel}: currency "${cur}" must be a 3-letter code.`);
    });
  }
  if (!cfg.list.some((m) => m.code === cfg.default)) errors.push(`The default market "${cfg.default}" does not match any market's code.`);
  return errors;
}

// ─────────────────────────── small shared controls ───────────────────────────

const ChipsInput: React.FC<{
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  uppercase?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, uppercase, disabled }) => {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (uppercase ? s.toUpperCase() : s));
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
  };
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 ${disabled ? 'bg-gray-50' : 'bg-white'}`}>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
          {v}
          {!disabled && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-gray-400 hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={commit}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[110px] flex-1 border-0 bg-transparent p-0.5 text-xs outline-none"
        />
      )}
      {!value.length && disabled && <span className="text-xs text-muted-foreground">—</span>}
    </div>
  );
};

const GATEWAY_OPTIONS = ['razorpay', 'paypal', 'cod', 'upi', 'manual', 'stripe'];

const GatewaysEditor: React.FC<{ gateways: MarketGateway[]; disabled: boolean; onChange: (next: MarketGateway[]) => void }> = ({ gateways, disabled, onChange }) => {
  const sorted = [...gateways].sort((a, b) => a.priority - b.priority);
  const renumber = (list: MarketGateway[]) => list.map((g, i) => ({ ...g, priority: i + 1 }));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
    onChange(renumber(next));
  };
  const update = (idx: number, patch: Partial<MarketGateway>) => onChange(sorted.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const remove = (idx: number) => onChange(renumber(sorted.filter((_, i) => i !== idx)));
  const add = () => onChange(renumber([...sorted, { gateway: 'razorpay', priority: sorted.length + 1, currencies: [], countries: [], methods: [] }]));

  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">No payment gateways yet — a market with none cannot take payment.</p>}
      {sorted.map((g, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="text-gray-500 hover:text-foreground disabled:opacity-25" title="Move up">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={disabled || i === sorted.length - 1} onClick={() => move(i, 1)} className="text-gray-500 hover:text-foreground disabled:opacity-25" title="Move down">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Badge variant="outline" className="font-mono">#{g.priority}</Badge>
            <Select value={g.gateway} disabled={disabled} onValueChange={(v) => update(i, { gateway: v })}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GATEWAY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
            {!disabled && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Currencies (blank = any)</Label>
              <ChipsInput value={g.currencies} onChange={(v) => update(i, { currencies: v })} uppercase disabled={disabled} placeholder="USD" />
            </div>
            <div>
              <Label className="text-xs">Countries (blank = any)</Label>
              <ChipsInput value={g.countries} onChange={(v) => update(i, { countries: v })} uppercase disabled={disabled} placeholder="US" />
            </div>
            <div>
              <Label className="text-xs">Methods</Label>
              <ChipsInput value={g.methods} onChange={(v) => update(i, { methods: v })} disabled={disabled} placeholder="card" />
            </div>
          </div>
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-2 h-4 w-4" /> Add gateway
        </Button>
      )}
    </div>
  );
};

const ManualRatesEditor: React.FC<{ rates: Record<string, number>; disabled: boolean; onChange: (next: Record<string, number>) => void }> = ({ rates, disabled, onChange }) => {
  const [newCode, setNewCode] = useState('');
  const entries = Object.entries(rates);
  const addRow = () => {
    const code = newCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || code in rates) return;
    onChange({ ...rates, [code]: 1 });
    setNewCode('');
  };
  return (
    <div className="space-y-2">
      {entries.length === 0 && <p className="text-sm text-muted-foreground">No manual rates set.</p>}
      {entries.map(([code, rate]) => (
        <div key={code} className="flex items-center gap-2">
          <Badge variant="outline" className="w-14 justify-center font-mono">{code}</Badge>
          <Input
            type="number" step="0.0001" min={0} disabled={disabled} value={rate}
            onChange={(e) => onChange({ ...rates, [code]: Number(e.target.value) || 0 })}
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">units of {code} per ₹1</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50" onClick={() => { const next = { ...rates }; delete next[code]; onChange(next); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="flex items-center gap-2">
          <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="USD" className="w-24 font-mono" maxLength={3} />
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" /> Add currency
          </Button>
        </div>
      )}
    </div>
  );
};

/** A fixed-vocabulary, orderable chip picker — used for the two notification
 *  chains, where ORDER is the policy (which channel is tried first) and an
 *  unlisted channel name must be impossible to enter (mirrors markets.ts
 *  normalizeNotifications, which drops anything outside its own vocabulary). */
function OrderedChannelPicker<T extends string>({ value, onChange, allowed, disabled }: {
  value: T[]; onChange: (v: T[]) => void; allowed: readonly T[]; disabled: boolean;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
    onChange(next);
  };
  const toggle = (ch: T) => {
    onChange(value.includes(ch) ? value.filter((x) => x !== ch) : [...value, ch]);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((ch) => (
          <button
            key={ch} type="button" disabled={disabled} onClick={() => toggle(ch)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${value.includes(ch) ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 text-muted-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {ch}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <ol className="space-y-1">
          {value.map((ch, i) => (
            <li key={ch} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
              <span className="text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 capitalize">{ch}</span>
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="text-gray-500 hover:text-foreground disabled:opacity-25"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)} className="text-gray-500 hover:text-foreground disabled:opacity-25"><ChevronDown className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ol>
      )}
      {value.length === 0 && <p className="text-xs text-amber-700">No channel selected — this falls back to the built-in default chain rather than notifying nobody.</p>}
    </div>
  );
}

const MARKETING_CONSENT_OPTIONS: Array<{ value: MarketingConsentMode; label: string }> = [
  { value: 'implied', label: 'Implied (e.g. India/DPDP) — a buyer may be messaged until they opt out' },
  { value: 'express', label: 'Express (e.g. CASL/GDPR) — nothing marketing sends until they opt in' },
];

const TAX_TREATMENT_OPTIONS: Array<{ value: TaxTreatment; label: string }> = [
  { value: 'domestic', label: 'Domestic (GST as normal)' },
  { value: 'export', label: 'Export (zero-rated / LUT)' },
  { value: 'ca', label: 'Canada (its own tax rules)' },
];
const DG_POLICY_OPTIONS: Array<{ value: DgPolicy; label: string }> = [
  { value: 'air_excluded', label: 'Exclude from air shipments (e.g. mother tinctures)' },
  { value: 'surface_only', label: 'Surface shipments only' },
  { value: 'allowed', label: 'No dangerous-goods restriction' },
];
const ROUNDING_OPTIONS: Array<{ value: RoundingRule; label: string }> = [
  { value: 'psychological', label: 'Psychological (…99 / whole number)' },
  { value: 'nearest_major', label: 'Nearest whole unit' },
  { value: 'none', label: 'No rounding' },
];

const MarketEditorPanel: React.FC<{
  market: Market;
  disabled: boolean;
  restricted: boolean;
  onField: (patch: Partial<Market>) => void;
  onPricing: (patch: Partial<MarketPricing>) => void;
  onAssortment: (patch: Partial<MarketAssortment>) => void;
  onShipping: (patch: Partial<MarketShipping>) => void;
  onGateways: (next: MarketGateway[]) => void;
  onNotifications: (patch: Partial<MarketNotifications>) => void;
}> = ({ market, disabled, restricted, onField, onPricing, onAssortment, onShipping, onGateways, onNotifications }) => {
  if (restricted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Editing: {market.label} <Badge variant="outline" className="font-mono text-[10px]">{market.code}</Badge>
          </CardTitle>
          <CardDescription>
            India is the store&apos;s home market, so only its display label and locale are edited here. GST lives on{' '}
            <Link to="/settings/gst" className="text-primary underline">Settings ▸ GST Display</Link>, payment gateways on{' '}
            <Link to="/settings/payment-gateways" className="text-primary underline">Settings ▸ Payment Gateways</Link>, and
            delivery on <Link to="/settings/shipping" className="text-primary underline">Settings ▸ Shipping &amp; Fees</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={market.label} disabled={disabled} onChange={(e) => onField({ label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Locale</Label>
            <Input value={market.locale} disabled={disabled} onChange={(e) => onField({ locale: e.target.value })} placeholder="en-IN" />
            <p className="text-xs text-muted-foreground">The language/region tag used for hreflang and number formatting, e.g. en-IN.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Editing: {market.label} <Badge variant="outline" className="font-mono text-[10px]">{market.code}</Badge>
        </CardTitle>
        <CardDescription>Every field below maps directly to this market&apos;s stored settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="assortment">Assortment</TabsTrigger>
            <TabsTrigger value="gateways">Payment gateways</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={market.code} disabled={disabled} onChange={(e) => onField({ code: e.target.value.toLowerCase() })} />
                <p className="text-xs text-muted-foreground">Lowercase, unique. A storefront deployment sends this as its x-market header.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input value={market.label} disabled={disabled} onChange={(e) => onField({ label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Locale</Label>
                <Input value={market.locale} disabled={disabled} onChange={(e) => onField({ locale: e.target.value })} placeholder="en" />
              </div>
              <div className="space-y-1.5">
                <Label>Storefront host</Label>
                <Input
                  value={market.storefrontHost} disabled={disabled}
                  onChange={(e) => onField({ storefrontHost: e.target.value.replace(/^https?:\/\//, '').replace(/\/+$/, '') })}
                  placeholder="shop.example.com"
                />
                <p className="text-xs text-muted-foreground">No https:// or trailing slash — this market&apos;s canonical public address.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tax treatment</Label>
                <Select value={market.taxTreatment} disabled={disabled} onValueChange={(v) => onField({ taxTreatment: v as TaxTreatment })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_TREATMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={market.enabled} disabled={disabled} onCheckedChange={(v) => onField({ enabled: v })} />
                <Label className="!mt-0">Switched on</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Countries</Label>
              <ChipsInput value={market.countries} onChange={(v) => onField({ countries: v })} uppercase disabled={disabled} placeholder="US, or * for everywhere" />
              <p className="text-xs text-muted-foreground">2-letter country codes (e.g. US, GB). Use * for &quot;everywhere not claimed by another market&quot;.</p>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pricing mode</Label>
                <Select value={market.pricing.mode} disabled={disabled} onValueChange={(v) => onPricing({ mode: v as MarketPricingMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fx">Currency conversion (FX)</SelectItem>
                    <SelectItem value="price_list">Stated price list</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rate source</Label>
                <Select value={market.pricing.rateMode} disabled={disabled} onValueChange={(v) => onPricing({ rateMode: v as RateMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic (daily FX feed)</SelectItem>
                    <SelectItem value="manual">Manual rates below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default currency</Label>
                <Input value={market.pricing.defaultCurrency} disabled={disabled} maxLength={3} className="font-mono" onChange={(e) => onPricing({ defaultCurrency: e.target.value.toUpperCase() })} />
                <p className="text-xs text-muted-foreground">Shown when the visitor&apos;s own currency is not switched on.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Margin over the FX rate</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.1" min={0} value={market.pricing.bufferPct} disabled={disabled} onChange={(e) => onPricing({ bufferPct: Number(e.target.value) || 0 })} />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Rounding</Label>
                <Select value={market.pricing.roundingRule} disabled={disabled} onValueChange={(v) => onPricing({ roundingRule: v as RoundingRule })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUNDING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Manual rates</Label>
              <p className="mb-1 text-xs text-muted-foreground">Units of that currency per ₹1. Used when the rate source above is &quot;Manual&quot;, or as an override.</p>
              <ManualRatesEditor rates={market.pricing.manualRates} disabled={disabled} onChange={(v) => onPricing({ manualRates: v })} />
            </div>
          </TabsContent>

          <TabsContent value="assortment" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label>Excluded potencies</Label>
              <ChipsInput value={market.assortment.excludePotencies} onChange={(v) => onAssortment({ excludePotencies: v })} uppercase disabled={disabled} placeholder="Q" />
              <p className="text-xs text-muted-foreground">e.g. Q (mother tinctures / ethanol) — often excluded from air or international shipments.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Excluded categories (slugs)</Label>
              <ChipsInput value={market.assortment.excludeCategorySlugs} onChange={(v) => onAssortment({ excludeCategorySlugs: v })} disabled={disabled} placeholder="mother-tinctures" />
            </div>
            <div className="space-y-1.5">
              <Label>Excluded brands (slugs)</Label>
              <ChipsInput value={market.assortment.excludeBrandSlugs} onChange={(v) => onAssortment({ excludeBrandSlugs: v })} disabled={disabled} placeholder="brand-slug" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Switch checked={market.assortment.requireDimsConfirmed} disabled={disabled} onCheckedChange={(v) => onAssortment({ requireDimsConfirmed: v })} />
                <Label className="!mt-0">Only sell SKUs with a confirmed weight/size</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={market.assortment.allowPrescription} disabled={disabled} onCheckedChange={(v) => onAssortment({ allowPrescription: v })} />
                <Label className="!mt-0">Allow prescription-only products</Label>
              </div>
            </div>
            <div className="max-w-md space-y-1.5">
              <Label>Dangerous-goods policy</Label>
              <Select value={market.assortment.dgPolicy} disabled={disabled} onValueChange={(v) => onAssortment({ dgPolicy: v as DgPolicy })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DG_POLICY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="gateways" className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">
              Which payment options this market offers, and the order they are shown in. A market that is switched on with
              no gateway below cannot take payment.
            </p>
            <GatewaysEditor gateways={market.paymentGateways} disabled={disabled} onChange={onGateways} />
          </TabsContent>

          <TabsContent value="notifications" className="space-y-5 pt-4">
            <div className="space-y-1.5">
              <Label>Order update channels, in priority order</Label>
              <p className="text-xs text-muted-foreground">The order a channel is tried when a caller does not force one. Click to add/remove a channel; use the arrows to change priority.</p>
              <OrderedChannelPicker value={market.notifications.orderChannels} onChange={(v) => onNotifications({ orderChannels: v })} allowed={ORDER_NOTIFY_CHANNELS} disabled={disabled} />
            </div>
            <div className="space-y-1.5">
              <Label>OTP (login / COD) channels, in priority order</Label>
              <OrderedChannelPicker value={market.notifications.otpChannels} onChange={(v) => onNotifications({ otpChannels: v })} allowed={OTP_NOTIFY_CHANNELS} disabled={disabled} />
            </div>
            <div className="max-w-md space-y-1.5">
              <Label>Marketing consent</Label>
              <Select value={market.notifications.marketingConsent} disabled={disabled} onValueChange={(v) => onNotifications({ marketingConsent: v as MarketingConsentMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MARKETING_CONSENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-md space-y-1.5">
              <Label>International SMS provider</Label>
              <Input
                value={market.notifications.smsProvider ?? ''} disabled={disabled} placeholder="Not set — this market sends no SMS"
                onChange={(e) => onNotifications({ smsProvider: e.target.value.trim() ? e.target.value : null })}
              />
              <p className="text-xs text-muted-foreground">India&apos;s DLT route cannot deliver to a foreign number. Leave blank until an international SMS account exists.</p>
            </div>
          </TabsContent>

          <TabsContent value="shipping" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Incoterm</Label>
                <Select value={market.shipping.defaultIncoterm} disabled={disabled} onValueChange={(v) => onShipping({ defaultIncoterm: v as Incoterm })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAP">DAP — buyer pays duty on arrival</SelectItem>
                    <SelectItem value="DDP">DDP — duty paid by the store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customs declaration (CSB)</Label>
                <Select value={market.shipping.csbType} disabled={disabled} onValueChange={(v) => onShipping({ csbType: v as CsbType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="V">CSB-V</SelectItem>
                    <SelectItem value="IV">CSB-IV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Flat shipping fee override</Label>
                <Input
                  type="number" min={0} step="1" disabled={disabled} value={market.shipping.flatFee ?? ''} placeholder="Store default"
                  onChange={(e) => onShipping({ flatFee: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">₹, charged when no shipping zone matches the destination. Blank = use the store&apos;s own flat fee.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Free shipping above</Label>
                <Input
                  type="number" min={0} step="1" disabled={disabled} value={market.shipping.freeAbove ?? ''} placeholder="Never"
                  onChange={(e) => onShipping({ freeAbove: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">₹ items total from which the fee above is waived. Blank = never waived.</p>
              </div>
            </div>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Shipping zones and carrier rates are configured once for the whole store on{' '}
              <Link to="/settings/shipping" className="text-primary underline">Settings ▸ Shipping &amp; Fees</Link>. To state
              an explicit per-SKU price for this market instead of converting the INR price, use{' '}
              <Link to="/inventory" className="text-primary underline">Inventory ▸ Market prices</Link>.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────── page ───────────────────────────

const Markets: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const { toast } = useToast();
  const canManage = hasPerm('settings.manage');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<MarketsConfig>(() => normalizeConfig(null));
  const [selected, setSelected] = useState<string>('in');
  const [showJson, setShowJson] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const view = await settingsRegistryAPI.get();
        const defs: Array<{ key: string; value: any }> = Array.isArray(view?.definitions) ? view.definitions : [];
        const def = defs.find((d) => d.key === 'markets');
        const next = normalizeConfig(def?.value);
        if (!cancelled) {
          setCfg(next);
          setSelected(next.list.some((m) => m.code === next.default) ? next.default : (next.list[0]?.code ?? 'in'));
        }
      } catch {
        if (!cancelled) {
          toast({ title: 'Could not load Markets', description: 'Showing India-only defaults — reload to try again.', variant: 'destructive' });
          setCfg(normalizeConfig(null));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeMarket = cfg.list.find((m) => m.code === selected) ?? null;

  const updateMarket = (code: string, updater: Partial<Market> | ((m: Market) => Market)) => {
    setCfg((prev) => ({
      ...prev,
      list: prev.list.map((m) => (m.code === code ? (typeof updater === 'function' ? updater(m) : { ...m, ...updater }) : m)),
    }));
  };
  const updatePricing = (code: string, patch: Partial<MarketPricing>) => updateMarket(code, (m) => ({ ...m, pricing: { ...m.pricing, ...patch } }));
  const updateAssortment = (code: string, patch: Partial<MarketAssortment>) => updateMarket(code, (m) => ({ ...m, assortment: { ...m.assortment, ...patch } }));
  const updateShipping = (code: string, patch: Partial<MarketShipping>) => updateMarket(code, (m) => ({ ...m, shipping: { ...m.shipping, ...patch } }));
  const updateNotifications = (code: string, patch: Partial<MarketNotifications>) => updateMarket(code, (m) => ({ ...m, notifications: { ...m.notifications, ...patch } }));

  const addInternationalMarket = () => {
    const used = new Set(cfg.list.map((m) => m.code));
    let code = 'intl';
    let n = 2;
    while (used.has(code)) { code = `intl${n}`; n += 1; }
    const m: Market = { ...intlMarketTemplate(), code, label: code === 'intl' ? 'International' : `International ${n - 1}` };
    setCfg((prev) => ({ ...prev, list: [...prev.list, m] }));
    setSelected(code);
  };

  const removeMarket = (code: string) => {
    if (code === 'in') return;
    if (!window.confirm('Remove this market? Its settings are lost once you save.')) return;
    setCfg((prev) => ({
      default: prev.default === code ? 'in' : prev.default,
      list: prev.list.filter((m) => m.code !== code),
    }));
    if (selected === code) setSelected('in');
  };

  const handleSave = async () => {
    const errs = validateConfig(cfg);
    setErrors(errs);
    if (errs.length) {
      toast({ title: 'Fix the errors below before saving', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await settingsRegistryAPI.update('markets', { default: cfg.default, list: cfg.list });
      toast({ title: 'Markets saved' });
    } catch (e: any) {
      toast({ title: 'Could not save Markets', description: e?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="mb-4 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Globe2 className="h-7 w-7 text-muted-foreground" /> Markets
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The regions you sell in — each with its own website address, currency, countries, tax treatment, payment
              options and product exclusions. India is always present; switch on an international market to sell abroad.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowJson((v) => !v)}>
              {showJson ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showJson ? 'Hide JSON' : 'Preview JSON'}
            </Button>
            {canManage && (
              <Button type="button" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You have read-only access to Markets. Ask an admin for the &quot;Manage settings&quot; permission to make changes.
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Fix these before saving</div>
          <ul className="list-disc space-y-0.5 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {showJson && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Normalised JSON (what Save writes)</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded bg-gray-950 p-3 text-xs text-green-300">{JSON.stringify(cfg, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Your markets</CardTitle>
            <CardDescription>The market a request resolves to decides its currency, tax treatment, product exclusions and payment options.</CardDescription>
          </div>
          {canManage && (
            <Button type="button" variant="outline" onClick={addInternationalMarket}>
              <Plus className="mr-2 h-4 w-4" /> Add international market
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {cfg.list.map((m) => (
            <div
              key={m.code}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${selected === m.code ? 'border-primary bg-primary/5' : 'border-gray-200'}`}
            >
              <Switch checked={m.enabled} disabled={!canManage} onCheckedChange={(v) => updateMarket(m.code, { enabled: v })} />
              <div className="min-w-[180px]">
                <div className="flex items-center gap-2 font-medium">
                  {m.label}
                  <Badge variant="outline" className="font-mono text-[10px]">{m.code}</Badge>
                  {cfg.default === m.code && <Badge className="text-[10px]">Default</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{m.locale} · {m.countries.join(', ') || '—'}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {cfg.default !== m.code && (
                  <Button type="button" variant="ghost" size="sm" disabled={!canManage} onClick={() => setCfg((p) => ({ ...p, default: m.code }))}>
                    <Star className="mr-1.5 h-3.5 w-3.5" /> Make default
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(m.code)}>
                  {selected === m.code ? 'Editing' : 'Edit'}
                </Button>
                {m.code !== 'in' && canManage && (
                  <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => removeMarket(m.code)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {activeMarket && (
        <MarketEditorPanel
          market={activeMarket}
          disabled={!canManage}
          restricted={activeMarket.code === 'in'}
          onField={(patch) => updateMarket(activeMarket.code, patch)}
          onPricing={(patch) => updatePricing(activeMarket.code, patch)}
          onAssortment={(patch) => updateAssortment(activeMarket.code, patch)}
          onShipping={(patch) => updateShipping(activeMarket.code, patch)}
          onGateways={(next) => updateMarket(activeMarket.code, { paymentGateways: next })}
          onNotifications={(patch) => updateNotifications(activeMarket.code, patch)}
        />
      )}
    </div>
  );
};

export default Markets;
