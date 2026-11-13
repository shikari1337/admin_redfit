import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, CheckCircle2, ChevronRight, Circle, CreditCard, HelpCircle, Landmark, Loader2, Package2, Plug,
  ShieldCheck, Store, Truck, Warehouse, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Page, PageHeader } from '../components/erp';
import { CARD } from '../components/erp/Card';
import { api, invoicesAPI, staffAPI, warehousesAPI } from '../services/api';
import { listTotal, payload } from '../lib/unwrap';
import { loadStoreConfig } from '../lib/storeConfig';
import { canOpenPath } from '../lib/routePermissions';
import { cn } from '@/lib/utils';

/**
 * Setup Guide: the steps left before this store is ready to sell (menu tip), then the extras.
 *
 * Every step is CHECKED against the store's own data, through the same reads its page makes, so the
 * guide can never say "done" while the page says otherwise: store details (settings), invoice and
 * GST details (the books invoice config's own `missing` list), a warehouse with a PIN code, products
 * switched on, an online payment method shoppers are offered at checkout (the storefront's gateway
 * list), and the team. A check the viewer's role may not read is never asked for (no doomed 403): it
 * says so instead. A link is shown only when the viewer may open its page.
 */

type State = 'checking' | 'done' | 'todo' | 'unknown';
interface Result { state: State; detail?: string }

interface Gate {
  hasPerm: (p: string) => boolean;
  canAccess: (m: string) => boolean;
}

/** What the checks share: the settings are read once for the store details and payment steps. */
interface Reads { settings: () => Promise<Record<string, any>> }

interface Step {
  key: string;
  icon: LucideIcon;
  title: string;
  why: string;
  to: string;
  action: string;
  /** Not needed to sell; shown, never counted. */
  optional?: boolean;
  /** May this viewer read what the check reads. */
  canCheck: (g: Gate) => boolean;
  check: (r: Reads) => Promise<Result>;
}

const blank = (v: unknown) => !String(v ?? '').trim();
const listOf = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  for (const k of ['data', 'warehouses', 'items', 'rows']) if (Array.isArray(res?.[k])) return res[k];
  return [];
};
const joinWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const people = (k: number) => `${k.toLocaleString('en-IN')} ${k === 1 ? 'person' : 'people'}`;

const STEPS: Step[] = [
  {
    key: 'store', icon: Store, title: 'Store details',
    why: 'Your store name, contact and address appear on the shop, on invoices and in every email.',
    to: '/settings/store-config', action: 'Fill in store details',
    canCheck: (g) => g.hasPerm('settings.read'),
    check: async (r) => {
      const cfg = loadStoreConfig(await r.settings());
      const missing = ([
        [cfg.business.name, 'store name'], [cfg.contact.email, 'email'], [cfg.contact.phone, 'phone'],
        [cfg.address.line1, 'address'], [cfg.address.city, 'city'], [cfg.address.postalCode, 'postal code'],
      ] as Array<[string, string]>).filter(([v]) => blank(v)).map(([, label]) => label);
      return missing.length
        ? { state: 'todo', detail: `Still missing: ${joinWords(missing)}.` }
        : { state: 'done', detail: `${cfg.business.name}, ${cfg.address.city}.` };
    },
  },
  {
    key: 'invoice', icon: Landmark, title: 'Invoice and GST details',
    why: 'Your legal name, GSTIN and address print on every invoice. Invoices cannot be sent until they are filled.',
    to: '/settings/invoice', action: 'Open invoice settings',
    canCheck: (g) => g.hasPerm('settings.read'),
    check: async () => {
      const res = await invoicesAPI.getConfig();
      const d = res?.data ?? res;
      // The books service decides what an invoice needs (`missing_required_fields`): nothing listed here.
      if (!Array.isArray(d?.missing)) return { state: 'unknown', detail: 'The invoice settings did not say what is missing.' };
      const labels = d.missing.map((m: any) => String(m?.label ?? m?.field ?? '')).filter(Boolean);
      return labels.length
        ? { state: 'todo', detail: `Still missing: ${joinWords(labels)}.` }
        : { state: 'done', detail: 'Every detail an invoice needs is filled in.' };
    },
  },
  {
    key: 'warehouse', icon: Warehouse, title: 'Where you ship from',
    why: 'Couriers collect from a warehouse address, and stock is kept per warehouse.',
    to: '/warehouses', action: 'Open warehouses',
    canCheck: (g) => (g.hasPerm('inventory.read') || g.hasPerm('warehouse.read')) && g.canAccess('inventory'),
    check: async () => {
      const active = listOf(await warehousesAPI.getAll()).filter((w) => w?.is_active !== false && w?.isActive !== false);
      const withPin = active.filter((w) => !blank(w?.pincode ?? w?.address?.pincode));
      if (withPin.length) return { state: 'done', detail: `${withPin.length.toLocaleString('en-IN')} active ${withPin.length === 1 ? 'warehouse' : 'warehouses'} with an address.` };
      return { state: 'todo', detail: active.length ? 'Add the PIN code to your warehouse address.' : 'No active warehouse yet.' };
    },
  },
  {
    key: 'products', icon: Package2, title: 'Products on sale',
    why: 'Shoppers can only buy what is listed and switched on.',
    to: '/products', action: 'Open products',
    canCheck: (g) => g.hasPerm('products.read'),
    check: async () => {
      const total = listTotal(await api.get('/products', { params: { active: true, limit: 1 } }));
      return total > 0
        ? { state: 'done', detail: `${total.toLocaleString('en-IN')} ${total === 1 ? 'product is' : 'products are'} switched on.` }
        : { state: 'todo', detail: 'No product is switched on yet.' };
    },
  },
  {
    key: 'payments', icon: CreditCard, title: 'Taking payment online',
    why: 'Shoppers pay at checkout with the methods switched on here. Cash on delivery works without one.',
    to: '/settings/payment-gateways', action: 'Open payment methods',
    canCheck: (g) => g.hasPerm('settings.read'),
    check: async (r) => {
      // Exactly what checkout offers (the storefront reads the same list): a method shows only once it can take money.
      const [gw, settings] = await Promise.all([api.get('/settings/payment-gateways').then((x) => payload<any>(x)), r.settings()]);
      const gateways: any[] = Array.isArray(gw?.gateways) ? gw.gateways : [];
      const online = gateways.filter((g) => g?.enabled !== false && g?.id !== 'manual').map((g) => String(g?.name || g?.id));
      const cod = settings?.shippingConfig ? settings.shippingConfig.codEnabled !== false : false;
      if (online.length) return { state: 'done', detail: `Shoppers can pay by ${joinWords(online)}${cod ? ', or cash on delivery' : ''}.` };
      return {
        state: 'todo',
        detail: cod ? 'Only cash on delivery is on. Set up an online method so shoppers can pay at checkout.' : 'No way to pay online is set up yet.',
      };
    },
  },
  {
    key: 'team', icon: ShieldCheck, title: 'Your team', optional: true,
    why: 'Give each person their own sign in, with a role that shows only their work.',
    to: '/settings/staff', action: 'Open staff and access',
    canCheck: (g) => g.hasPerm('staff.manage'),
    check: async () => {
      const list = listOf(await staffAPI.list()).filter((s) => s?.is_active !== false && s?.isActive !== false);
      return list.length > 1
        ? { state: 'done', detail: `${people(list.length)} can sign in.` }
        : { state: 'todo', detail: list.length === 1 ? 'Only one person can sign in.' : 'Nobody is listed yet.' };
    },
  },
];

/** Not checked: what a store usually sets up once it is selling. A card shows when one of its links opens. */
const MORE: Array<{ icon: LucideIcon; title: string; what: string; links: Array<{ to: string; label: string }> }> = [
  {
    icon: Truck, title: 'Shipping rates and couriers',
    what: 'Delivery fees, the free delivery threshold, zones and the couriers that collect from you.',
    links: [{ to: '/settings/shipping', label: 'Shipping settings' }],
  },
  {
    icon: Landmark, title: 'GST rate check',
    what: 'Compares your HSN codes and tax rules with the published rates, so you and your accountant see problems early.',
    links: [{ to: '/settings/tax-rules', label: 'Tax rules' }, { to: '/panel/accounting/rate-check', label: 'Run the rate check' }],
  },
  {
    icon: Plug, title: 'Other places you sell',
    what: 'Marketplaces connect for automatic sync. A shop counter or WhatsApp sales are recorded as manual orders against their own channel.',
    links: [{ to: '/channels', label: 'Channels' }, { to: '/orders/new', label: 'Create an order' }],
  },
  {
    icon: BookOpen, title: 'Accounting books',
    what: 'The chart of accounts comes ready. Keep automatic posting off until your accountant has checked the mapping.',
    links: [{ to: '/panel/accounting', label: 'Accounting' }, { to: '/panel/accounting/settings', label: 'Accounting settings' }],
  },
  {
    icon: Warehouse, title: 'Buying stock',
    what: 'Raise a purchase order, receive the goods, record the supplier bill and pay it, each step on record.',
    links: [{ to: '/vendors', label: 'Suppliers' }, { to: '/panel/inventory/purchasing', label: 'Purchasing' }, { to: '/panel/accounting/bills', label: 'Supplier bills' }],
  },
];

const STATUS: Record<State, { icon: LucideIcon; word: string; tone: string; chip: string }> = {
  done: { icon: CheckCircle2, word: 'Done', tone: 'text-good', chip: 'bg-good-bg text-good-ink' },
  todo: { icon: Circle, word: 'To do', tone: 'text-warn', chip: 'bg-warn-bg text-warn-ink' },
  unknown: { icon: HelpCircle, word: 'Not checked', tone: 'text-gray-400', chip: 'bg-gray-100 text-gray-600' },
  checking: { icon: Loader2, word: 'Checking', tone: 'text-gray-400 animate-spin', chip: 'bg-gray-100 text-gray-500' },
};

const linkCls = 'inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50';

const SetupGuide: React.FC = () => {
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const canOpen = (to: string) => canOpenPath(to, hasPerm, canAccess);
  const [results, setResults] = useState<Record<string, Result>>({});

  // What this viewer may check, as one string: checked once per distinct answer, not per render.
  const access = STEPS.map((s) => (s.canCheck({ hasPerm, canAccess }) ? 1 : 0)).join('');

  useEffect(() => {
    // `canAccess` fails open before the module map lands: wait, so no disabled module is asked.
    if (!modulesLoaded) return;
    let alive = true;
    let settingsP: Promise<Record<string, any>> | null = null;
    const reads: Reads = {
      settings: () => (settingsP ??= api.get('/settings/admin').then((r: any) => (r?.data ?? {}) as Record<string, any>)),
    };
    const first: Record<string, Result> = {};
    for (const s of STEPS) {
      first[s.key] = s.canCheck({ hasPerm, canAccess })
        ? { state: 'checking' }
        : { state: 'unknown', detail: 'Your role cannot see this, so it was not checked.' };
    }
    setResults(first);
    for (const s of STEPS) {
      if (first[s.key].state !== 'checking') continue;
      s.check(reads)
        .catch((): Result => ({ state: 'unknown', detail: 'Could not be checked just now. Open the page to see it.' }))
        .then((r) => { if (alive) setResults((prev) => ({ ...prev, [s.key]: r })); });
    }
    return () => { alive = false; };
    // `access` encodes every hasPerm/canAccess answer the checks use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesLoaded, access]);

  const required = STEPS.filter((s) => !s.optional);
  const stateOf = (s: Step): State => results[s.key]?.state ?? 'checking';
  const done = required.filter((s) => stateOf(s) === 'done').length;
  const checking = STEPS.some((s) => stateOf(s) === 'checking');
  const next = required.find((s) => stateOf(s) === 'todo');
  const unknown = required.filter((s) => stateOf(s) === 'unknown').length;
  const more = MORE.map((m) => ({ ...m, links: m.links.filter((l) => canOpen(l.to)) })).filter((m) => m.links.length > 0);

  return (
    <Page>
      <PageHeader
        icon={HelpCircle}
        title="Setup Guide"
        description="What is left before this store is ready to sell, checked against your store as it is now."
        actions={canOpen('/setup') ? <Link to="/setup" className={linkCls}>Open the setup wizard</Link> : undefined}
      />

      {/* What to act on first, in one sentence. */}
      <section aria-label="Where setup stands" aria-busy={checking || undefined}
        className={cn(CARD, 'flex flex-wrap items-center justify-between gap-3 px-4 py-4')} data-setup-summary>
        <div className="flex min-w-0 items-start gap-3">
          {!checking && !next && unknown === 0
            ? <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
            : <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />}
          <div className="min-w-0 text-sm">
            <div className="font-medium text-gray-900">
              {checking && done === 0 && !next
                ? 'Checking your store…'
                : !next && unknown === 0 && !checking
                  ? 'Your store has what it needs to sell.'
                  : `${done} of ${required.length} steps done.${next ? ` Next: ${next.title}.` : ''}`}
            </div>
            {!checking && unknown > 0 && (
              <div className="text-gray-500">
                {unknown === 1 ? 'One step' : `${unknown} steps`} could not be checked. Each says why below.
              </div>
            )}
          </div>
        </div>
        {next && canOpen(next.to) && (
          <Link to={next.to} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
            {next.action}<ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </section>

      <ol className="grid gap-3 lg:grid-cols-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const r = results[s.key] ?? { state: 'checking' as State };
          const st = STATUS[r.state];
          return (
            <li key={s.key} className={cn(CARD, 'p-4 sm:p-5')} data-setup-step={s.key} data-state={r.state}>
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-900/5 text-gray-700">
                  <s.icon aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">
                      <span className="mr-1.5 tabular-nums text-gray-400">{i + 1}.</span>{s.title}
                      {s.optional && <span className="ml-1.5 text-xs font-normal text-gray-500">(optional)</span>}
                    </h2>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', st.chip)}>
                      <st.icon aria-hidden className={cn('size-3.5', st.tone)} />{st.word}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{s.why}</p>
                  {r.detail && <p className={cn('mt-1 text-sm', r.state === 'todo' ? 'font-medium text-gray-900' : 'text-gray-600')}>{r.detail}</p>}
                  {canOpen(s.to) && (
                    <div className="mt-3">
                      <Link to={s.to} className={linkCls}>{s.action}<ChevronRight aria-hidden className="size-4 text-gray-400" /></Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {more.length > 0 && (
        <section aria-label="When you are ready for more" className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">When you are ready for more</h2>
            <p className="text-sm text-gray-500">Not needed to start selling, and not checked here.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {more.map((m) => (
              <div key={m.title} className={cn(CARD, 'p-4 sm:p-5')}>
                <div className="flex items-center gap-3 font-semibold text-gray-900">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-900/5 text-gray-700">
                    <m.icon aria-hidden className="size-5" />
                  </span>
                  <span>{m.title}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{m.what}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.links.map((l) => (
                    <Link key={l.to} to={l.to} className={linkCls}>{l.label}<ChevronRight aria-hidden className="size-4 text-gray-400" /></Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
};

export default SetupGuide;
