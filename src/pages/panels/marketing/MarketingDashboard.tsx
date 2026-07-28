import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/** Marketing panel home — hub KPIs + quick links (GET /marketing-hub/overview). */
const MarketingDashboard: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const [data, setData] = useState<any>(null);
  const [doctor, setDoctor] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/marketing-hub/overview')
      .then((r) => setData(payload(r)))
      .catch((e) => setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message));
    api.get('/marketing-hub/doctor')
      .then((r) => setDoctor(payload(r)))
      .catch(() => {});
  }, []);

  const tiles: Array<{ label: string; value: any; sub?: string }> = data ? [
    { label: 'Campaigns (30d)', value: data.campaigns_30d, sub: `${data.campaigns_total} all-time · ${data.campaigns_active} active` },
    { label: 'Messages sent (30d)', value: data.messages_30d, sub: `₹${Number(data.spend_30d ?? 0).toFixed(2)} spend` },
    { label: 'Approved templates', value: data.templates_approved, sub: `${data.templates_pending} pending approval` },
    { label: 'Audience lists', value: data.lists_total, sub: `${data.consented_contacts} consented contacts` },
    { label: 'Active automations', value: data.automations_active, sub: `${data.automations_30d} runs (30d)` },
    { label: 'Push subscribers', value: data.push_subscribers },
    { label: 'Ad campaigns active', value: data.ads_active, sub: `${data.ad_accounts} connected accounts` },
    { label: 'Ad spend (tracked)', value: `₹${Number(data.ads_spend ?? 0).toFixed(0)}` },
  ] : [];

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Marketing</h1>
        <p className="text-sm text-gray-500">
          Campaigns, templates, audiences, automation, ads and analytics — consent-first (GDPR/DPDP).
        </p>
      </div>
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <div className="mt-1 text-xs">
            If this says a table is missing or the module is disabled: restart the backend (migrations
            auto-apply at boot) and check Settings → Modules, then reload.
          </div>
        </div>
      )}

      {doctor && !doctor.ok && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-1 text-sm font-semibold text-amber-900">Setup checklist — fix these to get everything working</div>
          <ul className="space-y-1 text-sm text-amber-800">
            {doctor.checks.filter((c: any) => !c.ok).map((c: any) => (
              <li key={c.key}>✗ <b>{c.message}</b>{c.fix ? <> — {c.fix}</> : null}</li>
            ))}
          </ul>
          <div className="mt-1 text-xs text-amber-700">
            {doctor.checks.filter((c: any) => c.ok).length} of {doctor.checks.length} checks passing.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">{t.label}</div>
            <div className="mt-1 text-2xl font-bold">{t.value ?? '—'}</div>
            {t.sub && <div className="mt-0.5 text-xs text-gray-400">{t.sub}</div>}
          </div>
        ))}
        {!data && !error && <div className="col-span-4 p-6 text-center text-sm text-gray-400">Loading…</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {hasPerm('marketing.manage') && (
          <Link to="/panel/marketing/campaigns" className="rounded-lg border bg-white p-4 shadow-sm hover:bg-gray-50">
            <div className="font-semibold">New campaign →</div>
            <div className="text-sm text-gray-500">SMS · WhatsApp · Email · Push, sent with approved templates only.</div>
          </Link>
        )}
        {hasPerm('marketing.manage') && (
          <Link to="/panel/marketing/audiences" className="rounded-lg border bg-white p-4 shadow-sm hover:bg-gray-50">
            <div className="font-semibold">Build an audience →</div>
            <div className="text-sm text-gray-500">CRM leads, contacts, B2B/B2C customers, or CSV import.</div>
          </Link>
        )}
        {canAccess('ads_management') && hasPerm('ads.read') && (
          <Link to="/panel/marketing/ads" className="rounded-lg border bg-white p-4 shadow-sm hover:bg-gray-50">
            <div className="font-semibold">Ads manager →</div>
            <div className="text-sm text-gray-500">Google, Meta, Snapchat, Shopping & remarketing.</div>
          </Link>
        )}
      </div>

      {data?.templates_pending > 0 && hasPerm('marketing.approve') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {data.templates_pending} template{data.templates_pending > 1 ? 's' : ''} waiting for your approval —{' '}
          <Link to="/panel/marketing/templates" className="font-medium underline">review now</Link>.
        </div>
      )}
    </div>
  );
};

export default MarketingDashboard;
