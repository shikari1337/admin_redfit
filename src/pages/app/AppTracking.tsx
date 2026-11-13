import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { Page, PageHeader, SectionCard, StatusChip } from '@/components/erp';
import { ConfirmDialog, ErrorNote, Loading, Notice, OnOff, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { META_ROUTES, connectionsHref } from '@/pages/panels/marketing/meta/routes';
import { codeLabel } from '@/lib/v2/appSettings';
import { getAppEventDestinations, setAppEventDestination, type AppEventDestination } from '@/lib/v2/appGrowth';

/**
 * APP TRACKING AND INTEGRATIONS (owner, 13 Nov 2026; HMAPP-3 point 7): everything a customer does in
 * the app is recorded on the store's own server. Forwarding the app's events to an ad platform is a
 * switch per destination, off by default; the server sends only once the store's account there is
 * connected, and only for customers whose consent allows it. Health data never goes to any of them.
 *
 * Server: lane BB, `GET /api/v2/marketing/app-events/destinations` (`settings.read`, module
 * connectors) and `PUT .../destinations/{key}` `{enabled}` (`settings.manage`, a person). The list is
 * the backend's own (Meta and Google Ads today; GA4 is not offered), with what each sends, what the
 * store still lacks (`missing`) and the steps outside the backend, all in the server's words.
 * Connecting an account stays where it is today: the Meta pages, or Google's tab on Connections.
 */

/** What the server says is missing (`missing` codes, `api/app_destinations.rs`), in words, and where it is fixed. */
const MISSING: Record<string, { words: string; to: string }> = {
  meta_pixel: { words: 'The store\'s Meta pixel is not set up.', to: META_ROUTES.setup },
  google_ads_connection: { words: 'Google is not connected with its Ads service.', to: connectionsHref('google') },
  google_ads_developer_token: { words: 'The Google Ads developer token is not set.', to: connectionsHref('google') },
  server_conversion_action: { words: 'No Google Ads conversion action is chosen for server uploads.', to: connectionsHref('google') },
};

const missingOf = (code: string) => MISSING[code] ?? { words: `${codeLabel(code)} is missing.`, to: connectionsHref() };

/** The account's page for a destination with nothing missing. */
const accountHref = (d: AppEventDestination) => (d.key === 'meta' ? META_ROUTES.setup : connectionsHref(d.key.startsWith('google') ? 'google' : d.key));

function stateOf(d: AppEventDestination): { status: string; label: string } {
  if (d.sending) return { status: 'active', label: 'Sending' };
  if (d.enabled) return { status: 'pending', label: 'On, waiting for the account' };
  if (d.ready) return { status: 'inactive', label: 'Account connected' };
  return { status: 'inactive', label: 'Not connected' };
}

const AppTracking: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const canSeeConnections = hasPerm('marketing.read');
  const data = useLoad(getAppEventDestinations, []);
  const [asking, setAsking] = useState<AppEventDestination | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const save = async (d: AppEventDestination, on: boolean) => {
    setBusy(d.key); setError(null);
    try {
      await setAppEventDestination(d.key, on);
      setAsking(null);
      await data.reload();
    } catch (e) { setError(e); } finally { setBusy(null); }
  };

  const list = data.data;
  const off = whyDisabled(canSave, []);

  return (
    <Page>
      <PageHeader
        icon={Radar}
        title="App tracking and integrations"
        description="What customers do in the app is recorded on your own server. Forwarding it to an ad platform is your choice, one switch each, off until you turn it on."
      />
      <Notice tone="info" title="Health data never leaves">
        No remedy searched, no doctor's slip and no answer about health is sent to any company below, whatever is switched on. Only shop events go, such as a product viewed, added to the bag or bought, and only for customers whose consent allows it.
      </Notice>
      {error && !asking ? <ErrorNote error={error} /> : null}

      {data.loading && !list ? <Loading label="Reading the destinations" /> : data.error ? (
        <ErrorNote error={data.error} what="App tracking and integrations" onRetry={() => void data.reload()} />
      ) : list ? (
        <>
          <SectionCard title="Where app events may go" description="Each ad platform the server can forward the app's events to. A switch turned on before the account is connected is kept, and nothing is sent until it is.">
            {list.destinations.length === 0 ? (
              <p className="text-sm text-gray-600">The server lists no destination. Every app event stays on your own server.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {list.destinations.map((d) => {
                  const st = stateOf(d);
                  return (
                    <li key={d.key} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{d.label}</span>
                          <StatusChip status={st.status} label={st.label} />
                          {canSeeConnections && d.ready && (
                            <Link to={accountHref(d)} className="text-xs text-blue-700 underline">See the account</Link>
                          )}
                        </div>
                        <OnOff on={d.enabled} label={`Send app events to ${d.label}`} disabled={!!off} title={off ?? undefined}
                          busy={busy === d.key}
                          onToggle={() => { setError(null); if (d.enabled) void save(d, false); else setAsking(d); }} />
                      </div>
                      {d.missing.length > 0 && (
                        <ul className="space-y-0.5 text-sm text-amber-800">
                          {d.missing.map((code) => {
                            const m = missingOf(code);
                            return (
                              <li key={code}>
                                {m.words}{' '}
                                {canSeeConnections && <Link to={m.to} className="text-blue-700 underline">Set it up</Link>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {d.sends.length > 0 && (
                        <p className="text-xs text-gray-600">Sends: {d.sends.join('; ')}.</p>
                      )}
                      {d.steps.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-500">
                          {d.steps.map((s) => <li key={s}>{s}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {off && <p className="mt-3 text-xs text-gray-500">{off}</p>}
            <p className="mt-3 text-xs text-gray-500">
              Google Analytics is not offered for the app: its app reports need the Firebase kit, which the app does not carry.
            </p>
          </SectionCard>

          {list.never_sent.length > 0 && (
            <SectionCard title="Never sent to any of them" description="Whatever is switched on above.">
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                {list.never_sent.map((w) => <li key={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</li>)}
              </ul>
            </SectionCard>
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={!!asking}
        title={asking ? `Send app events to ${asking.label}?` : ''}
        confirmLabel="Turn on"
        busy={!!busy}
        onClose={() => { if (!busy) { setAsking(null); setError(null); } }}
        onConfirm={() => { if (asking) void save(asking, true); }}
      >
        {asking && asking.sends.length > 0
          ? <p>The server sends: {asking.sends.join('; ')}.</p>
          : <p>The server forwards shop events from the app to this company from now on.</p>}
        {asking && !asking.ready && <p>The account is not connected yet, so nothing is sent until it is.</p>}
        {asking && asking.steps.length > 0 && <p>Also needed outside Growcord: {asking.steps.join('; ')}.</p>}
        <p>Health data is never sent. You can turn it off here at any time.</p>
        {error ? <ErrorNote error={error} /> : null}
      </ConfirmDialog>
    </Page>
  );
};

export default AppTracking;
