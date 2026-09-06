import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDate } from '../../../utils/date';

/**
 * Ads Manager — Google / Meta / Snapchat accounts + campaigns (all types,
 * placements & formats, Shopping via the store product feed, remarketing with
 * approved custom audiences). Campaigns are pushed PAUSED to the platform.
 */
const CRED_FIELDS: Record<string, string[]> = {
  google: ['developer_token', 'oauth_client_id', 'oauth_client_secret', 'customer_id', 'login_customer_id', 'refresh_token'],
  meta: ['app_id', 'app_secret', 'ad_account_id', 'business_id', 'catalog_id', 'access_token'],
  snapchat: ['client_id', 'client_secret', 'ad_account_id', 'refresh_token', 'access_token'],
};

/** Fields OAuth fills automatically — save the app credentials, then click Connect. */
const OAUTH_FILLED: Record<string, string[]> = {
  google: ['refresh_token'], meta: ['access_token'], snapchat: ['refresh_token', 'access_token'],
};

const AdsManager: React.FC = () => {
  const { hasPerm } = useAuth();
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [audiences, setAudiences] = useState<any[]>([]);
  const [showAccount, setShowAccount] = useState(false);
  const [accForm, setAccForm] = useState<any>({ platform: 'google', credentials: {} });
  const [showCampaign, setShowCampaign] = useState(false);
  const [cForm, setCForm] = useState<any>({ campaign_type: 'search', placements: [], formats: [] });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    const [p, a, c, au] = await Promise.all([
      api.get('/marketing-hub/ads/platforms'),
      api.get('/marketing-hub/ads/accounts'),
      api.get('/marketing-hub/ads/campaigns'),
      api.get('/marketing-hub/ads/audiences'),
    ]);
    setPlatforms(payload(p) ?? []); setAccounts(payload(a) ?? []);
    setCampaigns(payload(c) ?? []); setAudiences(payload(au) ?? []);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, []);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message); }
  };

  const meta = (platform: string) => platforms.find((p) => p.platform === platform);
  const account = (id: string) => accounts.find((a) => a.id === id);

  const saveAccount = () => act(async () => {
    await api.post('/marketing-hub/ads/accounts', accForm);
    setShowAccount(false); setAccForm({ platform: 'google', credentials: {} });
  });

  const saveCampaign = () => act(async () => {
    await api.post('/marketing-hub/ads/campaigns', cForm);
    setShowCampaign(false); setCForm({ campaign_type: 'search', placements: [], formats: [] });
  });

  const toggleIn = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const cPlat = account(cForm.ad_account_id)?.platform;
  const cMeta = cPlat ? meta(cPlat) : null;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Ads Manager</h1>
          <p className="text-sm text-gray-500">
            Google · Meta (Facebook/Instagram) · Snapchat — search, display, video, shopping, all placements & remarketing.
            Custom audiences live in <Link className="underline" to="/panel/marketing/ads/audiences">Custom Audiences</Link>.
          </p>
        </div>
        <div className="flex gap-2">
          {hasPerm('ads.manage') && (
            <>
              <button onClick={() => setShowAccount((s) => !s)} className="rounded border px-3 py-1.5 text-sm">
                {showAccount ? 'Close' : '+ Ad account'}
              </button>
              <button onClick={() => setShowCampaign((s) => !s)} disabled={!accounts.length}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {showCampaign ? 'Close' : '+ Ad campaign'}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {/* Accounts */}
      <div className="rounded-lg border bg-white shadow-sm divide-y">
        <div className="px-4 py-2 text-sm font-semibold text-gray-700">Connected accounts</div>
        {accounts.length === 0 && <div className="p-4 text-sm text-gray-500">No ad accounts yet — connect one to begin. Without real credentials everything runs in clearly-labelled mock mode.</div>}
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">{a.platform}</span>
            <span className="font-medium">{a.account_name ?? a.account_id}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${a.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {a.configured ? 'live credentials' : 'mock mode'}
            </span>
            <div className="ml-auto flex gap-1.5">
              {hasPerm('ads.manage') && (
                <>
                  <button onClick={() => act(async () => {
                    const redirect = `${window.location.origin}/panel/marketing/ads/oauth/callback`;
                    const r = await api.get(`/marketing-hub/ads/oauth/${a.platform}/url`, {
                      params: { account_id: a.id, redirect_uri: redirect },
                    });
                    window.open(payload(r).url, '_blank', 'noopener');
                    setInfo(`Authorize in the new tab (redirect URI to register in the ${a.platform} app console: ${redirect}). Tokens are saved automatically after you approve.`);
                  })} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                    title="One-click OAuth — fills refresh/access tokens automatically">
                    Connect (OAuth)
                  </button>
                  <button onClick={() => act(async () => {
                    const r = await api.post(`/marketing-hub/ads/accounts/${a.id}/test`);
                    setInfo(`${a.platform}: ${payload(r).message}`);
                  })} className="rounded border px-2 py-1 text-xs">Test</button>
                  <button onClick={() => { setAccForm({ platform: a.platform, account_id: a.account_id, account_name: a.account_name, credentials: a.credentials }); setShowAccount(true); }}
                    className="rounded border px-2 py-1 text-xs">Edit</button>
                  <button onClick={() => { if (window.confirm('Remove account?')) act(() => api.delete(`/marketing-hub/ads/accounts/${a.id}`)); }}
                    className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAccount && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Platform
              <select value={accForm.platform} onChange={(e) => setAccForm({ platform: e.target.value, credentials: {} })}
                className="mt-1 w-full rounded border px-2 py-1.5 capitalize">
                {['google', 'meta', 'snapchat'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="text-sm">Account id
              <input value={accForm.account_id ?? ''} onChange={(e) => setAccForm({ ...accForm, account_id: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">Account name
              <input value={accForm.account_name ?? ''} onChange={(e) => setAccForm({ ...accForm, account_name: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {(CRED_FIELDS[accForm.platform] ?? []).map((f) => (
              <label key={f} className="text-sm">{f}
                {(OAUTH_FILLED[accForm.platform] ?? []).includes(f) && (
                  <span className="ml-1 text-xs text-blue-600">(auto via OAuth)</span>
                )}
                <input value={accForm.credentials?.[f] ?? ''} type={/secret|token|key/.test(f) ? 'password' : 'text'}
                  onChange={(e) => setAccForm({ ...accForm, credentials: { ...accForm.credentials, [f]: e.target.value } })}
                  className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" placeholder="optional until go-live" />
              </label>
            ))}
          </div>
          <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
            OAuth flow: save the app credentials (Google: OAuth client id/secret + developer token · Meta: app id/secret ·
            Snapchat: client id/secret), then press <b>Connect (OAuth)</b> on the account — tokens are fetched and stored
            automatically. Register <code>{`${window.location.origin}/panel/marketing/ads/oauth/callback`}</code> as the
            redirect URI in the platform's app console.
          </p>
          <button onClick={saveAccount} disabled={!accForm.account_id}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Save account
          </button>
        </div>
      )}

      {showCampaign && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">Account
              <select value={cForm.ad_account_id ?? ''} onChange={(e) => {
                const acc = accounts.find((x) => x.id === e.target.value);
                const firstType = acc ? (meta(acc.platform)?.campaignTypes?.[0] ?? 'search') : 'search';
                const month = localeDate(new Date(), { month: 'short', year: 'numeric' }, 'en-IN');
                setCForm({
                  ...cForm, ad_account_id: e.target.value, campaign_type: firstType,
                  name: cForm.nameTouched ? cForm.name : (acc ? `${acc.platform} ${firstType.replace(/_/g, ' ')} — ${month}` : cForm.name),
                });
              }} className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="">— select —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} · {a.account_name ?? a.account_id}</option>)}
              </select>
            </label>
            <label className="text-sm">Name <span className="text-gray-400">(auto)</span>
              <input value={cForm.name ?? ''} onChange={(e) => setCForm({ ...cForm, name: e.target.value, nameTouched: true })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">Type
              <select value={cForm.campaign_type} onChange={(e) => {
                const month = localeDate(new Date(), { month: 'short', year: 'numeric' }, 'en-IN');
                setCForm({
                  ...cForm, campaign_type: e.target.value,
                  is_remarketing: e.target.value === 'remarketing' || cForm.is_remarketing,
                  name: cForm.nameTouched ? cForm.name : (cPlat ? `${cPlat} ${e.target.value.replace(/_/g, ' ')} — ${month}` : cForm.name),
                });
              }} className="mt-1 w-full rounded border px-2 py-1.5">
                {(cMeta?.campaignTypes ?? ['search']).map((t: string) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="text-sm">Daily budget ₹
              <input type="number" min={0} value={cForm.budget_daily ?? ''}
                onChange={(e) => setCForm({ ...cForm, budget_daily: Number(e.target.value) || null })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          {!!cMeta?.placements?.length && (
            <div className="text-sm">
              <div className="mb-1 text-gray-600">Placements</div>
              <div className="flex flex-wrap gap-1.5">
                {cMeta.placements.map((p: string) => (
                  <button key={p} onClick={() => setCForm({ ...cForm, placements: toggleIn(cForm.placements ?? [], p) })}
                    className={`rounded px-2 py-0.5 text-xs ${(cForm.placements ?? []).includes(p) ? 'bg-primary text-primary-foreground' : 'bg-gray-100'}`}>
                    {p.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!!cMeta?.formats?.length && (
            <div className="text-sm">
              <div className="mb-1 text-gray-600">Formats</div>
              <div className="flex flex-wrap gap-1.5">
                {cMeta.formats.map((f: string) => (
                  <button key={f} onClick={() => setCForm({ ...cForm, formats: toggleIn(cForm.formats ?? [], f) })}
                    className={`rounded px-2 py-0.5 text-xs ${(cForm.formats ?? []).includes(f) ? 'bg-primary text-primary-foreground' : 'bg-gray-100'}`}>
                    {f.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Remarketing audience (approved + synced only)
              <select value={cForm.custom_audience_id ?? ''} onChange={(e) => setCForm({ ...cForm, custom_audience_id: e.target.value || null, is_remarketing: !!e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="">— none —</option>
                {audiences.filter((a) => a.status === 'synced').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Start date
              <input type="date" value={cForm.start_date ?? ''} onChange={(e) => setCForm({ ...cForm, start_date: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">End date
              <input type="date" value={cForm.end_date ?? ''} onChange={(e) => setCForm({ ...cForm, end_date: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          {['shopping', 'catalog_sales', 'performance_max', 'collection_ads'].includes(cForm.campaign_type) && (
            <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Shopping/catalog campaigns use the store's existing product feed (Multi-Channel Sync → Google/Meta feed URL).
            </p>
          )}
          <button onClick={saveCampaign} disabled={!cForm.ad_account_id || !cForm.name}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Create campaign (draft)
          </button>
        </div>
      )}

      {/* Campaigns */}
      <div className="rounded-lg border bg-white shadow-sm divide-y">
        <div className="px-4 py-2 text-sm font-semibold text-gray-700">Campaigns</div>
        {campaigns.length === 0 && <div className="p-4 text-sm text-gray-500">No ad campaigns yet.</div>}
        {campaigns.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">{c.platform}</span>
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-gray-500">{c.campaign_type.replace(/_/g, ' ')}{c.is_remarketing ? ' · remarketing' : ''}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${c.status === 'active' ? 'bg-green-100 text-green-800' : c.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
            {c.stats?.mock && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">mock</span>}
            <span className="ml-auto font-mono text-xs text-gray-500">
              {c.stats?.impressions != null && <>imp {c.stats.impressions} · clk {c.stats.clicks} · ₹{Number(c.stats.spend ?? 0).toFixed(0)}</>}
            </span>
            {hasPerm('ads.manage') && (
              <div className="flex gap-1.5">
                <button onClick={() => act(() => api.post(`/marketing-hub/ads/campaigns/${c.id}/sync`))}
                  className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Sync</button>
                <button onClick={() => act(() => api.post(`/marketing-hub/ads/campaigns/${c.id}/refresh-stats`))}
                  className="rounded border px-2 py-1 text-xs">Stats</button>
                <button onClick={() => act(() => api.post(`/marketing-hub/ads/campaigns/${c.id}/pause`))}
                  className="rounded border px-2 py-1 text-xs">Pause</button>
                <button onClick={() => { if (window.confirm('Delete campaign?')) act(() => api.delete(`/marketing-hub/ads/campaigns/${c.id}`)); }}
                  className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdsManager;
