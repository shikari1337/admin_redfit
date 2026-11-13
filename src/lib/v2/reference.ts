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
