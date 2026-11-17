/**
 * ChatGPT ads (lane CHATGPT-3; plan growcord-rs/docs/briefs/CHATGPT-0-plan.md, decisions D1 to D4; routes from lane
 * CHATGPT-1): every read and write the "ChatGPT ads" page makes, typed, in ONE place.
 *
 * The store's `chatgptPixel` setting is read and written through the existing Settings Center client
 * (`settingsRegistryAPI`, `GET /settings/registry` and `PATCH /commerce/settings/registry/chatgptPixel`), so nothing
 * here is a second settings path. Its fields: enabled, pixels[{pixelId, label, conversionsApiKey (sealed), browser,
 * server}], productLevelEvents, adAccountId, adsApiKey (sealed).
 *
 * Secrets follow the admin's secret field rule (SettingFieldControl `secret`): the server never answers a stored key,
 * only that one is stored (`secretsStored`, or the `<key>Set` flag its masking leaves on the row), and a key is sent
 * only when a person typed a new one. The pixel list is written whole; a row sent WITHOUT `conversionsApiKey` keeps
 * the key stored for that `pixelId` (the backend's merge, CHATGPT-1), a row left out is removed with its key.
 *
 * The three marketing routes are new and called straight through `v2call`, as META_PATHS does for the Meta page.
 */
import { v2call } from '../http';
import { settingsRegistryAPI } from '../../../services/api';

const MK = '/api/v2/marketing';

/** The registry key of the store's ChatGPT pixel setting. */
export const CHATGPT_SETTING = 'chatgptPixel';

/** Every contract path, so a route is re-pointed here and nowhere else. */
export const CHATGPT_PATHS = {
  status: `${MK}/chatgpt/status`,
  test: `${MK}/chatgpt/test`,
  provision: `${MK}/chatgpt/provision`,
} as const;

/** The store's admin page for this setting (menu, Settings Center links). */
export const CHATGPT_ROUTE = '/panel/marketing/chatgpt';

export interface ChatgptPixel {
  pixelId: string;
  label: string;
  browser: boolean;
  server: boolean;
  /** A Conversions API key is stored for this pixel (never the key itself). */
  keyStored: boolean;
}

export interface ChatgptSettings {
  enabled: boolean;
  productLevelEvents: boolean;
  adAccountId: string;
  adsApiKeyStored: boolean;
  pixels: ChatgptPixel[];
  /** The Settings Center's answer: may this person change the setting. */
  canWrite: boolean;
}

/** One pixel row as the form sends it back: a key only when one was typed. */
export interface ChatgptPixelSave { pixelId: string; label: string; browser: boolean; server: boolean; conversionsApiKey?: string }

export interface ChatgptSave {
  enabled?: boolean;
  productLevelEvents?: boolean;
  adAccountId?: string;
  /** Sent only when typed: a blank keeps the stored key. */
  adsApiKey?: string;
  pixels?: ChatgptPixelSave[];
}

export type KeySource = 'store' | 'growcord' | 'none';

export interface ChatgptPixelStatus {
  pixelId: string;
  label: string;
  browser: boolean;
  server: boolean;
  hasKey: boolean;
  lastSentAt: string | null;
  lastError: string | null;
  sent24h: number | null;
}

/** One event OpenAI reports for a pixel (its own recent events list, the last 15 minutes or so). Shape kept loose. */
export type ChatgptRecentEvent = Record<string, unknown>;

export interface ChatgptStatus {
  enabled: boolean;
  productLevelEvents: boolean;
  adAccountId: string | null;
  keySource: KeySource;
  pixels: ChatgptPixelStatus[];
  recentEvents: ChatgptRecentEvent[] | null;
  error: string | null;
}

export interface ChatgptTestResult { pixelId: string; ok: boolean; message: string }
export interface ChatgptProvision { ok: boolean; pixelId: string | null; keyCreated: boolean; message: string }

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
/** camelCase as the contract names it, snake_case if the server answers that way. */
const pick = (o: Record<string, any>, camel: string, snake: string): unknown => (o[camel] !== undefined ? o[camel] : o[snake]);

/** Read the definition's value into the form's shape. `null` when this server has no `chatgptPixel` setting yet. */
function settingsOf(def: any): ChatgptSettings | null {
  if (!isObj(def)) return null;
  const v = isObj(def.value) ? def.value : {};
  const stored: string[] = Array.isArray(def.secretsStored) ? def.secretsStored.map(String) : [];
  const rows: any[] = Array.isArray(v.pixels) ? v.pixels : [];
  return {
    enabled: v.enabled === true,
    productLevelEvents: v.productLevelEvents === true,
    adAccountId: str(v.adAccountId),
    adsApiKeyStored: stored.includes('adsApiKey') || v.adsApiKeySet === true,
    canWrite: def.canWrite === true,
    pixels: rows.filter(isObj).map((p, i) => ({
      pixelId: str(p.pixelId),
      label: str(p.label),
      browser: p.browser !== false,
      server: p.server !== false,
      keyStored: p.conversionsApiKeySet === true || p.hasKey === true
        || stored.includes(`pixels[${i}].conversionsApiKey`) || stored.includes(`pixels.${i}.conversionsApiKey`),
    })),
  };
}

function statusOf(d: unknown): ChatgptStatus {
  const o = isObj(d) ? d : {};
  const ks = str(pick(o, 'keySource', 'key_source'));
  const pixels: any[] = Array.isArray(o.pixels) ? o.pixels : [];
  const recent = pick(o, 'recentEvents', 'recent_events');
  return {
    enabled: o.enabled === true,
    productLevelEvents: pick(o, 'productLevelEvents', 'product_level_events') === true,
    adAccountId: strOrNull(pick(o, 'adAccountId', 'ad_account_id')),
    keySource: ks === 'store' || ks === 'growcord' ? ks : 'none',
    pixels: pixels.filter(isObj).map((p) => ({
      pixelId: str(pick(p, 'pixelId', 'pixel_id')),
      label: str(p.label),
      browser: p.browser !== false,
      server: p.server !== false,
      hasKey: pick(p, 'hasKey', 'has_key') === true,
      lastSentAt: strOrNull(pick(p, 'lastSentAt', 'last_sent_at')),
      lastError: strOrNull(pick(p, 'lastError', 'last_error')),
      sent24h: numOrNull(pick(p, 'sent24h', 'sent_24h')),
    })),
    recentEvents: Array.isArray(recent) ? recent.filter(isObj) : null,
    error: strOrNull(o.error),
  };
}

/** The settings patch: only what the caller gives, keys only when typed, no `*Set` flags sent back. */
function patchOf(s: ChatgptSave): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.enabled !== undefined) out.enabled = s.enabled;
  if (s.productLevelEvents !== undefined) out.productLevelEvents = s.productLevelEvents;
  if (s.adAccountId !== undefined) out.adAccountId = s.adAccountId.trim();
  if (s.adsApiKey !== undefined && s.adsApiKey.trim() !== '') out.adsApiKey = s.adsApiKey.trim();
  if (s.pixels !== undefined) {
    out.pixels = s.pixels.map((p) => {
      const row: ChatgptPixelSave = { pixelId: p.pixelId.trim(), label: p.label.trim(), browser: p.browser, server: p.server };
      if (p.conversionsApiKey && p.conversionsApiKey.trim() !== '') row.conversionsApiKey = p.conversionsApiKey.trim();
      return row;
    });
  }
  return out;
}

export const chatgptApi = {
  /** The `chatgptPixel` definition from the Settings Center read; `null` when this server does not have it yet. */
  settings: async (): Promise<ChatgptSettings | null> => settingsOf(await settingsRegistryAPI.definition(CHATGPT_SETTING)),
  /** One validated merging write of the given fields (the Settings Center's own write). */
  save: (s: ChatgptSave) => settingsRegistryAPI.update(CHATGPT_SETTING, patchOf(s)),
  /** GET /marketing/chatgpt/status: per pixel last sent, last error, sent in 24 hours; OpenAI's recent events when a key exists. */
  status: async (): Promise<ChatgptStatus> => statusOf(await v2call<any>('GET', CHATGPT_PATHS.status)),
  /** POST /marketing/chatgpt/test: OpenAI's validate only check, one pixel or every pixel. */
  test: async (pixelId?: string): Promise<ChatgptTestResult[]> => {
    const d = await v2call<any>('POST', CHATGPT_PATHS.test, { data: pixelId ? { pixelId } : {} });
    const rows: any[] = Array.isArray(d?.results) ? d.results : Array.isArray(d) ? d : [];
    return rows.filter(isObj).map((r) => ({ pixelId: str(pick(r, 'pixelId', 'pixel_id')), ok: r.ok === true, message: str(r.message) }));
  },
  /** POST /marketing/chatgpt/provision: create a pixel and its Conversions API key through the Ads API. */
  provision: async (label: string): Promise<ChatgptProvision> => {
    const d = await v2call<any>('POST', CHATGPT_PATHS.provision, { data: { label } });
    const o = isObj(d) ? d : {};
    return { ok: o.ok === true, pixelId: strOrNull(pick(o, 'pixelId', 'pixel_id')), keyCreated: pick(o, 'keyCreated', 'key_created') === true, message: str(o.message) };
  },
};
