import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { adsGoogleApi } from '@/lib/v2/areas/ads';
import { connectionsHref } from './meta/routes';
import { Figure, Lead, LoadFailure, Section, StateChip, linkCls, moneyMajor, num, plural, useLoad, writeError, type Tone } from './meta/common';
import { humanize } from './meta/ads/shared';
import { AdsGoogleSection, trackingLine } from './AdsGoogleSection';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDate } from '../../../utils/date';

/**
 * Ad accounts (Marketing > Ads > Ad accounts): the Google, Meta and Snapchat accounts, Google Ads conversion
 * tracking and live campaigns, and the store's own ad campaigns across platforms. It opens with what to act on.
 * Campaigns sent to a platform are always created paused there; nothing spends until a person resumes it.
 */

/**
 * The account's own fields per platform. The platform sign-in is filled by Connect, and Growcord uses one app per
 * provider, so a store never types app keys (the server drops them). A fallback: the server publishes no list.
 */
const ACCOUNT_FIELDS: Record<string, Array<{ key: string; label: string; secret?: boolean }>> = {
  google: [
    { key: 'customer_id', label: 'Ads customer ID' },
    { key: 'login_customer_id', label: 'Manager account ID (optional)' },
    { key: 'developer_token', label: 'Developer token', secret: true },
  ],
  meta: [
    { key: 'ad_account_id', label: 'Ad account ID' },
    { key: 'business_id', label: 'Business ID (optional)' },
    { key: 'catalog_id', label: 'Catalog ID (optional)' },
  ],
  snapchat: [{ key: 'ad_account_id', label: 'Ad account ID' }],
};

/** Used only when the platform list could not be read. */
const FALLBACK_PLATFORMS = ['google', 'meta', 'snapchat'];

const PLATFORM_NAME: Record<string, string> = { google: 'Google', meta: 'Meta', snapchat: 'Snapchat' };
const platformName = (p: string) => PLATFORM_NAME[p] ?? humanize(p);

const CAMPAIGN_TONE: Record<string, Tone> = { active: 'good', error: 'bad', paused: 'neutral', draft: 'info' };

/** The campaign types that use the store's product feed. */
const FEED_TYPES = ['shopping', 'catalog_sales', 'performance_max', 'collection_ads'];

const errText = (e: any) => writeError(e, 'Something went wrong.');

interface AccountForm { platform: string; account_id: string; account_name: string; fields: Record<string, string> }
const emptyAccount = (platform: string): AccountForm => ({ platform, account_id: '', account_name: '', fields: {} });

const AdsManager: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('ads.manage');
  const { toast } = useToast();

  const base = useLoad(async () => {
    const [p, a, c, au] = await Promise.all([
      api.get('/marketing-hub/ads/platforms'),
      api.get('/marketing-hub/ads/accounts'),
      api.get('/marketing-hub/ads/campaigns'),
      api.get('/marketing-hub/ads/audiences'),
    ]);
    const list = (r: any) => (Array.isArray(payload(r)) ? payload<any[]>(r) : []);
    return { platforms: list(p), accounts: list(a), campaigns: list(c), audiences: list(au) };
  }, []);
  const google = useLoad(() => adsGoogleApi.measurement(), []);

  const [settingUp, setSettingUp] = useState(false);
  const [busy, setBusy] = useState('');
  const [accForm, setAccForm] = useState<AccountForm | null>(null);
  const [cForm, setCForm] = useState<any | null>(null);

  const platforms: any[] = base.data?.platforms ?? [];
  const accounts: any[] = base.data?.accounts ?? [];
  const campaigns: any[] = base.data?.campaigns ?? [];
  const audiences: any[] = base.data?.audiences ?? [];
  const platformKeys = platforms.length ? platforms.map((p) => String(p.platform)) : FALLBACK_PLATFORMS;
  const metaOf = (platform: string) => platforms.find((p) => p.platform === platform);
  const typesOf = (platform: string): string[] => {
    const m = metaOf(platform);
    return m?.campaign_types ?? m?.campaignTypes ?? [];
  };
  const m = google.data;

  const practice = accounts.filter((a) => !a.configured);
  const failed = campaigns.filter((c) => c.status === 'error');
  const spend = campaigns.reduce((s, c) => s + (Number(c.stats?.spend) || 0), 0);

  const setUp = async () => {
    setSettingUp(true);
    try {
      const next = await adsGoogleApi.setUpMeasurement();
      google.setData(next);
      toast({ title: next.created ? `Conversion tracking set up: ${plural(next.created, 'action')} added on Google Ads` : 'Conversion tracking is set up', description: trackingLine(next) });
    } catch (e) {
      toast({ title: 'Conversion tracking was not set up', description: errText(e), variant: 'destructive' });
    } finally { setSettingUp(false); }
  };

  /** One write: busy key, a toast, then a reload of the lists. */
  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) toast({ title: done }); await base.reload(); }
    catch (e) { toast({ title: 'Not done', description: errText(e), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  const saveAccount = () => accForm && act('account', async () => {
    // Only filled fields are sent: the server merges them into what is stored, so a blank never wipes a saved value.
    const credentials = Object.fromEntries(Object.entries(accForm.fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const r = await api.post('/marketing-hub/ads/accounts', {
      platform: accForm.platform, account_id: accForm.account_id.trim(), account_name: accForm.account_name.trim() || undefined, credentials,
    });
    const ignored: string[] = payload<any>(r)?.ignored_app_keys ?? [];
    if (ignored.length) toast({ title: 'App keys were not saved', description: `Growcord uses one ${platformName(accForm.platform)} app for every store, so ${ignored.join(', ')} ${ignored.length === 1 ? 'was' : 'were'} left out.` });
    setAccForm(null);
  }, 'Account saved');

  const connect = (a: any) => act(`connect:${a.id}`, async () => {
    const redirect = `${window.location.origin}/panel/marketing/ads/oauth/callback`;
    const r = await api.get(`/marketing-hub/ads/oauth/${a.platform}/url`, { params: { account_id: a.id, redirect_uri: redirect } });
    window.open(payload<any>(r).url, '_blank', 'noopener');
    toast({ title: `Sign in to ${platformName(a.platform)} in the new tab`, description: 'The account is connected when you approve there.' });
  });

  const test = (a: any) => act(`test:${a.id}`, async () => {
    const r = payload<any>(await api.post(`/marketing-hub/ads/accounts/${a.id}/test`));
    toast({ title: `${platformName(a.platform)}: ${r?.ok ? 'connection works' : 'connection failed'}`, description: r?.message ?? r?.error ?? undefined, variant: r?.ok ? undefined : 'destructive' });
  });

  const saveCampaign = () => cForm && act('campaign', async () => {
    const { nameTouched, ...body } = cForm;
    await api.post('/marketing-hub/ads/campaigns', body);
    setCForm(null);
  }, 'Campaign saved as a draft');

  const autoName = (platform: string | undefined, type: string) => {
    const month = localeDate(new Date(), { month: 'short', year: 'numeric' }, 'en-IN');
    return platform ? `${platformName(platform)} ${humanize(type).toLowerCase()}, ${month}` : '';
  };

  const lead = useMemo(() => {
    if (!base.data || (google.loading && !m)) return null;
    if (!accounts.length && !m?.connected) {
      return {
        tone: 'info' as Tone, title: 'Connect an ad account to begin',
        body: <>Connect Google and pick its Ads customer in <Link className={linkCls} to={connectionsHref('google')}>Platform Connections</Link>, or add a Meta or Snapchat account below.</>,
        action: canManage ? <Button size="sm" onClick={() => setAccForm(emptyAccount(platformKeys[0] ?? 'google'))}>Add account</Button> : null,
      };
    }
    if (m?.connected && !m.managed) {
      return {
        tone: 'warn' as Tone, title: 'Google Ads is not counting your sales yet',
        body: <>Set up conversion tracking once. Growcord adds one conversion action per store event on your Google Ads account and its tag to your website. No campaign, budget or ad changes.</>,
        action: canManage ? <Button size="sm" onClick={setUp} disabled={settingUp}>{settingUp && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}Set up conversion tracking</Button> : null,
      };
    }
    if (failed.length) {
      return { tone: 'bad' as Tone, title: `${plural(failed.length, 'campaign')} could not be sent`, body: <>Open the campaign below to read the platform's reason, fix it, then send it again.</>, action: null };
    }
    if (practice.length) {
      return {
        tone: 'warn' as Tone, title: `${plural(practice.length, 'account')} in practice mode`,
        body: <>Nothing reaches {practice.map((a) => platformName(a.platform)).filter((v, i, all) => all.indexOf(v) === i).join(' or ')} until the account is connected. Press Connect on it.</>,
        action: null,
      };
    }
    if (m?.managed && m.missing_events.length) {
      return { tone: 'warn' as Tone, title: trackingLine(m), body: <>Press Check again on Google Ads to add the missing ones.</>, action: null };
    }
    return { tone: 'good' as Tone, title: 'Your ad accounts are connected', body: <>{plural(accounts.length, 'account')}, {plural(campaigns.length, 'campaign')}{m?.managed ? ', Google Ads conversion tracking on.' : '.'}</>, action: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.data, m, google.loading, settingUp, canManage]);

  const cPlatform = accounts.find((a) => a.id === cForm?.ad_account_id)?.platform as string | undefined;
  const cMeta = cPlatform ? metaOf(cPlatform) : null;
  const typeOptions: string[] = cPlatform && typesOf(cPlatform).length ? typesOf(cPlatform) : ['search'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Ad accounts</h1>
          <p className="text-sm text-gray-600">
            Google, Meta and Snapchat accounts, Google Ads tracking and campaigns. Meta campaigns are run from{' '}
            <Link className={linkCls} to="/panel/marketing/ads/manager">Ads Manager</Link>; customer lists live in{' '}
            <Link className={linkCls} to="/panel/marketing/ads/audiences">Audiences</Link>.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAccForm(accForm ? null : emptyAccount(platformKeys[0] ?? 'google'))}>
              {accForm ? 'Close' : 'Add account'}
            </Button>
            <Button size="sm" disabled={!accounts.length} onClick={() => setCForm(cForm ? null : { campaign_type: 'search', placements: [], formats: [] })}>
              {cForm ? 'Close' : 'New campaign'}
            </Button>
          </div>
        )}
      </div>

      {base.error && !base.data ? <LoadFailure failure={base.error} what="Ad accounts (GET /api/v2/marketing/ads/accounts)" onRetry={base.reload} />
        : !base.data ? <p className="text-sm text-gray-500">Loading...</p>
        : (
          <>
            {lead && <Lead tone={lead.tone} title={lead.title} actions={lead.action}>{lead.body}</Lead>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Accounts" value={num(accounts.length)} sub={practice.length ? `${num(practice.length)} in practice mode` : 'all connected'} tone={practice.length ? 'warn' : 'neutral'} />
              <Figure label="Campaigns" value={num(campaigns.length)} sub={failed.length ? `${num(failed.length)} not sent` : undefined} tone={failed.length ? 'bad' : 'neutral'} />
              <Figure label="Spend reported" value={moneyMajor(spend)} sub="campaigns below" />
              <Figure label="Google tracking" value={!m ? '...' : !m.connected ? 'Not connected' : m.managed ? 'On' : 'Off'} tone={m?.connected && !m.managed ? 'warn' : 'neutral'} />
            </div>

            <AdsGoogleSection measurement={m} failure={google.error} onRetry={google.reload} onSetUp={setUp} settingUp={settingUp} canManage={canManage} />

            {accForm && (
              <Section title={accounts.some((a) => a.platform === accForm.platform && a.account_id === accForm.account_id) ? 'Edit account' : 'Add account'}
                hint="Save the account, then press Connect on it to sign in with the platform. Growcord uses one app per platform, so there is nothing to register.">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="acc-platform">Platform</Label>
                      <select id="acc-platform" value={accForm.platform} onChange={(e) => setAccForm(emptyAccount(e.target.value))}
                        className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm">
                        {platformKeys.map((p) => <option key={p} value={p}>{platformName(p)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="acc-id">Account ID</Label>
                      <Input id="acc-id" value={accForm.account_id} onChange={(e) => setAccForm({ ...accForm, account_id: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="acc-name">Name</Label>
                      <Input id="acc-name" value={accForm.account_name} onChange={(e) => setAccForm({ ...accForm, account_name: e.target.value })} />
                    </div>
                  </div>
                  {(ACCOUNT_FIELDS[accForm.platform] ?? []).length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(ACCOUNT_FIELDS[accForm.platform] ?? []).map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label htmlFor={`acc-${f.key}`}>{f.label}</Label>
                          <Input id={`acc-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="off"
                            placeholder={f.secret ? 'Leave blank to keep the saved one' : undefined}
                            value={accForm.fields[f.key] ?? ''} onChange={(e) => setAccForm({ ...accForm, fields: { ...accForm.fields, [f.key]: e.target.value } })}
                            className="font-mono text-xs" />
                        </div>
                      ))}
                    </div>
                  )}
                  {accForm.platform === 'meta' && (
                    <p className="text-sm text-gray-600">Most stores connect Meta on <Link className={linkCls} to="/panel/marketing/meta">Facebook and Instagram</Link> instead.</p>
                  )}
                  <Button onClick={saveAccount} disabled={!accForm.account_id.trim() || busy === 'account'}>
                    {busy === 'account' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}Save account
                  </Button>
                </div>
              </Section>
            )}

            <Section title="Connected accounts" hint="An account in practice mode shows sample figures and sends nothing to the platform until it is connected.">
              {!accounts.length ? <p className="text-sm text-gray-500">No ad accounts yet.</p> : (
                <ul className="-my-2 divide-y">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="font-medium text-gray-900">{platformName(a.platform)}</span>
                      <span className="min-w-0 break-words text-gray-700">{a.account_name || a.account_id}</span>
                      <StateChip tone={a.configured ? 'good' : 'warn'}>{a.configured ? 'Connected' : 'Practice mode'}</StateChip>
                      {a.connection_id && <span className="text-xs text-gray-500">through the shared connection</span>}
                      {canManage && (
                        <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
                          <Button size="sm" variant={a.configured ? 'outline' : 'default'} onClick={() => connect(a)} disabled={busy === `connect:${a.id}`}>Connect</Button>
                          <Button size="sm" variant="outline" onClick={() => test(a)} disabled={busy === `test:${a.id}`}>Test</Button>
                          <Button size="sm" variant="outline" onClick={() => setAccForm({
                            platform: a.platform, account_id: a.account_id ?? '', account_name: a.account_name ?? '',
                            fields: Object.fromEntries(Object.entries(a.settings ?? {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v as string])),
                          })}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-red-700"
                            onClick={() => { if (window.confirm(`Remove the ${platformName(a.platform)} account ${a.account_name || a.account_id} from Growcord? Nothing changes on ${platformName(a.platform)} itself.`)) act(`del:${a.id}`, () => api.delete(`/marketing-hub/ads/accounts/${a.id}`), 'Account removed'); }}>
                            Remove
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {cForm && (
              <Section title="New campaign" hint="Saved here as a draft. Send creates it paused on the platform; it spends nothing until you resume it there.">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="c-account">Account</Label>
                      <select id="c-account" value={cForm.ad_account_id ?? ''} className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm"
                        onChange={(e) => {
                          const acc = accounts.find((x) => x.id === e.target.value);
                          const first = acc ? (typesOf(acc.platform)[0] ?? 'search') : 'search';
                          setCForm({ ...cForm, ad_account_id: e.target.value, campaign_type: first, name: cForm.nameTouched ? cForm.name : autoName(acc?.platform, first) });
                        }}>
                        <option value="">Pick an account</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{platformName(a.platform)}: {a.account_name || a.account_id}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-name">Name</Label>
                      <Input id="c-name" value={cForm.name ?? ''} onChange={(e) => setCForm({ ...cForm, name: e.target.value, nameTouched: true })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-type">Type</Label>
                      <select id="c-type" value={cForm.campaign_type} className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm"
                        onChange={(e) => setCForm({
                          ...cForm, campaign_type: e.target.value,
                          is_remarketing: e.target.value === 'remarketing' || cForm.is_remarketing,
                          name: cForm.nameTouched ? cForm.name : autoName(cPlatform, e.target.value),
                        })}>
                        {typeOptions.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-budget">Daily budget</Label>
                      <Input id="c-budget" type="number" inputMode="decimal" min={0} value={cForm.budget_daily ?? ''}
                        onChange={(e) => setCForm({ ...cForm, budget_daily: e.target.value === '' ? null : Number(e.target.value) })} />
                    </div>
                  </div>
                  {(['placements', 'formats'] as const).map((key) => (cMeta?.[key]?.length ? (
                    <fieldset key={key} className="space-y-1">
                      <legend className="text-sm font-medium text-gray-700">{key === 'placements' ? 'Placements' : 'Formats'}</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {(cMeta[key] as string[]).map((v) => {
                          const on = (cForm[key] ?? []).includes(v);
                          return (
                            <Button key={v} size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on}
                              onClick={() => setCForm({ ...cForm, [key]: on ? cForm[key].filter((x: string) => x !== v) : [...(cForm[key] ?? []), v] })}>
                              {humanize(v)}
                            </Button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null))}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="c-aud">Remarketing audience</Label>
                      <select id="c-aud" value={cForm.custom_audience_id ?? ''} className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm"
                        onChange={(e) => setCForm({ ...cForm, custom_audience_id: e.target.value || null, is_remarketing: !!e.target.value })}>
                        <option value="">None</option>
                        {audiences.filter((a) => a.status === 'synced').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <p className="text-xs text-gray-500">Only approved audiences already shared with the platform.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-start">Start date</Label>
                      <Input id="c-start" type="date" value={cForm.start_date ?? ''} onChange={(e) => setCForm({ ...cForm, start_date: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-end">End date</Label>
                      <Input id="c-end" type="date" value={cForm.end_date ?? ''} onChange={(e) => setCForm({ ...cForm, end_date: e.target.value })} />
                    </div>
                  </div>
                  {FEED_TYPES.includes(cForm.campaign_type) && (
                    <p className="text-sm text-gray-600">This type shows your products from the store's product feed, kept current by channel sync.</p>
                  )}
                  <Button onClick={saveCampaign} disabled={!cForm.ad_account_id || !cForm.name || busy === 'campaign'}>
                    {busy === 'campaign' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}Save as draft
                  </Button>
                </div>
              </Section>
            )}

            <Section title="Campaigns" hint="Campaigns made here, on any platform.">
              {!campaigns.length ? <p className="text-sm text-gray-500">No campaigns made here yet.</p> : (
                <ul className="-my-2 divide-y">
                  {campaigns.map((c) => (
                    <li key={c.id} className="space-y-1.5 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{c.name}</span>
                        <span className="text-xs text-gray-500">{platformName(c.platform)}, {humanize(c.campaign_type)}{c.is_remarketing ? ', remarketing' : ''}</span>
                        <StateChip tone={CAMPAIGN_TONE[c.status] ?? 'neutral'}>{humanize(c.status) || 'Draft'}</StateChip>
                        {c.stats?.mock && <StateChip tone="warn">Sample figures</StateChip>}
                      </div>
                      {c.stats?.impressions != null && (
                        <p className="text-xs tabular-nums text-gray-600">
                          {num(c.stats.impressions)} views, {num(c.stats.clicks)} clicks, {moneyMajor(Number(c.stats.spend) || 0)} spent
                        </p>
                      )}
                      {c.status === 'error' && c.last_error && <p className="text-xs text-red-700">{c.last_error}</p>}
                      {canManage && (
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" disabled={busy === `sync:${c.id}`}
                            onClick={() => { if (window.confirm(`Send "${c.name}" to ${platformName(c.platform)}? It is created paused there and spends nothing until you resume it.`)) act(`sync:${c.id}`, () => api.post(`/marketing-hub/ads/campaigns/${c.id}/sync`), 'Sent, paused on the platform'); }}>
                            Send
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy === `stats:${c.id}`} onClick={() => act(`stats:${c.id}`, () => api.post(`/marketing-hub/ads/campaigns/${c.id}/refresh-stats`), 'Figures updated')}>Update figures</Button>
                          <Button size="sm" variant="outline" disabled={busy === `pause:${c.id}`} onClick={() => act(`pause:${c.id}`, () => api.post(`/marketing-hub/ads/campaigns/${c.id}/pause`), 'Paused')}>Pause</Button>
                          <Button size="sm" variant="ghost" className="text-red-700"
                            onClick={() => { if (window.confirm(`Delete "${c.name}" from Growcord?`)) act(`del:${c.id}`, () => api.delete(`/marketing-hub/ads/campaigns/${c.id}`), 'Campaign deleted'); }}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
    </div>
  );
};

export default AdsManager;
