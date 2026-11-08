/**
 * Development only (`?mock=meta` on a dev server): sample staff notifications in the comms app's answer
 * shapes, so the bell can be checked without a backend. Never bundled in a production build (see
 * `staffNotifications.ts`). The words follow what the producers write (META-21 PORT_NOTES); the ad spend
 * text is META-10's own sentence with its amount in the ad account's currency.
 */
import type { StaffKind, StaffKindList, StaffNote, StaffNoteList, StaffNoteQuery } from './staffNotifications';

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

const notes: StaffNote[] = [
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000001',
    kind: 'marketing.meta_ad_alert',
    kind_label: 'Meta ads alerts',
    title: 'Meta rejected an ad or reports issues: Arnica gel carousel, winter',
    body: 'Meta rejected this ad; it does not run until it is fixed and reviewed again.',
    link: '/panel/marketing/ads/analytics',
    severity: 'critical',
    created_at: ago(35),
    cleared_at: null,
    read_at: null,
  },
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000002',
    kind: 'marketing.meta_ad_alert',
    kind_label: 'Meta ads alerts',
    title: 'Ad spend with no sales: Diwali remedies prospecting, broad audience India',
    body: 'Spent 4850.00 INR in the last 7 days with no purchases.',
    link: '/panel/marketing/ads/analytics',
    severity: 'warning',
    created_at: ago(190),
    cleared_at: null,
    read_at: null,
  },
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000003',
    kind: 'commerce.meta_catalog',
    kind_label: 'Meta catalog updates failing',
    title: 'Meta catalog updates are failing',
    body: 'Product updates to the Meta catalog have failed for 3 hours, so Facebook and Instagram may show old prices or stock. Meta said: (#100) Invalid parameter: the price of retailer id HM-ARN-30C-30ML must be greater than zero.',
    link: '/panel/marketing/meta/catalog',
    severity: 'warning',
    created_at: ago(310),
    cleared_at: null,
    read_at: ago(120),
  },
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000004',
    kind: 'marketing.meta_connection',
    kind_label: 'Meta connection',
    title: 'The Meta login ends soon',
    body: "The store's Meta login ends on 2026-11-14. Connect it again before then so ads data, catalog updates, posts and leads keep flowing.",
    link: '/panel/marketing/meta',
    severity: 'warning',
    created_at: ago(26 * 60),
    cleared_at: null,
    read_at: null,
  },
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000005',
    kind: 'marketing.social_publish_failed',
    kind_label: 'Post did not publish',
    title: 'A post did not publish on Instagram',
    body: 'The image is too small: Instagram needs it at least 320 pixels wide. Open the Publisher to publish it again.',
    link: '/panel/marketing/social/publisher',
    severity: 'warning',
    created_at: ago(2 * 24 * 60),
    cleared_at: ago(2 * 24 * 60 - 45),
    read_at: ago(2 * 24 * 60 - 50),
  },
  {
    id: '0193f6a0-7c11-7a51-9b2e-5d1c00000006',
    kind: 'marketing.meta_lead_form',
    kind_label: 'Lead form not read',
    title: 'Leads of Free consultation, homeopathy for children could not be read',
    body: 'New leads of this form may be missing from the CRM until the next read works; it is tried again every hour. Meta said: (#200) Requires pages_manage_ads permission to manage the object.',
    link: '/panel/marketing/ads/leads',
    severity: 'warning',
    created_at: ago(4 * 24 * 60),
    cleared_at: ago(4 * 24 * 60 - 60),
    read_at: null,
  },
];

const kinds: StaffKind[] = [
  { kind: 'marketing.meta_ad_alert', product: 'marketing', label: 'Meta ads alerts', help: 'Spend with no sales, return on ad spend below target, cost per purchase rising, people seeing the same ads too often, ads Meta rejected and ad account problems. The thresholds are in Ads analytics, alert settings.', permission: 'ads.read', may_see: true, store_on: true, roles: [], mine_on: true },
  { kind: 'marketing.meta_connection', product: 'marketing', label: 'Meta connection', help: 'The Meta login needs to be connected again, or ends soon.', permission: 'settings.read', may_see: true, store_on: true, roles: [], mine_on: true },
  { kind: 'commerce.meta_catalog', product: 'commerce', label: 'Meta catalog updates failing', help: 'Product updates to the Meta catalog keep failing, so Facebook and Instagram show old prices or stock.', permission: 'channels.read', may_see: true, store_on: true, roles: [], mine_on: true },
  { kind: 'marketing.social_publish_failed', product: 'marketing', label: 'Post did not publish', help: 'A Facebook or Instagram post from the Publisher did not go out.', permission: 'marketing.read', may_see: true, store_on: false, roles: [], mine_on: true },
  { kind: 'marketing.meta_lead_form', product: 'marketing', label: 'Lead form not read', help: 'The leads of a Meta lead form could not be read, so new leads may be missing from the CRM.', permission: 'marketing.read', may_see: false, store_on: true, roles: [], mine_on: true },
];

const visible = (n: StaffNote) => {
  const k = kinds.find((x) => x.kind === n.kind);
  return !!k && k.may_see && k.store_on && k.mine_on;
};
const unread = () => notes.filter((n) => visible(n) && !n.cleared_at && !n.read_at).length;

export const staffNotesMock = {
  list(q: StaffNoteQuery): StaffNoteList {
    let items = notes.filter(visible);
    if (q.open) items = items.filter((n) => !n.cleared_at);
    if (q.unread) items = items.filter((n) => !n.read_at);
    return { items: items.slice(0, q.limit ?? 20).map((n) => ({ ...n })), unread: unread(), next_before: null };
  },
  count(): number {
    return unread();
  },
  read(ids?: string[]): number {
    const at = new Date().toISOString();
    for (const n of notes) if (visible(n) && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = at;
    return unread();
  },
  kinds(): StaffKindList {
    return { items: kinds.map((k) => ({ ...k })), can_manage: true };
  },
  setMine(kind: string, enabled: boolean): StaffKindList {
    const k = kinds.find((x) => x.kind === kind);
    if (k) k.mine_on = enabled;
    return this.kinds();
  },
  setStore(kind: string, enabled: boolean): StaffKindList {
    const k = kinds.find((x) => x.kind === kind);
    if (k) k.store_on = enabled;
    return this.kinds();
  },
};

export type StaffNotesMock = typeof staffNotesMock;
