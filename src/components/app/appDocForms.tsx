import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Btn, Field, SectionCard, SelectInput, TextInput } from '@/components/erp';
import ImageField from '@/components/common/ImageField';
import { Notice, OnOff } from '@/pages/panels/erp/shared';
import { pagesAPI } from '@/services/api';
import { fromStoreDateTimeInput, storeDateTimeInput } from '@/utils/date';
import { codeLabel, localeName, type AppDoc } from '@/lib/v2/appSettings';

/**
 * The sections of the store app's settings document (AD08, HMAPP design 60), each editing its own
 * part of ONE document (`GET/PUT /api/v2/commerce/app/settings`, checked whole by the server; every
 * field optional, unknown fields refused). Fields are the document's own (`domain/app.rs`
 * `AppSettings`); the server's words are shown for anything it refuses.
 *
 * Lists are never typed here: switch names come from the app config the server answers, legal
 * pages from the store's own pages, languages from the document and the browser's names.
 */

export type Path = Array<string | number>;
export type SetFn = (path: Path, value: unknown) => void;
export interface SectionProps { doc: AppDoc; set: SetFn; disabled: boolean; config: Record<string, any> | null }

/** The value at a path, or undefined. */
export function getIn(doc: unknown, path: Path): any {
  let cur: any = doc;
  for (const k of path) { if (cur === null || cur === undefined) return undefined; cur = cur[k as any]; }
  return cur;
}

/** A copy of `doc` with the value at `path` replaced (undefined removes the key). */
export function setIn(doc: AppDoc, path: Path, value: unknown): AppDoc {
  if (path.length === 0) return (value ?? {}) as AppDoc;
  const [head, ...rest] = path;
  const base: any = Array.isArray(doc) ? doc.slice() : { ...(doc ?? {}) };
  const next = rest.length ? setIn(base[head as any] ?? (typeof rest[0] === 'number' ? [] : {}), rest, value) : value;
  if (next === undefined) {
    if (Array.isArray(base)) base.splice(Number(head), 1); else delete base[head as any];
  } else {
    base[head as any] = next;
  }
  return base;
}

/** The three platforms the document has a section for (its fields `ios`, `android`, `windows`). */
const PLATFORM_FIELDS = ['ios', 'android', 'windows'] as const;
const PLATFORM_WORDS: Record<(typeof PLATFORM_FIELDS)[number], string> = { ios: 'iPhone and iPad', android: 'Android', windows: 'Windows' };

const Txt: React.FC<{
  label: string; value: unknown; onChange: (v: string) => void; disabled?: boolean; hint?: string;
  placeholder?: string; type?: string; className?: string; maxLength?: number;
}> = ({ label, value, onChange, disabled, hint, placeholder, type, className, maxLength }) => (
  <Field label={label} className={className}>
    <TextInput type={type} value={value === undefined || value === null ? '' : String(value)} disabled={disabled}
      placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    {hint && <span className="text-xs text-gray-500">{hint}</span>}
  </Field>
);

/** One value per line (ids, fingerprints, link paths). */
const Lines: React.FC<{ label: string; value: unknown; onChange: (v: string[] | undefined) => void; disabled?: boolean; hint?: string }> = ({
  label, value, onChange, disabled, hint,
}) => {
  const [text, setText] = useState(Array.isArray(value) ? value.join('\n') : '');
  useEffect(() => { setText(Array.isArray(value) ? value.join('\n') : ''); }, [value]);
  return (
    <Field label={label}>
      <textarea rows={3} value={text} disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { const list = text.split('\n').map((s) => s.trim()).filter(Boolean); onChange(list.length ? list : undefined); }}
        className="w-full rounded-lg border border-gray-200 p-2 font-mono text-xs" />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </Field>
  );
};

/** Default, on or off: an optional switch whose absence means the default. */
const TriState: React.FC<{ label: string; value: unknown; onChange: (v: boolean | undefined) => void; disabled?: boolean; now?: boolean | null }> = ({
  label, value, onChange, disabled, now,
}) => (
  <Field label={label}>
    <SelectInput value={value === true ? 'on' : value === false ? 'off' : ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value === 'on' ? true : e.target.value === 'off' ? false : undefined)}>
      <option value="">Default</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </SelectInput>
    {now !== undefined && now !== null && <span className="text-xs text-gray-500">In this store now: {now ? 'on' : 'off'}</span>}
  </Field>
);

/* ── versions and links ────────────────────────────────────────────────── */

export const VersionsSection: React.FC<SectionProps> = ({ doc, set, disabled }) => (
  <div className="space-y-6">
    {PLATFORM_FIELDS.map((p) => (
      <SectionCard key={p} title={PLATFORM_WORDS[p]} description="An app older than the least version must update; older than the newest is asked to.">
        <div className="grid gap-4 md:grid-cols-3">
          <Txt label="Least version served" value={getIn(doc, [p, 'min_version'])} disabled={disabled} placeholder="1.0.0"
            onChange={(v) => set([p, 'min_version'], v || undefined)} hint="Digits and dots, such as 1.4.2." />
          <Txt label="Newest version" value={getIn(doc, [p, 'latest_version'])} disabled={disabled} placeholder="1.2.0"
            onChange={(v) => set([p, 'latest_version'], v || undefined)} />
          <Txt label="Store page of the app" value={getIn(doc, [p, 'store_url'])} disabled={disabled} placeholder="https://"
            onChange={(v) => set([p, 'store_url'], v || undefined)} />
          {p === 'ios' && (
            <div className="md:col-span-3">
              <Lines label="App ids for links (Team ID and bundle, one a line)" value={getIn(doc, ['ios', 'app_ids'])} disabled={disabled}
                onChange={(v) => set(['ios', 'app_ids'], v)} hint="Such as ABCDE12345.in.homeomed.app" />
            </div>
          )}
          {p === 'android' && (
            <>
              <Txt label="Package name" value={getIn(doc, ['android', 'package'])} disabled={disabled} placeholder="in.homeomed.app"
                onChange={(v) => set(['android', 'package'], v || undefined)} />
              <div className="md:col-span-2">
                <Lines label="Signing certificate SHA-256 prints (one a line)" value={getIn(doc, ['android', 'sha256_cert_fingerprints'])} disabled={disabled}
                  onChange={(v) => set(['android', 'sha256_cert_fingerprints'], v)} hint="Pairs of hex digits joined by colons, 32 pairs." />
              </div>
            </>
          )}
        </div>
      </SectionCard>
    ))}
    <SectionCard title="Links that open the app" description="Paths on the store's own site the apps open, such as /products/*. Start a line with NOT to leave a path out.">
      <Lines label="Paths (one a line)" value={doc.link_paths} disabled={disabled} onChange={(v) => set(['link_paths'], v)} />
    </SectionCard>
  </div>
);

/* ── switches ──────────────────────────────────────────────────────────── */

export const SwitchesSection: React.FC<SectionProps> = ({ doc, set, disabled, config }) => {
  const saved: Record<string, boolean> = doc.switches ?? {};
  const live: Record<string, boolean> = (config?.switches && typeof config.switches === 'object') ? config.switches : {};
  const names = [...new Set([...Object.keys(live), ...Object.keys(saved)])].sort();
  return (
    <SectionCard title="Switches" description="What the app offers in every store of the organisation. Some only work in an India store, and partners are India only: the server turns those off elsewhere whatever is saved here.">
      {names.length === 0 ? (
        <Notice tone="warn">The server named no switch. Check that the app routes are on.</Notice>
      ) : (
        <ul className="divide-y divide-gray-100">
          {names.map((n) => (
            <li key={n} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-gray-900">{codeLabel(n)}</div>
                <div className="font-mono text-xs text-gray-500">{n}{n in live ? `, in this store now: ${live[n] ? 'on' : 'off'}` : ''}</div>
              </div>
              <OnOff on={saved[n] === true} label={codeLabel(n)} disabled={disabled} onToggle={() => set(['switches', n], !(saved[n] === true))} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
};

/* ── banners ───────────────────────────────────────────────────────────── */

export const BannersSection: React.FC<SectionProps> = ({ doc, set, disabled }) => {
  const banners: any[] = Array.isArray(doc.banners) ? doc.banners : [];
  const put = (list: any[]) => set(['banners'], list.length ? list : undefined);
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= banners.length) return;
    const next = banners.slice();
    [next[i], next[to]] = [next[to], next[i]];
    put(next);
  };
  return (
    <SectionCard
      title="App banners"
      description="Shown only in the app, in this order. Each may be limited to some languages, platforms and a time window."
      action={<Btn size="sm" variant="outline" disabled={disabled || banners.length >= 20} onClick={() => put([...banners, { id: `banner_${banners.length + 1}`, title: '' }])}><Plus className="h-4 w-4" />Add banner</Btn>}
    >
      {banners.length === 0 ? <p className="text-sm text-gray-500">No banner yet.</p> : (
        <div className="space-y-4">
          {banners.map((b, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{b.title || `Banner ${i + 1}`}</span>
                <span className="flex gap-1">
                  <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={disabled || i === banners.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" disabled={disabled} onClick={() => put(banners.filter((_, j) => j !== i))} aria-label="Remove banner" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Txt label="Id (a-z, 0-9, _ and -)" value={b.id} disabled={disabled} maxLength={64} onChange={(v) => set(['banners', i, 'id'], v)} />
                <Txt label="Headline" value={b.title} disabled={disabled} maxLength={120} onChange={(v) => set(['banners', i, 'title'], v)} />
                <Txt label="Text under it" value={b.body} disabled={disabled} onChange={(v) => set(['banners', i, 'body'], v || undefined)} className="md:col-span-2" />
                <Txt label="Opens (an app path such as /products/arnica, or https://)" value={b.link} disabled={disabled} onChange={(v) => set(['banners', i, 'link'], v || undefined)} className="md:col-span-2" />
                <div className="md:col-span-2">
                  <ImageField label="Picture" value={b.image_url ?? ''} folder="app" disabled={disabled} onChange={(url) => set(['banners', i, 'image_url'], url || undefined)} />
                </div>
                <Txt label="Languages (tags, comma separated; empty is every language)" value={(b.locales ?? []).join(', ')} disabled={disabled}
                  onChange={(v) => { const l = v.split(',').map((s) => s.trim()).filter(Boolean); set(['banners', i, 'locales'], l.length ? l : undefined); }} />
                <Field label="Platforms (none ticked is every platform)">
                  <span className="flex flex-wrap gap-3">
                    {PLATFORM_FIELDS.map((p) => {
                      const list: string[] = b.platforms ?? [];
                      return (
                        <label key={p} className="inline-flex items-center gap-1.5 text-sm">
                          <input type="checkbox" disabled={disabled} checked={list.includes(p)} onChange={(e) => {
                            const next = e.target.checked ? [...list, p] : list.filter((x) => x !== p);
                            set(['banners', i, 'platforms'], next.length ? next : undefined);
                          }} />{PLATFORM_WORDS[p]}
                        </label>
                      );
                    })}
                  </span>
                </Field>
                <Txt label="From (store time; empty is now)" type="datetime-local" value={storeDateTimeInput(b.starts_at)} disabled={disabled}
                  onChange={(v) => set(['banners', i, 'starts_at'], v ? fromStoreDateTimeInput(v) ?? undefined : undefined)} />
                <Txt label="Until (store time; empty is no end)" type="datetime-local" value={storeDateTimeInput(b.ends_at)} disabled={disabled}
                  onChange={(v) => set(['banners', i, 'ends_at'], v ? fromStoreDateTimeInput(v) ?? undefined : undefined)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

/* ── support, sign-in and push ─────────────────────────────────────────── */

export const SupportSection: React.FC<SectionProps> = ({ doc, set, disabled, config }) => {
  const s = config?.sign_in ?? null;
  return (
    <div className="space-y-6">
      <SectionCard title="Support contacts" description="Where a shopper reaches your people from the app's help screens. Phones in international form, such as +91 98xxx xxxxx.">
        <div className="grid gap-4 md:grid-cols-2">
          <Txt label="E-mail" type="email" value={getIn(doc, ['support', 'email'])} disabled={disabled} onChange={(v) => set(['support', 'email'], v || undefined)} />
          <Txt label="Phone" value={getIn(doc, ['support', 'phone'])} disabled={disabled} placeholder="+91" onChange={(v) => set(['support', 'phone'], v || undefined)} />
          <Txt label="WhatsApp" value={getIn(doc, ['support', 'whatsapp'])} disabled={disabled} placeholder="+91" onChange={(v) => set(['support', 'whatsapp'], v || undefined)} />
          <Txt label="Hours, in words" value={getIn(doc, ['support', 'hours'])} disabled={disabled} onChange={(v) => set(['support', 'hours'], v || undefined)} />
          <Txt label="Help page" value={getIn(doc, ['support', 'url'])} disabled={disabled} placeholder="https://" onChange={(v) => set(['support', 'url'], v || undefined)} className="md:col-span-2" />
        </div>
      </SectionCard>

      <SectionCard title="Sign in" description="The code sign-in (phone or e-mail, code length and life) is the store's own login setting; the app only adds these.">
        <div className="space-y-4">
          {s && (
            <p className="text-sm text-gray-600">
              In this store now: codes by {String(s.methods)}, {String(s.otp_length)} digits, good for {String(s.otp_expiry_seconds)} seconds; new accounts {s.allow_registration ? 'allowed' : 'not allowed'}.
            </p>
          )}
          <Txt label="Seconds before the app offers another code (10 to 600)" type="number" value={getIn(doc, ['sign_in', 'resend_after_seconds'])} disabled={disabled}
            onChange={(v) => set(['sign_in', 'resend_after_seconds'], v === '' ? undefined : Number(v))} className="max-w-xs" />
          <div className="grid gap-4 rounded-lg border border-gray-200 p-3 md:grid-cols-2">
            <div className="flex items-center justify-between md:col-span-2">
              <span className="text-sm font-medium">Sign in with Google</span>
              <OnOff on={getIn(doc, ['sign_in', 'google', 'enabled']) === true} label="Sign in with Google" disabled={disabled}
                onToggle={() => set(['sign_in', 'google', 'enabled'], !(getIn(doc, ['sign_in', 'google', 'enabled']) === true))} />
            </div>
            <Txt label="Web client id (required when on)" value={getIn(doc, ['sign_in', 'google', 'server_client_id'])} disabled={disabled}
              onChange={(v) => set(['sign_in', 'google', 'server_client_id'], v || undefined)} className="md:col-span-2" />
            <Txt label="iOS client id" value={getIn(doc, ['sign_in', 'google', 'ios_client_id'])} disabled={disabled}
              onChange={(v) => set(['sign_in', 'google', 'ios_client_id'], v || undefined)} />
            <Txt label="Android client id" value={getIn(doc, ['sign_in', 'google', 'android_client_id'])} disabled={disabled}
              onChange={(v) => set(['sign_in', 'google', 'android_client_id'], v || undefined)} />
          </div>
          <div className="grid gap-4 rounded-lg border border-gray-200 p-3 md:grid-cols-2">
            <div className="flex items-center justify-between md:col-span-2">
              <span className="text-sm font-medium">Sign in with Apple</span>
              <OnOff on={getIn(doc, ['sign_in', 'apple', 'enabled']) === true} label="Sign in with Apple" disabled={disabled}
                onToggle={() => set(['sign_in', 'apple', 'enabled'], !(getIn(doc, ['sign_in', 'apple', 'enabled']) === true))} />
            </div>
            <Txt label="Services id (Android and the web)" value={getIn(doc, ['sign_in', 'apple', 'services_id'])} disabled={disabled}
              onChange={(v) => set(['sign_in', 'apple', 'services_id'], v || undefined)} className="md:col-span-2" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Push identifiers" description="The public Firebase ids built into the app. The server's own push credentials stay on the server.">
        <div className="grid gap-4 md:grid-cols-2">
          <Txt label="Firebase project id" value={getIn(doc, ['push', 'project_id'])} disabled={disabled} onChange={(v) => set(['push', 'project_id'], v || undefined)} />
          <Txt label="Sender id (digits)" value={getIn(doc, ['push', 'sender_id'])} disabled={disabled} onChange={(v) => set(['push', 'sender_id'], v || undefined)} />
          <Txt label="Web API key" value={getIn(doc, ['push', 'api_key'])} disabled={disabled} onChange={(v) => set(['push', 'api_key'], v || undefined)} />
          <Txt label="iOS bundle id for APNs" value={getIn(doc, ['push', 'apns_bundle_id'])} disabled={disabled} onChange={(v) => set(['push', 'apns_bundle_id'], v || undefined)} />
          <Txt label="Android Firebase app id" value={getIn(doc, ['push', 'android_app_id'])} disabled={disabled} onChange={(v) => set(['push', 'android_app_id'], v || undefined)} />
          <Txt label="iOS Firebase app id" value={getIn(doc, ['push', 'ios_app_id'])} disabled={disabled} onChange={(v) => set(['push', 'ios_app_id'], v || undefined)} />
        </div>
        {config?.push?.apps && (
          <p className="mt-3 text-xs text-gray-500">
            Push app found for Android: {config.push.apps.android ? 'yes' : 'no'}; for iOS: {config.push.apps.ios ? 'yes' : 'no'}.
          </p>
        )}
      </SectionCard>
    </div>
  );
};

/* ── look, brand and prices ────────────────────────────────────────────── */

export const BrandSection: React.FC<SectionProps> = ({ doc, set, disabled, config }) => {
  const colors: Record<string, string> = config?.theme?.colors ?? {};
  const fonts: Record<string, string> = config?.theme?.fonts ?? {};
  const brand = config?.brand ?? {};
  const pd = config?.price_display ?? null;
  return (
    <div className="space-y-6">
      <SectionCard title="Theme" description="The app takes the website's colours, fonts and logo. Change them where the website's are." action={<Link to="/appearance/style" className="text-sm text-blue-700 underline">Edit the style</Link>}>
        {Object.keys(colors).length === 0 && Object.keys(fonts).length === 0 ? (
          <p className="text-sm text-gray-500">The server has not answered the theme yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {Object.entries(colors).map(([k, c]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="h-6 w-6 rounded border border-gray-200" style={{ background: c }} aria-hidden />
                  <span>{codeLabel(k.replace(/Color$/, ''))}<span className="ml-1 font-mono text-gray-500">{c}</span></span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600">{Object.entries(fonts).map(([k, f]) => `${codeLabel(k.replace(/FontFamily$/, ''))}: ${f}`).join('; ')}</p>
            <div className="flex flex-wrap items-center gap-4">
              {brand.logo_url && <img src={brand.logo_url} alt="Website logo" className="h-10 rounded border border-gray-200 bg-white p-1" />}
              {brand.logo_dark_url && <img src={brand.logo_dark_url} alt="Logo on dark" className="h-10 rounded bg-gray-900 p-1" />}
              {brand.app_icon_url && <img src={brand.app_icon_url} alt="App icon" className="h-10 w-10 rounded-xl border border-gray-200" />}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="App pictures" description="Pictures only the app uses, from the store's media library.">
        <div className="grid gap-4 md:grid-cols-2">
          <ImageField label="App icon" value={getIn(doc, ['brand', 'app_icon_url']) ?? ''} folder="app" disabled={disabled}
            onChange={(url) => set(['brand', 'app_icon_url'], url || undefined)} />
          <ImageField label="Logo on a dark background" value={getIn(doc, ['brand', 'logo_dark_url']) ?? ''} folder="app" disabled={disabled}
            onChange={(url) => set(['brand', 'logo_dark_url'], url || undefined)} />
        </div>
      </SectionCard>

      <SectionCard title="How a price shows" description="The MRP line is always on in an India store. The saving is never shown where the website's own saving line is off.">
        <div className="grid gap-4 md:grid-cols-4">
          <TriState label="MRP line" value={getIn(doc, ['price_display', 'mrp'])} now={pd?.mrp} disabled={disabled} onChange={(v) => set(['price_display', 'mrp'], v)} />
          <TriState label="MRP struck through" value={getIn(doc, ['price_display', 'strike'])} now={pd?.strike} disabled={disabled} onChange={(v) => set(['price_display', 'strike'], v)} />
          <TriState label="Percent off" value={getIn(doc, ['price_display', 'percent_off'])} now={pd?.percent_off} disabled={disabled} onChange={(v) => set(['price_display', 'percent_off'], v)} />
          <TriState label="You save" value={getIn(doc, ['price_display', 'you_save'])} now={pd?.you_save} disabled={disabled} onChange={(v) => set(['price_display', 'you_save'], v)} />
        </div>
      </SectionCard>
    </div>
  );
};

/* ── legal and privacy ─────────────────────────────────────────────────── */

/** The kinds of legal page the document names (`legal.pages` fields). */
const LEGAL_KINDS = ['privacy', 'terms', 'returns', 'shipping', 'grievance'] as const;

export const LegalSection: React.FC<SectionProps> = ({ doc, set, disabled, config }) => {
  const [pages, setPages] = useState<Array<{ slug: string; title: string; active: boolean }> | null>(null);
  useEffect(() => {
    let live = true;
    pagesAPI.getAll()
      .then((r: any) => {
        const list: any[] = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
        if (live) setPages(list.filter((p) => p?.slug).map((p) => ({ slug: String(p.slug), title: String(p.title ?? p.slug), active: p.is_active !== false && p.isVisible !== false })));
      })
      .catch(() => { if (live) setPages([]); });
    return () => { live = false; };
  }, []);

  const cfgLegal = config?.legal ?? null;
  const ranking: Record<string, string> = getIn(doc, ['legal', 'ranking']) ?? {};
  const locales = [...new Set([...Object.keys(ranking), ...(config?.locale ? [String(config.locale).split('-')[0]] : [])])];
  const officer = ['legal', 'grievance_officer'];
  const seller = cfgLegal?.seller ?? null;

  return (
    <div className="space-y-6">
      <SectionCard title="Legal pages" description="The pages the app links to. Unset: the store's own published policy page of that kind.">
        <div className="grid gap-4 md:grid-cols-2">
          {LEGAL_KINDS.map((k) => (
            <Field key={k} label={`${codeLabel(k)} page`}>
              <SelectInput value={getIn(doc, ['legal', 'pages', k]) ?? ''} disabled={disabled || pages === null}
                onChange={(e) => set(['legal', 'pages', k], e.target.value || undefined)}>
                <option value="">{k === 'grievance' ? 'None' : 'The store\'s policy page'}</option>
                {(pages ?? []).map((p) => <option key={p.slug} value={p.slug}>{p.title}{p.active ? '' : ' (draft)'}</option>)}
              </SelectInput>
              {cfgLegal?.pages && <span className="text-xs text-gray-500">The app opens now: {cfgLegal.pages[k] ?? 'nothing'}</span>}
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Notice and age" description="The privacy notice version is recorded with every consent the app takes.">
        <div className="grid gap-4 md:grid-cols-2">
          <Txt label="Privacy notice version" value={getIn(doc, ['legal', 'notice_version'])} disabled={disabled} maxLength={40}
            onChange={(v) => set(['legal', 'notice_version'], v || undefined)} hint="Letters, digits, dots, _ and -, such as 2026.11" />
          <Txt label="Least age to use the app alone (13 to 21)" type="number" value={getIn(doc, ['legal', 'minimum_age'])} disabled={disabled}
            onChange={(v) => set(['legal', 'minimum_age'], v === '' ? undefined : Number(v))} hint={`Default ${cfgLegal?.minimum_age ?? 18}.`} />
        </div>
      </SectionCard>

      <SectionCard title="How results are ordered" description="Shown to shoppers in their language. Unset, the app shows the server's own true description of the order.">
        <div className="space-y-3">
          {cfgLegal?.ranking_notice && !cfgLegal.ranking_notice_stored && <p className="text-xs text-gray-500">Now: {cfgLegal.ranking_notice}</p>}
          {locales.map((t) => (
            <Field key={t} label={`${localeName(t)} (${t})`}>
              <textarea rows={3} maxLength={2000} value={ranking[t] ?? ''} disabled={disabled}
                onChange={(e) => set(['legal', 'ranking', t], e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Grievance officer" description="The person a shopper complains to. A name and an e-mail or phone are needed.">
        <div className="grid gap-4 md:grid-cols-2">
          <Txt label="Name" value={getIn(doc, [...officer, 'name'])} disabled={disabled} onChange={(v) => set([...officer, 'name'], v || undefined)} />
          <Txt label="Designation" value={getIn(doc, [...officer, 'designation'])} disabled={disabled} onChange={(v) => set([...officer, 'designation'], v || undefined)} />
          <Txt label="E-mail" type="email" value={getIn(doc, [...officer, 'email'])} disabled={disabled} onChange={(v) => set([...officer, 'email'], v || undefined)} />
          <Txt label="Phone" value={getIn(doc, [...officer, 'phone'])} disabled={disabled} placeholder="+91" onChange={(v) => set([...officer, 'phone'], v || undefined)} />
          <Txt label="Address for letters" value={getIn(doc, [...officer, 'address'])} disabled={disabled} onChange={(v) => set([...officer, 'address'], v || undefined)} className="md:col-span-2" />
          <Txt label="Hours, in words" value={getIn(doc, [...officer, 'hours'])} disabled={disabled} onChange={(v) => set([...officer, 'hours'], v || undefined)} />
          <Txt label="Answers within (days, 1 to 30)" type="number" value={getIn(doc, [...officer, 'answer_days'])} disabled={disabled}
            onChange={(v) => set([...officer, 'answer_days'], v === '' ? undefined : Number(v))} />
        </div>
      </SectionCard>

      <SectionCard title="Seller" description="Who sells, as the store's invoice settings say. The app shows these; change them in Invoice settings." action={<Link to="/settings/invoice" className="text-sm text-blue-700 underline">Invoice settings</Link>}>
        {seller ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {['legal_name', 'trade_name', 'gstin', 'cin', 'city', 'state', 'phone', 'email'].filter((k) => seller[k]).map((k) => (
              <div key={k}><dt className="inline text-gray-500">{codeLabel(k)}: </dt><dd className="inline">{String(seller[k])}</dd></div>
            ))}
            {Array.isArray(seller.licences) && seller.licences.length > 0 && (
              <div className="sm:col-span-2"><dt className="inline text-gray-500">Licences: </dt><dd className="inline">{seller.licences.map((l: any) => `${l.label ?? codeLabel(l.kind)} ${l.number}`).join('; ')}</dd></div>
            )}
          </dl>
        ) : <p className="text-sm text-gray-500">No seller facts reached the app yet.</p>}
      </SectionCard>

      <SectionCard title="Privacy" description="What the app may do with a shopper's data. Ad events and promotional messages never run outside a full market, whatever is saved.">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="App analytics">
            <SelectInput value={getIn(doc, ['privacy', 'analytics']) ?? ''} disabled={disabled}
              onChange={(e) => set(['privacy', 'analytics'], e.target.value || undefined)}>
              <option value="">Default (only after the shopper agrees)</option>
              <option value="opt_in">Only after the shopper agrees</option>
              <option value="notice">With notice</option>
            </SelectInput>
            {config?.privacy && <span className="text-xs text-gray-500">Now: {config.privacy.analytics === 'notice' ? 'with notice' : 'only after the shopper agrees'}</span>}
          </Field>
          <TriState label="App events to ad platforms" value={getIn(doc, ['privacy', 'ad_events'])} now={config?.privacy?.ad_events} disabled={disabled}
            onChange={(v) => set(['privacy', 'ad_events'], v)} />
          <TriState label="Promotional messages" value={getIn(doc, ['privacy', 'promotional_messages'])} now={config?.privacy?.promotional_messages} disabled={disabled}
            onChange={(v) => set(['privacy', 'promotional_messages'], v)} />
        </div>
      </SectionCard>
    </div>
  );
};
