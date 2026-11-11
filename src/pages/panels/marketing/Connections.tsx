import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/components/messaging/common';
import { modulesForPath, permissionsForPath } from '@/lib/routePermissions';
import { metaApi, type MetaSetup, type SetupItem } from '@/lib/v2/areas/meta';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { startConnect } from '../../../lib/connectorConnect';
import MetaWebhooksCard from './MetaWebhooksCard';
import { Section, StateChip, linkCls, plural, useLoad, type Tone } from './meta/common';
import { SERVICE_FALLBACK, needText, tokenEndsSoon, useTokenWarnDays } from './meta/SetupTab';
import { connectionsHref, metaHref } from './meta/routes';
import { ACCOUNT_LINK, RELATED, USE_CASES, type UseCaseLink } from './connectionUseCases';

/**
 * Platform Connections: one tab per provider the backend lists (`GET /connectors/providers`), so a newly registered
 * provider appears with no change here. The tab is `?platform=<provider key>`. Inside a tab: the account first
 * (who is connected, reconnect, missing permissions), then one row per service saying what it does for the store,
 * its state, what is missing and the one next action, with links to the screen where it is used
 * (`connectionUseCases.ts`). Adding a service later consents incrementally on the same account, so nothing already
 * connected is disturbed.
 */

interface ServiceDef {
  key: string; label: string; description: string;
  resourceLabel: string | null; readOnly?: boolean; requiresModule?: string; scopes?: string[];
}
interface CredentialFieldDef {
  key: string; label: string; secret?: boolean; help?: string;
  service?: string; storeOnly?: boolean;
}
interface ProviderDef {
  key: string; label: string; description: string;
  services: ServiceDef[];
  /** The backend sends `platform_app` (aliased to camelCase); `platformAppConfigured` is the old name. */
  platformApp?: boolean; platformAppConfigured?: boolean;
  /** Server-declared form: the panel renders whatever the provider needs. */
  credentialFields: CredentialFieldDef[];
}
interface ConnService {
  id: string; service: string; isEnabled: boolean;
  externalResourceId: string | null; externalResourceName: string | null;
  status: string; lastError: string | null; lastSyncedAt: string | null;
}
interface Connection {
  id: string; provider: string; displayName: string | null; accountEmail: string | null;
  status: string; lastError: string | null; appOwner: string;
  tokenExpiresAt: string | null; grantedScopes?: string[]; services: ConnService[];
  credentials: Record<string, { set: boolean; preview: string }>;
}

type PlatformStatus = 'connected' | 'attention' | 'not_connected';

const PLATFORM_STATUS: Record<PlatformStatus, { label: string; tone: Tone; dot: string }> = {
  connected: { label: 'Connected', tone: 'good', dot: 'bg-emerald-500' },
  attention: { label: 'Needs attention', tone: 'warn', dot: 'bg-amber-500' },
  not_connected: { label: 'Not connected', tone: 'neutral', dot: 'bg-gray-400' },
};

/** A connection that exists but is not usable: consent never finished, or it was revoked. */
const isLive = (c?: Connection | null): c is Connection => !!c && c.status !== 'pending' && c.status !== 'revoked';
const STOPPED = new Set(['needs_reauth', 'error']);

type NextAction = 'select' | 'add' | 'enable' | 'choose' | 'credential' | 'reconnect' | 'open' | 'none';

interface UseCaseView {
  tone: Tone; state: string; missing?: string; action: NextAction;
  field?: CredentialFieldDef;
  /** Permissions this service still lacks, as the provider names them. */
  perms?: string[];
  /** The Meta checklist's row for this service, when it has one. */
  item?: SetupItem | null;
}

interface Row { def: ServiceDef; svc?: ConnService; view: UseCaseView }

/** What a service needs next. One action, in the order a store owner must do them. */
function useCaseView(provider: ProviderDef, def: ServiceDef, conn: Connection | undefined, svc: ConnService | undefined, item: SetupItem | null): UseCaseView {
  if (!isLive(conn)) return { tone: 'neutral', state: 'Not connected', action: 'select' };
  if (!svc) return { tone: 'neutral', state: 'Not turned on', missing: `${provider.label} has not been asked for this yet.`, action: 'add', item };
  if (STOPPED.has(conn.status)) return { tone: 'bad', state: 'Stopped', missing: `Reconnect ${provider.label} to start this again.`, action: 'reconnect', item };
  if (!svc.isEnabled) return { tone: 'neutral', state: 'Turned off', action: 'enable', item };

  // Meta's checklist says per asset what Meta really allowed; other providers: the scopes they reported granting.
  const needs = item?.needs ?? [];
  const perms = item
    ? (needs.includes('permission') ? (item.missing_permissions ?? []) : [])
    : (provider.key !== 'meta' && conn.grantedScopes?.length ? (def.scopes ?? []).filter((s) => !conn.grantedScopes!.includes(s)) : []);
  if ((item && needs.includes('permission')) || perms.length) {
    const text = item ? needText(item, perms)[needs.indexOf('permission')] : `${provider.label} has not given this permission yet. Reconnect and allow everything it asks for.`;
    return { tone: 'warn', state: 'Needs permission', missing: text, perms, action: 'reconnect', item };
  }
  if (def.resourceLabel && !svc.externalResourceId) {
    return { tone: 'warn', state: 'Needs a choice', missing: `Choose the ${def.resourceLabel} this store uses.`, action: 'choose', item };
  }
  const field = (provider.credentialFields ?? []).find((f) => f.storeOnly && f.service === def.key && !conn.credentials?.[f.key]?.set);
  if (field) return { tone: 'warn', state: 'Needs a detail', missing: `Add your ${field.label} under Credentials.`, action: 'credential', field, item };
  const other = needs.find((n) => n !== 'permission' && n !== 'pick');
  if (item && other && item.state !== 'done') {
    // Nothing the owner can do yet, so this does not raise the tab to "Needs attention".
    return { tone: 'info', state: `Waiting on ${provider.label}`, missing: needText(item, [])[needs.indexOf(other)], action: 'none', item };
  }
  if (svc.lastError || svc.status === 'error') {
    return { tone: 'bad', state: 'Problem', missing: svc.lastError ?? `${provider.label} reported a problem with this.`, action: def.resourceLabel ? 'choose' : 'reconnect', item };
  }
  return { tone: 'good', state: 'Working', action: 'open', item };
}

/** Everything that can stop a connection, whichever tab it is on. */
function platformStatus(conn: Connection | undefined, rows: Row[], metaProblem: boolean): PlatformStatus {
  if (!isLive(conn)) return 'not_connected';
  if (metaProblem || STOPPED.has(conn.status) || conn.lastError) return 'attention';
  return rows.some((r) => r.view.tone === 'warn' || r.view.tone === 'bad') ? 'attention' : 'connected';
}

const Connections: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const canManage = hasPerm?.('settings.manage') ?? true;

  const [providers, setProviders] = useState<ProviderDef[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  /** Service picker state, keyed `${connectionId}:${service}`. */
  const [resources, setResources] = useState<Record<string, any[]>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<Record<string, string[]>>({});
  const [credsFor, setCredsFor] = useState<string | null>(null);
  const [credDraft, setCredDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get('/connectors/providers'),
        api.get('/connectors'),
      ]);
      setProviders(payload(p) ?? []);
      setConnections(payload(c) ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Meta's own checklist (live token check, permissions per asset). The tab status needs it, so it loads with the page. */
  const metaConnId = connections.find((c) => c.provider === 'meta' && isLive(c))?.id ?? null;
  const setupQ = useLoad<MetaSetup | null>(() => (metaConnId ? metaApi.setup().catch(() => null) : Promise.resolve(null)), [metaConnId]);
  const setup = setupQ.data ?? null;
  const warnDays = useTokenWarnDays();

  const refresh = useCallback(async () => {
    await load();
    await setupQ.reload();
  }, [load, setupQ.reload]);

  const connectionFor = useCallback((key: string) => connections.find((c) => c.provider === key), [connections]);

  const metaToken = setup?.connection ?? null;
  const metaEndsIn = tokenEndsSoon(metaToken, warnDays);
  const metaBad = metaToken?.token_valid === false || !!metaToken?.token_error;

  const byPlatform = useMemo(() => new Map(providers.map((provider) => {
    const conn = connectionFor(provider.key);
    const itemOf = (service: string): SetupItem | null => (provider.key === 'meta' && setup
      ? setup.items.find((i) => (i.action?.service || SERVICE_FALLBACK[String(i.key)]) === service) ?? null
      : null);
    const rows: Row[] = provider.services.map((def) => {
      const svc = conn?.services?.find((s) => s.service === def.key);
      return { def, svc, view: useCaseView(provider, def, conn, svc, itemOf(def.key)) };
    });
    const metaProblem = provider.key === 'meta' && (metaBad || metaEndsIn !== null);
    return [provider.key, { conn, rows, status: platformStatus(conn, rows, metaProblem) }] as const;
  })), [providers, connectionFor, setup, metaBad, metaEndsIn]);

  /* With no `?platform=`, open the platform that needs the owner most. */
  const keys = providers.map((p) => p.key);
  const statusOf = (k: string) => byPlatform.get(k)?.status;
  const landing = keys.find((k) => statusOf(k) === 'attention') ?? keys.find((k) => statusOf(k) === 'connected') ?? keys[0] ?? '';
  const [platform, setPlatform] = useTabParam<string>(keys, landing, { param: 'platform', push: true });

  /** Start (or extend) a connection: opens the provider consent screen and comes back to this tab. */
  const connect = async (provider: ProviderDef, services: string[]) => {
    if (!services.length) { setError('Pick at least one service to connect.'); return; }
    setError(''); setInfo(''); setBusy(provider.key);
    try {
      // The one consent flow (lib/connectorConnect.ts), shared with Facebook and Instagram.
      const problem = await startConnect(provider.key, services, connectionFor(provider.key)?.id ?? null, connectionsHref(provider.key));
      if (problem) setError(problem);
    } catch (e: any) {
      const d = e?.response?.data;
      setError(d?.note ?? d?.message ?? e.message);
    } finally { setBusy(null); }
  };

  /** Same consent, for the services already on (the server adds them anyway) so a broken grant comes back whole. */
  const reconnect = (provider: ProviderDef, conn: Connection) => {
    const held = (conn.services ?? []).map((s) => s.service);
    return connect(provider, held.length ? held : provider.services.map((s) => s.key));
  };

  const disconnect = async (conn: Connection, providerLabel: string) => {
    const services = conn.services.map((s) => s.service).join(', ') || 'none';
    // Meta: the server never revokes at Meta, because the same login can also carry WhatsApp.
    const question = conn.provider === 'meta'
      ? `Disconnect ${providerLabel}?\n\nThis removes the sign-in from Growcord only, with every service set up on it `
        + `(${services}). WhatsApp keeps working. To remove the access fully, do it in Meta's business settings. `
        + 'Reconnecting later starts fresh.'
      : `Disconnect ${providerLabel}?\n\nThis removes the sign-in and every service set up on it `
        + `(${services}). Reconnecting later starts fresh.`;
    if (!window.confirm(question)) return;
    setBusy(conn.id);
    try {
      await api.delete(`/connectors/${conn.id}`);
      setInfo(`${providerLabel} disconnected.`);
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const testConnection = async (conn: Connection) => {
    setBusy(conn.id); setError(''); setInfo('');
    try {
      const r = payload<any>(await api.post(`/connectors/${conn.id}/test`));
      setInfo(`The connection works. Signed in as ${r?.identity?.email ?? r?.identity?.displayName ?? 'the connected account'}.`);
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  /** Pick a resource only where the provider offers exactly one choice. */
  const autoConfigure = async (conn: Connection) => {
    setBusy(`${conn.id}:auto-configure`); setError(''); setInfo('');
    try {
      const out = payload<any>(await api.post(`/connectors/${conn.id}/services/auto-configure`, {}));
      const results = out?.results ?? [];
      const configured = results.filter((r: any) => r.status === 'configured');
      const choose = results.filter((r: any) => r.status === 'choose_one');
      const attention = results.filter((r: any) => r.status === 'needs_access' || r.status === 'none_available');
      setInfo([
        configured.length ? `Set up: ${configured.map((r: any) => r.service.replace(/_/g, ' ')).join(', ')}.` : '',
        choose.length ? `Choose by hand: ${choose.map((r: any) => `${r.service.replace(/_/g, ' ')} (${r.count} choices)`).join(', ')}.` : '',
        attention.length ? `Needs attention: ${attention.map((r: any) => r.service.replace(/_/g, ' ')).join(', ')}.` : '',
      ].filter(Boolean).join(' ') || 'Nothing here can be set up automatically.');
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  /** Load the pickable resources for a service (GA4 properties, Search Console sites and so on). */
  const openPicker = async (conn: Connection, service: string) => {
    const key = `${conn.id}:${service}`;
    setPicking(key); setError('');
    if (resources[key]) return;
    try {
      const r = payload<any[]>(await api.get(`/connectors/${conn.id}/services/${service}/resources`));
      setResources((prev) => ({ ...prev, [key]: r ?? [] }));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
      setResources((prev) => ({ ...prev, [key]: [] }));
    }
  };

  const chooseResource = async (conn: Connection, service: string, resource: any) => {
    setBusy(`${conn.id}:${service}`);
    try {
      const saved = payload<any>(await api.put(`/connectors/${conn.id}/services/${service}`, {
        isEnabled: true,
        externalResourceId: resource.id,
        externalResourceName: resource.name,
      }));
      setPicking(null);
      // Meta: picking a Page installs the Growcord app on it so webhooks flow. Say plainly when Meta refused.
      const sub = saved?.webhooks?.subscription;
      if (sub && !sub.ok) {
        setError(`${service.replace(/_/g, ' ')} is using ${resource.name}, but Meta refused to install the app on the Page: ${sub.error}`);
      } else {
        setInfo(`${service.replace(/_/g, ' ')} is now using ${resource.name}.`
          + (sub?.ok ? ' Meta will now send its updates here.' : ''));
      }
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const toggleService = async (conn: Connection, svc: ConnService) => {
    setBusy(`${conn.id}:${svc.service}`);
    try {
      await api.put(`/connectors/${conn.id}/services/${svc.service}`, { isEnabled: !svc.isEnabled });
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const saveCredentials = async (conn: Connection) => {
    setBusy(conn.id);
    try {
      await api.patch(`/connectors/${conn.id}/credentials`, { credentials: credDraft });
      setCredsFor(null); setCredDraft({});
      setInfo('Details saved.');
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  /** A link is shown only if the router would open it for this person (the same test RouteGuard applies). */
  const canOpen = (to: string): boolean => {
    const path = to.split('?')[0];
    const perms = permissionsForPath(path);
    return (!perms.length || perms.some((p) => hasPerm(p))) && modulesForPath(path).every((m) => canAccess(m));
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading connections...</div>;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Platform Connections</h1>
        <p className="mt-1 text-sm text-gray-600">
          Sign in to each platform once, then see what it does for your store and what still needs you.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {info}
        </div>
      )}

      {!providers.length ? (
        <p className="text-sm text-gray-600">No platforms are available for this store yet.</p>
      ) : (
        <Tabs value={platform} onValueChange={setPlatform} activationMode="manual">
          <TabsList aria-label="Platforms" className="flex h-auto w-full flex-wrap justify-start gap-1">
            {providers.map((p) => {
              const st = PLATFORM_STATUS[byPlatform.get(p.key)?.status ?? 'not_connected'];
              return (
                <TabsTrigger key={p.key} value={p.key} className="h-auto min-w-[6.5rem] flex-col items-start gap-0.5 py-1.5 text-left">
                  <span>{p.label}</span>
                  <span className="flex items-center gap-1 text-[11px] font-normal text-gray-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />
                    {st.label}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {providers.map((provider) => {
            const { conn, rows, status } = byPlatform.get(provider.key) ?? { conn: undefined, rows: [] as Row[], status: 'not_connected' as PlatformStatus };
            const live = isLive(conn);
            const connStatus = conn?.status;
            const selected = selecting[provider.key] ?? [];
            const st = PLATFORM_STATUS[status];
            const accountLink = ACCOUNT_LINK[provider.key];
            const meta = provider.key === 'meta';
            const token = meta ? metaToken : null;
            const endsIn = meta ? metaEndsIn : null;
            const missing = [...new Set(rows.flatMap((r) => r.view.perms ?? []))];
            const who = (meta ? token?.connected_as : null) ?? conn?.accountEmail ?? conn?.displayName ?? null;
            const reconnectFirst = live && (STOPPED.has(conn!.status) || missing.length > 0 || (meta && (metaBad || endsIn !== null)));
            const related = (RELATED[provider.key] ?? []).flatMap((r) => {
              if ('platform' in r) {
                const other = providers.find((p) => p.key === r.platform);
                return other ? [{ title: other.label, what: r.what, to: connectionsHref(r.platform), label: `Open ${other.label}` }] : [];
              }
              return canOpen(r.to) ? [{ title: r.title, what: r.what, to: metaHref(r.to), label: r.label }] : [];
            });

            return (
              <TabsContent key={provider.key} value={provider.key} className="mt-4 space-y-4">
                {/* The account */}
                <Section
                  title={(
                    <span className="flex flex-wrap items-center gap-2">
                      {provider.label}
                      <StateChip tone={st.tone}>{st.label}</StateChip>
                    </span>
                  )}
                  hint={provider.description}
                  actions={conn && canManage ? (
                    <>
                      {live && (
                        <Button size="sm" variant={reconnectFirst ? 'default' : 'outline'} onClick={() => reconnect(provider, conn)} disabled={busy === provider.key}>
                          {busy === provider.key ? 'Opening...' : 'Reconnect'}
                        </Button>
                      )}
                      {live && (
                        <Button size="sm" variant="outline" onClick={() => testConnection(conn)} disabled={busy === conn.id}>Test</Button>
                      )}
                      {live && (
                        <Button size="sm" variant="outline" onClick={() => autoConfigure(conn)} disabled={busy === `${conn.id}:auto-configure`}>
                          {busy === `${conn.id}:auto-configure` ? 'Setting up...' : 'Set up automatically'}
                        </Button>
                      )}
                      {(provider.credentialFields ?? []).length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => { setCredsFor(credsFor === conn.id ? null : conn.id); setCredDraft({}); }}>Credentials</Button>
                      )}
                      <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => disconnect(conn, provider.label)} disabled={busy === conn.id}>Disconnect</Button>
                    </>
                  ) : undefined}
                >
                  <div className="space-y-1.5 text-sm">
                    {live ? (
                      <p className="text-gray-800">
                        {who ? <>Connected as <span className="font-medium">{who}</span>{meta && token?.business ? <>, business <span className="font-medium">{token.business.name}</span></> : null}.</> : 'Connected.'}
                      </p>
                    ) : (
                      <p className="text-gray-700">
                        {connStatus === 'pending' ? 'Sign-in was started but not finished. Choose what this store needs below, then press Connect.'
                          : connStatus === 'revoked' ? 'This sign-in was removed. Choose what this store needs below, then press Connect.'
                            : 'Not connected yet. Choose what this store needs below, then press Connect.'}
                      </p>
                    )}
                    {conn && STOPPED.has(conn.status) && (
                      <p className="text-amber-800">
                        {provider.label} no longer accepts this sign-in{conn.status === 'needs_reauth' ? ' because it expired or was withdrawn' : ''}. Press Reconnect; what you already chose stays.
                      </p>
                    )}
                    {conn?.lastError && <p className="break-words text-red-700">{conn.lastError}</p>}
                    {meta && metaBad && <p className="break-words text-red-700">{token?.token_error ?? 'Meta no longer accepts this connection.'}</p>}
                    {meta && endsIn !== null && (
                      <p className="text-red-700">
                        {endsIn < 0 ? 'Meta access has ended.' : `Meta access ends in ${plural(endsIn, 'day')}.`}
                        {' '}Reconnect with the business login so it does not end.
                      </p>
                    )}
                    {live && token?.note && <p className="text-amber-800">{token.note}</p>}
                    {missing.length > 0 && (
                      <div>
                        <p className="text-amber-800">
                          {missing.some((m) => m.includes('/'))
                            ? `${plural(missing.length, 'permission')} not given. Press Reconnect and allow everything ${provider.label} asks for.`
                            : `Not given: press Reconnect and allow these on ${provider.label}'s screen.`}
                        </p>
                        {!missing.some((m) => m.includes('/')) && (
                          <div className="mt-1 flex flex-wrap gap-1">{missing.map((p) => <StateChip key={p} tone="bad" className="font-normal">{p}</StateChip>)}</div>
                        )}
                      </div>
                    )}
                    {!live && !provider.platformApp && !provider.platformAppConfigured && (
                      <p className="text-amber-800">Growcord has not finished setting up {provider.label} yet, so connecting may not work until it has.</p>
                    )}
                    {!canManage && <p className="text-gray-600">Only someone who can change settings can connect or change this.</p>}
                    {accountLink && canOpen(accountLink.to) && (
                      <p><Link to={metaHref(accountLink.to)} className={linkCls}>{accountLink.label}</Link></p>
                    )}
                  </div>

                  {/* Extra credentials (developer token, own OAuth app) */}
                  {conn && credsFor === conn.id && (
                    <div className="mt-4 rounded-md border bg-gray-50 p-4">
                      <h3 className="text-sm font-semibold">Details for {provider.label}</h3>
                      <p className="mt-1 text-xs text-gray-600">
                        Leave a field blank to keep what is saved.
                        {' '}{(provider.platformApp ?? provider.platformAppConfigured)
                          ? 'Sign-in uses Growcord\'s own app, so only the extras below are yours to give.'
                          : 'This store signs in with its own app, so its app ID and secret are needed.'}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(provider.credentialFields ?? []).map((f) => {
                          const saved = conn.credentials?.[f.key];
                          return (
                            <label key={f.key} className="block">
                              <span className="text-xs font-medium text-gray-700">
                                {f.label}
                                {f.storeOnly && (
                                  <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">you must give this</span>
                                )}
                                {saved?.set && (
                                  <em className="ml-2 not-italic text-gray-400">saved, ends {saved.preview}</em>
                                )}
                              </span>
                              <input type={f.secret ? 'password' : 'text'}
                                value={credDraft[f.key] ?? ''}
                                onChange={(e) => setCredDraft({ ...credDraft, [f.key]: e.target.value })}
                                placeholder={saved?.set ? '(unchanged)' : ''}
                                autoComplete="new-password"
                                className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                              {f.help && <span className="mt-1 block text-[11px] text-gray-500">{f.help}</span>}
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => saveCredentials(conn)} disabled={busy === conn.id}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => { setCredsFor(null); setCredDraft({}); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </Section>

                {/* What it does for the store */}
                <Card className="overflow-hidden">
                  <div className="border-b px-4 py-3 sm:px-5">
                    <h2 className="text-base font-semibold text-gray-900">What {provider.label} does for your store</h2>
                  </div>
                  <ul className="divide-y">
                    {rows.map(({ def, svc, view }) => {
                      const useCase = USE_CASES[provider.key]?.[def.key];
                      const links: UseCaseLink[] = (useCase?.links ?? []).filter((l) => canOpen(l.to));
                      const pickerKey = `${conn?.id}:${def.key}`;
                      const isPicking = picking === pickerKey;
                      const openFirst = view.action === 'open' && links.length > 0;
                      const showLinks = openFirst ? links.slice(1) : links;

                      return (
                        <li key={def.key} className="p-4 sm:px-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-[min(100%,16rem)] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{def.label}</span>
                                <StateChip tone={view.tone}>{view.state}</StateChip>
                                {def.readOnly && <StateChip tone="info" className="font-normal">Read only</StateChip>}
                                {svc?.externalResourceName && (
                                  <span className="max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700" title={svc.externalResourceId ?? undefined}>{svc.externalResourceName}</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-sm text-gray-600">{useCase?.what ?? def.description}</p>
                              {view.missing && <p className="mt-1 text-sm text-amber-800">{view.missing}</p>}
                              {view.item?.note && <p className="mt-1 text-sm text-gray-700">{view.item.note}</p>}
                              {svc?.lastError && svc.lastError !== view.missing && <p className="mt-1 break-words text-xs text-red-600">{svc.lastError}</p>}
                              {showLinks.length > 0 && (
                                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                  {showLinks.map((l) => <Link key={l.to} to={metaHref(l.to)} className={linkCls}>{l.label}</Link>)}
                                </p>
                              )}
                            </div>

                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                              {openFirst && (
                                <Button size="sm" variant="outline" asChild><Link to={metaHref(links[0].to)}>{links[0].label}</Link></Button>
                              )}
                              {canManage && view.action === 'select' && (
                                <label className="flex items-center gap-1.5 text-sm">
                                  <input type="checkbox" checked={selected.includes(def.key)}
                                    onChange={(e) => setSelecting({
                                      ...selecting,
                                      [provider.key]: e.target.checked
                                        ? [...selected, def.key]
                                        : selected.filter((s) => s !== def.key),
                                    })} />
                                  Include
                                </label>
                              )}
                              {canManage && view.action === 'add' && (
                                <Button size="sm" onClick={() => connect(provider, [def.key])} disabled={busy === provider.key}>Turn on</Button>
                              )}
                              {canManage && view.action === 'reconnect' && live && (
                                <Button size="sm" onClick={() => reconnect(provider, conn)} disabled={busy === provider.key}>Reconnect</Button>
                              )}
                              {canManage && view.action === 'credential' && live && (
                                <Button size="sm" onClick={() => { setCredsFor(conn.id); setCredDraft({}); }}>Add {view.field?.label}</Button>
                              )}
                              {canManage && live && def.resourceLabel && svc && (
                                view.action === 'choose' ? (
                                  <Button size="sm" onClick={() => openPicker(conn, def.key)}>{svc.externalResourceId ? 'Change' : `Choose ${def.resourceLabel}`}</Button>
                                ) : (
                                  <button type="button" onClick={() => openPicker(conn, def.key)} className="text-sm text-gray-600 underline-offset-2 hover:underline">Change</button>
                                )
                              )}
                              {canManage && live && svc && (
                                view.action === 'enable' ? (
                                  <Button size="sm" onClick={() => toggleService(conn, svc)} disabled={busy === `${conn.id}:${def.key}`}>Turn on</Button>
                                ) : svc.isEnabled && (
                                  <button type="button" onClick={() => toggleService(conn, svc)} disabled={busy === `${conn.id}:${def.key}`} className="text-sm text-gray-600 underline-offset-2 hover:underline disabled:opacity-50">Turn off</button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Resource picker */}
                          {isPicking && conn && (
                            <div className="mt-3 rounded-md border bg-gray-50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-600">Choose a {def.resourceLabel}</span>
                                <button type="button" onClick={() => setPicking(null)} className="text-xs text-gray-500 hover:text-gray-800">Close</button>
                              </div>
                              {!resources[pickerKey] ? (
                                <p className="text-sm text-gray-500">Loading...</p>
                              ) : resources[pickerKey].length === 0 ? (
                                <p className="text-sm text-gray-600">
                                  {provider.label} shows none for this account. Check that the account you connected can use a {def.resourceLabel}, then reload.
                                </p>
                              ) : (
                                <ul className="max-h-56 space-y-1 overflow-auto">
                                  {resources[pickerKey].map((r) => (
                                    <li key={r.id}>
                                      <button type="button" onClick={() => chooseResource(conn, def.key, r)}
                                        disabled={busy === `${conn.id}:${def.key}`}
                                        className={`flex w-full flex-wrap items-center justify-between gap-x-3 rounded px-3 py-2 text-left text-sm hover:bg-white disabled:opacity-50 ${
                                          svc?.externalResourceId === r.id ? 'bg-white ring-1 ring-primary' : ''}`}>
                                        <span className="min-w-0">
                                          <span className="font-medium">{r.name}</span>
                                          {r.detail && <span className="ml-2 text-xs text-gray-500">{r.detail}</span>}
                                        </span>
                                        <span className="break-all text-xs text-gray-400">{r.id}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {related.map((r) => (
                      <li key={r.title} className="p-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[min(100%,16rem)] flex-1">
                            <span className="font-medium">{r.title}</span>
                            <p className="mt-0.5 text-sm text-gray-600">{r.what}</p>
                          </div>
                          <Button size="sm" variant="outline" asChild><Link to={r.to}>{r.label}</Link></Button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Connect a platform that is not connected yet */}
                  {!live && canManage && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 p-4 sm:px-5">
                      <span className="text-sm text-gray-600">
                        {selected.length ? `${plural(selected.length, 'service')} chosen` : 'Choose at least one above, then connect.'}
                      </span>
                      <Button onClick={() => connect(provider, selected)} disabled={busy === provider.key || !selected.length}>
                        {busy === provider.key ? 'Opening...' : `Connect ${provider.label}`}
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Meta webhooks: assets receiving updates and recent notifications */}
                {meta && live && (
                  <Card className="overflow-hidden">
                    <MetaWebhooksCard canManage={canManage} refreshKey={connections} />
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
};

export default Connections;
