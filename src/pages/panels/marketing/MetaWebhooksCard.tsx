import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * Meta ▸ Webhooks & notifications — what this store's Meta connection is
 * receiving (backend GET /connectors/meta/webhooks, migration 208).
 *
 * "Assets" are the Pages, Instagram accounts, ad accounts and catalogs this
 * store picked; each Page must install the Growcord app before Meta sends
 * anything about it (or its Instagram account), so the install result and
 * Meta's own refusal reason are shown per Page. "Recent notifications" is the
 * store's slice of every delivery: lead forms (→ CRM), comments, reviews, ad
 * issues, catalog batch results.
 */

interface Route {
  id: string; asset_type: string; asset_id: string; asset_name: string | null; source: string;
  subscription_status: string; subscription_error: string | null; subscribed_fields: string[];
  is_active: boolean; last_event_at: string | null;
}
interface EventRow {
  id: string; object: string; field: string; status: string; detail: string | null;
  summary: string; received_at: string;
}

const TONE: Record<string, string> = {
  processed: 'bg-green-100 text-green-800',
  recorded: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-800',
  unrouted: 'bg-amber-100 text-amber-800',
  received: 'bg-blue-100 text-blue-800',
  ignored: 'bg-gray-100 text-gray-500',
  subscribed: 'bg-green-100 text-green-800',
  not_needed: 'bg-gray-100 text-gray-500',
  pending: 'bg-blue-100 text-blue-800',
};

const ASSET_LABEL: Record<string, string> = {
  page: 'Facebook Page', instagram: 'Instagram', ad_account: 'Ad account', catalog: 'Catalog', user: 'Connected by',
};

const MetaWebhooksCard: React.FC<{ canManage: boolean; refreshKey?: unknown }> = ({ canManage, refreshKey }) => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = payload<any>(await api.get('/connectors/meta/webhooks', { params: { limit: 25 } }));
      setRoutes(data?.routes ?? []);
      setEvents(data?.events ?? []);
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.message ?? e.message });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const resync = async () => {
    setBusy(true); setMessage(null);
    try {
      const data = payload<any>(await api.post('/connectors/meta/webhooks/resync'));
      const failed = (data?.results ?? []).filter((r: any) => r.subscription && !r.subscription.ok);
      setMessage(failed.length
        ? { ok: false, text: failed.map((r: any) => `${r.resource}: ${r.subscription.error}`).join(' · ') }
        : { ok: true, text: 'Every picked Page has the Growcord app installed and is routed to this store.' });
      setRoutes(data?.routes ?? []);
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.message ?? e.message });
    } finally { setBusy(false); }
  };

  const active = routes.filter((r) => r.is_active && r.asset_type !== 'user');

  return (
    <div className="border-t p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Webhooks &amp; notifications</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Meta tells Growcord the moment something happens on the assets you picked — lead forms go
            straight into the CRM; comments, reviews, ad issues and catalog results are listed here.
          </p>
        </div>
        {canManage && (
          <button onClick={resync} disabled={busy}
            className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
            {busy ? 'Checking…' : 'Re-check Page installs'}
          </button>
        )}
      </div>

      {message && (
        <div className={`mt-3 rounded border px-3 py-2 text-xs ${message.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assets receiving updates</h4>
            {!active.length ? (
              <p className="mt-1 text-sm text-gray-500">
                None yet — choose a Page, Instagram account, ad account or catalog on a service above.
              </p>
            ) : (
              <ul className="mt-1 divide-y rounded border">
                {active.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-gray-500">{ASSET_LABEL[r.asset_type] ?? r.asset_type}</span>{' '}
                      <span className="font-medium">{r.asset_name ?? r.asset_id}</span>
                      <span className="ml-2 text-xs text-gray-400">via {r.source.replace(/_/g, ' ')}</span>
                      {r.subscription_error && <p className="mt-0.5 text-xs text-red-600">{r.subscription_error}</p>}
                      {r.subscription_status === 'subscribed' && !!r.subscribed_fields?.length && (
                        <p className="mt-0.5 text-[11px] text-gray-500">{r.subscribed_fields.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${TONE[r.subscription_status] ?? TONE.recorded}`}>
                        {r.subscription_status === 'subscribed' ? 'app installed'
                          : r.subscription_status === 'not_needed' ? 'routed' : r.subscription_status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-400">
                        {r.last_event_at ? `last update ${new Date(r.last_event_at).toLocaleString()}` : 'no update yet'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent notifications</h4>
            {!events.length ? (
              <p className="mt-1 text-sm text-gray-500">Nothing received yet.</p>
            ) : (
              <ul className="mt-1 divide-y rounded border">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{e.summary}</span>
                      <span className="ml-2 text-xs text-gray-400">{e.object}.{e.field}</span>
                      {e.detail && e.detail !== e.summary && <p className="mt-0.5 text-xs text-gray-600">{e.detail}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${TONE[e.status] ?? TONE.recorded}`}>{e.status}</span>
                      <span className="text-gray-400">{new Date(e.received_at).toLocaleString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MetaWebhooksCard;
