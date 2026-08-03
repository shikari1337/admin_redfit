import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Platform Connections — the Site Kit-style hub.
 *
 * One card per provider. Connecting grants an identity; each SERVICE is then
 * enabled and pointed at a specific resource (a verified Search Console site, a
 * GA4 property, a Merchant account, an Ads customer id). Adding a service later
 * re-consents INCREMENTALLY against the same identity, so nothing already
 * working is disturbed.
 *
 * The page is provider-agnostic: everything it renders comes from
 * GET /connectors/providers, so Meta (and later TikTok/Microsoft) appear here
 * automatically once registered on the backend — no change to this file.
 */

interface ServiceDef {
  key: string; label: string; description: string;
  resourceLabel: string | null; readOnly?: boolean; requiresModule?: string;
}
interface CredentialFieldDef {
  key: string; label: string; secret?: boolean; help?: string;
  service?: string; storeOnly?: boolean;
}
interface ProviderDef {
  key: string; label: string; description: string;
  services: ServiceDef[]; platformAppConfigured: boolean;
  /** Server-declared form — the panel renders whatever the provider needs. */
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
  tokenExpiresAt: string | null; services: ConnService[];
  credentials: Record<string, { set: boolean; preview: string }>;
}

const STATUS_STYLE: Record<string, string> = {
  connected: 'bg-green-100 text-green-800',
  needs_reauth: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-700',
  revoked: 'bg-gray-100 text-gray-500',
};

const PROVIDER_GLYPH: Record<string, string> = { google: 'G', meta: 'M' };

const Connections: React.FC = () => {
  const { hasPerm } = useAuth();
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

  const connectionFor = (providerKey: string) => connections.find((c) => c.provider === providerKey);

  /** Start (or extend) a connection — opens the provider consent screen. */
  const connect = async (provider: ProviderDef, services: string[]) => {
    if (!services.length) { setError('Pick at least one service to connect.'); return; }
    setError(''); setInfo(''); setBusy(provider.key);
    try {
      const redirectUri = `${window.location.origin}/panel/marketing/connections/callback`;
      const existing = connectionFor(provider.key);
      const res = await api.post(`/connectors/${provider.key}/connect`, {
        services, redirectUri, connectionId: existing?.id ?? null,
      });
      const data = payload<any>(res);
      if (!data?.url) { setError(data?.note ?? 'Could not build the consent URL.'); return; }
      // Remember where to come back to; the callback page reads this.
      sessionStorage.setItem('connector_return', window.location.pathname);
      window.location.href = data.url;
    } catch (e: any) {
      const d = e?.response?.data;
      setError(d?.note ?? d?.message ?? e.message);
    } finally { setBusy(null); }
  };

  const disconnect = async (conn: Connection, providerLabel: string) => {
    if (!window.confirm(
      `Disconnect ${providerLabel}?\n\nThis revokes the token and removes every service configured on it `
      + `(${conn.services.map((s) => s.service).join(', ') || 'none'}). Reconnecting later is a fresh consent.`)) return;
    setBusy(conn.id);
    try {
      await api.delete(`/connectors/${conn.id}`);
      setInfo(`${providerLabel} disconnected.`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const testConnection = async (conn: Connection) => {
    setBusy(conn.id); setError(''); setInfo('');
    try {
      const r = payload<any>(await api.post(`/connectors/${conn.id}/test`));
      setInfo(`Connection is live — authenticated as ${r?.identity?.email ?? r?.identity?.displayName ?? 'the connected account'}.`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  /** Load the pickable resources for a service (GA4 properties, GSC sites…). */
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
      await api.put(`/connectors/${conn.id}/services/${service}`, {
        isEnabled: true,
        externalResourceId: resource.id,
        externalResourceName: resource.name,
      });
      setPicking(null);
      setInfo(`${service.replace(/_/g, ' ')} is now using “${resource.name}”.`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const toggleService = async (conn: Connection, svc: ConnService) => {
    setBusy(`${conn.id}:${svc.service}`);
    try {
      await api.put(`/connectors/${conn.id}/services/${svc.service}`, { isEnabled: !svc.isEnabled });
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  const saveCredentials = async (conn: Connection) => {
    setBusy(conn.id);
    try {
      await api.patch(`/connectors/${conn.id}/credentials`, { credentials: credDraft });
      setCredsFor(null); setCredDraft({});
      setInfo('Credentials saved.');
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading connections…</div>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Platform Connections</h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect a provider once, then switch on the services you need. Adding a service later
          re-uses the same account — nothing already connected is disturbed.
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

      {/* Guided setup — every remaining step, in the order it must be done.
          Derived from live state so it disappears as the store completes it. */}
      {(() => {
        const steps: Array<{ text: string; done: boolean }> = [];
        for (const provider of providers) {
          const conn = connectionFor(provider.key);
          if (!conn) {
            steps.push({ text: `Connect ${provider.label} and pick the services you need`, done: false });
            continue;
          }
          if (conn.status === 'needs_reauth') {
            steps.push({ text: `Reconnect ${provider.label} — its access expired`, done: false });
          }
          for (const svc of conn.services ?? []) {
            if (!svc.isEnabled) continue;
            const def = provider.services.find((d) => d.key === svc.service);
            if (def?.resourceLabel && !svc.externalResourceId) {
              steps.push({ text: `Choose a ${def.resourceLabel} for ${provider.label} ${def.label}`, done: false });
            }
          }
          const adsOn = conn.services?.some((sv) => sv.service === 'ads' && sv.isEnabled);
          const needsDevToken = (provider.credentialFields ?? []).some(
            (f) => f.storeOnly && f.service === 'ads' && !conn.credentials?.[f.key]?.set);
          if (adsOn && needsDevToken) {
            steps.push({ text: `Add your ${provider.label} Ads developer token (Credentials)`, done: false });
          }
        }
        if (!steps.length) return null;
        return (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Finish setting up</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {steps.map((st, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-[2px] text-amber-600">○</span>
                  <span>{st.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <div className="space-y-5">
        {providers.map((provider) => {
          const conn = connectionFor(provider.key);
          const selected = selecting[provider.key] ?? [];

          return (
            <div key={provider.key} className="rounded-lg border bg-white shadow-sm">
              {/* ── Header ─────────────────────────────────────────── */}
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-700">
                    {PROVIDER_GLYPH[provider.key] ?? provider.label[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{provider.label}</h2>
                      {conn && (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[conn.status] ?? STATUS_STYLE.pending}`}>
                          {conn.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{provider.description}</p>
                    {conn?.accountEmail && (
                      <p className="mt-1 text-xs text-gray-500">Connected as {conn.accountEmail}</p>
                    )}
                    {conn?.lastError && (
                      <p className="mt-1 text-xs text-red-600">{conn.lastError}</p>
                    )}
                    {!provider.platformAppConfigured && !conn && (
                      <p className="mt-1 text-xs text-amber-700">
                        No platform-wide {provider.label} app configured — this store must supply its own
                        OAuth client id and secret before connecting.
                      </p>
                    )}
                  </div>
                </div>

                {conn && canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => testConnection(conn)} disabled={busy === conn.id}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                      Test
                    </button>
                    <button onClick={() => { setCredsFor(credsFor === conn.id ? null : conn.id); setCredDraft({}); }}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
                      Credentials
                    </button>
                    <button onClick={() => disconnect(conn, provider.label)} disabled={busy === conn.id}
                      className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              {/* ── Extra credentials (developer token, own OAuth app) ── */}
              {conn && credsFor === conn.id && (
                <div className="border-b bg-gray-50 p-5">
                  <h3 className="text-sm font-semibold">Credentials for {provider.label}</h3>
                  <p className="mt-1 text-xs text-gray-600">
                    Leave a field blank to keep its current value.
                    {provider.platformAppConfigured
                      ? ' You are connected through the platform’s app, so only the provider-specific extras below are needed.'
                      : ' No platform app is configured, so this store must supply its own OAuth client.'}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(provider.credentialFields ?? []).map((f) => {
                      const saved = conn.credentials?.[f.key];
                      return (
                        <label key={f.key} className="block">
                          <span className="text-xs font-medium text-gray-700">
                            {f.label}
                            {f.storeOnly && (
                              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                                you must supply
                              </span>
                            )}
                            {saved?.set && (
                              <em className="ml-2 not-italic text-gray-400">saved · {saved.preview}</em>
                            )}
                          </span>
                          <input type={f.secret ? 'password' : 'text'}
                            value={credDraft[f.key] ?? ''}
                            onChange={(e) => setCredDraft({ ...credDraft, [f.key]: e.target.value })}
                            placeholder={saved?.set ? '•••••• (unchanged)' : ''}
                            autoComplete="new-password"
                            className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                          {f.help && <span className="mt-1 block text-[11px] text-gray-500">{f.help}</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => saveCredentials(conn)} disabled={busy === conn.id}
                      className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => { setCredsFor(null); setCredDraft({}); }}
                      className="rounded border px-3 py-1.5 text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {/* ── Services ───────────────────────────────────────── */}
              <div className="divide-y">
                {provider.services.map((def) => {
                  const svc = conn?.services?.find((s) => s.service === def.key);
                  const pickerKey = `${conn?.id}:${def.key}`;
                  const isPicking = picking === pickerKey;
                  const needsResource = !!def.resourceLabel && svc?.isEnabled && !svc.externalResourceId;

                  return (
                    <div key={def.key} className="p-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{def.label}</span>
                            {def.readOnly && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                read only
                              </span>
                            )}
                            {svc?.externalResourceName && (
                              <span className="truncate rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
                                {svc.externalResourceName}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-gray-600">{def.description}</p>
                          {needsResource && (
                            <p className="mt-1 text-xs text-amber-700">
                              Choose a {def.resourceLabel} to activate this service.
                            </p>
                          )}
                          {svc?.lastError && <p className="mt-1 text-xs text-red-600">{svc.lastError}</p>}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {!conn && canManage && (
                            <label className="flex items-center gap-1.5 text-sm">
                              <input type="checkbox" checked={selected.includes(def.key)}
                                onChange={(e) => setSelecting({
                                  ...selecting,
                                  [provider.key]: e.target.checked
                                    ? [...selected, def.key]
                                    : selected.filter((s) => s !== def.key),
                                })} />
                              Select
                            </label>
                          )}
                          {conn && !svc && canManage && (
                            <button onClick={() => connect(provider, [def.key])} disabled={busy === provider.key}
                              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                              Add
                            </button>
                          )}
                          {conn && svc && canManage && (
                            <>
                              {def.resourceLabel && (
                                <button onClick={() => openPicker(conn, def.key)}
                                  className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
                                  {svc.externalResourceId ? 'Change' : `Choose ${def.resourceLabel}`}
                                </button>
                              )}
                              <button onClick={() => toggleService(conn, svc)}
                                disabled={busy === `${conn.id}:${def.key}`}
                                className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
                                  svc.isEnabled ? 'border' : 'bg-primary text-primary-foreground'}`}>
                                {svc.isEnabled ? 'Disable' : 'Enable'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Resource picker */}
                      {isPicking && conn && (
                        <div className="mt-3 rounded border bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                              Select a {def.resourceLabel}
                            </span>
                            <button onClick={() => setPicking(null)} className="text-xs text-gray-500">Close</button>
                          </div>
                          {!resources[pickerKey] ? (
                            <p className="text-sm text-gray-500">Loading…</p>
                          ) : resources[pickerKey].length === 0 ? (
                            <p className="text-sm text-gray-600">
                              Nothing available. Make sure the connected Google account has access to a
                              {' '}{def.resourceLabel} — then reload.
                            </p>
                          ) : (
                            <ul className="max-h-56 space-y-1 overflow-auto">
                              {resources[pickerKey].map((r) => (
                                <li key={r.id}>
                                  <button onClick={() => chooseResource(conn, def.key, r)}
                                    disabled={busy === `${conn.id}:${def.key}`}
                                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-white disabled:opacity-50 ${
                                      svc?.externalResourceId === r.id ? 'bg-white ring-1 ring-primary' : ''}`}>
                                    <span>
                                      <span className="font-medium">{r.name}</span>
                                      {r.detail && <span className="ml-2 text-xs text-gray-500">{r.detail}</span>}
                                    </span>
                                    <span className="text-xs text-gray-400">{r.id}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Connect CTA for a brand-new provider ───────────── */}
              {!conn && canManage && (
                <div className="flex items-center justify-between gap-3 border-t bg-gray-50 p-4 sm:px-5">
                  <span className="text-sm text-gray-600">
                    {selected.length
                      ? `${selected.length} service${selected.length > 1 ? 's' : ''} selected`
                      : 'Select the services you want, then connect.'}
                  </span>
                  <button onClick={() => connect(provider, selected)}
                    disabled={busy === provider.key || !selected.length}
                    className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === provider.key ? 'Opening…' : `Connect ${provider.label}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link to="/panel/marketing/connections/insights" className="text-primary hover:underline">
          View Search Console &amp; Analytics insights →
        </Link>
        <Link to="/panel/marketing/ads/ai-studio" className="text-primary hover:underline">
          Open the AI Ads Studio →
        </Link>
      </div>
    </div>
  );
};

export default Connections;
