// ─────────────────────────────────────────────────────────────────────────────
// The ONE country reference list for the admin panel — code, display name,
// default currency and dial code. Shape rich enough for every consumer:
// `storeConfig.ts` (Store Configuration / Setup Wizard — code/name/currency)
// and `PhoneInput.tsx` (a dial-code selector — code/dial). Previously kept as
// two near-duplicate lists in different shapes; see
// `.claude/checklists/L1-redundancy.md` item 13 / `L3-redundancy-fixes.md`.
// ─────────────────────────────────────────────────────────────────────────────

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
