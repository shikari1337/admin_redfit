import React, { useEffect, useMemo, useState } from 'react';
import { Chip, BlockSkeleton } from '@/components/erp';
import { useCountries } from '@/lib/v2/reference';
import { messagingAPI, smsRouteCountry, type SmsRoute } from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * SMS, Provider tab: the SMS routing table (MSG-0 §6, route 9). Which provider
 * and sender a text to each country goes out on, whether that country can be
 * reached at all, and the provider's rule in its own words. Read-only for a
 * store: the platform keeps the rows. A country with no route falls to
 * WhatsApp or email by the channel order. Country names come from the
 * reference list (`useCountries`), never typed here.
 */
const SmsRoutes: React.FC = () => {
  const [data, setData] = useState<{ items: SmsRoute[]; default_country: string | null } | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const countries = useCountries();
  const load = () => { setFailure(null); messagingAPI.smsRoutes().then(setData).catch((e) => setFailure(failureOf(e, 'Could not load the SMS routes.'))); };
  useEffect(() => { load(); }, []);

  const nameOf = useMemo(() => {
    const by = new Map(countries.map((c) => [c.code.toUpperCase(), c.name]));
    return (code: string) => (code === '*' ? smsRouteCountry(code) : by.get(code.toUpperCase()) ?? smsRouteCountry(code));
  }, [countries]);
  const rules = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of data?.items ?? []) if (r.provider && r.rule && !seen.has(r.provider)) seen.set(r.provider, r.rule);
    return [...seen.entries()];
  }, [data]);
  const reachable = (data?.items ?? []).filter((r) => r.reachable);

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="sms-routes">
      <p className="text-sm font-semibold text-ink">Routes by country</p>
      <p className="mb-3 text-xs text-ink-soft">
        {data && data.items.length > 0
          ? reachable.length > 0
            ? `SMS reaches numbers in ${reachable.map((r) => nameOf(r.country)).join(', ')}. Any other country gets WhatsApp or email instead.`
            : 'No country can be reached by SMS right now. Messages go by WhatsApp or email instead.'
          : 'A country with no route gets WhatsApp or email instead.'}
      </p>
      {failure?.gap ? <GapNotice what="The SMS routing table (GET /comms/sms/routes) is not on this server yet." />
        : failure ? <ErrorNotice message={failure.message} onRetry={load} />
          : !data ? <BlockSkeleton lines={3} /> : data.items.length === 0 ? <p className="text-xs text-ink-soft">No SMS route is set for this store.</p> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    <tr><th scope="col" className="py-1.5 pr-3">Country</th><th scope="col" className="py-1.5 pr-3">Provider</th><th scope="col" className="py-1.5 pr-3">Sender</th><th scope="col" className="py-1.5 pr-3">Account</th><th scope="col" className="py-1.5">Reachable</th></tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={`${r.country}:${r.provider ?? ''}`} className="border-b border-line last:border-0">
                        <td className="py-1.5 pr-3 text-ink">{nameOf(r.country)}{data.default_country === r.country && <span className="ml-1 text-xs text-ink-mute" title="A phone number typed without a country code is read as this country's.">(home country)</span>}</td>
                        <td className="py-1.5 pr-3 text-ink-soft">{r.provider || 'None'}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-ink-soft">{r.sender || <span className="font-sans">Not set</span>}</td>
                        <td className="py-1.5 pr-3 text-ink-soft">{r.source === 'own' ? 'Your own' : r.source === 'growcord' ? 'Growcord\'s' : 'None'}</td>
                        <td className="py-1.5">{r.reachable ? <Chip tone="green">Yes</Chip> : <Chip tone="neutral">No route</Chip>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rules.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {rules.map(([provider, rule]) => (
                    <li key={provider} className="text-[11px] text-ink-soft"><span className="font-medium text-ink">{provider}:</span> {rule}</li>
                  ))}
                </ul>
              )}
            </>
          )}
    </div>
  );
};

export default SmsRoutes;
