import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BarChart3, Check, CircleCheck, CircleDashed, Copy, Loader2, RefreshCw, Save, Star, X,
} from 'lucide-react';
import api, { seoAPI } from '../services/api';
import RedirectsManager, { type RedirectsSummary } from '../components/seo/RedirectsManager';
import { metaApi, pixelIdOf } from '../lib/v2/areas/meta';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Non-secret client-side tracking IDs, stored as the public `tracking` setting.
 *  These appear in storefront page source anyway; server secrets (Meta CAPI
 *  token) stay in API & Integration settings, never here. */
interface TrackingIds {
  ga4Id: string;
  gtmId: string;
  metaPixelId: string;
  clarityId: string;
  hotjarId: string;
  googleAdsConversionId: string;
  googleAdsConversionLabel: string;
}

const EMPTY_TRACKING: TrackingIds = {
  ga4Id: '', gtmId: '', metaPixelId: '', clarityId: '', hotjarId: '',
  googleAdsConversionId: '', googleAdsConversionLabel: '',
};

/** Shared with `useSettingsSection`'s `parse` below AND `load()`'s own inline
 *  parsing: `load()` fetches the raw admin-settings object once and feeds every
 *  card from it, so the hook instances below run with `skipInitialFetch`. */
const parseTrackingIds = (settingsRes: any): TrackingIds => {
  const t = (settingsRes?.tracking ?? {}) as Partial<TrackingIds>;
  return {
    ga4Id: t.ga4Id || settingsRes?.ga4?.measurementId || '',
    gtmId: t.gtmId || '',
    // EVT-08: the one pixel id is `metaPixel.pixelId`; `tracking.metaPixelId` is read only as its fallback.
    metaPixelId: pixelIdOf(settingsRes).id,
    clarityId: t.clarityId || '',
    hotjarId: t.hotjarId || '',
    googleAdsConversionId: t.googleAdsConversionId || '',
    googleAdsConversionLabel: t.googleAdsConversionLabel || '',
  };
};

interface GoogleReviewsForm { enabled: boolean; title: string; subtitle: string; embedCode: string; }

interface GoogleCustomerReviewsForm { enabled: boolean; deliveryDays: number; deliveryCountry: string; merchantId: string; }

const DEFAULT_GOOGLE_REVIEWS: GoogleReviewsForm = {
  enabled: false, title: 'Loved by customers on Google', subtitle: '', embedCode: '',
};

const parseGoogleReviews = (settingsRes: any): GoogleReviewsForm => {
  const gr = (settingsRes?.googleReviews ?? {}) as Partial<GoogleReviewsForm>;
  return {
    enabled: gr.enabled ?? false,
    title: gr.title ?? 'Loved by customers on Google',
    subtitle: gr.subtitle ?? '',
    embedCode: gr.embedCode ?? '',
  };
};

const DEFAULT_GOOGLE_CUSTOMER_REVIEWS: GoogleCustomerReviewsForm = {
  enabled: false, deliveryDays: 7, deliveryCountry: 'IN', merchantId: '',
};

const parseGoogleCustomerReviews = (settingsRes: any): GoogleCustomerReviewsForm => {
  const gcr = (settingsRes?.googleCustomerReviews ?? {}) as Partial<GoogleCustomerReviewsForm>;
  return {
    enabled: gcr.enabled === true,
    deliveryDays: Math.min(30, Math.max(1, Number(gcr.deliveryDays) || 7)),
    deliveryCountry: String(gcr.deliveryCountry || 'IN').trim().toUpperCase(),
    merchantId: String(gcr.merchantId ?? '').trim(),
  };
};

/**
 * One store setting written through its registry definition (`PATCH /commerce/settings/registry/{key}`,
 * body `{ fieldPath: value }`): validated against the definition's own fields, its own write permission
 * (settings.manage) checked, merged into the stored value. The old `PUT /settings/{key}` is not served
 * on v2 (areas/settings.ts), which is why these saves used to fail.
 */
const saveSetting = (key: string, patch: Record<string, unknown>) =>
  api.put(`/settings/registry/${encodeURIComponent(key)}`, patch);

/**
 * The Merchant Center account picked on the store's Google connection (service `merchant_feed`), the
 * id Google Customer Reviews names. Empty when Google is not connected or no account is picked.
 */
async function connectedMerchantId(): Promise<string> {
  const res = await api.get('/connectors').catch(() => null);
  const list: any[] = Array.isArray(res?.data) ? res!.data : [];
  for (const c of list) {
    if (c?.provider !== 'google' || c?.status !== 'connected') continue;
    const svc = (Array.isArray(c?.services) ? c.services : [])
      .find((s: any) => s?.service === 'merchant_feed' && s?.is_enabled !== false);
    const id = String(svc?.external_resource_id ?? '').replace(/^accounts\//, '').trim();
    if (id) return id;
  }
  return '';
}

const TRACKING_FIELDS: Array<{
  key: keyof TrackingIds; label: string; placeholder: string; help: React.ReactNode;
}> = [
  {
    key: 'ga4Id', label: 'Google Analytics 4 measurement ID', placeholder: 'G-XXXXXXXXXX',
    help: <>In Analytics: Admin, Data streams, your web stream. Starts with <code>G-</code>.</>,
  },
  {
    key: 'gtmId', label: 'Google Tag Manager container ID', placeholder: 'GTM-XXXXXXX',
    help: <>Optional. Use it if you manage your tags in Tag Manager.</>,
  },
  {
    key: 'metaPixelId', label: 'Meta (Facebook) Pixel ID', placeholder: '123456789012345',
    help: <>Events Manager, Data sources, your pixel. The browser pixel and the server events use this one id; the server token is in API and Integrations.
      {' '}<Link to="/panel/marketing/meta/events" className="font-medium text-primary hover:underline">See Events health</Link></>,
  },
  {
    key: 'clarityId', label: 'Microsoft Clarity project ID', placeholder: 'abcdef1234',
    help: <>Free heatmaps and session recordings. In Clarity: Settings, Overview.</>,
  },
  {
    key: 'hotjarId', label: 'Hotjar site ID', placeholder: '3123456',
    help: <>Optional second heatmap tool. The numeric Site ID from your Hotjar dashboard.</>,
  },
  {
    key: 'googleAdsConversionId', label: 'Google Ads conversion ID', placeholder: 'AW-XXXXXXXXX',
    help: <>Google Ads: Tools, Conversions, your conversion action, Tag setup. This is only the on-site
      conversion tag; campaigns are under Marketing.</>,
  },
  {
    key: 'googleAdsConversionLabel', label: 'Google Ads conversion label', placeholder: 'AbC-D3fGhiJ4kLm5nOp',
    help: <>On the same screen, just below the ID. Needed for purchases to be counted.</>,
  },
];

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline" size="sm"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
};

/** One tile of the summary strip: a figure, its label, and whether it needs a look; it scrolls to its card. */
const GlanceTile: React.FC<{ target: string; label: string; value: string; warn?: boolean }> = ({ target, label, value, warn }) => (
  <button
    type="button"
    onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    className={`rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${warn ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-950/20' : ''}`}
  >
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className={`text-sm font-semibold ${warn ? 'text-amber-800 dark:text-amber-300' : 'text-foreground'}`}>{value}</div>
  </button>
);

const Seo: React.FC = () => {
  const navigate = useNavigate();
  // The panel must not offer a control the API will refuse: the tag and review settings are written
  // through the settings registry (settings.manage); robots and redirects need content.manage.
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const canSettings = hasPerm('settings.manage');
  const canContent = hasPerm('content.manage');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [robotsTxt, setRobotsTxt] = useState('');
  const [savedRobotsTxt, setSavedRobotsTxt] = useState('');

  const [sitemapPreview, setSitemapPreview] = useState('');
  const [robotsPreview, setRobotsPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [redirects, setRedirects] = useState<RedirectsSummary | null>(null);
  const [connectedMerchant, setConnectedMerchant] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); };
  const errText = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

  const {
    formData: tracking, setFormData: setTracking, saving: savingTracking, handleSubmit: handleSaveTracking,
  } = useSettingsSection<TrackingIds>({
    defaults: EMPTY_TRACKING,
    skipInitialFetch: true,
    parse: parseTrackingIds,
    submitter: async (data) => {
      // EVT-08 (META-16 section 6): the pixel id is saved once, on `metaPixel.pixelId`, which the browser
      // pixel and the server events both read. It goes FIRST, so the old `tracking.metaPixelId` copy can be
      // cleared afterwards without a moment where the storefront has no pixel id.
      const pixelId = data.metaPixelId.trim();
      await metaApi.saveEventSettings({ pixelId });
      const value = {
        ga4Id: data.ga4Id.trim(),
        gtmId: data.gtmId.trim(),
        // A registry write merges, so the old copy is emptied rather than left behind: a pixel cleared
        // here must not come back through the fallback.
        metaPixelId: '',
        clarityId: data.clarityId.trim(),
        hotjarId: data.hotjarId.trim(),
        googleAdsConversionId: data.googleAdsConversionId.trim(),
        googleAdsConversionLabel: data.googleAdsConversionLabel.trim(),
      };
      await saveSetting('tracking', value);
      setTracking({ ...value, metaPixelId: pixelId });
    },
    onSuccess: () => flash('Tracking IDs saved. The shop picks them up within a minute.'),
    onError: (err: any) => setError(errText(err, 'Tracking IDs were not saved')),
  });

  const {
    formData: googleReviews, setFormData: setGoogleReviews, saving: savingReviews, handleSubmit: handleSaveGoogleReviews,
  } = useSettingsSection<GoogleReviewsForm>({
    defaults: DEFAULT_GOOGLE_REVIEWS,
    skipInitialFetch: true,
    parse: parseGoogleReviews,
    submitter: async (data) => {
      const value = {
        enabled: data.enabled,
        title: data.title.trim(),
        subtitle: data.subtitle.trim(),
        embedCode: data.embedCode.trim(),
      };
      // A public setting: the storefront's settings answer carries it. The embed may contain a <script>;
      // it runs only inside the homepage Google Reviews section, and only when no synced reviews show.
      await saveSetting('googleReviews', value);
      setGoogleReviews(value);
    },
    onSuccess: () => flash('Google Reviews saved. The homepage shows the change within a minute.'),
    onError: (err: any) => setError(errText(err, 'Google Reviews was not saved')),
  });

  const {
    formData: googleCustomerReviews, setFormData: setGoogleCustomerReviews,
    saving: savingCustomerReviews, handleSubmit: handleSaveCustomerReviews,
  } = useSettingsSection<GoogleCustomerReviewsForm>({
    defaults: DEFAULT_GOOGLE_CUSTOMER_REVIEWS,
    skipInitialFetch: true,
    parse: parseGoogleCustomerReviews,
    submitter: async (data) => {
      const merchantId = (data.merchantId.trim() || connectedMerchant).replace(/^accounts\//, '');
      if (data.enabled && !merchantId) {
        throw new Error('Add the Merchant Center ID first, or pick a Merchant Center account on the Google connection.');
      }
      const value = {
        enabled: data.enabled,
        deliveryDays: Math.min(30, Math.max(1, Number(data.deliveryDays) || 7)),
        deliveryCountry: (data.deliveryCountry || 'IN').trim().toUpperCase(),
        // The storefront's opt-in names this account to Google; without it the survey never shows.
        merchantId,
      };
      await saveSetting('googleCustomerReviews', value);
      setGoogleCustomerReviews(value);
    },
    onSuccess: (data) => flash(data.enabled
      ? 'Google Customer Reviews is on. New order confirmations show Google\'s survey opt-in.'
      : 'Google Customer Reviews saved. The survey opt-in is off.'),
    onError: (err: any) => setError(errText(err, 'Google Customer Reviews was not saved')),
  });

  const load = async () => {
    setLoading(true);
    try {
      const [s, settingsRes] = await Promise.all([
        seoAPI.get(),
        // Admin settings carry the stored `tracking` object (axios unwraps {success,data}).
        api.get('/settings/admin').then((res) => res.data).catch(() => ({})),
      ]);
      setSettings(s || {});
      setRobotsTxt(s?.robotsTxt || '');
      setSavedRobotsTxt(s?.robotsTxt || '');
      setTracking(parseTrackingIds(settingsRes));
      setGoogleReviews(parseGoogleReviews(settingsRes));
      setGoogleCustomerReviews(parseGoogleCustomerReviews(settingsRes));
    } catch (err: any) {
      setError(errText(err, 'SEO settings could not be loaded'));
    } finally {
      setLoading(false);
    }
  };

  const setTrackingField = (key: keyof TrackingIds, val: string) =>
    setTracking((prev) => ({ ...prev, [key]: val }));

  const loadPreviews = async () => {
    setPreviewLoading(true);
    try {
      const [sitemap, robots] = await Promise.all([seoAPI.getSitemap(), seoAPI.getRobots()]);
      setSitemapPreview(sitemap);
      setRobotsPreview(robots);
    } catch {
      setSitemapPreview('Could not load. Try Refresh.');
      setRobotsPreview('Could not load. Try Refresh.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => { load(); loadPreviews(); }, []);

  // The Google connection lives in the connectors module (settings.read); asked only when both are on,
  // so a store without it never sees an access notice from this page.
  useEffect(() => {
    if (!modulesLoaded || !canAccess('connectors') || !hasPerm('settings.read')) return;
    let alive = true;
    connectedMerchantId().then((id) => { if (alive) setConnectedMerchant(id); });
    return () => { alive = false; };
  }, [modulesLoaded, canAccess, hasPerm]);

  const handleSaveRobots = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = { ...settings, robotsTxt: robotsTxt.trim() };
      await seoAPI.update(next);
      setSettings(next);
      setSavedRobotsTxt(next.robotsTxt);
      flash(next.robotsTxt ? 'robots.txt lines saved.' : 'robots.txt is back to the built-in rules.');
      loadPreviews();
    } catch (err: any) {
      setError(errText(err, 'robots.txt was not saved'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // What to act on first, then the numbers.
  const tagsOn = TRACKING_FIELDS.filter((f) => tracking[f.key].trim()).length;
  const merchantForSurvey = googleCustomerReviews.merchantId || connectedMerchant;
  const surveyBlocked = googleCustomerReviews.enabled && !merchantForSurvey;
  const robotsLines = savedRobotsTxt.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
  const actions: string[] = [];
  if (redirects && !redirects.enabled) actions.push('Redirects are switched off, so every old address shows a not-found page.');
  if (surveyBlocked) actions.push('Google Customer Reviews is on but has no Merchant Center ID, so the survey never shows.');
  if (tagsOn === 0) actions.push('No analytics or advertising tag is set, so visits and sales are not reported to Google or Meta.');
  const sitemapUrls = (sitemapPreview.match(/<loc>/g) ?? []).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">SEO &amp; Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tracking tags, review widgets, URL redirects, and the robots.txt and sitemap search engines read.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">{success}</div>
      )}

      {/* At a glance: what needs a look first, then the figures. */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          {actions.length > 0 ? (
            <ul className="space-y-1.5">
              {actions.map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck className="h-4 w-4 text-green-600" />Nothing here needs attention.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GlanceTile target="seo-tags" label="Tags on" value={`${tagsOn} of ${TRACKING_FIELDS.length}`} warn={tagsOn === 0} />
            <GlanceTile
              target="seo-redirects" label="Redirects"
              value={redirects ? `${redirects.enabled ? 'On' : 'Off'}, ${redirects.total.toLocaleString('en-IN')} rules` : 'Loading'}
              warn={!!redirects && !redirects.enabled}
            />
            <GlanceTile
              target="seo-survey" label="Review survey"
              value={googleCustomerReviews.enabled ? (surveyBlocked ? 'Needs ID' : 'On') : 'Off'}
              warn={surveyBlocked}
            />
            <GlanceTile target="seo-robots" label="robots.txt" value={robotsLines ? `${robotsLines} extra lines` : 'Built-in'} />
          </div>
        </CardContent>
      </Card>

      {!canSettings && (
        <p className="text-xs text-muted-foreground">
          You can see these settings. Saving tags and review settings needs the Settings manage permission.
        </p>
      )}

      {/* Tracking & Analytics */}
      <Card id="seo-tags" className="scroll-mt-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Tracking &amp; Analytics
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">
            Paste each ID to turn its tag on in your shop. Tags load only after a visitor allows
            analytics or marketing cookies (DPDP Act, GDPR). Leave a field blank to turn that tag off.
            Every shop action (page view, product view, add to cart, checkout, purchase, search, login)
            is also recorded in your own Analytics.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {TRACKING_FIELDS.map((f) => {
            const val = tracking[f.key];
            const on = !!val.trim();
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">{f.label}</Label>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${on ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {on ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {on ? 'Active' : 'Not set'}
                  </span>
                </div>
                <Input
                  value={val}
                  onChange={(e) => setTrackingField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  disabled={!canSettings}
                  className="h-9 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">{f.help}</p>
              </div>
            );
          })}
          {canSettings && (
            <div className="pt-1">
              <Button onClick={() => { setError(null); handleSaveTracking(); }} disabled={savingTracking}>
                {savingTracking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save tracking IDs
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Reviews widget */}
      <Card id="seo-reviews" className="scroll-mt-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" /> Google Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-muted-foreground leading-snug">
            The homepage shows your Google Business Profile reviews. Reviews synced under{' '}
            <Link to="/panel/marketing/google-reviews" className="font-medium text-primary hover:underline">Google Reviews</Link>{' '}
            show first. A pasted widget (Elfsight, Trustindex or Google&apos;s own) is used only when no synced reviews are there.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={googleReviews.enabled}
              disabled={!canSettings}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <span className="text-xs">Show the Google Reviews section on the homepage</span>
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Section heading</Label>
            <Input
              value={googleReviews.title}
              disabled={!canSettings}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, title: e.target.value }))}
              placeholder="Loved by customers on Google"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sub-heading (optional)</Label>
            <Input
              value={googleReviews.subtitle}
              disabled={!canSettings}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, subtitle: e.target.value }))}
              placeholder="Real reviews from our Google Business profile"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Widget embed code</Label>
              <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${googleReviews.embedCode.trim() ? 'text-green-600' : 'text-muted-foreground'}`}>
                {googleReviews.embedCode.trim() ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                {googleReviews.embedCode.trim() ? 'Set' : 'Not set'}
              </span>
            </div>
            <Textarea
              value={googleReviews.embedCode}
              disabled={!canSettings}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, embedCode: e.target.value }))}
              placeholder={'<script src="https://static.elfsight.com/platform/platform.js" async></script>\n<div class="elfsight-app-XXXXXXXX"></div>'}
              className="font-mono text-xs min-h-[120px]"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Paste the whole snippet (it may include a &lt;script&gt; tag). It runs on the shop&apos;s homepage only.
            </p>
          </div>
          {canSettings && (
            <div className="pt-1">
              <Button onClick={() => { setError(null); handleSaveGoogleReviews(); }} disabled={savingReviews}>
                {savingReviews ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Google Reviews
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Customer Reviews: the survey opt-in on the order confirmation page. */}
      <Card id="seo-survey" className="scroll-mt-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" /> Google Customer Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-muted-foreground leading-snug">
            Turn on Google Customer Reviews in your Merchant Center account first. Then switch it on here to show
            Google&apos;s survey opt-in after every order.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={googleCustomerReviews.enabled} disabled={!canSettings}
              onChange={(e) => setGoogleCustomerReviews((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4" />
            <span className="text-xs">Show the Google Customer Reviews opt-in after checkout</span>
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Merchant Center ID</Label>
            <Input value={googleCustomerReviews.merchantId} disabled={!canSettings}
              onChange={(e) => setGoogleCustomerReviews((p) => ({ ...p, merchantId: e.target.value.replace(/\s+/g, '') }))}
              placeholder={connectedMerchant || '123456789'} inputMode="numeric" className="h-9 font-mono text-sm" />
            <p className={`text-[11px] ${surveyBlocked ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
              {connectedMerchant
                ? <>Your Google connection uses account <span className="font-mono">{connectedMerchant}</span>. Leave this blank to use it.</>
                : <>The number at the top of Merchant Center. Or pick the account on the{' '}
                  <Link to="/panel/marketing/connections" className="font-medium text-primary hover:underline">Google connection</Link>.</>}
              {googleCustomerReviews.merchantId && connectedMerchant && googleCustomerReviews.merchantId !== connectedMerchant
                && ' The ID typed here is a different account.'}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Estimated delivery days</Label>
              <Input type="number" min="1" max="30" value={googleCustomerReviews.deliveryDays} disabled={!canSettings}
                onChange={(e) => setGoogleCustomerReviews((p) => ({ ...p, deliveryDays: Number(e.target.value) || 1 }))}
                className="h-9 text-sm" />
              <p className="text-[11px] text-muted-foreground">Use your real delivery promise; Google sends its survey after this date.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fallback delivery country</Label>
              <Input value={googleCustomerReviews.deliveryCountry} disabled={!canSettings}
                onChange={(e) => setGoogleCustomerReviews((p) => ({ ...p, deliveryCountry: e.target.value.toUpperCase() }))}
                maxLength={2} placeholder="IN" className="h-9 font-mono text-sm" />
              <p className="text-[11px] text-muted-foreground">Two-letter code. The shipping address country is used when there is one.</p>
            </div>
          </div>
          {canSettings && (
            <div className="pt-1">
              <Button onClick={() => { setError(null); handleSaveCustomerReviews(); }} disabled={savingCustomerReviews}>
                {savingCustomerReviews ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Customer Reviews
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* URL redirects: grouped rules, bulk CSV, edit history and hit log. */}
      <div id="seo-redirects" className="scroll-mt-20">
        <RedirectsManager canManage={canContent} onSummary={setRedirects} />
      </div>

      {/* robots.txt: the store's own lines, added to the built-in rules. */}
      <Card id="seo-robots" className="scroll-mt-20">
        <CardHeader className="pb-3"><CardTitle className="text-base">robots.txt extra lines</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The shop&apos;s robots.txt already lets search engines read the shop and lists its sitemap. Lines you add
            here are added to it, for example <span className="font-mono">Disallow: /internal/</span>. Leave it empty
            to keep only the built-in rules. A line that would hide the whole shop from every search engine is ignored.
          </p>
          <Textarea
            value={robotsTxt} onChange={e => setRobotsTxt(e.target.value)}
            placeholder={'Disallow: /internal/'}
            disabled={!canContent}
            rows={5} className="font-mono text-sm"
          />
          {canContent && (
            <Button onClick={handleSaveRobots} disabled={saving || robotsTxt.trim() === savedRobotsTxt.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Preview</CardTitle>
          <Button variant="outline" size="sm" onClick={loadPreviews} disabled={previewLoading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">robots.txt</span>
              <CopyButton text={robotsPreview} />
            </div>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all">{robotsPreview || 'Nothing to show yet.'}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">
                sitemap.xml{sitemapUrls > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({sitemapUrls.toLocaleString('en-IN')} addresses)</span>}
              </span>
              <CopyButton text={sitemapPreview} />
            </div>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">{sitemapPreview || 'Nothing to show yet.'}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Seo;
