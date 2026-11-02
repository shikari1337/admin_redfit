import React, { useEffect, useState } from 'react';
import { Chip, BlockSkeleton } from '@/components/erp';
import { messagingAPI, smsRouteCountry, type SmsRoute } from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * SMS ▸ Provider: the SMS routing table (MSG-0 §6, route 9) — which provider
 * and sender a text to each country goes out on, and whether that country can
 * be reached at all. Read-only for a store: the platform keeps the rows. A
 * country with no route falls to WhatsApp or email by the channel order.
 */
const SmsRoutes: React.FC = () => {
  const [data, setData] = useState<{ items: SmsRoute[]; default_country: string | null } | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const load = () => { setFailure(null); messagingAPI.smsRoutes().then(setData).catch((e) => setFailure(failureOf(e, 'Could not load the SMS routes.'))); };
  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="sms-routes">
      <p className="text-sm font-semibold text-ink">Routes by country</p>
      <p className="mb-3 text-xs text-ink-soft">International SMS gateways can be added later. A country with no route gets WhatsApp or email instead.</p>
      {failure?.gap ? <GapNotice what="The SMS routing table (GET /comms/sms/routes) is not on this server yet." />
        : failure ? <ErrorNotice message={failure.message} onRetry={load} />
          : !data ? <BlockSkeleton lines={3} /> : data.items.length === 0 ? <p className="text-xs text-ink-soft">No SMS route is set for this store.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <tr><th scope="col" className="py-1.5 pr-3">Country</th><th scope="col" className="py-1.5 pr-3">Provider</th><th scope="col" className="py-1.5 pr-3">Sender</th><th scope="col" className="py-1.5 pr-3">Account</th><th scope="col" className="py-1.5">Reachable</th></tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={`${r.country}:${r.provider ?? ''}`} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-3 text-ink">{smsRouteCountry(r.country)}{data.default_country === r.country && <span className="ml-1 text-xs text-ink-mute" title="A phone number typed without a country code is read as this country’s.">(home country)</span>}</td>
                      <td className="py-1.5 pr-3 text-ink-soft">{r.provider || '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-ink-soft">{r.sender || '—'}</td>
                      <td className="py-1.5 pr-3 text-ink-soft">{r.source === 'own' ? 'Your own' : r.source === 'growcord' ? 'Growcord’s' : '—'}</td>
                      <td className="py-1.5">{r.reachable ? <Chip tone="green">Yes</Chip> : <Chip tone="neutral">No route</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
};

export default SmsRoutes;
