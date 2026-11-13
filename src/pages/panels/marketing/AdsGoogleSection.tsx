/**
 * Google Ads on the Ad accounts page (lane MENU-1 ads). Conversion tracking first: whether the store's sales and
 * shopping steps are counted on Google Ads, and the one button that sets it up (`POST /ads/google/reconcile`, a
 * person's click; the old screen ran it on every visit). Then the live campaigns of the connected customer with a
 * person's pause, resume and daily budget (`/google/ads/*`). Nothing here creates a campaign or an ad.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import { adsGoogleApi, type GoogleCampaign, type GoogleMeasurement } from '@/lib/v2/areas/ads';
import { Figure, LoadFailure, Section, StateChip, linkCls, moneyMajor, num, plural, useLoad, writeError, type Failure, type Tone } from './meta/common';
import { connectionsHref } from './meta/routes';
import { humanize, roasText } from './meta/ads/shared';

/** Google's campaign states in plain words (anything else is shown as Google wrote it). */
const STATUS_WORD: Record<string, [string, Tone]> = {
  ENABLED: ['Running', 'good'],
  PAUSED: ['Paused', 'neutral'],
  REMOVED: ['Removed', 'neutral'],
};

const statusOf = (s: string): [string, Tone] => STATUS_WORD[s] ?? [humanize(s) || 'Unknown', 'warn'];

/** The tracking state in one line, for the section and the page's lead. */
export function trackingLine(m: GoogleMeasurement): string {
  const total = m.events.length + m.missing_events.length;
  if (!m.connected) return 'Google Ads is not connected.';
  if (!m.managed) return 'Google Ads does not count your sales or shopping steps yet.';
  if (m.missing_events.length) return `${m.events.length} of ${total} store events report to Google Ads.`;
  return `All ${total} store events report to Google Ads.`;
}

export const AdsGoogleSection: React.FC<{
  measurement: GoogleMeasurement | null;
  failure: Failure | null;
  onRetry: () => void;
  onSetUp: () => void;
  settingUp: boolean;
  canManage: boolean;
}> = ({ measurement: m, failure, onRetry, onSetUp, settingUp, canManage }) => {
  const [days, setDays] = useState<7 | 30>(30);
  const connected = !!m?.connected;
  const list = useLoad(() => (connected ? adsGoogleApi.campaigns(days) : Promise.resolve(null)), [connected, days]);

  const setUpButton = canManage && connected && (
    <Button size="sm" variant={m?.managed ? 'outline' : 'default'} onClick={onSetUp} disabled={settingUp}>
      {settingUp && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
      {m?.managed ? 'Check again' : 'Set up conversion tracking'}
    </Button>
  );

  return (
    <Section
      title="Google Ads"
      hint="Conversion tracking, then your live Google Ads campaigns."
      actions={setUpButton || undefined}
    >
      {failure && !m ? <LoadFailure failure={failure} what="Google Ads conversion tracking (GET /api/v2/marketing/ads/google/measurement)" onRetry={onRetry} />
        : !m ? <p className="text-sm text-gray-500">Loading...</p>
        : !connected ? (
          <div className="space-y-2 text-sm text-gray-700">
            <p>{m.note ? `Google Ads is not ready: ${m.note}` : 'Google Ads is not connected.'}</p>
            <p>
              Connect Google and pick its Ads customer in{' '}
              <Link className={linkCls} to={connectionsHref('google')}>Platform Connections</Link>. It shows here on its own.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StateChip tone={m.managed && !m.missing_events.length ? 'good' : 'warn'}>
                {m.managed ? 'Tracking on' : 'Tracking not set up'}
              </StateChip>
              <span className="text-gray-700">{trackingLine(m)}</span>
            </div>
            {m.managed ? (
              <ul className="space-y-1 text-sm text-gray-600">
                <li>Website tag: <span className="font-mono text-gray-900">{m.conversion_id}</span>, loaded only for visitors who allow marketing cookies.</li>
                <li>{m.server_action ? 'Confirmed orders are also sent from the server, so a sale is counted even when the browser blocks the tag.' : 'Confirmed orders are not sent from the server yet. Pick an upload conversion action on the Google connection.'}</li>
                {m.missing_events.length > 0 && (
                  <li>No action yet for: {m.missing_events.map((e) => humanize(e)).join(', ')}. Press Check again to add them.</li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">
                Setting it up creates one conversion action per store event (product view, add to cart, checkout steps,
                purchase, lead, sign up, search) on your Google Ads account and adds its tag to your website. It changes no
                campaign, budget or ad. {canManage ? '' : 'Ask someone with the ads manage permission to press it.'}
              </p>
            )}
            <GoogleCampaignList
              data={list.data}
              failure={list.error}
              loading={list.loading}
              onRetry={list.reload}
              days={days}
              setDays={setDays}
              canManage={canManage}
            />
          </div>
        )}
    </Section>
  );
};

const GoogleCampaignList: React.FC<{
  data: { currency: string; rows: GoogleCampaign[] } | null;
  failure: Failure | null;
  loading: boolean;
  onRetry: () => void;
  days: 7 | 30;
  setDays: (d: 7 | 30) => void;
  canManage: boolean;
}> = ({ data, failure, loading, onRetry, days, setDays, canManage }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [budget, setBudget] = useState<{ id: string; value: string } | null>(null);
  const cur = data?.currency || 'INR';
  const rows = data?.rows ?? [];
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const conversions = rows.reduce((s, r) => s + r.conversions, 0);
  const running = rows.filter((r) => r.status === 'ENABLED').length;
  const losing = rows.filter((r) => r.spend > 0 && r.revenue < r.spend).length;

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await fn(); toast({ title: done }); onRetry(); }
    catch (e) { toast({ title: 'Google Ads refused', description: writeError(e, 'The change was not made.'), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  const toggle = (c: GoogleCampaign) => {
    const resume = c.status !== 'ENABLED';
    const ask = resume
      ? `Resume "${c.name}"? It can spend up to ${moneyMajor(c.daily_budget, cur)} a day from now.`
      : `Pause "${c.name}"? It stops showing and spending until you resume it.`;
    if (!window.confirm(ask)) return;
    run(`status:${c.id}`, () => adsGoogleApi.setStatus(c.id, resume ? 'ENABLED' : 'PAUSED'), resume ? 'Campaign resumed' : 'Campaign paused');
  };

  const saveBudget = (c: GoogleCampaign) => {
    if (!budget) return;
    const minor = majorToMinor(budget.value, cur);
    if (minor === null || minor <= 0) { toast({ title: 'Enter a daily budget above zero', variant: 'destructive' }); return; }
    const amount = minorToMajor(minor, cur);
    if (!window.confirm(`Set the daily budget of "${c.name}" to ${moneyMajor(amount, cur)}?`)) return;
    run(`budget:${c.id}`, async () => { await adsGoogleApi.setBudget(c.id, amount, cur); setBudget(null); }, 'Daily budget changed');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Campaigns, last {days} days</h3>
        <div className="flex gap-1" role="group" aria-label="Window">
          {([7, 30] as const).map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>{d} days</Button>
          ))}
        </div>
      </div>
      {failure && !data ? <LoadFailure failure={failure} what="Google Ads campaigns (GET /api/v2/marketing/google/ads/campaigns)" onRetry={onRetry} />
        : loading && !data ? <p className="text-sm text-gray-500">Loading campaigns...</p>
        : !rows.length ? <p className="text-sm text-gray-500">No Google Ads campaigns ran in these {days} days.</p>
        : (
          <>
            {losing > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {plural(losing, 'campaign')} spent more than the sales value it brought in. Check them first.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Running" value={`${num(running)} of ${num(rows.length)}`} />
              <Figure label="Spend" value={moneyMajor(spend, cur)} />
              <Figure label="Sales value" value={moneyMajor(revenue, cur)} />
              <Figure label="Return" value={roasText(spend > 0 ? revenue / spend : null)} tone={spend > 0 && revenue < spend ? 'bad' : 'neutral'} sub={`${num(Math.round(conversions))} conversions`} />
            </div>
            <ul className="divide-y rounded-lg border">
              {rows.map((c) => {
                const [word, tone] = statusOf(c.status);
                const editing = budget?.id === c.id;
                return (
                  <li key={c.id} className="space-y-2 px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 break-words font-medium text-gray-900">{c.name}</span>
                      <StateChip tone={tone}>{word}</StateChip>
                      {c.channel_type && <span className="text-xs text-gray-500">{humanize(c.channel_type)}</span>}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                      <div><dt className="text-xs text-gray-500">Daily budget</dt><dd className="tabular-nums">{moneyMajor(c.daily_budget, cur)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Spend</dt><dd className="tabular-nums">{moneyMajor(c.spend, cur)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Clicks</dt><dd className="tabular-nums">{num(c.clicks)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Conversions</dt><dd className="tabular-nums">{num(Math.round(c.conversions * 100) / 100)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Return</dt><dd className="tabular-nums">{roasText(c.spend > 0 ? c.revenue / c.spend : null)}</dd></div>
                    </dl>
                    {canManage && c.status !== 'REMOVED' && (
                      editing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`budget-${c.id}`}>Daily budget in {cur}</label>
                          <Input id={`budget-${c.id}`} type="number" inputMode="decimal" min={0} className="h-8 w-36"
                            value={budget?.value ?? ''} onChange={(e) => setBudget({ id: c.id, value: e.target.value })} />
                          <span className="text-xs text-gray-500">{cur} a day</span>
                          <Button size="sm" onClick={() => saveBudget(c)} disabled={busy === `budget:${c.id}`}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setBudget(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => toggle(c)} disabled={busy === `status:${c.id}`}>
                            {c.status === 'ENABLED' ? 'Pause' : 'Resume'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setBudget({ id: c.id, value: String(c.daily_budget || '') })}>
                            Change budget
                          </Button>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </div>
  );
};

export default AdsGoogleSection;
