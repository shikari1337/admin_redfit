/**
 * META-22 (REUSE-14): the ONE client of the backend reference registry
 * (`GET /api/v2/platform/public/reference/countries`, growcord-rs `apps/platform/core/src/api/reference.rs`).
 * Every country picker reads `useCountries()`; `lib/countries.ts` keeps only a small fallback used until the
 * read answers or when it fails. The answer is cached for the page's life (the server caches it for a day).
 */
import { useEffect, useState } from 'react';
import { V2_ENABLED } from './config';
import { v2call } from './http';
import { COUNTRIES_FALLBACK, type CountryRef } from '../countries';

export const REFERENCE_PATHS = {
  countries: '/api/v2/platform/public/reference/countries',
  /** THE IFSC lookup (RBI list through the directory port, cached by the server; growcord-rs `apps/books/core/src/api/ifsc.rs`). */
  ifsc: (code: string) => `/api/v2/books/public/ifsc/${encodeURIComponent(code)}`,
} as const;

interface WireCountry { iso2?: string; name?: string; dial_code?: string | null; currency?: string | null }

/* ── currencies, languages, subdivisions (MENU-1 settings-core) ─────────────────────────────────────────
 * The same registry, the same rule as the countries below: one read per table for the page's life, the
 * caller's small fallback until it answers or when it fails. The Settings Center validates a store setting
 * against these very lists (commerce `svc/settings_center.rs` resolve_options), so a picker built from them
 * never offers a value the server refuses: currencies are the current ISO ones without funds, a state's
 * value is the subdivision's address key (for India, its name). */

/** The registry's other whole tables, and one country's subdivisions (growcord-rs `apps/platform/core/src/api/reference.rs`). */
export const REFERENCE_TABLE_PATHS = {
  currencies: '/api/v2/platform/public/reference/currencies',
  languages: '/api/v2/platform/public/reference/languages',
  subdivisions: (iso2: string) =>
    `/api/v2/platform/public/reference/countries/${encodeURIComponent(iso2.trim().toUpperCase())}/subdivisions`,
} as const;

export interface CurrencyOption { code: string; name: string; symbol: string }
export interface LanguageOption { code: string; name: string }
export interface SubdivisionOption { value: string; name: string }

interface WireCurrency { code?: string; name?: string; symbol?: string | null; narrow_symbol?: string | null; iso_current?: boolean; is_fund?: boolean }
interface WireLanguage { code?: string; name?: string }
interface WireSubdivision { key?: string; name?: string }

const tables = new Map<string, unknown[]>();
const tablesInflight = new Map<string, Promise<void>>();
const tableListeners = new Set<() => void>();

function loadTable<T>(path: string, map: (rows: any[]) => T[]): Promise<void> {
  if (tables.has(path) || !V2_ENABLED) return Promise.resolve();
  let p = tablesInflight.get(path);
  if (!p) {
    p = v2call<any[]>('GET', path)
      .then((rows) => {
        const list = map(Array.isArray(rows) ? rows : []);
        if (list.length) {
          tables.set(path, list);
          tableListeners.forEach((l) => l());
        }
      })
      .catch(() => { /* the fallback stays; a later mount may retry */ })
      .finally(() => { tablesInflight.delete(path); });
    tablesInflight.set(path, p);
  }
  return p;
}

function useTable<T>(path: string | null, map: (rows: any[]) => T[], fallback: T[]): T[] {
  const now = () => (path && (tables.get(path) as T[] | undefined)) || fallback;
  const [list, setList] = useState<T[]>(now);
  useEffect(() => {
    const sync = () => setList(now());
    tableListeners.add(sync);
    if (path) void loadTable(path, map);
    sync();
    return () => { tableListeners.delete(sync); };
    // `map` and `fallback` are the caller's constants; the path decides the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return list;
}

const toCurrencies = (rows: WireCurrency[]): CurrencyOption[] => rows
  .filter((r) => r.code && r.iso_current !== false && !r.is_fund)
  .map((r) => ({ code: String(r.code), name: String(r.name ?? r.code), symbol: String(r.symbol ?? r.narrow_symbol ?? r.code) }));

const toLanguages = (rows: WireLanguage[]): LanguageOption[] => rows
  .filter((r) => r.code)
  .map((r) => ({ code: String(r.code), name: String(r.name ?? r.code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const toSubdivisions = (rows: WireSubdivision[]): SubdivisionOption[] => rows
  .filter((r) => r.key || r.name)
  .map((r) => ({ value: String(r.key ?? r.name), name: String(r.name ?? r.key) }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Every current ISO 4217 currency (no funds), the fallback until the registry answers. */
export function useCurrencies(fallback: CurrencyOption[] = []): CurrencyOption[] {
  return useTable(REFERENCE_TABLE_PATHS.currencies, toCurrencies, fallback);
}

/** Every language the registry knows, by name. */
export function useLanguages(fallback: LanguageOption[] = []): LanguageOption[] {
  return useTable(REFERENCE_TABLE_PATHS.languages, toLanguages, fallback);
}

/** The first-level subdivisions (states, provinces) of one country; empty for a country without any. */
export function useSubdivisions(iso2: string | null | undefined, fallback: SubdivisionOption[] = []): SubdivisionOption[] {
  return useTable(iso2 ? REFERENCE_TABLE_PATHS.subdivisions(iso2) : null, toSubdivisions, fallback);
}

let cached: CountryRef[] | null = null;
let inflight: Promise<CountryRef[]> | null = null;
const listeners = new Set<() => void>();

/** The countries now: the full list once it has loaded, else the small fallback. */
export function countriesNow(): CountryRef[] {
  return cached ?? COUNTRIES_FALLBACK;
}

/** Read the list once (shared by every caller). A failed read keeps the fallback and may be retried later. */
export function loadCountries(): Promise<CountryRef[]> {
  if (cached) return Promise.resolve(cached);
  if (!V2_ENABLED) return Promise.resolve(COUNTRIES_FALLBACK);
  if (!inflight) {
    inflight = v2call<WireCountry[]>('GET', REFERENCE_PATHS.countries, { params: { fields: 'name,dial_code,currency' } })
      .then((rows) => {
        const list = (Array.isArray(rows) ? rows : [])
          .filter((r) => r.iso2 && r.name)
          .map((r) => ({ code: String(r.iso2), name: String(r.name), currency: r.currency ?? '', dial: r.dial_code ?? '' }));
        if (list.length === 0) return COUNTRIES_FALLBACK;
        cached = list;
        listeners.forEach((l) => l());
        return list;
      })
      .catch(() => COUNTRIES_FALLBACK)
      .finally(() => { inflight = null; });
  }
  return inflight ?? Promise.resolve(COUNTRIES_FALLBACK);
}

/** The country list for a picker: the fallback first, the full registry list as soon as it arrives. */
export function useCountries(): CountryRef[] {
  const [list, setList] = useState<CountryRef[]>(countriesNow);
  useEffect(() => {
    const sync = () => setList(countriesNow());
    listeners.add(sync);
    void loadCountries();
    sync();
    return () => { listeners.delete(sync); };
  }, []);
  return list;
}

/** One bank branch as the IFSC lookup answers it (`IfscView`). */
export interface IfscBranch {
  ifsc: string; bank: string; bankCode: string; branch: string;
  address: string; city: string; district: string; state: string;
}

/**
 * The branch an IFSC belongs to, from the backend's one lookup (never an outside site; the server checks the
 * shape). `ok: false` carries the reason in words: not IFSC-shaped, no branch carries it, or the lookup could
 * not be reached.
 */
export async function lookupIfsc(input: string): Promise<{ ok: true; branch: IfscBranch } | { ok: false; reason: string }> {
  const code = String(input ?? '').replace(/\s+/g, '').toUpperCase();
  if (code.length !== 11) return { ok: false, reason: 'An IFSC has 11 characters.' };
  if (!V2_ENABLED) return { ok: false, reason: 'The IFSC lookup is not available on this server.' };
  try {
    const r = await v2call<Record<string, unknown>>('GET', REFERENCE_PATHS.ifsc(code));
    const t = (k: string) => (r?.[k] == null ? '' : String(r[k]));
    return {
      ok: true,
      branch: {
        ifsc: t('ifsc') || code, bank: t('bank'), bankCode: t('bank_code') || t('bankCode'), branch: t('branch'),
        address: t('address'), city: t('city'), district: t('district'), state: t('state'),
      },
    };
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 404) return { ok: false, reason: `No bank branch carries the IFSC ${code}.` };
    return { ok: false, reason: e?.response?.data?.message || 'The IFSC lookup could not be reached. Check the code by hand.' };
  }
}
