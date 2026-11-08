/**
 * Platform Connections: what each connection service does for the store and the screen where it is used.
 * The ONE place that maps a backend service to a screen. Provider names and service lists are the backend's
 * (`GET /connectors/providers`); an entry here only adds a sentence for a store owner and the links, so a service
 * with no entry still shows, with the backend's own label and description and no link. Keyed by provider key,
 * then service key. Why here and not on the backend: a screen path belongs to this app's router, and the backend
 * returns data, never screens (growcord-rs CLAUDE.md rule 6).
 */
import { ADS_ROUTES, CONNECTIONS_ROUTE, META_ROUTES, SOCIAL_ROUTES } from './meta/routes';

export interface UseCaseLink { to: string; label: string }
export interface UseCase {
  /** What it does for the store, in plain words. The backend's description is the fallback. */
  what?: string;
  /** Where it is operated. The first link is the main one. */
  links?: UseCaseLink[];
}

/** Screens outside the Meta and Ads route lists above. Each is a route in App.tsx. */
const SCREENS = {
  insights: `${CONNECTIONS_ROUTE}/insights`,
  adAccounts: '/panel/marketing/ads',
  aiStudio: '/panel/marketing/ads/ai-studio',
  googleReviews: '/panel/marketing/google-reviews',
  seo: '/seo',
  crm: '/leads',
  channels: '/channels',
  whatsapp: '/messaging/whatsapp',
} as const;

const REPORTS: UseCaseLink = { to: SCREENS.insights, label: 'Open search insights' };
const CRM: UseCaseLink = { to: SCREENS.crm, label: 'Open CRM' };
const CHANNELS: UseCaseLink = { to: SCREENS.channels, label: 'Open channels' };

export const USE_CASES: Record<string, Record<string, UseCase>> = {
  meta: {
    business: {
      what: 'The Meta business account that owns your Page, ads and catalog. It decides which catalogs, pixels and ad accounts you can choose below.',
      links: [{ to: META_ROUTES.setup, label: 'Open Facebook and Instagram setup' }],
    },
    merchant_feed: {
      what: 'Puts your products on Facebook and Instagram so people can shop them, and supplies your catalog ads.',
      links: [{ to: META_ROUTES.catalog, label: 'Open Meta catalog' }],
    },
    ads: {
      what: 'Run Facebook and Instagram ads from this admin and build audiences from your customers.',
      links: [{ to: ADS_ROUTES.manager, label: 'Open Ads Manager' }, { to: ADS_ROUTES.audiences, label: 'Open audiences' }],
    },
    analytics: {
      what: 'Shows how your Facebook Page and posts are doing: views, reach and engagement.',
      links: [{ to: SOCIAL_ROUTES.insights, label: 'Open social analytics' }],
    },
    pages: {
      what: 'Post to your Facebook Page and answer the comments people leave there.',
      links: [{ to: SOCIAL_ROUTES.publisher, label: 'Open Publisher' }, { to: SOCIAL_ROUTES.comments, label: 'Open comments' }],
    },
    instagram: {
      what: 'Post to your Instagram account and show your Instagram feed on your store.',
      links: [{ to: META_ROUTES.instagram, label: 'Open Instagram feed' }, { to: SOCIAL_ROUTES.publisher, label: 'Open Publisher' }],
    },
    lead_ads: {
      what: 'Everyone who fills in a lead form on Facebook or Instagram comes straight into your CRM.',
      links: [{ to: ADS_ROUTES.leads, label: 'Open lead forms' }],
    },
    pixel: {
      what: 'Tells Meta what shoppers do on your store, through the Pixel and the Conversions API, so ads reach the right people and sales are counted.',
      links: [{ to: META_ROUTES.events, label: 'Open events health' }],
    },
    instagram_shopping: {
      what: 'Lets you tag your products in Instagram posts. Instagram must approve your shop first.',
      links: [{ to: META_ROUTES.instagram, label: 'Open Instagram feed' }],
    },
    messaging: {
      what: 'Answer Messenger and Instagram messages from your store inbox.',
      links: [{ to: SOCIAL_ROUTES.inbox, label: 'Open inbox' }, { to: SOCIAL_ROUTES.messengerSettings, label: 'Open chat settings' }],
    },
  },
  threads: {
    publish: {
      what: 'Post and schedule on your Threads profile.',
      links: [{ to: SOCIAL_ROUTES.publisher, label: 'Open Publisher' }],
    },
    replies: {
      what: 'Read, answer and hide replies to your Threads posts.',
      links: [{ to: SOCIAL_ROUTES.comments, label: 'Open comments' }],
    },
    insights: {
      what: 'Shows views, likes, replies and followers on Threads.',
      links: [{ to: SOCIAL_ROUTES.insights, label: 'Open social analytics' }],
    },
  },
  google: {
    search_console: {
      what: 'Shows what people search on Google before they reach your store, and tells Google about your pages.',
      links: [REPORTS],
    },
    analytics: {
      what: 'Brings your Google Analytics visitors and sales reports into this admin.',
      links: [REPORTS],
    },
    merchant_feed: {
      what: 'Sends your products to Google Shopping and shows which ones Google refused.',
      links: [REPORTS],
    },
    ads: {
      what: 'Run Google Search, Shopping and Performance Max ads, and let AI draft them for you.',
      links: [{ to: SCREENS.adAccounts, label: 'Open ad accounts' }, { to: SCREENS.aiStudio, label: 'Open AI Ads Studio' }],
    },
    tag_manager: {
      what: 'Checks that your Google tracking tags are firing on the store.',
      links: [{ to: SCREENS.seo, label: 'Open SEO and tracking tags' }],
    },
    business_profile: {
      what: 'Brings in your Google reviews so you can answer them from here.',
      links: [{ to: SCREENS.googleReviews, label: 'Open Google reviews' }],
    },
    gmail: {
      what: 'Shows your email conversations with a person on their CRM record. Nothing is sent or changed in your mailbox.',
      links: [CRM],
    },
    pagespeed: {
      what: 'Scores how fast your store pages load.',
      links: [REPORTS],
    },
  },
  microsoft: {
    outlook: {
      what: 'Shows your email conversations with a person on their CRM record. Nothing is sent or changed in your mailbox.',
      links: [CRM],
    },
  },
  linkedin: {
    ads: { what: 'Reads how your LinkedIn campaigns are doing and sends LinkedIn the conversions shoppers agreed to.' },
    analytics: { what: 'Reads your LinkedIn campaign and conversion reports.' },
  },
  zoho: {
    books: { what: 'Copies your Zoho Books records into Growcord Books, one way. Nothing changes in Zoho.' },
    invoice: { what: 'Copies your Zoho Invoice records into Growcord Books, one way. Nothing changes in Zoho.' },
  },
  shopify: {
    checkout: { what: 'Creates the orders Growcord Checkout takes payment for in your Shopify store, and records cancellations, refunds and edits.' },
  },
  woocommerce: {
    checkout: { what: 'Creates the orders Growcord Checkout takes payment for in your WooCommerce store, and records cancellations, refunds and edits.' },
  },
  amazon: { listings: { what: 'Keeps your stock and prices up to date on Amazon.', links: [CHANNELS] } },
  flipkart: { listings: { what: 'Keeps your stock and prices up to date on Flipkart.', links: [CHANNELS] } },
  meesho: { listings: { what: 'Keeps your stock and prices up to date on Meesho.', links: [CHANNELS] } },
  tata1mg: { listings: { what: 'Keeps your stock and prices up to date on Tata 1mg.', links: [CHANNELS] } },
};

/** A second way to reach a provider's main screen, shown in its account card. */
export const ACCOUNT_LINK: Record<string, UseCaseLink> = {
  meta: { to: META_ROUTES.setup, label: 'Open Facebook and Instagram setup' },
};

/**
 * Things a store owner expects on a platform's tab that are not a connection service of that provider. `platform`
 * names another tab (rendered only when the backend lists that provider, with its own label); `to` is a screen.
 */
export type RelatedRow =
  | { what: string; title: string; to: string; label: string }
  | { what: string; platform: string };

export const RELATED: Record<string, RelatedRow[]> = {
  meta: [
    {
      title: 'WhatsApp',
      what: 'Your WhatsApp number, templates and chats are set up in Messaging, not through this sign-in. The WhatsApp catalog is on the Meta catalog page.',
      to: SCREENS.whatsapp,
      label: 'Open WhatsApp',
    },
    { platform: 'threads', what: 'Threads has its own sign-in. Its posts, replies and numbers are on its own tab.' },
  ],
};
