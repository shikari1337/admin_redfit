// ─────────────────────────────────────────────────────────────────────────────
// Store Configuration — the single, structured source of truth for a store's
// business identity, contact, address, regional/commerce settings, social links
// and business hours.
//
// Persisted as ONE public settings key (`storeConfig`) via the generic
// /settings endpoints, so the storefront receives it automatically from
// GET /settings. For backward-compatibility with screens/consumers that still
// read the older flat keys (general/contact/logo), saving also mirrors the key
// fields back into those keys — see `storeConfigToLegacy`.
// ─────────────────────────────────────────────────────────────────────────────

export interface StoreBusiness {
  /** Public display / brand name shown across the storefront. */
  name: string;
  /** Registered legal entity name (invoices, policies). */
  legalName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  websiteUrl: string;
}

export interface StoreContact {
  /** Primary/support email. */
  email: string;
  salesEmail: string;
  phone: string;
  whatsapp: string;
  tollFree: string;
}

export interface StoreAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO-2 country code. */
  country: string;
  /** Google Maps link/embed for the contact page. */
  mapUrl: string;
}

export interface StoreRegional {
  /** ISO-2 country the business is registered / primarily operates in. */
  baseCountry: string;
  /** ISO-2 codes of countries the store sells/ships to. */
  operatingCountries: string[];
  /** Default display currency (ISO-4217). */
  currency: string;
  /** Additional currencies the store accepts/displays. */
  supportedCurrencies: string[];
  /**
   * NOTE: there is deliberately no `timezone` here.
   * The store's civil timezone lives on the PLATFORM store record
   * (`stores.settings.timezone`) and is resolved server-side by
   * `backend/src/config/timezone.ts`; the admin renders it read-only from
   * `utils/date.ts`. A second copy under storeConfig was written by two
   * screens and read by nothing — see COMMON_MISTAKES #216 (and #199 for the
   * identical `returnPeriodDays` shape). Do not add it back.
   */
  language: string;
  weightUnit: 'kg' | 'lb' | 'g';
  dimensionUnit: 'cm' | 'in';
}

export interface StoreSocial {
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  linkedin: string;
  pinterest: string;
}

export interface BusinessHour {
  /** 'mon' | 'tue' | … */
  day: string;
  open: string;   // '09:00'
  close: string;  // '19:00'
  closed: boolean;
}

export interface StoreConfig {
  business: StoreBusiness;
  contact: StoreContact;
  address: StoreAddress;
  regional: StoreRegional;
  social: StoreSocial;
  hours: BusinessHour[];
  /** Free-text note shown alongside hours (e.g. "Closed on public holidays"). */
  hoursNote: string;
  /** Set true once the store owner finishes the setup wizard / config page. */
  setupCompleted: boolean;
}

// ─── Reference data ──────────────────────────────────────────────────────────

export interface CountryRef { code: string; name: string; currency: string; dial: string; }

/** A pragmatic country list weighted toward the platform's markets, then major
 *  economies. `currency` is the country's default ISO-4217 code. */
export const COUNTRIES: CountryRef[] = [
  { code: 'IN', name: 'India',                currency: 'INR', dial: '+91' },
  { code: 'US', name: 'United States',        currency: 'USD', dial: '+1' },
  { code: 'GB', name: 'United Kingdom',       currency: 'GBP', dial: '+44' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', dial: '+971' },
  { code: 'SA', name: 'Saudi Arabia',         currency: 'SAR', dial: '+966' },
  { code: 'QA', name: 'Qatar',                currency: 'QAR', dial: '+974' },
  { code: 'KW', name: 'Kuwait',               currency: 'KWD', dial: '+965' },
  { code: 'OM', name: 'Oman',                 currency: 'OMR', dial: '+968' },
  { code: 'BH', name: 'Bahrain',              currency: 'BHD', dial: '+973' },
  { code: 'SG', name: 'Singapore',            currency: 'SGD', dial: '+65' },
  { code: 'MY', name: 'Malaysia',             currency: 'MYR', dial: '+60' },
  { code: 'AU', name: 'Australia',            currency: 'AUD', dial: '+61' },
  { code: 'NZ', name: 'New Zealand',          currency: 'NZD', dial: '+64' },
  { code: 'CA', name: 'Canada',               currency: 'CAD', dial: '+1' },
  { code: 'NP', name: 'Nepal',                currency: 'NPR', dial: '+977' },
  { code: 'BD', name: 'Bangladesh',           currency: 'BDT', dial: '+880' },
  { code: 'LK', name: 'Sri Lanka',            currency: 'LKR', dial: '+94' },
  { code: 'PK', name: 'Pakistan',             currency: 'PKR', dial: '+92' },
  { code: 'ZA', name: 'South Africa',         currency: 'ZAR', dial: '+27' },
  { code: 'DE', name: 'Germany',              currency: 'EUR', dial: '+49' },
  { code: 'FR', name: 'France',               currency: 'EUR', dial: '+33' },
  { code: 'IT', name: 'Italy',                currency: 'EUR', dial: '+39' },
  { code: 'ES', name: 'Spain',                currency: 'EUR', dial: '+34' },
  { code: 'NL', name: 'Netherlands',          currency: 'EUR', dial: '+31' },
];

export interface CurrencyRef { code: string; symbol: string; name: string; }

export const CURRENCIES: CurrencyRef[] = [
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee' },
  { code: 'USD', symbol: '$',  name: 'US Dollar' },
  { code: 'EUR', symbol: '€',  name: 'Euro' },
  { code: 'GBP', symbol: '£',  name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼',  name: 'Saudi Riyal' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  { code: 'BDT', symbol: '৳',  name: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'ZAR', symbol: 'R',  name: 'South African Rand' },
];


export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ta', name: 'Tamil' },
  { code: 'bn', name: 'Bengali' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
];

/** States & Union Territories of India (the platform's primary market). */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_HOURS: BusinessHour[] = WEEKDAYS.map((d) => ({
  day: d.key,
  open: '09:00',
  close: '19:00',
  closed: d.key === 'sun',
}));

export const EMPTY_STORE_CONFIG: StoreConfig = {
  business: { name: '', legalName: '', tagline: '', description: '', logoUrl: '', faviconUrl: '', websiteUrl: '' },
  contact: { email: '', salesEmail: '', phone: '', whatsapp: '', tollFree: '' },
  address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN', mapUrl: '' },
  regional: {
    baseCountry: 'IN', operatingCountries: ['IN'], currency: 'INR', supportedCurrencies: ['INR'],
    language: 'en', weightUnit: 'kg', dimensionUnit: 'cm',
  },
  social: { facebook: '', instagram: '', twitter: '', youtube: '', linkedin: '', pinterest: '' },
  hours: DEFAULT_HOURS,
  hoursNote: '',
  setupCompleted: false,
};

// ─── Load / normalize ────────────────────────────────────────────────────────

const s = (v: any): string => (v == null ? '' : String(v));
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/**
 * Build a fully-populated StoreConfig from the raw settings object returned by
 * `/settings/admin` (or the public `/settings`). Reads the canonical
 * `storeConfig` key first, then falls back to the legacy flat keys so stores
 * configured before this page keep their values.
 */
export function loadStoreConfig(settings: Record<string, any> | null | undefined): StoreConfig {
  const raw = settings ?? {};
  const sc = raw.storeConfig ?? {};
  const legacyGeneral = raw.general ?? {};
  const legacyContact = raw.contact ?? {};
  const legacyLogo = raw.logo ?? {};

  const business: StoreBusiness = {
    name: s(sc.business?.name ?? legacyGeneral.siteName ?? raw.storeName),
    legalName: s(sc.business?.legalName ?? legacyGeneral.legalName),
    tagline: s(sc.business?.tagline ?? legacyGeneral.tagline),
    description: s(sc.business?.description ?? legacyGeneral.siteDescription),
    logoUrl: s(sc.business?.logoUrl ?? legacyLogo.logoUrl),
    faviconUrl: s(sc.business?.faviconUrl ?? legacyLogo.faviconUrl),
    websiteUrl: s(sc.business?.websiteUrl ?? legacyGeneral.websiteUrl),
  };

  const contact: StoreContact = {
    email: s(sc.contact?.email ?? legacyContact.email ?? raw.storeEmail),
    salesEmail: s(sc.contact?.salesEmail ?? legacyContact.salesEmail),
    phone: s(sc.contact?.phone ?? legacyContact.phoneNumber ?? raw.storePhone),
    whatsapp: s(sc.contact?.whatsapp ?? legacyContact.whatsappNumber),
    tollFree: s(sc.contact?.tollFree ?? legacyContact.tollFree),
  };

  const address: StoreAddress = {
    line1: s(sc.address?.line1 ?? legacyContact.address),
    line2: s(sc.address?.line2),
    city: s(sc.address?.city),
    state: s(sc.address?.state),
    postalCode: s(sc.address?.postalCode),
    country: s(sc.address?.country) || 'IN',
    mapUrl: s(sc.address?.mapUrl),
  };

  const regional: StoreRegional = {
    baseCountry: s(sc.regional?.baseCountry) || 'IN',
    operatingCountries: arr(sc.regional?.operatingCountries).length ? arr(sc.regional?.operatingCountries) : ['IN'],
    currency: s(sc.regional?.currency ?? legacyGeneral.currency) || 'INR',
    supportedCurrencies: arr(sc.regional?.supportedCurrencies).length
      ? arr(sc.regional?.supportedCurrencies)
      : [s(sc.regional?.currency ?? legacyGeneral.currency) || 'INR'],
    language: s(sc.regional?.language ?? legacyGeneral.language) || 'en',
    weightUnit: (sc.regional?.weightUnit as StoreRegional['weightUnit']) || 'kg',
    dimensionUnit: (sc.regional?.dimensionUnit as StoreRegional['dimensionUnit']) || 'cm',
  };

  const social: StoreSocial = {
    facebook: s(sc.social?.facebook),
    instagram: s(sc.social?.instagram),
    twitter: s(sc.social?.twitter),
    youtube: s(sc.social?.youtube),
    linkedin: s(sc.social?.linkedin),
    pinterest: s(sc.social?.pinterest),
  };

  const hours: BusinessHour[] = Array.isArray(sc.hours) && sc.hours.length
    ? WEEKDAYS.map((d) => {
        const found = sc.hours.find((h: any) => h.day === d.key) ?? {};
        return {
          day: d.key,
          open: s(found.open) || '09:00',
          close: s(found.close) || '19:00',
          closed: !!found.closed,
        };
      })
    : DEFAULT_HOURS;

  return {
    business, contact, address, regional, social, hours,
    hoursNote: s(sc.hoursNote),
    setupCompleted: !!sc.setupCompleted,
  };
}

/**
 * Legacy mirror: the flat settings keys that other screens/consumers still read.
 * Persist these alongside `storeConfig` so nothing that reads
 * general/contact/logo drifts out of sync.
 */
export function storeConfigToLegacy(cfg: StoreConfig): Array<{ key: string; value: any; grp: string; is_public: boolean }> {
  return [
    {
      key: 'general',
      grp: 'general',
      is_public: true,
      value: {
        siteName: cfg.business.name,
        siteDescription: cfg.business.description,
        legalName: cfg.business.legalName,
        tagline: cfg.business.tagline,
        websiteUrl: cfg.business.websiteUrl,
        currency: cfg.regional.currency,
        language: cfg.regional.language,
      },
    },
    {
      key: 'contact',
      grp: 'contact',
      is_public: true,
      value: {
        email: cfg.contact.email,
        phoneNumber: cfg.contact.phone,
        whatsappNumber: cfg.contact.whatsapp,
        address: [cfg.address.line1, cfg.address.line2, cfg.address.city, cfg.address.state, cfg.address.postalCode]
          .filter(Boolean)
          .join(', '),
      },
    },
    {
      key: 'logo',
      grp: 'appearance',
      is_public: true,
      value: { logoUrl: cfg.business.logoUrl, faviconUrl: cfg.business.faviconUrl },
    },
  ];
}

/** Build the full bulk-settings payload (canonical + mirror) for saving. */
export function storeConfigSavePayload(cfg: StoreConfig) {
  return [
    { key: 'storeConfig', value: cfg, grp: 'store', is_public: true },
    ...storeConfigToLegacy(cfg),
  ];
}

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
