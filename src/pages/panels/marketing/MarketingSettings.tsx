import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Marketing settings: consent policy, default UTM, push (VAPID/FCM) config,
 * and links to channel provider credentials (their existing homes).
 */
const MarketingSettings: React.FC = () => {
  const { hasPerm } = useAuth();
  const [data, setData] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [push, setPush] = useState<any>({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    const r = await api.get('/marketing-hub/settings');
    setData(payload(r));
    setPolicy(payload(r).policy);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, []);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  if (!data) return <div className="p-6 text-sm text-gray-400">{error || 'Loading…'}</div>;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Marketing Settings</h1>
        <p className="text-sm text-gray-500">Consent policy, tracking defaults, push configuration and channel credentials.</p>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {/* Consent policy */}
      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <div className="font-semibold">Consent policy (GDPR / DPDP)</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={policy?.requireConsent !== false}
            disabled={!hasPerm('marketing.manage')}
            onChange={(e) => setPolicy({ ...policy, requireConsent: e.target.checked })} />
          Require recorded opt-in consent for marketing sends (email/SMS/WhatsApp)
        </label>
        {policy?.requireConsent === false && (
          <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠ Disabling consent filtering may violate GDPR / the DPDP Act for contacts in covered regions.
            Sharing data with ad platforms ALWAYS requires user consent + admin approval — that gate cannot be disabled.
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-3">
          {['utm_source', 'utm_medium'].map((k) => (
            <label key={k} className="text-sm">Default {k}
              <input value={policy?.defaultUtm?.[k] ?? ''}
                disabled={!hasPerm('marketing.manage')}
                onChange={(e) => setPolicy({ ...policy, defaultUtm: { ...policy.defaultUtm, [k]: e.target.value } })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-sm">Frequency cap / contact / 7 days <span className="text-gray-400">(0 = off)</span>
            <input type="number" min={0} value={policy?.maxPerContact7d ?? 3}
              disabled={!hasPerm('marketing.manage')}
              onChange={(e) => setPolicy({ ...policy, maxPerContact7d: Number(e.target.value) })}
              className="mt-1 w-full rounded border px-2 py-1.5" />
          </label>
          <label className="text-sm">Quiet hours (SMS/WhatsApp promos)
            <div className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={policy?.quietHours?.enabled !== false}
                disabled={!hasPerm('marketing.manage')}
                onChange={(e) => setPolicy({ ...policy, quietHours: { ...policy.quietHours, enabled: e.target.checked } })} />
              <input type="number" min={0} max={23} value={policy?.quietHours?.startHour ?? 21}
                onChange={(e) => setPolicy({ ...policy, quietHours: { ...policy.quietHours, startHour: Number(e.target.value) } })}
                className="w-16 rounded border px-2 py-1.5" />
              <span className="text-xs">to</span>
              <input type="number" min={0} max={23} value={policy?.quietHours?.endHour ?? 10}
                onChange={(e) => setPolicy({ ...policy, quietHours: { ...policy.quietHours, endHour: Number(e.target.value) } })}
                className="w-16 rounded border px-2 py-1.5" />
              <span className="text-xs text-gray-400">IST (TRAI DND 21–10)</span>
            </div>
          </label>
          <label className="text-sm">Monthly marketing budget ₹ <span className="text-gray-400">(pacing on Performance)</span>
            <input type="number" min={0} value={policy?.budgets?.monthly_total ?? 0}
              disabled={!hasPerm('marketing.manage')}
              onChange={(e) => setPolicy({ ...policy, budgets: { ...policy.budgets, monthly_total: Number(e.target.value) } })}
              className="mt-1 w-full rounded border px-2 py-1.5" />
          </label>
          <label className="text-sm">Ads budget ₹ / month
            <input type="number" min={0} value={policy?.budgets?.ads ?? 0}
              disabled={!hasPerm('marketing.manage')}
              onChange={(e) => setPolicy({ ...policy, budgets: { ...policy.budgets, ads: Number(e.target.value) } })}
              className="mt-1 w-full rounded border px-2 py-1.5" />
          </label>
        </div>
        {hasPerm('marketing.manage') && (
          <button onClick={() => act(async () => {
            await api.put('/marketing-hub/settings/policy', policy);
            setInfo('Policy saved.');
          })} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Save policy
          </button>
        )}
      </div>

      {/* Push */}
      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <div className="font-semibold">
          Web push
          <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${data.push.vapid_configured || data.push.fcm_configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {data.push.vapid_configured ? 'VAPID configured' : data.push.fcm_configured ? 'FCM configured' : 'not configured'}
          </span>
          <span className="ml-2 text-xs font-normal text-gray-500">{data.push.subscribers} subscribers</span>
        </div>
        <p className="text-xs text-gray-500">
          Option A (recommended): install <code>web-push</code> in backend/ and save VAPID keys
          (generate with <code>npx web-push generate-vapid-keys</code>). Option B: save an FCM server key.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-sm">VAPID public key
            <input value={push.vapid_public_key ?? data.push.vapid_public_key ?? ''}
              onChange={(e) => setPush({ ...push, vapid_public_key: e.target.value })}
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" />
          </label>
          <label className="text-sm">VAPID private key
            <input type="password" value={push.vapid_private_key ?? ''}
              onChange={(e) => setPush({ ...push, vapid_private_key: e.target.value })}
              placeholder={data.push.vapid_configured ? '(saved)' : ''}
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" />
          </label>
          <label className="text-sm">VAPID subject (mailto:)
            <input value={push.vapid_subject ?? ''} onChange={(e) => setPush({ ...push, vapid_subject: e.target.value })}
              placeholder="mailto:admin@yourstore.com"
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" />
          </label>
          <label className="text-sm">FCM server key (fallback)
            <input type="password" value={push.fcm_server_key ?? ''}
              onChange={(e) => setPush({ ...push, fcm_server_key: e.target.value })}
              placeholder={data.push.fcm_configured ? '(saved)' : ''}
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" />
          </label>
        </div>
        {hasPerm('marketing.manage') && (
          <button onClick={() => act(async () => {
            await api.put('/marketing-hub/settings/push', push);
            setPush({}); setInfo('Push settings saved.');
          })} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Save push settings
          </button>
        )}
      </div>

      {/* Channel credentials — existing homes */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">Channel providers</div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <Link className="rounded border p-3 hover:bg-gray-50" to="/settings/api-integrations">
            WhatsApp / Email (SMTP) / Meta pixel credentials → <b>API Integrations</b>
          </Link>
          <Link className="rounded border p-3 hover:bg-gray-50" to="/settings/sms-templates">
            SMS & WhatsApp operational templates (order updates, OTP) → <b>SMS / WhatsApp Templates</b>
          </Link>
          <Link className="rounded border p-3 hover:bg-gray-50" to="/settings/wallet">
            Campaign billing balance → <b>Wallet</b>
          </Link>
          <Link className="rounded border p-3 hover:bg-gray-50" to="/channels">
            Product feeds for Shopping/Catalog ads → <b>Multi-Channel Sync</b>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MarketingSettings;
