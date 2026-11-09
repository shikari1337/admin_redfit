/**
 * DEVELOPMENT ONLY sample data for lane META-23 (`?mock=meta` on a dev server; loaded only through `via` in `meta.ts`,
 * whose mock branch a production build drops, so this module is never bundled): the Events health page's match quality
 * part for a sample Indian homeopathy store, shaped like the Homeomed Events Manager figures the owner showed on 8 Nov
 * (Initiate checkout: e-mail 2.54%, phone not sent, browser id 59.08%, external id 41.19%, click id 0.08%), the pixel's
 * own matching settings as the connect flow left them, and META-18's refused server events with "Send again".
 * `?mockvariant=fresh` shows a store whose pixel was picked before META-23 (no pixel setup kept, a pasted token).
 */
import type { EventQuality, EventsMatch, MatchGap, RefusedEvent, ResendResult } from './meta';
import { minutesAgo, refuse, wait } from './meta.mock.social';

const fresh = (): boolean => {
  try { return new URLSearchParams(window.location.search).get('mockvariant') === 'fresh'; } catch { return false; }
};

/** Meta's match keys per event, as the dataset quality read gives them (identifier, coverage %). */
const KEYS: Record<string, Array<[string, number]>> = {
  InitiateCheckout: [['email', 2.54], ['ip_address', 100], ['user_agent', 100], ['fbp', 59.08], ['external_id', 41.19], ['fbc', 0.08]],
  AddPaymentInfo: [['email', 4.1], ['phone', 12.6], ['ip_address', 100], ['user_agent', 100], ['fbp', 61.2], ['external_id', 47.9]],
  Purchase: [['email', 38.2], ['phone', 99.1], ['ip_address', 100], ['user_agent', 100], ['fbp', 72.4], ['external_id', 99.6], ['fbc', 3.1]],
  PageView: [['ip_address', 100], ['user_agent', 100], ['fbp', 55.4], ['external_id', 22.3]],
  ViewContent: [['ip_address', 100], ['user_agent', 100], ['fbp', 57.9], ['external_id', 25.0], ['email', 1.2]],
};
const SCORES: Record<string, number> = { InitiateCheckout: 3.8, AddPaymentInfo: 4.6, Purchase: 8.0, PageView: 5.1, ViewContent: 5.4 };

const LABELS: Array<[string, string]> = [
  ['email', 'E-mail'], ['phone', 'Phone'], ['external_id', 'External id'], ['fbc', 'Click id (fbc)'], ['fbp', 'Browser id (fbp)'],
  ['ip_address', 'IP address'], ['user_agent', 'User agent'],
];
const words = (e: string) => e.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);
const pct = (p: number) => `${Math.round(p * 100) / 100}%`;

function gaps(below: number): MatchGap[] {
  const out: MatchGap[] = [];
  for (const [event, keys] of Object.entries(KEYS)) {
    for (const [id, label] of LABELS) {
      const hit = keys.find(([k]) => k === id);
      const coverage = hit ? hit[1] : 0;
      if (coverage >= below) continue;
      out.push({
        event, identifier: id, label, coverage,
        line: hit ? `${label} sent on ${pct(coverage)} of ${words(event)} events` : `${label} not sent on ${words(event)} events`,
      });
    }
  }
  return out;
}

let REFUSED: RefusedEvent[] = [
  {
    event: 'Purchase', event_id: 'purchase_HM-24117', order_id: 'HM-24117', at: minutesAgo(60 * 27), last_tried: minutesAgo(60 * 27), attempts: 1,
    message: '(#100) Invalid parameter: user_data must contain at least one customer information parameter.', action_source: 'website',
    resend: { allowed: true, reason: null, until: minutesAgo(-60 * 24 * 5) },
  },
  {
    event: 'OrderDelivered', event_id: 'delivered_HM-23988', order_id: 'HM-23988', at: minutesAgo(60 * 50), last_tried: minutesAgo(60 * 49), attempts: 2,
    message: 'Meta did not answer in time.', action_source: 'system_generated',
    resend: { allowed: true, reason: null, until: minutesAgo(-60 * 24 * 4) },
  },
  {
    event: 'Purchase', event_id: 'purchase_HM-23410', order_id: 'HM-23410', at: minutesAgo(60 * 24 * 9), last_tried: minutesAgo(60 * 24 * 9), attempts: 1,
    message: '(#100) Invalid parameter: event_time is more than 7 days in the past.', action_source: 'website',
    resend: { allowed: false, reason: 'Meta takes an event at most 7 days old; this one went 9 days ago.', until: null },
  },
];

export const matchMock = {
  /** The META-23 and META-18 parts of the events health answer. */
  extend: (quality: EventQuality[]): { quality: EventQuality[]; match: EventsMatch } => {
    const below = 50;
    const scored: EventQuality[] = quality.map((q) => (KEYS[q.event]
      ? { ...q, match_quality: SCORES[q.event], match_keys: KEYS[q.event].map(([identifier, coverage]) => ({ identifier, coverage })) }
      : q));
    for (const event of Object.keys(KEYS)) {
      if (!scored.some((q) => q.event === event)) {
        scored.push({ event, read_on: null, match_quality: SCORES[event], deduped: null, coverage: null, match_keys: KEYS[event].map(([identifier, coverage]) => ({ identifier, coverage })), diagnostics: [] });
      }
    }
    const match: EventsMatch = {
      server_events_source: fresh() ? 'pasted_token' : 'connection',
      connection_pixel_id: fresh() ? null : '1187654321098765',
      connected_pixel_id: null,
      pixel_setup: fresh() ? null : {
        pixel_id: '1187654321098765', automatic_matching: true, fields: ['em', 'fn', 'ln', 'ph', 'ct', 'st', 'zp', 'country', 'external_id'],
        first_party_cookies: 'FIRST_PARTY_COOKIE_ENABLED', fields_asked: ['em', 'fn', 'ln', 'ph', 'ct', 'st', 'zp', 'country', 'external_id'],
        checked_at: minutesAgo(60 * 3), error: null,
      },
      match_alert: { match_quality_below: 6, coverage_below: below },
      gaps: gaps(below),
      low_match_quality: Object.entries(SCORES).filter(([, s]) => s < 6).sort((a, b) => a[1] - b[1]).map(([event, match_quality]) => ({ event, match_quality })),
      refused: REFUSED,
    };
    return { quality: scored, match };
  },
  resend: (event: string, eventId: string): Promise<ResendResult> => {
    const row = REFUSED.find((r) => r.event === event && r.event_id === eventId);
    if (!row) return refuse(404, 'No such refused event.');
    if (!row.resend.allowed) return refuse(422, row.resend.reason ?? 'This event cannot be sent again.');
    REFUSED = REFUSED.filter((r) => r !== row);
    return wait<ResendResult>({ event, event_id: eventId, order_id: row.order_id, status: 'sent', message: null, attempts: (row.attempts ?? 0) + 1, at: new Date().toISOString() }, 700);
  },
};
