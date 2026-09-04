import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Plus, Trash2, RefreshCw, Copy, Check, BarChart3, CircleCheck, CircleDashed, Star } from 'lucide-react';
import api, { seoAPI } from '../services/api';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Redirect { from: string; to: string; }

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
 *  parsing — `load()` fetches the raw admin-settings object once (as part of a
 *  combined `Promise.all` with the other SEO sources) and feeds it to both this
 *  and `parseGoogleReviews` directly, so the hook instances below run with
 *  `skipInitialFetch` rather than each independently re-fetching the same
 *  `/settings/admin` endpoint. */
const parseTrackingIds = (settingsRes: any): TrackingIds => {
  const t = (settingsRes?.tracking ?? {}) as Partial<TrackingIds>;
  return {
    ga4Id: t.ga4Id || settingsRes?.ga4?.measurementId || '',
    gtmId: t.gtmId || '',
    metaPixelId: t.metaPixelId || settingsRes?.metaPixel?.pixelId || '',
    clarityId: t.clarityId || '',
    hotjarId: t.hotjarId || '',
    googleAdsConversionId: t.googleAdsConversionId || '',
    googleAdsConversionLabel: t.googleAdsConversionLabel || '',
  };
};

interface GoogleReviewsForm { enabled: boolean; title: string; subtitle: string; embedCode: string; }

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

const TRACKING_FIELDS: Array<{
  key: keyof TrackingIds; label: string; placeholder: string; help: React.ReactNode;
}> = [
  {
    key: 'ga4Id', label: 'Google Analytics 4 — Measurement ID', placeholder: 'G-XXXXXXXXXX',
    help: <>Analytics ▸ Admin ▸ Data Streams ▸ your web stream. Starts with <code>G-</code>.</>,
  },
  {
    key: 'gtmId', label: 'Google Tag Manager — Container ID', placeholder: 'GTM-XXXXXXX',
    help: <>Optional. Use GTM if you manage tags there instead of hardcoding GA4/Pixel.</>,
  },
  {
    key: 'metaPixelId', label: 'Meta (Facebook) Pixel ID', placeholder: '123456789012345',
    help: <>Events Manager ▸ Data Sources ▸ your pixel. The server-side Conversion API token is set separately in API &amp; Integrations.</>,
  },
  {
    key: 'clarityId', label: 'Microsoft Clarity — Project ID', placeholder: 'abcdef1234',
    help: <>Free heatmaps + session recordings. clarity.microsoft.com ▸ Settings ▸ Overview.</>,
  },
  {
    key: 'hotjarId', label: 'Hotjar — Site ID', placeholder: '3123456',
    help: <>Optional second heatmap tool. Numeric Site ID from your Hotjar dashboard.</>,
  },
  {
    key: 'googleAdsConversionId', label: 'Google Ads — Conversion ID', placeholder: 'AW-XXXXXXXXX',
    help: <>Google Ads ▸ Tools ▸ Conversions ▸ your conversion action ▸ Tag setup. Separate from
      the Ads campaign manager under Marketing — this is only the on-site conversion tag.</>,
  },
  {
    key: 'googleAdsConversionLabel', label: 'Google Ads — Conversion Label', placeholder: 'AbC-D3fGhiJ4kLm5nOp',
    help: <>Same Conversion ID screen, just below the ID. Required for the purchase conversion to
      report correctly.</>,
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

const Seo: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [robotsTxt, setRobotsTxt] = useState('');
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [addingRedirect, setAddingRedirect] = useState(false);

  const [sitemapPreview, setSitemapPreview] = useState('');
  const [robotsPreview, setRobotsPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tracking IDs and the Google Reviews widget are each a genuine single-object
  // load+save pair, so they go through the shared hook — but `load()` below
  // fetches the raw admin-settings object ONCE as part of one combined
  // `Promise.all` with the other SEO sources (robots/redirects), so both hooks
  // use `skipInitialFetch` and get fed via their `setFormData` from `load()`
  // directly instead of independently re-fetching `/settings/admin`.
  const {
    formData: tracking, setFormData: setTracking, saving: savingTracking, handleSubmit: handleSaveTracking,
  } = useSettingsSection<TrackingIds>({
    defaults: EMPTY_TRACKING,
    skipInitialFetch: true,
    parse: parseTrackingIds,
    submitter: async (data) => {
      const value: TrackingIds = {
        ga4Id: data.ga4Id.trim(),
        gtmId: data.gtmId.trim(),
        metaPixelId: data.metaPixelId.trim(),
        clarityId: data.clarityId.trim(),
        hotjarId: data.hotjarId.trim(),
        googleAdsConversionId: data.googleAdsConversionId.trim(),
        googleAdsConversionLabel: data.googleAdsConversionLabel.trim(),
      };
      // Stored PUBLIC so the storefront's GET /settings returns it (non-secret IDs).
      await api.put('/settings/tracking', { value, is_public: true, group_name: 'analytics' });
      setTracking(value);
    },
    onSuccess: () => {
      setSuccess('Tracking & analytics IDs saved. The storefront picks them up within a minute.');
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Failed to save tracking IDs'),
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
      // Stored PUBLIC so the storefront's GET /settings returns it. The embed may
      // contain a <script>; it runs only inside the homepage Google Reviews section.
      await api.put('/settings/googleReviews', { value, is_public: true, group_name: 'analytics' });
      setGoogleReviews(value);
    },
    onSuccess: () => {
      setSuccess('Google Reviews widget saved. It appears on the homepage within a minute.');
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Failed to save Google Reviews'),
  });

  const load = async () => {
    setLoading(true);
    try {
      const [s, r, settingsRes] = await Promise.all([
        seoAPI.get(),
        seoAPI.getRedirects(),
        // Admin settings carry the stored `tracking` object (axios unwraps {success,data}).
        api.get('/settings/admin').then((res) => res.data).catch(() => ({})),
      ]);
      setSettings(s || {});
      setRobotsTxt(s?.robotsTxt || '');
      setRedirects(Array.isArray(r) ? r : []);
      setTracking(parseTrackingIds(settingsRes));
      setGoogleReviews(parseGoogleReviews(settingsRes));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load SEO settings');
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
      setSitemapPreview('Failed to load — try refreshing.');
      setRobotsPreview('Failed to load — try refreshing.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => { load(); loadPreviews(); }, []);

  const handleSaveRobots = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = { ...settings, robotsTxt };
      await seoAPI.update(next);
      setSettings(next);
      setSuccess('robots.txt override saved.');
      setTimeout(() => setSuccess(null), 3000);
      loadPreviews();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRedirect = async () => {
    const from = newFrom.trim();
    const to = newTo.trim();
    if (!from || !to) { setError('Both "From" and "To" are required.'); return; }
    setAddingRedirect(true);
    setError(null);
    try {
      await seoAPI.createRedirect({ from, to });
      setRedirects(prev => [...prev, { from, to }]);
      setNewFrom(''); setNewTo('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add redirect');
    } finally {
      setAddingRedirect(false);
    }
  };

  const handleDeleteRedirect = async (from: string) => {
    if (!confirm(`Remove the redirect from "${from}"?`)) return;
    try {
      await seoAPI.deleteRedirect(from);
      setRedirects(prev => prev.filter(r => r.from !== from));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove redirect');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">SEO &amp; Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tracking IDs (GA4, GTM, Meta Pixel, Clarity, Hotjar), URL redirects, and the
          sitemap/robots.txt served to search engines.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      {/* Tracking & Analytics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Tracking &amp; Analytics
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">
            Paste each ID to enable the tag on your storefront. Tags load only after a visitor
            grants analytics/marketing consent (DPDP&nbsp;Act / GDPR). Leave a field blank to
            disable that tag. Every storefront action (page view, product view, add-to-cart,
            checkout, purchase, search, login) is also recorded in your in-house Analytics.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {TRACKING_FIELDS.map((f) => {
            const val = tracking[f.key];
            const on = !!val.trim();
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{f.label}</Label>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${on ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {on ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {on ? 'Active' : 'Not set'}
                  </span>
                </div>
                <Input
                  value={val}
                  onChange={(e) => setTrackingField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="h-9 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">{f.help}</p>
              </div>
            );
          })}
          <div className="pt-1">
            <Button onClick={() => { setError(null); handleSaveTracking(); }} disabled={savingTracking}>
              {savingTracking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save tracking IDs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Google Reviews widget */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" /> Google Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-muted-foreground leading-snug">
            Show your Google (Business Profile) reviews on the homepage. Create a free reviews widget
            connected to your Google Business Profile (e.g. Elfsight, Trustindex, or Google&apos;s own
            widget), then paste its embed snippet below. The homepage&apos;s Google Reviews section renders it live.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={googleReviews.enabled}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <span className="text-xs">Show the Google Reviews section on the homepage</span>
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Section heading</Label>
            <Input
              value={googleReviews.title}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, title: e.target.value }))}
              placeholder="Loved by customers on Google"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sub-heading (optional)</Label>
            <Input
              value={googleReviews.subtitle}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, subtitle: e.target.value }))}
              placeholder="Real reviews from our Google Business profile"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Widget embed code</Label>
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${googleReviews.embedCode.trim() ? 'text-green-600' : 'text-muted-foreground'}`}>
                {googleReviews.embedCode.trim() ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                {googleReviews.embedCode.trim() ? 'Configured' : 'Not set'}
              </span>
            </div>
            <Textarea
              value={googleReviews.embedCode}
              onChange={(e) => setGoogleReviews((p) => ({ ...p, embedCode: e.target.value }))}
              placeholder={'<script src="https://static.elfsight.com/platform/platform.js" async></script>\n<div class="elfsight-app-XXXXXXXX"></div>'}
              className="font-mono text-xs min-h-[120px]"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Paste the full snippet (it may include a &lt;script&gt; tag). It runs on the storefront homepage only.
            </p>
          </div>
          <div className="pt-1">
            <Button onClick={() => { setError(null); handleSaveGoogleReviews(); }} disabled={savingReviews}>
              {savingReviews ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Google Reviews
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Redirects */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Redirects</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">From (old path)</Label>
              <Input value={newFrom} onChange={e => setNewFrom(e.target.value)} placeholder="/old-page" className="h-9" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">To (new path or URL)</Label>
              <Input value={newTo} onChange={e => setNewTo(e.target.value)} placeholder="/new-page" className="h-9" />
            </div>
            <Button onClick={handleAddRedirect} disabled={addingRedirect} className="h-9">
              {addingRedirect ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {redirects.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-16 text-center text-muted-foreground">No redirects configured.</TableCell></TableRow>
              ) : redirects.map((r, i) => (
                <TableRow key={`${r.from}-${i}`}>
                  <TableCell className="font-mono text-sm">{r.from}</TableCell>
                  <TableCell className="font-mono text-sm">{r.to}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeleteRedirect(r.from)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* robots.txt override */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">robots.txt override</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Leave empty to serve the default (allow everything + a link to the sitemap). Fill this in to replace it entirely.
          </p>
          <Textarea
            value={robotsTxt} onChange={e => setRobotsTxt(e.target.value)}
            placeholder={'User-agent: *\nAllow: /'}
            rows={5} className="font-mono text-sm"
          />
          <Button onClick={handleSaveRobots} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Live preview</CardTitle>
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
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">{robotsPreview || '—'}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">sitemap.xml</span>
              <CopyButton text={sitemapPreview} />
            </div>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{sitemapPreview || '—'}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Seo;
