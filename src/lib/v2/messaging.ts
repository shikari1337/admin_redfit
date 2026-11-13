/**
 * MESSAGING — the typed client for the ONE messaging place in the store admin
 * (Messaging ▸ Notifications · WhatsApp · Email · SMS). Lane ADMIN-MSG-1.
 *
 * The routes are the comms app's (`/api/v2/comms/...`), as fixed by the shared
 * contract `growcord-rs/docs/briefs/MSG-0-contract.md` §4. Every call goes
 * straight to v2 through `v2call` (no legacy-path mapping, `api.ts` does not
 * grow). A route this server does not serve yet answers 404 or a typed
 * `v2.backend_gap`; `isGap` recognises both so a screen says "Not available on
 * this server yet" instead of going blank.
 *
 * Nothing here decides what is sent: the server owns the catalogue, the switch
 * a send checks, approval and DLT state. This file only carries the answers.
 */
import { V2_ENABLED } from './config';
import { backendGap, v2call } from './http';
import { getStoreTimeZone } from '@/utils/date';

const C = '/api/v2/comms';

/* ── types (contract §4) ───────────────────────────────────────────────────── */

export type MsgCh = 'email' | 'whatsapp' | 'sms' | 'push';
export const MSG_CHANNELS: MsgCh[] = ['email', 'whatsapp', 'sms', 'push'];
export const MSG_CHANNEL_LABEL: Record<MsgCh, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', push: 'Push' };

export type Approval = 'approved' | 'pending' | 'rejected' | 'not_submitted' | null;

export interface NotificationCell {
  available: boolean;
  enabled: boolean;
  customised: boolean;
  /** WhatsApp only. */
  approval: Approval;
  /** SMS only. */
  dlt: 'mapped' | 'unmapped' | null;
  last_sent_at: string | null;
  sent_30d: number;
}

export interface NotificationRow {
  key: string;
  product: string;
  group: string;
  label: string;
  trigger: string;
  audience: 'customer' | 'staff';
  purpose: 'transactional' | 'marketing' | 'authentication';
  automatic: boolean;
  channels: Record<MsgCh, NotificationCell | null>;
}

export interface AnalyticsPoint { date: string; sent: number; delivered: number; read: number; failed: number }
export interface MessagingAnalytics {
  totals: { sent: number; delivered: number; read: number; failed: number; cost: number | null };
  series: AnalyticsPoint[];
  by_key: Array<{ key: string; label: string; sent: number; delivered: number; read: number; failed: number }>;
  failures: Array<{ reason: string; count: number }>;
  /** The zone the days are counted in, and the server's own note on what the counts mean (MSG-2 additions). */
  timezone: string | null;
  note: string | null;
}

export interface EmailConfig {
  mode: 'platform' | 'own';
  from_name: string | null; from_email: string | null; reply_to: string | null;
  host: string | null; port: number | null; secure: boolean;
  username: string | null; password_set: boolean; live: boolean;
  /** The server's note on the active mode (MSG-2 addition). */
  note: string | null;
}
/**
 * What `PUT /email/config` takes (`EmailConfigBody`). `from_name` / `reply_to` are
 * the store's name and support email (Branding): the server accepts them only
 * unchanged, so this screen never sends them.
 */
export type EmailConfigInput = Partial<Pick<EmailConfig, 'mode' | 'from_email' | 'host' | 'port' | 'secure' | 'username'>> & { password?: string };

export interface WhatsAppConfig {
  mode: 'growcord' | 'own';
  provider: string | null;
  status: string | null;
  phone_number: string | null;
  display_name: string | null;
  quality: string | null;
  channel_priority: string[];
  live: boolean;
  credentials_set: boolean;
  /** §6: always Growcord's WhatsApp Platform on v2. */
  via: string | null;
  /** §6: whose number — Growcord's shared one, or the store's own number connected inside the Platform. */
  number_source: 'growcord' | 'own' | null;
  /** §6: the store's Platform account, masked. */
  platform_account: string | null;
  /** The store's "send on WhatsApp" switch (MSG-2 addition). */
  enabled: boolean;
  /** The Platform's id of the store's own number, when one is connected (MSG-2 addition). */
  phone_number_id: string | null;
  note: string | null;
}
/**
 * What `PUT /whatsapp/config` takes (`WhatsAppConfigBody`, deny-unknown-fields):
 * no `provider` (always Growcord's WhatsApp Platform). `api_key` is write-only.
 */
export type WhatsAppConfigInput = Partial<Pick<WhatsAppConfig, 'mode' | 'enabled' | 'channel_priority' | 'phone_number_id'>> & { api_key?: string };

export interface TestResult { ok: boolean; message: string }

export interface LayoutPreviewResult { subject: string | null; html: string | null; text: string }

/** One row of the dispatch log (`views::dispatch` DispatchRowView). Never a body. */
export interface DispatchRow {
  id: string;
  channel: string | null;
  provider: string | null;
  account_source: string | null;
  event: string | null;
  template_key: string | null;
  template_version: number | null;
  purpose_category: string | null;
  send_purpose: string | null;
  status: string | null;
  provider_message_id: string | null;
  error: string | null;
  skipped_reason: string | null;
  deferred_until: string | null;
  /** Masked by the server. */
  recipient: string | null;
  order_id: string | null;
  reference_kind: string | null;
  reference_id: string | null;
  units: number | null;
  actor_name: string | null;
  is_automated: boolean | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface DispatchEvent { id: string | null; status: string | null; provider_status: string | null; detail: string | null; source: string | null; occurred_at: string | null }
export interface DispatchDetail extends DispatchRow { timeline: DispatchEvent[] }
export interface DispatchPage { items: DispatchRow[]; cursor: string | null }

export interface ProviderTemplate { id: string; title: string | null; template: string; active: boolean }
export interface DltProposal {
  event: string; title: string; channel: string; provider_template_id: string | null;
  content: string; provider_text: string; confidence: string; score: number;
}

/** §6 route 8: a conversation (inbox). META-13 adds Messenger and Instagram threads to the same model (`channel`). */
export type InboxChannel = 'whatsapp' | 'messenger' | 'instagram';
export const INBOX_CHANNELS: InboxChannel[] = ['whatsapp', 'messenger', 'instagram'];
export const INBOX_CHANNEL_LABEL: Record<InboxChannel, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' };
/** `handle`: the Instagram username (META-13). */
export interface InboxContact { name: string | null; phone_masked: string | null; handle?: string | null }
export interface InboxItem {
  id: string; channel: string; contact: InboxContact;
  last: { text: string | null; direction: 'in' | 'out'; at: string | null } | null;
  unread: number; window_open: boolean; order_ref: string | null;
}
export interface InboxMessage {
  id: string; direction: 'in' | 'out'; kind: string; text: string | null; media_url: string | null;
  template_key: string | null; status: string | null; at: string | null;
  /** META-13 (Messenger, Instagram): who sent it from the store's side, attachment count, removed by the person. */
  by?: string | null; attachments?: number; deleted?: boolean;
}
/** META-13: the store customer beside a Messenger or Instagram thread, matched by a phone or e-mail shared in the chat. */
export interface InboxCustomer {
  matched_by: string; name: string | null; phone_masked: string | null; email_masked: string | null;
  orders: Array<{ id: string; number: string | null; status: string | null; payment_status: string | null; total: string | null; at: string | null }>;
  orders_found: number; more: boolean;
}
export interface InboxThread {
  id: string; channel: string; contact: InboxContact; window_open: boolean; window_closes_at: string | null; messages: InboxMessage[];
  /** META-13: only for a caller who may read orders, and only once the person shared a phone or e-mail. */
  customer?: InboxCustomer | null;
  /** Where the chat began when Meta said (`ADS`, a link) and the ad's id. */
  origin_source?: string | null; origin_ad_id?: string | null;
}
/** META-13 `GET|PUT /inbox/settings`: the Messenger profile (greeting, ice breakers, menu) and each push's result. */
export interface MessengerProfile {
  greeting: Array<{ locale: string; text: string }>;
  ice_breakers: Array<{ locale: string; questions: Array<{ question: string; payload?: string | null }> }>;
  persistent_menu: Array<{ locale: string; composer_input_disabled?: boolean; items: Array<{ type: 'postback' | 'web_url' | string; title: string; url?: string | null; payload?: string | null }> }>;
  /** Also push the ice breakers and menu to Instagram. */
  instagram: boolean;
}
export interface InboxSettings {
  profile: MessengerProfile;
  pushed: Array<{ platform: string; ok: boolean; error: string | null; at: string | null; by: string | null }>;
  updated_by: string | null;
}
/** §6 route 9: one row of the SMS routing table. */
export interface SmsRoute { country: string; provider: string | null; sender: string | null; source: 'growcord' | 'own' | null; reachable: boolean }

export interface DispatchFilter {
  channel?: string;
  status?: string;
  key?: string;
  /** Store days, `YYYY-MM-DD` (sent to the server as the instants that bound them). */
  from?: string;
  to?: string;
  /** Masked-recipient search. */
  q?: string;
}

/* ── errors ─────────────────────────────────────────────────────────────────── */

/** A route this server does not serve yet: 404/405/501, or the typed `v2.backend_gap`. */
export function isGap(e: any): boolean {
  const s = e?.response?.status;
  const code = e?.response?.data?.code ?? e?.response?.data?.error?.code ?? e?.code;
  return s === 404 || s === 405 || s === 501 || code === 'v2.backend_gap' || code === 'V2_BACKEND_GAP';
}

/** The typed code of a refusal (`comms.wrong_state`, …), when the server sent one. */
export function errCode(e: any): string | null {
  const d = e?.response?.data;
  const c = d?.code ?? d?.error?.code ?? null;
  return typeof c === 'string' ? c : null;
}

/**
 * A refused inbox reply in the screen's words (route 8: 409 `comms.wrong_state` = the 24-hour window closed).
 * Messenger and Instagram have no templates yet, so there the server's own sentence is shown (META-13).
 */
export function inboxReplyErrText(e: any, channel: string = 'whatsapp'): string {
  const code = errCode(e);
  if (channel !== 'whatsapp' && (code === 'comms.wrong_state' || e?.response?.status === 409)) {
    return errText(e, 'The 24 hour reply window is closed: the customer has not written in the last 24 hours. Nothing was sent; you can reply once they write again.');
  }
  if (code === 'comms.wrong_state' || e?.response?.status === 409) return 'The 24-hour window is closed — send an approved template';
  if (code === 'comms.not_configured') return 'This store’s WhatsApp line is not on Growcord’s WhatsApp Platform yet, so replies cannot be sent from here.';
  if (code === 'comms.gateway_refused') return `The WhatsApp Platform refused the reply: ${errText(e, 'no reason given')}`;
  return errText(e, 'The reply was refused.');
}

/** The server's own words for a refusal, else the fallback. */
export function errText(e: any, fallback: string): string {
  const d = e?.response?.data;
  return d?.message || d?.error?.message || (typeof d?.error === 'string' ? d.error : '') || e?.message || fallback;
}

async function call<T>(method: string, path: string, opts: Parameters<typeof v2call>[2] = {}): Promise<T> {
  if (!V2_ENABLED) backendGap(`${method} ${path} (this build is not on the v2 API)`);
  return v2call<T>(method, `${C}${path}`, opts);
}

/* ── shapes ─────────────────────────────────────────────────────────────────── */

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));

function cell(raw: any): NotificationCell | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    available: raw.available !== false,
    enabled: !!raw.enabled,
    customised: !!raw.customised,
    approval: (raw.approval ?? null) as Approval,
    dlt: raw.dlt === 'mapped' || raw.dlt === 'unmapped' ? raw.dlt : null,
    last_sent_at: s(raw.last_sent_at),
    sent_30d: n(raw.sent_30d),
  };
}

function notificationRow(raw: any): NotificationRow {
  const ch = raw?.channels ?? {};
  return {
    key: String(raw?.key ?? ''),
    product: String(raw?.product ?? 'commerce'),
    group: String(raw?.group ?? 'other'),
    label: String(raw?.label || raw?.key || ''),
    trigger: String(raw?.trigger ?? ''),
    audience: raw?.audience === 'staff' ? 'staff' : 'customer',
    purpose: raw?.purpose === 'marketing' || raw?.purpose === 'authentication' ? raw.purpose : 'transactional',
    automatic: !!raw?.automatic,
    channels: { email: cell(ch.email), whatsapp: cell(ch.whatsapp), sms: cell(ch.sms), push: cell(ch.push) },
  };
}

const listOf = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []);

function dispatchRow(r: any): DispatchRow {
  return {
    id: String(r?.id ?? ''),
    channel: s(r?.channel), provider: s(r?.provider), account_source: s(r?.account_source),
    event: s(r?.event), template_key: s(r?.template_key), template_version: r?.template_version ?? null,
    purpose_category: s(r?.purpose_category), send_purpose: s(r?.send_purpose),
    status: s(r?.status), provider_message_id: s(r?.provider_message_id),
    error: s(r?.error), skipped_reason: s(r?.skipped_reason), deferred_until: s(r?.deferred_until),
    recipient: s(r?.recipient), order_id: s(r?.order_id),
    reference_kind: s(r?.reference_kind), reference_id: s(r?.reference_id),
    units: r?.units ?? null, actor_name: s(r?.actor_name), is_automated: r?.is_automated ?? null,
    source: s(r?.source), created_at: s(r?.created_at), updated_at: s(r?.updated_at),
  };
}

function contactOf(c: any): InboxContact {
  return { name: s(c?.name), phone_masked: s(c?.phone_masked), handle: s(c?.handle) };
}
function inboxMessage(m: any): InboxMessage {
  return {
    id: String(m?.id ?? ''), direction: m?.direction === 'out' ? 'out' : 'in', kind: String(m?.kind ?? 'text'),
    text: s(m?.text), media_url: s(m?.media_url), template_key: s(m?.template_key), status: s(m?.status), at: s(m?.at),
    by: s(m?.by), attachments: n(m?.attachments), deleted: !!m?.deleted,
  };
}
function inboxCustomer(c: any): InboxCustomer | null {
  if (!c || typeof c !== 'object') return null;
  return {
    matched_by: String(c.matched_by ?? ''), name: s(c.name), phone_masked: s(c.phone_masked), email_masked: s(c.email_masked),
    orders: listOf(c.orders).map((o: any) => ({ id: String(o?.id ?? ''), number: s(o?.number), status: s(o?.status), payment_status: s(o?.payment_status), total: s(o?.total), at: s(o?.at) })),
    orders_found: n(c.orders_found), more: !!c.more,
  };
}
/** Development only: `?mock=meta` on a dev server answers the inbox from the Meta mock (a production build drops this). */
async function inboxMock() {
  if (!import.meta.env.DEV) return null;
  const { metaMockOn } = await import('./areas/meta');
  return metaMockOn() ? (await import('./areas/meta.mock')).metaMock : null;
}
function inboxSettingsOf(d: any): InboxSettings {
  const p = d?.profile ?? {};
  return {
    profile: {
      greeting: listOf(p.greeting), ice_breakers: listOf(p.ice_breakers).map((i: any) => ({ locale: String(i?.locale ?? 'default'), questions: listOf(i?.questions) })),
      persistent_menu: listOf(p.persistent_menu).map((m: any) => ({ locale: String(m?.locale ?? 'default'), composer_input_disabled: !!m?.composer_input_disabled, items: listOf(m?.items) })),
      instagram: !!p.instagram,
    },
    pushed: listOf(d?.pushed).map((x: any) => ({ platform: String(x?.platform ?? ''), ok: !!x?.ok, error: s(x?.error), at: s(x?.at), by: s(x?.by) })),
    updated_by: s(d?.updated_by),
  };
}
function inboxItem(r: any): InboxItem {
  return {
    id: String(r?.id ?? ''), channel: String(r?.channel ?? 'whatsapp'), contact: contactOf(r?.contact),
    last: r?.last ? { text: s(r.last.text), direction: r.last.direction === 'out' ? 'out' : 'in', at: s(r.last.at) } : null,
    unread: n(r?.unread), window_open: !!r?.window_open, order_ref: s(r?.order_ref),
  };
}

function dltProposal(r: any): DltProposal {
  return {
    event: String(r?.event ?? ''), title: String(r?.title || r?.event || ''), channel: String(r?.channel ?? 'sms'),
    provider_template_id: s(r?.provider_template_id), content: String(r?.content ?? ''),
    provider_text: String(r?.provider_text ?? ''), confidence: String(r?.confidence ?? ''), score: n(r?.score),
  };
}

/* ── store days → instants (the dispatch log filters on RFC 3339 instants) ──── */

/** Minutes the store's zone is ahead of UTC at `at`. */
function zoneOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant a store day starts (or, with `end`, the start of the next day). */
export function storeDayInstant(day: string, end = false): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!m) return undefined;
  const tz = getStoreTimeZone();
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (end ? 1 : 0));
  const off = zoneOffsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000).toISOString();
}

/* ── the calls ──────────────────────────────────────────────────────────────── */

export const messagingAPI = {
  /** §4.1 every message of a product, with a cell per channel. */
  notifications: async (product = 'commerce'): Promise<NotificationRow[]> => {
    const d = await call<any>('GET', '/notifications', { params: { product } });
    return listOf(d).map(notificationRow).filter((r) => r.key);
  },

  /** §4.2 the ONE switch per channel (the same flag the send path checks). */
  setChannel: async (key: string, channel: MsgCh, enabled: boolean): Promise<NotificationCell | null> => {
    const d = await call<any>('PUT', `/notifications/${encodeURIComponent(key)}/channels/${channel}`, { data: { enabled } });
    return cell(d);
  },

  /** §4.3 counts from the dispatch rows; dates are store days. */
  analytics: async (q: { channel?: MsgCh; from?: string; to?: string }): Promise<MessagingAnalytics> => {
    const params: Record<string, unknown> = { bucket: 'day' };
    if (q.channel) params.channel = q.channel;
    if (q.from) params.from = q.from;
    if (q.to) params.to = q.to;
    const d = await call<any>('GET', '/analytics', { params });
    const t = d?.totals ?? {};
    const cost = t.cost;
    return {
      totals: {
        sent: n(t.sent), delivered: n(t.delivered), read: n(t.read), failed: n(t.failed),
        // Money arrives already turned into rupees by the v2 normaliser.
        cost: cost === null || cost === undefined || Number.isNaN(Number(cost)) ? null : Number(cost),
      },
      series: listOf(d?.series).map((p: any) => ({ date: String(p?.date ?? ''), sent: n(p?.sent), delivered: n(p?.delivered), read: n(p?.read), failed: n(p?.failed) })),
      by_key: listOf(d?.by_key).map((r: any) => ({ key: String(r?.key ?? ''), label: String(r?.label || r?.key || ''), sent: n(r?.sent), delivered: n(r?.delivered), read: n(r?.read), failed: n(r?.failed) })),
      failures: listOf(d?.failures).map((r: any) => ({ reason: String(r?.reason || 'unknown'), count: n(r?.count) })),
      timezone: s(d?.timezone),
      note: s(d?.note),
    };
  },

  /** §4.4 the sent log: keyset pages, masked recipients, never a body. */
  dispatches: async (f: DispatchFilter, cursor?: string | null, limit = 50): Promise<DispatchPage> => {
    const params: Record<string, unknown> = { limit };
    if (f.channel) params.channel = f.channel;
    if (f.status) params.status = f.status;
    if (f.key) params.key = f.key;
    // The server answers a recipient search from 3 characters (`dispatches.rs` ListQuery `q`).
    if (f.q && f.q.trim().length >= 3) params.q = f.q.trim();
    // Civil dates go as they are: the server reads them in the STORE's calendar (`from` = start of
    // that day, `to` = its end — `dispatches.rs::instant`), the same calendar the analytics count in.
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) params.from = f.from;
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) params.to = f.to;
    if (cursor) params.cursor = cursor;
    const d = await call<any>('GET', '/dispatches', { params });
    // A page with `limit` is turned into an array carrying `cursor` by the normaliser.
    const next = (d as any)?.cursor ?? null;
    return { items: listOf(d).map(dispatchRow), cursor: typeof next === 'string' && next ? next : null };
  },

  dispatch: async (id: string): Promise<DispatchDetail> => {
    const d = await call<any>('GET', `/dispatches/${encodeURIComponent(id)}`);
    return {
      ...dispatchRow(d),
      timeline: listOf(d?.timeline).map((e: any) => ({
        id: s(e?.id), status: s(e?.status), provider_status: s(e?.provider_status), detail: s(e?.detail), source: s(e?.source), occurred_at: s(e?.occurred_at),
      })),
    };
  },

  /** §4.5 sender & SMTP. The password is write-only: never read back. */
  emailConfig: async (): Promise<EmailConfig> => {
    const d = await call<any>('GET', '/email/config');
    return {
      mode: d?.mode === 'own' ? 'own' : 'platform',
      from_name: s(d?.from_name), from_email: s(d?.from_email), reply_to: s(d?.reply_to),
      host: s(d?.host), port: d?.port === null || d?.port === undefined ? null : n(d.port), secure: !!d?.secure,
      username: s(d?.username), password_set: !!d?.password_set, live: !!d?.live,
      note: s(d?.note),
    };
  },
  saveEmailConfig: async (body: EmailConfigInput): Promise<EmailConfig> => {
    await call<any>('PUT', '/email/config', { data: body });
    return messagingAPI.emailConfig();
  },
  testEmail: async (to: string): Promise<TestResult> => {
    const d = await call<any>('POST', '/email/test', { data: { to } });
    return { ok: d?.ok !== false, message: String(d?.message || (d?.ok === false ? 'Not sent.' : 'Sent.')) };
  },

  /** §4.6 the WhatsApp connection. Credentials are never read back. */
  whatsappConfig: async (): Promise<WhatsAppConfig> => {
    const d = await call<any>('GET', '/whatsapp/config');
    return {
      mode: d?.mode === 'own' ? 'own' : 'growcord',
      provider: s(d?.provider), status: s(d?.status), phone_number: s(d?.phone_number),
      display_name: s(d?.display_name), quality: s(d?.quality),
      channel_priority: Array.isArray(d?.channel_priority) ? d.channel_priority.map(String) : [],
      live: !!d?.live, credentials_set: !!d?.credentials_set,
      via: s(d?.via),
      number_source: d?.number_source === 'own' || d?.number_source === 'growcord' ? d.number_source : null,
      platform_account: s(d?.platform_account),
      enabled: d?.enabled !== false,
      phone_number_id: s(d?.phone_number_id),
      note: s(d?.note),
    };
  },
  saveWhatsAppConfig: async (body: WhatsAppConfigInput): Promise<WhatsAppConfig> => {
    await call<any>('PUT', '/whatsapp/config', { data: body });
    return messagingAPI.whatsappConfig();
  },
  /** `key`: the catalogue message to send (`TestBody.key`); the server's default is the order confirmation. */
  testWhatsApp: async (to: string, key?: string): Promise<TestResult> => {
    const d = await call<any>('POST', '/whatsapp/test', { data: key ? { to, key } : { to } });
    return { ok: d?.ok !== false, message: String(d?.message || (d?.ok === false ? 'Not sent.' : 'Sent.')) };
  },

  /** The DLT texts registered to the store's own SMS sender (existing route, `views::sms` ProviderTemplateListView). */
  providerTemplates: async (): Promise<ProviderTemplate[]> => {
    const d = await call<any>('GET', '/sms-config/provider-templates');
    return listOf(d?.rows ?? d).map((r: any) => ({ id: String(r?.id ?? ''), title: s(r?.title), template: String(r?.template ?? ''), active: r?.active !== false }));
  },
  /** Which registered DLT text would back which message — proposals only, nothing applied (MappingPreviewView). */
  dltProposals: async (): Promise<{ rows: DltProposal[]; providerTemplateCount: number }> => {
    const d = await call<any>('GET', '/sms-config/mappings');
    return { rows: listOf(d?.rows ?? d).map(dltProposal), providerTemplateCount: n(d?.provider_template_count) };
  },
  /** Apply the proposals (all, or the named events) so sends use the registered wording (MappingAppliedView). */
  applyDlt: async (events?: string[]): Promise<{ applied: string[]; message: string }> => {
    const d = await call<any>('POST', '/sms-config/mappings', { data: events?.length ? { events } : {} });
    return { applied: Array.isArray(d?.applied) ? d.applied.map(String) : [], message: String(d?.message ?? '') };
  },

  /** §6 route 8: conversations, newest first, a keyset page at a time. */
  inbox: async (q: { status?: 'open' | 'all'; cursor?: string | null; channel?: InboxChannel } = {}): Promise<{ items: InboxItem[]; cursor: string | null }> => {
    const dev = await inboxMock(); if (dev) return dev.inbox(q);
    const params: Record<string, unknown> = { channel: q.channel ?? 'whatsapp', status: q.status ?? 'open' };
    if (q.cursor) params.cursor = q.cursor;
    const d = await call<any>('GET', '/inbox', { params });
    const next = (d as any)?.cursor ?? null;
    return { items: listOf(d).map(inboxItem), cursor: typeof next === 'string' && next ? next : null };
  },
  inboxThread: async (id: string): Promise<InboxThread> => {
    const dev = await inboxMock(); if (dev) return dev.inboxThread(id);
    const d = await call<any>('GET', `/inbox/${encodeURIComponent(id)}`);
    return {
      id: String(d?.id ?? id), channel: String(d?.channel ?? 'whatsapp'), contact: contactOf(d?.contact),
      window_open: !!d?.window_open, window_closes_at: s(d?.window_closes_at),
      messages: listOf(d?.messages).map(inboxMessage),
      customer: inboxCustomer(d?.customer), origin_source: s(d?.origin_source), origin_ad_id: s(d?.origin_ad_id),
    };
  },
  /**
   * Free text inside the 24-hour window; outside it, an approved template.
   * Answers the message as sent (`InboxMessageView`). A closed window is a 409
   * `comms.wrong_state` (`inboxReplyErrText`).
   */
  inboxReply: async (id: string, body: { text: string } | { template_key: string; variables: Record<string, string> }): Promise<InboxMessage> => {
    const dev = await inboxMock(); if (dev) return dev.inboxReply(id, body);
    const m = await call<any>('POST', `/inbox/${encodeURIComponent(id)}/reply`, { data: body });
    return {
      id: String(m?.id ?? ''), direction: m?.direction === 'in' ? 'in' : 'out', kind: String(m?.kind ?? 'text'),
      text: s(m?.text), media_url: s(m?.media_url), template_key: s(m?.template_key), status: s(m?.status), at: s(m?.at),
    };
  },
  inboxRead: async (id: string): Promise<void> => {
    const dev = await inboxMock(); if (dev) { await dev.inboxRead(id); return; }
    await call<any>('POST', `/inbox/${encodeURIComponent(id)}/read`, { data: {} });
  },
  /** META-13: the Messenger profile (greeting, ice breakers, persistent menu) and the last push per platform. */
  inboxSettings: async (): Promise<InboxSettings> => {
    const dev = await inboxMock(); if (dev) return dev.inboxSettings();
    return inboxSettingsOf(await call<any>('GET', '/inbox/settings'));
  },
  /** Saved, checked against Meta's limits and pushed to Meta; a failed push keeps the save and answers Meta's words. */
  saveInboxSettings: async (profile: MessengerProfile): Promise<InboxSettings> => {
    const dev = await inboxMock(); if (dev) return dev.saveInboxSettings(profile);
    return inboxSettingsOf(await call<any>('PUT', '/inbox/settings', { data: profile }));
  },
  /** The stored profile pushed to Meta again. */
  pushInboxSettings: async (): Promise<InboxSettings> => {
    const dev = await inboxMock(); if (dev) return dev.pushInboxSettings();
    return inboxSettingsOf(await call<any>('POST', '/inbox/settings/push', { data: {} }));
  },

  /** §6 route 9: the SMS routing table (read-only for a store). */
  smsRoutes: async (): Promise<{ items: SmsRoute[]; default_country: string | null }> => {
    const d = await call<any>('GET', '/sms/routes');
    return {
      items: listOf(d).map((r: any) => ({
        country: String(r?.country ?? ''), provider: s(r?.provider), sender: s(r?.sender),
        source: r?.source === 'own' || r?.source === 'growcord' ? r.source : null, reachable: !!r?.reachable,
      })),
      default_country: s((d as any)?.default_country),
    };
  },

  /** §4.7 one message rendered in the store's layout (or an unsaved one) on sample data. */
  layoutPreview: async (body: { key?: string; channel: 'email' | 'whatsapp' | 'sms'; layout?: Record<string, unknown> }): Promise<LayoutPreviewResult> => {
    const d = await call<any>('POST', '/layout/preview', { data: body });
    return { subject: s(d?.subject), html: s(d?.html), text: String(d?.text ?? '') };
  },
};

/* ── the other apps' messaging settings (ADMIN-MSG-2) ─────────────────────────
 * The Messaging screens also show settings other apps own — read and written
 * on THEIR routes, never copied into comms:
 *  - Reviews: `GET|PUT /api/v2/reviews/settings/messaging` (content.read / content.manage, MSG-4
 *    `apps/reviews/core/src/api/saas/settings.rs`) + the rule resources
 *    `/api/v2/reviews/incentives/rules` and `/api/v2/reviews/requests/rules`.
 *  - Commerce: `GET|PATCH /api/v2/commerce/cart-settings` (orders.read / settings.manage) —
 *    `recovery_automation_enabled` arms the Retain recovery job (default off).
 */

export interface ReviewMessagingSettings {
  requests_enabled: boolean;
  delay_days: number;
  reminder_count: number;
  reminder_after_days: number;
  expire_after_days: number;
  for_outside_sites: boolean;
  incentives_enabled: boolean;
  /** The promise in the store's own words (null = the first rule's reward is said). */
  promise_text: string | null;
  /** Read-only: the promise text the NEXT request will state (empty when none). */
  incentive_text: string | null;
  answer_notices: boolean;
  reply_notices: boolean;
  /** Who gets a review request (REV-0 decision, lane REV-1); null = this server does not have the setting yet. */
  consent_mode: ReviewConsentMode | null;
  /** The Google "write a review" link the store typed (null = none typed). */
  google_write_review_url: string | null;
  /** Read only: the link requests use now, the typed one or else the Business Profile sync's. */
  google_review_url: string | null;
  /** Read only: the link the Business Profile sync found (used while none is typed). */
  google_synced_url: string | null;
  /** Days after a buyer's product review before the one Google review ask goes. */
  google_ask_after_days: number | null;
  /** The Google review ask on or off (nothing goes while no link is known). */
  google_ask_enabled: boolean | null;
  /** Where this server keeps each REV-1 field; a field missing here is not on this server yet and is never sent. */
  wire: ReviewWire;
}
/**
 * Who gets a review request (REV-0 "Decisions", `reviews.requests.consentMode`):
 * `email_all_phone_opt_in` (the default) e-mails every buyer and uses WhatsApp or SMS only with
 * marketing consent; `all` uses every channel; `opt_in_only` asks only buyers with marketing consent.
 */
export type ReviewConsentMode = 'email_all_phone_opt_in' | 'all' | 'opt_in_only';
export const REVIEW_CONSENT_MODES: ReviewConsentMode[] = ['email_all_phone_opt_in', 'all', 'opt_in_only'];
export const REVIEW_CONSENT_DEFAULT: ReviewConsentMode = 'email_all_phone_opt_in';

/** The fields lane REV-1 adds to `GET|PUT /reviews/settings/messaging`. */
export type ReviewExtraField = 'consent_mode' | 'google_write_review_url' | 'google_ask_after_days' | 'google_ask_enabled';
export type ReviewWire = Partial<Record<ReviewExtraField, string[]>>;
/**
 * Where each REV-1 field may sit in the reply (flat snake case first, the route's own style).
 * The PUT refuses unknown fields (`deny_unknown_fields`), so a field is written back only under
 * the key the GET answered it with, and never when the GET did not answer it.
 */
const REVIEW_EXTRA_PATHS: Record<ReviewExtraField, string[][]> = {
  consent_mode: [['consent_mode'], ['consentMode']],
  google_write_review_url: [['google_write_review_url'], ['google', 'write_review_url'], ['google', 'writeReviewUrl']],
  google_ask_after_days: [['google_ask_after_days'], ['google', 'ask_after_days'], ['google', 'askAfterDays']],
  google_ask_enabled: [['google_ask_enabled'], ['google', 'ask_enabled'], ['google', 'askEnabled']],
};
const REVIEW_GOOGLE_EFFECTIVE: string[][] = [['google_review_url'], ['google', 'review_url'], ['google', 'reviewUrl']];
const REVIEW_GOOGLE_SYNCED: string[][] = [['google_synced_review_url'], ['google', 'synced_review_url'], ['google', 'new_review_uri']];

export type ReviewMessagingInput = Partial<Omit<ReviewMessagingSettings, 'incentive_text' | 'google_review_url' | 'google_synced_url' | 'wire'>>;
/** Reviews' bounds (`settings.rs` put + `domain::settings::MAX_REMINDERS`); the Google ask delay is the admin's guard, the server decides. */
export const REVIEW_BOUNDS = {
  delay_days: [0, 180], reminder_count: [0, 5], reminder_after_days: [1, 60], expire_after_days: [1, 365], promise_text: 200,
  google_ask_after_days: [0, 60],
} as const;

/**
 * A Google review link as Reviews accepts it (https, a Google host): `g.page/r/.../review` from
 * Business Profile's "Ask for reviews", `search.google.com/local/writereview?placeid=...`, a
 * `google.<tld>` maps link or a `goo.gl` / `g.co` short link. The server checks again and has the last word.
 */
export function googleReviewUrlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return 'Paste the whole link, starting with https://'; }
  if (u.protocol !== 'https:') return 'The link must start with https://';
  const host = u.hostname.toLowerCase();
  const google = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) || ['g.page', 'goo.gl', 'g.co'].some((h) => host === h || host.endsWith(`.${h}`));
  return google ? null : 'This is not a Google link. Copy it from your Google Business Profile (it starts with https://g.page/r/).';
}

export interface IncentiveRule {
  id: string; name: string; trigger_on: string; reward: string;
  percent_milli: number | null; amount: number | null; currency: string | null; points: number | null;
  validity_days: number | null; disclosure: string; enabled: boolean;
}
export interface RequestRule {
  id: string; product_id: string | null; delay_days: number | null; reminder_after_days: number | null;
  expire_after_days: number | null; enabled: boolean;
}
export const INCENTIVE_TRIGGER_LABEL: Record<string, string> = {
  photo: 'a review with a photo', video: 'a review with a video', media: 'a review with a photo or video',
  any: 'any review', verified: 'a verified-purchase review',
};

export interface CartAutomation { enabled: boolean }

const R = '/api/v2/reviews';
async function callAt<T>(method: string, path: string, opts: Parameters<typeof v2call>[2] = {}): Promise<T> {
  if (!V2_ENABLED) backendGap(`${method} ${path} (this build is not on the v2 API)`);
  return v2call<T>(method, path, opts);
}
const nOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** The first of `paths` present in `d` (present with null counts: the server knows the field). */
function findPath(d: any, paths: string[][]): { path: string[]; value: unknown } | null {
  for (const p of paths) {
    let cur = d;
    let found = true;
    for (const k of p) {
      if (cur && typeof cur === 'object' && !Array.isArray(cur) && k in cur) cur = cur[k];
      else { found = false; break; }
    }
    if (found) return { path: p, value: cur };
  }
  return null;
}
function setPath(target: Record<string, any>, path: string[], value: unknown): void {
  let cur = target;
  path.slice(0, -1).forEach((k) => { cur = (cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}); });
  cur[path[path.length - 1]] = value;
}

function reviewSettings(d: any): ReviewMessagingSettings {
  const wire: ReviewWire = {};
  const extra = (f: ReviewExtraField): unknown => {
    const hit = findPath(d, REVIEW_EXTRA_PATHS[f]);
    if (hit) wire[f] = hit.path;
    return hit ? hit.value : undefined;
  };
  const mode = extra('consent_mode');
  const url = extra('google_write_review_url');
  const after = extra('google_ask_after_days');
  const ask = extra('google_ask_enabled');
  return {
    requests_enabled: !!d?.requests_enabled, delay_days: n(d?.delay_days), reminder_count: n(d?.reminder_count),
    reminder_after_days: n(d?.reminder_after_days), expire_after_days: n(d?.expire_after_days),
    for_outside_sites: !!d?.for_outside_sites, incentives_enabled: !!d?.incentives_enabled,
    promise_text: s(d?.promise_text), incentive_text: s(d?.incentive_text),
    answer_notices: d?.answer_notices !== false, reply_notices: d?.reply_notices !== false,
    consent_mode: wire.consent_mode
      ? (REVIEW_CONSENT_MODES.includes(mode as ReviewConsentMode) ? (mode as ReviewConsentMode) : REVIEW_CONSENT_DEFAULT)
      : null,
    google_write_review_url: s(url),
    google_review_url: s(findPath(d, REVIEW_GOOGLE_EFFECTIVE)?.value) ?? s(url),
    google_synced_url: s(findPath(d, REVIEW_GOOGLE_SYNCED)?.value),
    google_ask_after_days: wire.google_ask_after_days ? nOrNull(after) : null,
    google_ask_enabled: wire.google_ask_enabled ? ask !== false : null,
    wire,
  };
}

/** The PUT body: the MSG-4 fields as they are, each REV-1 field under the key the GET used (else left out). */
function reviewBody(body: ReviewMessagingInput, wire: ReviewWire): Record<string, unknown> {
  const out: Record<string, any> = {};
  (Object.keys(body) as Array<keyof ReviewMessagingInput>).forEach((k) => {
    const v = body[k];
    if (v === undefined) return;
    if (k in REVIEW_EXTRA_PATHS) {
      const path = wire[k as ReviewExtraField];
      if (path) setPath(out, path, v);
    } else out[k] = v;
  });
  return out;
}

export const messagingAppsAPI = {
  reviewSettings: async (): Promise<ReviewMessagingSettings> => reviewSettings(await callAt<any>('GET', `${R}/settings/messaging`)),
  saveReviewSettings: async (body: ReviewMessagingInput, wire: ReviewWire = {}): Promise<ReviewMessagingSettings> =>
    reviewSettings(await callAt<any>('PUT', `${R}/settings/messaging`, { data: reviewBody(body, wire) })),

  incentiveRules: async (): Promise<IncentiveRule[]> => {
    const d = await callAt<any>('GET', `${R}/incentives/rules`, { params: { limit: 50 } });
    return listOf(d).map((r: any) => ({
      id: String(r?.id ?? ''), name: String(r?.name ?? ''), trigger_on: String(r?.trigger_on ?? ''), reward: String(r?.reward ?? ''),
      percent_milli: nOrNull(r?.percent_milli),
      // Money arrives in major units from the normaliser (`amount_minor` → rupees).
      amount: nOrNull(r?.amount_minor ?? r?.amount), currency: s(r?.currency), points: nOrNull(r?.points),
      validity_days: nOrNull(r?.validity_days), disclosure: String(r?.disclosure ?? ''), enabled: !!r?.enabled,
    })).filter((r) => r.id);
  },
  setIncentiveRule: async (id: string, enabled: boolean): Promise<void> => {
    await callAt<any>('PATCH', `${R}/incentives/rules/${encodeURIComponent(id)}`, { data: { enabled } });
  },
  requestRules: async (): Promise<RequestRule[]> => {
    const d = await callAt<any>('GET', `${R}/requests/rules`, { params: { limit: 50 } });
    return listOf(d).map((r: any) => ({
      id: String(r?.id ?? ''), product_id: s(r?.product_id), delay_days: nOrNull(r?.delay_days),
      reminder_after_days: nOrNull(r?.reminder_after_days), expire_after_days: nOrNull(r?.expire_after_days), enabled: !!r?.enabled,
    })).filter((r) => r.id);
  },
  setRequestRule: async (id: string, enabled: boolean): Promise<void> => {
    await callAt<any>('PATCH', `${R}/requests/rules/${encodeURIComponent(id)}`, { data: { enabled } });
  },

  /** Commerce's `cartSettings.recoveryAutomationEnabled` — the arm switch of the recovery job. */
  cartAutomation: async (): Promise<CartAutomation> => {
    const d = await callAt<any>('GET', '/api/v2/commerce/cart-settings');
    return { enabled: !!(d?.current?.recovery_automation_enabled ?? d?.recovery_automation_enabled) };
  },
  setCartAutomation: async (enabled: boolean): Promise<CartAutomation> => {
    const d = await callAt<any>('PATCH', '/api/v2/commerce/cart-settings', { data: { recovery_automation_enabled: enabled } });
    return { enabled: !!(d?.current?.recovery_automation_enabled ?? enabled) };
  },
};

/* ── Retention (lane ADMIN-REV-1, routes of lane RET-1) ────────────────────────
 * Messaging, Retention reads Retain's own routes, never a copy:
 *  - journeys: the declared list `GET /api/v2/retain/journeys` (marketing.read), switched with
 *    `POST /journeys/{id}/install|activate|pause` (activate and pause need marketing.approve);
 *    RET-1 adds `sent` / `converted` to each row.
 *  - the recommended set: `POST /api/v2/retain/journeys/install-recommended` (RET-1, marketing.manage),
 *    every journey it adds stays off.
 *  - the reorder interval: inside Retain's settings key, `GET|PUT /api/v2/retain/settings` (`{value}`;
 *    the PUT replaces the whole key, so the value read is sent back with one field changed).
 *  - notify-me sign-ups per product: `GET /api/v2/retain/alerts/by-product` (RET-1 staff read).
 * A route this server does not serve yet is a gap (`isGap`), shown as "Not available on this server yet".
 */
const RT = '/api/v2/retain';

export interface RetentionJourney {
  id: string;
  name: string;
  template_code: string | null;
  trigger: string;
  /** `draft`, `ready`, `active`, `paused` or `retired` (Retain `domain::journey::Status`). */
  status: string;
  /** "3 messages" or "5 steps", whichever the server gives; null when it gives neither. */
  steps: string | null;
  sent: number | null;
  converted: number | null;
  /** Message keys the store has not written yet (activation waits for them). */
  needs_templates: string[];
  activated_at: string | null;
}
export interface InstallRecommendedResult { added: number | null; existing: number | null }
export interface RetentionSettings {
  /** The whole `retain` key as read (sent back whole on save). */
  value: Record<string, any>;
  /** The default days between an order and its reorder reminder; null = not on this server yet. */
  reorder_days: number | null;
  reorder_path: string[] | null;
}
export interface StockSignupRow {
  item_id: string;
  product_name: string;
  variant: string | null;
  sku: string | null;
  image: string | null;
  /** People waiting for the item to be back. */
  back_in_stock: number;
  /** People waiting for a lower price. */
  price_drop: number;
  /** Sign-ups already told. */
  notified: number;
  last_signup_at: string | null;
  /** Whether the item can be bought now (null = not given). */
  in_stock: boolean | null;
}

/** Where RET-1 may keep the reorder interval inside the `retain` key. */
const REORDER_PATHS: string[][] = [
  ['reorder', 'interval_days'], ['reorder', 'default_interval_days'], ['reorder', 'default_days'],
  ['journeys', 'reorder_interval_days'], ['reorder_interval_days'],
];
export const REORDER_BOUNDS = [1, 365] as const;

const firstNum = (...vs: unknown[]): number | null => {
  for (const v of vs) { const x = nOrNull(v); if (x !== null) return x; }
  return null;
};
const countOf = (v: unknown): number | null => (Array.isArray(v) ? v.length : nOrNull(v));

function journeyRow(r: any): RetentionJourney {
  const defSteps = Array.isArray(r?.definition?.steps) ? r.definition.steps : Array.isArray(r?.steps) ? r.steps : null;
  const sends = defSteps ? defSteps.filter((x: any) => x?.type === 'send').length : null;
  const stepCount = firstNum(typeof r?.steps === 'number' ? r.steps : null, r?.step_count, r?.steps_count);
  const msgCount = firstNum(r?.message_count, r?.messages, sends);
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  return {
    id: String(r?.id ?? r?.journey_id ?? ''),
    name: String(r?.name ?? ''),
    template_code: s(r?.template_code),
    trigger: String(r?.trigger_type ?? r?.trigger ?? ''),
    status: String(r?.status ?? 'draft'),
    steps: msgCount !== null ? plural(msgCount, 'message') : stepCount !== null ? plural(stepCount, 'step') : null,
    sent: firstNum(r?.sent, r?.stats?.sent, r?.sent_count),
    converted: firstNum(r?.converted, r?.stats?.converted, r?.converted_count),
    needs_templates: Array.isArray(r?.needs_templates) ? r.needs_templates.map(String) : [],
    activated_at: s(r?.activated_at),
  };
}

function retentionSettings(d: any): RetentionSettings {
  const value = d?.value && typeof d.value === 'object' ? d.value : (d && typeof d === 'object' ? d : {});
  const hit = findPath(value, REORDER_PATHS);
  return { value, reorder_days: hit ? nOrNull(hit.value) : null, reorder_path: hit ? hit.path : null };
}

function stockSignupRow(r: any): StockSignupRow {
  const c = r?.counts ?? {};
  const stock = nOrNull(r?.stock ?? r?.available);
  return {
    item_id: String(r?.item_id ?? r?.variation_id ?? r?.product_id ?? ''),
    product_name: String(r?.product_name ?? r?.name ?? r?.title ?? ''),
    variant: s(r?.variant_name ?? r?.variant ?? r?.variation_name),
    sku: s(r?.sku),
    image: s(r?.image ?? r?.image_url),
    back_in_stock: n(r?.back_in_stock ?? c.back_in_stock),
    price_drop: n(r?.price_drop ?? c.price_drop),
    notified: n(r?.notified ?? c.notified),
    last_signup_at: s(r?.last_signup_at ?? r?.latest_at),
    in_stock: typeof r?.in_stock === 'boolean' ? r.in_stock : stock === null ? null : stock > 0,
  };
}

export const retentionAPI = {
  journeys: async (): Promise<RetentionJourney[]> => {
    const d = await callAt<any>('GET', `${RT}/journeys`, { params: { limit: 200 } });
    return listOf(d).map(journeyRow).filter((j) => j.id);
  },
  /** On: a draft is put on the engine first, then switched on. Off: paused (people already in it finish). */
  setJourneyOn: async (j: RetentionJourney, on: boolean): Promise<string> => {
    const id = encodeURIComponent(j.id);
    if (on && j.status === 'draft') await callAt<any>('POST', `${RT}/journeys/${id}/install`, { data: {} });
    const d = await callAt<any>('POST', `${RT}/journeys/${id}/${on ? 'activate' : 'pause'}`, { data: {} });
    return String(d?.status ?? (on ? 'active' : 'paused'));
  },
  installRecommended: async (): Promise<InstallRecommendedResult> => {
    const d = await callAt<any>('POST', `${RT}/journeys/install-recommended`, { data: {} });
    return {
      added: countOf(d?.added ?? d?.installed ?? d?.created ?? d?.added_count),
      existing: countOf(d?.existing ?? d?.skipped ?? d?.existing_count),
    };
  },
  settings: async (): Promise<RetentionSettings> => retentionSettings(await callAt<any>('GET', `${RT}/settings`)),
  saveReorderDays: async (cur: RetentionSettings, days: number): Promise<RetentionSettings> => {
    if (!cur.reorder_path) backendGap('the reorder interval in GET /retain/settings');
    const next = JSON.parse(JSON.stringify(cur.value ?? {}));
    setPath(next, cur.reorder_path, days);
    return retentionSettings(await callAt<any>('PUT', `${RT}/settings`, { data: next }));
  },
  stockSignups: async (): Promise<StockSignupRow[]> => {
    const d = await callAt<any>('GET', `${RT}/alerts/by-product`, { params: { limit: 200 } });
    return listOf(d).map(stockSignupRow).filter((r) => r.item_id);
  },
};

/** A journey trigger in plain words (Retain `contract::triggers::LIFECYCLE`); an unknown one shows its key. */
export const JOURNEY_TRIGGER_LABEL: Record<string, string> = {
  'order.placed': 'An order is placed',
  'order.delivered': 'An order is delivered',
  'customer.signed_up': 'Someone signs up',
  'cart.abandoned': 'A cart is left behind',
  'payment.failed': 'A payment does not go through',
  'customer.inactive_for': 'A buyer has not ordered for a while',
  'reorder.due': 'A product is due for a reorder',
  'points.expiring': 'Points are about to expire',
  'subscription.renewal_due': 'A subscription is due',
  'review.requested': 'A review is asked for',
  'customer.birthday': 'A buyer has a birthday',
};
export const journeyTriggerLabel = (t: string): string => JOURNEY_TRIGGER_LABEL[t] ?? (t ? t.replace(/[._]/g, ' ') : 'No trigger');

/** An SMS route's country in words (`*` = the row serving every country no named row serves). */
export const smsRouteCountry = (c: string): string => (c === '*' ? 'Every other country' : c);

/* ── presentation vocabulary ────────────────────────────────────────────────── */

/**
 * The groups the contract names (§2), in the order the page lists them. The
 * SERVER puts each message in its group; this only names and orders them. A
 * group the server sends that is not here is listed after these, by its key.
 */
export const GROUP_ORDER: Array<{ key: string; label: string }> = [
  { key: 'orders', label: 'Orders' },
  { key: 'payments', label: 'Payments' },
  { key: 'shipping', label: 'Shipping & NDR' },
  { key: 'returns', label: 'Returns & refunds' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'questions', label: 'Questions' },
  { key: 'stock', label: 'Back in stock' },
  { key: 'cart', label: 'Cart' },
  { key: 'account', label: 'Account' },
  { key: 'staff', label: 'Staff alerts' },
  { key: 'marketing', label: 'Marketing' },
];

export const groupLabel = (key: string): string =>
  GROUP_ORDER.find((g) => g.key === key)?.label
  ?? (key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') : 'Other');

export const groupRank = (key: string): number => {
  const i = GROUP_ORDER.findIndex((g) => g.key === key);
  return i === -1 ? GROUP_ORDER.length : i;
};

/**
 * Does this cell need someone? On, but it cannot actually go out: no template,
 * WhatsApp not approved by Meta, or SMS text not mapped to a DLT registration.
 */
export function cellNeedsAttention(channel: MsgCh, c: NotificationCell | null): string | null {
  if (!c || !c.enabled) return null;
  // `available` = words exist for the channel AND it can send for this store now (MSG-2 CellView).
  if (!c.available) return 'Switched on, but this channel is not set up to send for your store yet.';
  if (channel === 'whatsapp' && c.approval && c.approval !== 'approved') return 'Switched on, but Meta has not approved the template.';
  if (channel === 'sms' && c.dlt === 'unmapped') return 'Switched on, but the text is not mapped to a DLT registration.';
  return null;
}

export const rowNeedsAttention = (r: NotificationRow): boolean =>
  MSG_CHANNELS.some((ch) => !!cellNeedsAttention(ch, r.channels[ch]));

/** The plain words for a dispatch status — never "Delivered" unless the provider said so. */
export const DISPATCH_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', pending: 'Queued', sent: 'Sent (accepted by provider)', accepted: 'Accepted by provider',
  delivered: 'Delivered', read: 'Read', failed: 'Failed', error: 'Failed', undelivered: 'Not delivered',
  skipped: 'Not sent', deferred: 'Held back', bounced: 'Bounced', refused: 'Refused',
};
export const dispatchStatusLabel = (st: string | null): string =>
  (st && DISPATCH_STATUS_LABEL[st.toLowerCase()]) || (st ? st.replace(/_/g, ' ') : '—');

/** en-IN whole numbers. */
export const fmtCount = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN');

/** A share as "12.3%", or "—" when there is no base. */
export const fmtShare = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` : '—';
