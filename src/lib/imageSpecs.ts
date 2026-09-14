/**
 * Image specs — the admin's view of `GET /upload/image-specs`.
 *
 * Every image field names its SLOT (`spec="product.aplus.banner"`), and this
 * module answers "what size does this store's frontend need for that slot",
 * resolved server-side (registry → frontend variant → theme declaration →
 * merchant overrides). Loaded once per session and cached; the hint under a
 * field, the upload warning and the AI image dialog's locked size all read
 * from here so they can never disagree.
 */
import { useEffect, useState } from 'react';
import api from '../services/api';

export type ImageSpecFrontend = 'storefront' | 'ecom' | 'template';

export interface ImageSpec {
  key: string;
  label: string;
  entity: string;
  description: string;
  width: number;
  height: number;
  aspect: string;
  minWidth: number;
  fit: 'cover' | 'contain';
  formats: string[];
  maxKb: number;
  transparent: boolean;
  aiHints?: string;
  frontend: ImageSpecFrontend;
  uses?: string;
  source: 'registry' | 'frontend' | 'theme' | 'override';
  others: Array<{ frontend: ImageSpecFrontend; width: number; height: number; uses?: string }>;
}

export interface ImageSpecResolution {
  frontend: ImageSpecFrontend;
  frontendLabel: string;
  themeName?: string;
  specs: ImageSpec[];
  byKey: Record<string, ImageSpec>;
}

/** Used while the resolution loads, and for callers with no slot at all. */
export const SPEC_FALLBACK: ImageSpec = {
  key: 'generic', label: 'Image', entity: 'generic', description: 'A general image with no fixed place on the website.',
  width: 1600, height: 900, aspect: '16:9', minWidth: 600, fit: 'contain', formats: ['webp', 'jpg', 'png'], maxKb: 400,
  transparent: false, frontend: 'storefront', source: 'registry', others: [],
};

let cached: ImageSpecResolution | null = null;
let inflight: Promise<ImageSpecResolution> | null = null;
const listeners = new Set<() => void>();

export async function loadImageSpecs(force = false): Promise<ImageSpecResolution> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = api.get('/upload/image-specs').then((r) => {
    const data = r.data?.specs ? r.data : r.data?.data;
    const specs: ImageSpec[] = Array.isArray(data?.specs) ? data.specs : [];
    cached = {
      frontend: data?.frontend ?? 'storefront',
      frontendLabel: data?.frontendLabel ?? 'Growcord storefront',
      themeName: data?.themeName,
      specs,
      byKey: data?.byKey && typeof data.byKey === 'object' ? data.byKey : Object.fromEntries(specs.map((s) => [s.key, s])),
    };
    listeners.forEach((l) => l());
    return cached;
  }).finally(() => { inflight = null; });
  return inflight;
}

export function getImageSpecSync(key?: string | null): ImageSpec {
  if (!key) return SPEC_FALLBACK;
  return cached?.byKey[key] ?? SPEC_FALLBACK;
}

export function useImageSpecs(): { resolution: ImageSpecResolution | null; loading: boolean; reload: () => void } {
  const [resolution, setResolution] = useState<ImageSpecResolution | null>(cached);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setResolution(cached); };
    listeners.add(sync);
    if (!cached) loadImageSpecs().catch(() => { /* hint simply falls back */ }).finally(() => alive && setLoading(false));
    return () => { alive = false; listeners.delete(sync); };
  }, []);
  return { resolution, loading, reload: () => { loadImageSpecs(true).catch(() => {}); } };
}

/** The spec for ONE slot; falls back to the generic spec until loaded or when the key is unknown. */
export function useImageSpec(key?: string | null): ImageSpec {
  const { resolution } = useImageSpecs();
  if (!key) return SPEC_FALLBACK;
  return resolution?.byKey[key] ?? SPEC_FALLBACK;
}

/** "1600 × 600 px (8:3) · WebP/JPG/PNG · under 350 KB" */
export function specHint(s: ImageSpec, opts: { short?: boolean } = {}): string {
  const fmt = s.formats.map((f) => f.toUpperCase()).join('/');
  if (opts.short) return `${s.width} × ${s.height} (${s.aspect})`;
  return `${s.width} × ${s.height} px (${s.aspect}) · ${fmt} · under ${s.maxKb} KB${s.transparent ? ' · transparent' : ''}`;
}

export interface SpecCheck { level: 'ok' | 'warn' | 'bad'; message: string }

/** Judge a picked/uploaded image against its slot. Never blocks — it informs. */
export function checkAgainstSpec(dims: { width: number; height: number } | null, bytes: number | null, s: ImageSpec): SpecCheck {
  const notes: string[] = [];
  let level: SpecCheck['level'] = 'ok';
  if (dims) {
    if (dims.width < s.minWidth) { level = 'bad'; notes.push(`only ${dims.width} px wide — needs at least ${s.minWidth}`); }
    const want = s.width / s.height, got = dims.width / dims.height;
    const drift = Math.abs(got - want) / want;
    if (drift > 0.25) {
      if (level !== 'bad') level = 'warn';
      notes.push(s.fit === 'cover' ? `shape is ${dims.width}:${dims.height}, the page will crop it to ${s.aspect}` : `shape is ${dims.width}:${dims.height}, expected about ${s.aspect}`);
    }
  }
  if (bytes != null && bytes > s.maxKb * 1024 * 1.5) {
    if (level !== 'bad') level = 'warn';
    notes.push(`${Math.round(bytes / 1024)} KB — heavier than the ${s.maxKb} KB target`);
  }
  return { level, message: notes.length ? notes.join('; ') : `Fits the ${s.label.toLowerCase()} slot` };
}

/** Measure an image URL in the browser (never throws; null when it cannot load). */
export function readImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
