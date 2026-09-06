/**
 * Page settings + SEO, inside the visual builder.
 *
 * Before this, a page's title/slug/visibility lived only in the classic page
 * form and its SEO lived NOWHERE in the admin at all — `pages.seo` was a column
 * the storefront read and no screen could write. So the two facts an author
 * most wants while looking at the page (what it's called, how it appears in
 * Google) were the two they had to leave the builder to change, or couldn't
 * change at all.
 *
 * Everything here maps 1:1 onto what the storefront actually renders
 * (`lib/seo.ts buildPageMetadata`), which is why the SERP preview can be exact
 * rather than indicative — including the "| StoreName" suffix rule, where an
 * authored title is used verbatim and only a generated fallback gets the suffix.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Image as ImageIcon, X, Check, AlertTriangle, Globe, Code2, Eye, EyeOff } from 'lucide-react';
import MediaPicker from '../common/MediaPicker';

export interface PageSeoValue {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  schema?: any;
}

export interface PageBasics {
  title: string;
  slug: string;
  isActive: boolean;
}

interface Props {
  basics: PageBasics;
  seo: PageSeoValue;
  storeName?: string;
  storefrontUrl?: string;
  /** Homepage lives at `/`, every other page at `/pages/{slug}`. */
  isHomepage?: boolean;
  onChange: (next: { basics: PageBasics; seo: PageSeoValue }) => void;
}

/** Google truncates around these widths; the counters are advisory, never a
 *  hard limit — an over-length title still saves, it just previews clipped. */
const TITLE_IDEAL = 60;
const DESC_IDEAL = 160;

const counterTone = (len: number, ideal: number) =>
  len === 0 ? 'text-slate-400'
    : len > ideal ? 'text-amber-600'
      : len < ideal * 0.4 ? 'text-slate-400' : 'text-emerald-600';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ label, hint, children, right }) => (
  <div className="mb-3.5">
    <div className="flex items-baseline justify-between mb-1">
      <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {right}
    </div>
    {children}
    {hint && <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>}
  </div>
);

const inputCls =
  'w-full px-2.5 py-2 text-[13px] border border-slate-300 rounded-md bg-white text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, icon, children, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-b border-slate-200">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[12px] font-bold text-slate-700 flex-1">{title}</span>
        <span className={`text-slate-400 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="px-3.5 pb-4">{children}</div>}
    </div>
  );
};

const PageSeoPanel: React.FC<Props> = ({ basics, seo, storeName = 'Store', storefrontUrl = '', isHomepage, onChange }) => {
  const [picking, setPicking] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [schemaError, setSchemaError] = useState('');

  // The stored value is an object; the editor is text. Re-sync only when the
  // page itself changes, never on every keystroke (that would fight the typist).
  useEffect(() => {
    setSchemaText(seo.schema ? JSON.stringify(seo.schema, null, 2) : '');
    setSchemaError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basics.slug]);

  const setSeo = (patch: Partial<PageSeoValue>) => onChange({ basics, seo: { ...seo, ...patch } });
  const setBasics = (patch: Partial<PageBasics>) => onChange({ basics: { ...basics, ...patch }, seo });

  const path = isHomepage ? '/' : `/pages/${basics.slug || 'page-slug'}`;
  const displayTitle = (seo.title || '').trim() || `${basics.title || 'Untitled page'} | ${storeName}`;
  const displayDesc = (seo.description || '').trim()
    || `${basics.title || 'This page'}. Read more at ${storeName}.`;

  const titleLen = (seo.title || '').length;
  const descLen = (seo.description || '').length;

  const previewUrl = useMemo(
    () => `${(storefrontUrl || 'https://your-store.com').replace(/\/$/, '')}${path}`,
    [storefrontUrl, path],
  );

  const applySchema = (text: string) => {
    setSchemaText(text);
    if (!text.trim()) { setSchemaError(''); setSeo({ schema: undefined }); return; }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('must be an object or array');
      setSchemaError('');
      setSeo({ schema: parsed });
    } catch (e: any) {
      // Keep the text so the author can fix it; just don't store invalid JSON.
      setSchemaError(e?.message || 'Invalid JSON');
    }
  };

  return (
    <div className="bg-white h-full overflow-y-auto">
      {/* ── Page ─────────────────────────────────────────────────────────── */}
      <Section title="Page" icon={<Globe size={13} />} defaultOpen>
        <Field label="Page title" hint="Shown in the admin and used as the SEO title when you leave that blank.">
          <input className={inputCls} value={basics.title}
            onChange={(e) => setBasics({ title: e.target.value })} placeholder="About us" />
        </Field>
        {!isHomepage && (
          <Field label="URL slug" hint={`Live at ${previewUrl}`}>
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-slate-400 shrink-0">/pages/</span>
              <input className={inputCls} value={basics.slug}
                onChange={(e) => setBasics({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') })}
                placeholder="about-us" />
            </div>
          </Field>
        )}
        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input type="checkbox" checked={basics.isActive}
            onChange={(e) => setBasics({ isActive: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-[12.5px] text-slate-700">Published (visible on the storefront)</span>
        </label>
        {!basics.isActive && (
          <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Unpublished — visitors get a 404 until you tick this.
          </p>
        )}
      </Section>

      {/* ── Search engines ───────────────────────────────────────────────── */}
      <Section title="Search engine listing" icon={<Search size={13} />} defaultOpen>
        {/* Exactly what lib/seo.ts buildPageMetadata will emit — same rules. */}
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Google preview</p>
          <p className="text-[12px] text-emerald-800 truncate">{previewUrl}</p>
          <p className="text-[15px] text-blue-800 leading-snug line-clamp-2 hover:underline cursor-default">
            {displayTitle.length > 65 ? `${displayTitle.slice(0, 65)}…` : displayTitle}
          </p>
          <p className="text-[12px] text-slate-600 leading-snug line-clamp-2 mt-0.5">
            {displayDesc.length > 165 ? `${displayDesc.slice(0, 165)}…` : displayDesc}
          </p>
          {(seo.noIndex) && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
              <AlertTriangle size={11} /> Hidden from search results (noindex)
            </p>
          )}
        </div>

        <Field label="Meta title"
          right={<span className={`text-[10.5px] tabular-nums ${counterTone(titleLen, TITLE_IDEAL)}`}>{titleLen}/{TITLE_IDEAL}</span>}
          hint={seo.title ? 'Used exactly as typed — the store name is not appended.' : `Blank = "${basics.title || 'Page title'} | ${storeName}"`}>
          <input className={inputCls} value={seo.title || ''}
            onChange={(e) => setSeo({ title: e.target.value })}
            placeholder={`${basics.title || 'Page title'} | ${storeName}`} />
        </Field>

        <Field label="Meta description"
          right={<span className={`text-[10.5px] tabular-nums ${counterTone(descLen, DESC_IDEAL)}`}>{descLen}/{DESC_IDEAL}</span>}
          hint="The sentence under the title in search results.">
          <textarea className={`${inputCls} resize-y`} rows={3} value={seo.description || ''}
            onChange={(e) => setSeo({ description: e.target.value })}
            placeholder="What this page is about, in one or two sentences." />
        </Field>

        <Field label="Focus keywords" hint="Comma separated. Used as the keywords meta tag.">
          <input className={inputCls} value={seo.keywords || ''}
            onChange={(e) => setSeo({ keywords: e.target.value })}
            placeholder="homeopathy, shipping policy" />
        </Field>

        <Field label="Canonical URL" hint="Leave blank unless this page duplicates another URL.">
          <input className={inputCls} value={seo.canonical || ''}
            onChange={(e) => setSeo({ canonical: e.target.value })} placeholder={path} />
        </Field>

        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!seo.noIndex}
              onChange={(e) => setSeo({ noIndex: e.target.checked })}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span className="text-[12.5px] text-slate-700 flex items-center gap-1.5">
              {seo.noIndex ? <EyeOff size={12} className="text-red-600" /> : <Eye size={12} className="text-slate-400" />}
              Hide from search engines (noindex)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!seo.noFollow}
              onChange={(e) => setSeo({ noFollow: e.target.checked })}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span className="text-[12.5px] text-slate-700">Don&apos;t follow links on this page (nofollow)</span>
          </label>
        </div>
      </Section>

      {/* ── Social ───────────────────────────────────────────────────────── */}
      <Section title="Social sharing" icon={<ImageIcon size={13} />}>
        <Field label="Share image"
          hint="Shown when the page is shared on WhatsApp, Facebook or X. 1200×630 works everywhere.">
          {seo.ogImage ? (
            <div className="relative rounded-md overflow-hidden border border-slate-200 bg-slate-50">
              <img src={seo.ogImage} alt="" className="w-full aspect-[1200/630] object-cover" />
              <button type="button" onClick={() => setSeo({ ogImage: '' })}
                className="absolute top-1.5 right-1.5 bg-white/95 border border-slate-300 rounded p-1 text-slate-600 hover:text-red-600 shadow-sm">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setPicking(true)}
              className="w-full flex flex-col items-center justify-center gap-1.5 py-6 border-2 border-dashed border-slate-300 rounded-md text-slate-500 hover:border-blue-400 hover:text-blue-600">
              <ImageIcon size={20} />
              <span className="text-[12px] font-medium">Upload or choose an image</span>
            </button>
          )}
          {seo.ogImage && (
            <button type="button" onClick={() => setPicking(true)}
              className="mt-1.5 text-[11.5px] font-semibold text-blue-600 hover:underline">Replace image</button>
          )}
        </Field>

        <Field label="Share title" hint="Blank = the meta title above.">
          <input className={inputCls} value={seo.ogTitle || ''}
            onChange={(e) => setSeo({ ogTitle: e.target.value })} placeholder={displayTitle} />
        </Field>
        <Field label="Share description" hint="Blank = the meta description above.">
          <textarea className={`${inputCls} resize-y`} rows={2} value={seo.ogDescription || ''}
            onChange={(e) => setSeo({ ogDescription: e.target.value })} placeholder={displayDesc} />
        </Field>
      </Section>

      {/* ── Structured data ──────────────────────────────────────────────── */}
      <Section title="Structured data (JSON-LD)" icon={<Code2 size={13} />}>
        <Field label="Schema"
          hint="Optional schema.org markup for rich results — e.g. FAQPage, LocalBusiness, BreadcrumbList. Paste one object or an array.">
          <textarea
            className={`${inputCls} font-mono text-[11.5px] resize-y ${schemaError ? 'border-red-400 focus:ring-red-500/30' : ''}`}
            rows={8} value={schemaText} onChange={(e) => applySchema(e.target.value)}
            placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": []\n}'} />
        </Field>
        {schemaError ? (
          <p className="flex items-start gap-1.5 text-[11px] text-red-600">
            <AlertTriangle size={12} className="mt-px shrink-0" /> {schemaError} — not saved until the JSON is valid.
          </p>
        ) : schemaText.trim() ? (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-600">
            <Check size={12} /> Valid JSON — will render on the page.
          </p>
        ) : null}
      </Section>

      {picking && (
        <MediaPicker open folder="pages" onClose={() => setPicking(false)}
          onSelect={(url) => { setSeo({ ogImage: url }); setPicking(false); }} />
      )}
    </div>
  );
};

export default PageSeoPanel;
