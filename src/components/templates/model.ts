/**
 * MESSAGE TEMPLATES — the presentation vocabulary for the catalogue
 * (docs/MESSAGE_TEMPLATES_PLAN.md §5). Nothing here decides which layer a send
 * uses: the server resolves it (`resolveTemplate`) and the catalogue route
 * carries the answer. This file only turns that answer into words and tones.
 */
import type { Tone } from '@/components/erp/StatusChip';
import type { MsgCatalogue, MsgCatalogueEntry, MsgChannel, MsgKind, MsgResolvedLayer, MsgTemplateDef } from '@/services/api';

export const CHANNEL_ORDER: MsgChannel[] = ['email', 'sms', 'whatsapp', 'push'];

export const CHANNEL_LABEL: Record<MsgChannel, string> = {
  email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push',
};

export const KIND_LABEL: Record<MsgKind, string> = {
  authentication: 'Authentication', update: 'Update', marketing: 'Marketing',
};
export const KIND_TONE: Record<MsgKind, Tone> = {
  authentication: 'blue', update: 'neutral', marketing: 'amber',
};
export const KIND_HELP: Record<MsgKind, string> = {
  authentication: 'Sign-in codes. Always sent, never counted as marketing.',
  update: 'Something the person needs to know about their own order, account or document.',
  marketing: 'Offers and news. Needs opt-in; quiet hours and the weekly cap apply.',
};

/** Fallback product names when the server sends a bare key. The server's `label` wins. */
const PRODUCT_NAMES: Record<string, string> = {
  growcord: 'Growcord', hub: 'Growcord ID', commerce: 'Commerce', books: 'Books', ship: 'Ship',
  wms: 'WMS', make: 'Make', trade: 'Trade', retail: 'Retail', crm: 'CRM', people: 'People',
  comms: 'Comms', reach: 'Reach', insights: 'Insights', finance: 'Finance', domains: 'Domains',
  links: 'Links', wa: 'WhatsApp Platform', website: 'Website',
};
export const productLabel = (cat: MsgCatalogue | null, product: string): string =>
  cat?.products.find((p) => p.product === product)?.label || PRODUCT_NAMES[product] || product;

/** Is this product switched on for the store? The server decides (`products[].enabled`); unknown = on. */
export const productEnabled = (cat: MsgCatalogue | null, product: string): boolean =>
  cat?.products.find((p) => p.product === product)?.enabled !== false;

export const PRODUCT_OFF_TIP = 'Not switched on for this store (Settings 17.1)';

/**
 * The product tabs, Commerce first: the products the store has switched on,
 * or — with `showAll` — every product in the catalogue (the page greys the
 * ones that are off). A product only appears when it has entries.
 */
export function productTabs(cat: MsgCatalogue | null, showAll = false): string[] {
  if (!cat) return [];
  const withEntries = new Set(cat.entries.map((e) => e.def.product));
  const order = [...cat.products.map((p) => p.product), ...[...withEntries].filter((p) => !cat.products.some((x) => x.product === p))];
  return [...new Set(order)]
    .filter((p) => withEntries.has(p) && (showAll || productEnabled(cat, p)))
    .sort((a, b) => (a === 'commerce' ? -1 : b === 'commerce' ? 1 : 0));
}

/* ── layers ────────────────────────────────────────────────────────────────── */

export type LayerKey = 'growcord' | 'store' | 'store_registered' | 'not_registered' | 'none';
export const LAYER_FILTER_LABEL: Record<LayerKey, string> = {
  growcord: 'Growcord default',
  store: 'Store override',
  store_registered: 'Store override · registered',
  not_registered: 'Not registered (DLT)',
  none: 'No text',
};

export const isStoreLayer = (l?: MsgResolvedLayer | null) =>
  l?.source === 'store_version' || l?.source === 'store_sms';

/**
 * Which layer ONE channel of ONE event resolves to — read from the server's
 * `resolved` block, never guessed. SMS gets the DLT reading on top, because an
 * unregistered DLT text is refused by the operator whatever it says.
 */
export function layerOf(entry: MsgCatalogueEntry, channel: MsgChannel, smsOwnHeader?: boolean): LayerKey {
  const l = entry.resolved[channel];
  if (!l || l.source === 'none') return 'none';
  if (isStoreLayer(l)) {
    if (channel === 'sms') {
      const registered = l.registeredUnder === 'STORE' || (smsOwnHeader && !!l.providerRef);
      return registered ? 'store_registered' : 'store';
    }
    return 'store';
  }
  if (channel === 'sms' && entry.def.sms && entry.def.sms.dlt.registered === false) return 'not_registered';
  return 'growcord';
}

export const LAYER_TONE: Record<LayerKey, Tone> = {
  growcord: 'neutral', store: 'blue', store_registered: 'green', not_registered: 'amber', none: 'red',
};

/** Approval, as the PROVIDER last said it. `unknown` means nobody asked — not a refusal. */
export function approvalOf(l?: MsgResolvedLayer | null): { label: string; tone: Tone } | null {
  const s = String(l?.approvalStatus ?? '').toLowerCase();
  if (!s || s === 'not_applicable') return null;
  if (s === 'approved') return { label: 'Approved', tone: 'green' };
  if (s === 'pending' || s === 'draft') return { label: 'Pending Meta', tone: 'amber' };
  if (s === 'rejected') return { label: 'Rejected', tone: 'red' };
  if (s === 'paused' || s === 'disabled') return { label: s === 'paused' ? 'Paused' : 'Disabled', tone: 'red' };
  return { label: 'Not checked', tone: 'neutral' };
}

/* ── text ──────────────────────────────────────────────────────────────────── */

/** The Growcord default body for one channel, as written in the catalogue. */
export function defaultBody(def: MsgTemplateDef, channel: MsgChannel): { subject?: string; body: string } {
  switch (channel) {
    case 'sms': return { body: def.sms?.body ?? '' };
    case 'whatsapp': return { body: def.whatsapp?.preview || def.whatsapp?.body || '' };
    case 'push': return { subject: def.push?.title, body: def.push?.body ?? '' };
    case 'email': return { subject: def.email?.subject, body: '' };
    default: return { body: '' };
  }
}

/** Fill `{{key}}` with the catalogue's own examples, so a preview reads like a real message. */
export function fillExamples(text: string, def: MsgTemplateDef, extra: Record<string, string> = {}): string {
  const map: Record<string, string> = { ...extra };
  for (const v of def.variables) if (v.example) map[v.key] = v.example;
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (whole, k: string) => map[k] ?? whole);
}

/** Placeholders a text uses — the server refuses a version that uses one it does not declare. */
export function placeholdersIn(...texts: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of String(t ?? '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/** Search haystack for one row. */
export const rowHaystack = (e: MsgCatalogueEntry) =>
  `${e.def.title} ${e.def.event} ${e.def.key} ${e.def.description}`.toLowerCase();
