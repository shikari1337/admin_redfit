/**
 * Events health (`/panel/marketing/meta/events`, lane META-15B; routes META-16 `api/meta_events.rs`): what Meta received
 * from the store's pixel and server per store day and event, how much of it was deduplicated, Meta's match quality and
 * its own diagnostics, what our server sent or failed to send, the last error, "Read from Meta now", the test event
 * code and the two switches of the `metaPixel` setting (business events, product level events, EVT-05).
 *
 * One pixel id (EVT-08): the page reads and writes `metaPixel.pixelId` only; an id still kept under the older
 * `tracking.metaPixelId` is shown with a button that saves it as the one id. The pixel picked in Facebook and
 * Instagram setup is compared with it, as the wave 1 Events tab did.
 *
 * META-23: match quality as Meta scores it, one plain line per identifier Meta received on too few events ("Phone not
 * sent on Initiate checkout events"), the events under the store's match quality alert, where the server's token comes
 * from (the Meta connection, set up by the pixel pick, or a pasted token) and what Meta holds for the pixel's automatic
 * advanced matching and first party cookies. META-18: the server events Meta did not count, with Meta's words and
 * "Send again" (a confirm, then `POST /meta/events/resend`) where it is still allowed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { localeDate } from '@/utils/date';
import { metaApi, metaEventsApi, metaMatchApi, type EventDay, type EventQuality, type EventSettings, type EventsMatch, type MatchGap, type RefusedEvent } from '@/lib/v2/areas/meta';
import { useMetaCtx, type MetaCtx } from './useMetaCtx';
import MetaHeader from './MetaHeader';
import { Figure, Lead, LoadFailure, Section, StateChip, ago, linkCls, num, plural, useLoad, writeError, type Tone } from './common';
import { META_ROUTES, metaHref } from './routes';

/** The look backs the page offers (the route takes 1 to 90 days). */
const RANGES = [{ key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '28', label: '28 days' }, { key: '90', label: '90 days' }] as const;

const fmtDay = (d: string) => localeDate(`${d}T12:00:00`, { day: 'numeric', month: 'short' });
const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${Math.round(v)}%`);
const emq = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(1)} of 10`);
/** A sum that stays "n/a" when Meta gave no figure on any day (never a made up zero). */
const sumOf = (rows: EventDay[], k: 'received' | 'received_server' | 'sent' | 'failed' | 'sending'): number | null => {
  const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};
const avgOf = (rows: EventDay[], k: 'deduped' | 'match_quality'): number | null => {
  const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

interface EventRow { event: string; days: EventDay[]; received: number | null; server: number | null; deduped: number | null; quality: EventQuality | null; sent: number | null; failed: number | null }

const EventsTab: React.FC<{ ctx: MetaCtx }> = ({ ctx }) => {
  const { toast } = useToast();
  const [range, setRange] = useState<string>('14');
  // One read: META-16's part and META-23's (match quality, the pixel's setup, META-18's refused rows).
  const healthQ = useLoad(() => metaMatchApi.health(Number(range)), [range]);
  const settingsQ = useLoad(() => metaApi.eventSettings(), []);
  const [reading, setReading] = useState(false);
  const [picked, setPicked] = useState<string>('');
  const h = healthQ.data?.health;
  const match = healthQ.data?.match ?? null;
  const s = settingsQ.data;
  const setupPixel = ctx.setup?.items.find((i) => i.key === 'pixel')?.picked ?? null;

  const rows: EventRow[] = useMemo(() => {
    if (!h) return [];
    const by = new Map<string, EventDay[]>();
    for (const d of h.days) by.set(d.event, [...(by.get(d.event) ?? []), d]);
    for (const q of h.quality) if (!by.has(q.event)) by.set(q.event, []);
    return [...by.entries()].map(([event, days]) => ({
      event, days: [...days].sort((a, b) => b.date.localeCompare(a.date)),
      received: sumOf(days, 'received'), server: sumOf(days, 'received_server'), deduped: avgOf(days, 'deduped'),
      quality: h.quality.find((q) => q.event === event) ?? null, sent: sumOf(days, 'sent'), failed: sumOf(days, 'failed'),
    })).sort((a, b) => (b.received ?? b.sent ?? 0) - (a.received ?? a.sent ?? 0));
  }, [h]);
  useEffect(() => { if (rows.length && !rows.some((r) => r.event === picked)) setPicked(rows.find((r) => r.event === 'Purchase')?.event ?? rows[0].event); }, [rows, picked]);

  const readNow = async () => {
    setReading(true);
    try {
      const r = await metaEventsApi.readNow();
      toast({ title: r.status === 'ok' ? 'Read from Meta' : r.status === 'partial' ? 'Read in part' : 'Meta did not answer', description: r.error ?? (r.events != null ? `${plural(r.events, 'event')} over ${plural(r.days ?? 0, 'day')}.` : undefined), variant: r.status === 'failed' ? 'destructive' : undefined });
      await healthQ.reload();
    } catch (e) {
      toast({ title: 'Could not read from Meta', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' });
    } finally { setReading(false); }
  };

  /* What to act on, most serious first. */
  const acts: Array<{ tone: Tone; text: React.ReactNode; action?: React.ReactNode }> = [];
  if (s && h) {
    if (!s.pixelId) acts.push({ tone: 'bad', text: 'No pixel id is saved, so the store sends events nowhere.', action: <Link className={linkCls} to="/settings/api-integrations">Add it in API and Integrations</Link> });
    else if (setupPixel && setupPixel.id !== s.pixelId) acts.push({ tone: 'bad', text: <>Events go to pixel <span className="font-mono">{s.pixelId}</span>, but setup picked {setupPixel.name} (<span className="font-mono">{setupPixel.id}</span>).</>, action: <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>Check setup</Link> });
    // META-23: the server's own answer decides (a Meta connection with this pixel needs no pasted token).
    if (!h.server_events) {
      if (s.serverEventsOn || match?.connection_pixel_id) acts.push({ tone: 'bad', text: 'Server events are on, but there is neither a Meta connection with a picked pixel nor an access token, so none are sent.', action: <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>Pick the pixel in setup</Link> });
      else acts.push({ tone: 'warn', text: 'Server events are off, so Meta sees only what the browser sends.', action: <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>Connect Meta and pick the pixel</Link> });
    }
    for (const low of match?.low_match_quality ?? []) acts.push({ tone: 'warn', text: <>Meta scores <b>{eventWords(low.event)}</b> {low.match_quality.toFixed(1)} of 10, under your alert of {match!.match_alert.match_quality_below}.</>, action: <button type="button" className={linkCls} onClick={() => setPicked(low.event)}>See what is missing</button> });
    const resendable = (match?.refused ?? []).filter((r) => r.resend.allowed).length;
    if (resendable) acts.push({ tone: 'bad', text: `${plural(resendable, 'server event')} Meta did not count can still be sent again.`, action: <a className={linkCls} href="#refused-events">See them</a> });
    const failed = rows.filter((r) => (r.failed ?? 0) > 0);
    if (failed.length) acts.push({ tone: 'bad', text: `Meta refused ${failed.map((r) => `${num(r.failed)} ${r.event}`).join(', ')} sent by the store in this period.`, action: <button type="button" className={linkCls} onClick={() => setPicked(failed[0].event)}>See the days</button> });
    if (h.last_error?.message) acts.push({ tone: 'warn', text: <>Last error{h.last_error.event ? ` (${h.last_error.event})` : ''}, {ago(h.last_error.at)}: {h.last_error.message}</> });
    for (const q of h.quality) for (const d of q.diagnostics ?? []) acts.push({ tone: 'warn', text: <><b>{q.event}:</b> {d.description ?? d.name}{d.solution ? ` ${d.solution}` : ''}</>, action: <button type="button" className={linkCls} onClick={() => setPicked(q.event)}>Open {q.event}</button> });
    if (h.test_event_code) acts.push({ tone: 'info', text: <>Test events are on: every server event carries the code <span className="font-mono">{h.test_event_code}</span> and shows only in Test Events. Remove the code when you are done.</> });
  }
  const worst: Tone = acts.some((a) => a.tone === 'bad') ? 'bad' : acts.some((a) => a.tone === 'warn') ? 'warn' : acts.length ? 'info' : 'good';
  const current = rows.find((r) => r.event === picked) ?? null;
  const totals = useMemo(() => ({
    received: rows.reduce((t, r) => t + (r.received ?? 0), 0),
    deduped: avgOf(rows.flatMap((r) => r.days).filter((d) => d.deduped !== null), 'deduped'),
    emq: rows.filter((r) => r.quality?.match_quality != null).reduce((t, r, _i, arr) => t + (r.quality!.match_quality as number) / arr.length, 0),
    failed: rows.reduce((t, r) => t + (r.failed ?? 0), 0),
  }), [rows]);

  if ((healthQ.error && !h) || (settingsQ.error && !s)) {
    return <LoadFailure failure={(healthQ.error ?? settingsQ.error)!} what="Events health (GET /api/v2/marketing/meta/events/health) is not served yet." onRetry={() => { healthQ.reload(); settingsQ.reload(); }} />;
  }
  if (!h || !s) return <p className="text-sm text-gray-500">Loading events health...</p>;

  return (
    <div className="space-y-5">
      {acts.length ? (
        <Lead tone={worst} title={acts.length === 1 ? 'One thing to act on' : `${acts.length} things to act on`}>
          <ul className="mt-1 space-y-1.5">
            {acts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 flex-1">{a.text}</span>{a.action}
              </li>
            ))}
          </ul>
        </Lead>
      ) : (
        <Lead tone="good" title="Meta receives every event and matches it well">Browser and server events reach pixel {s.pixelId}, Meta pairs them, and nothing was refused in this period.</Lead>
      )}
      {s.pixelIdFromFallback && <OldPixelId id={s.pixelId ?? ''} onSaved={settingsQ.reload} canSave={ctx.can.setup} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Period" options={RANGES} value={range} onChange={setRange} size="sm" />
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Read from Meta {ago(h.last_read?.at)}{h.last_read?.status && h.last_read.status !== 'ok' ? ` (${h.last_read.status})` : ''}</span>
          {ctx.can.setup && <Button size="sm" variant="outline" onClick={readNow} disabled={reading}>{reading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Read from Meta now</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Figure label="Events Meta received" value={num(totals.received)} sub={`${localeDate(`${h.from}T12:00:00`, { day: 'numeric', month: 'short' })} to ${fmtDay(h.to)}`} />
        <Figure label="Browser events paired with the server" value={pct(totals.deduped)} sub="Average share deduplicated" />
        <Figure label="Match quality" value={totals.emq ? emq(totals.emq) : 'n/a'} sub="Meta's score, average of events" />
        <Figure label="Refused by Meta" value={num(totals.failed)} tone={totals.failed ? 'bad' : 'neutral'} sub="Sent by the store's server" />
      </div>

      <Section title="By event" hint="Totals for the period. Pick an event to see each day, its match keys and Meta's advice.">
        {!rows.length ? <p className="text-sm text-gray-600">Meta has counted no events for pixel {s.pixelId} in this period.</p> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">From the server</th>
                    <th className="px-3 py-2 text-right font-medium">Deduplicated</th>
                    <th className="px-3 py-2 text-right font-medium">Match quality</th>
                    <th className="px-3 py-2 text-right font-medium">Sent by the store</th>
                    <th className="py-2 pl-3 text-right font-medium">Refused</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.event} className={cn('cursor-pointer border-b last:border-0 hover:bg-gray-50', r.event === picked && 'bg-gray-50')} onClick={() => setPicked(r.event)}>
                      <td className="py-2 pr-3"><button type="button" className="font-medium text-gray-900 hover:underline" aria-pressed={r.event === picked}>{r.event}</button>{r.quality?.diagnostics?.length ? <StateChip tone="warn" className="ml-2">Advice</StateChip> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.received === null ? 'n/a' : num(r.received)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.server === null ? 'n/a' : num(r.server)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.deduped)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{emq(r.quality?.match_quality)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.sent === null ? 'n/a' : num(r.sent)}</td>
                      <td className={cn('py-2 pl-3 text-right tabular-nums', (r.failed ?? 0) > 0 && 'font-semibold text-red-700')}>{r.failed === null ? 'n/a' : num(r.failed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.event}>
                  <button type="button" onClick={() => setPicked(r.event)} className={cn('w-full rounded-md border bg-white px-3 py-2 text-left text-sm', r.event === picked && 'border-gray-900 ring-1 ring-gray-900')}>
                    <span className="flex items-center justify-between gap-2"><span className="font-medium">{r.event}</span>{(r.failed ?? 0) > 0 ? <StateChip tone="bad">{num(r.failed)} refused</StateChip> : r.quality?.diagnostics?.length ? <StateChip tone="warn">Advice</StateChip> : null}</span>
                    <span className="mt-1 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <span>Received<b className="block text-sm text-gray-900">{r.received === null ? 'n/a' : num(r.received)}</b></span>
                      <span>Deduplicated<b className="block text-sm text-gray-900">{pct(r.deduped)}</b></span>
                      <span>Match<b className="block text-sm text-gray-900">{r.quality?.match_quality == null ? 'n/a' : r.quality.match_quality.toFixed(1)}</b></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {match && <MatchSection match={match} rows={rows} onOpen={setPicked} />}

      {current && <EventDetail row={current} gaps={(match?.gaps ?? []).filter((g) => g.event === current.event)} />}

      {match && match.refused.length > 0 && <RefusedSection rows={match.refused} canResend={ctx.can.ads} onDone={() => healthQ.reload()} />}

      <EventSwitches s={s} canEdit={ctx.can.setup} onSaved={async () => { await settingsQ.reload(); await healthQ.reload(); }} />

      {h.notes.length > 0 && (
        <Section title="Notes from the server">
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{h.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Section>
      )}
      <p className="text-xs text-gray-500">
        Received counts are Meta's, from every source, per store day; sent and refused come from the store's own log of server events.
        Who may be tracked is set in <Link className={linkCls} to="/panel/marketing/compliance">Compliance</Link>; the pixel id and its token in <Link className={linkCls} to="/settings/api-integrations">API and Integrations</Link>.
      </p>
    </div>
  );
};

/** `InitiateCheckout` as people read it (`Initiate checkout`). */
const eventWords = (e: string) => e.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (_m, c: string) => ` ${c.toLowerCase()}`);

/** Meta's match key words as people read them (META-23). */
const KEY_WORDS: Record<string, string> = {
  email: 'E-mail', phone: 'Phone', external_id: 'External id', fbc: 'Click id (fbc)', fbp: 'Browser id (fbp)',
  ip_address: 'IP address', client_ip_address: 'IP address', user_agent: 'User agent', client_user_agent: 'User agent',
  first_name: 'First name', last_name: 'Last name', city: 'City', state: 'State', zip: 'Postal code', country: 'Country',
};
const keyWords = (id: string) => KEY_WORDS[id] ?? id.replace(/_/g, ' ');

/** Meta's automatic advanced matching field words as people read them. */
const FIELD_WORDS: Record<string, string> = {
  em: 'e-mail', ph: 'phone', fn: 'first name', ln: 'last name', ct: 'city', st: 'state', zp: 'postal code', country: 'country',
  external_id: 'external id', ge: 'gender', db: 'date of birth',
};

/**
 * META-23: how well Meta can match the store's events to people. The lines come from the server (one per identifier
 * under the store's coverage alert); the pixel's own setup is what the pixel pick switched on at Meta.
 */
const MatchSection: React.FC<{ match: EventsMatch; rows: EventRow[]; onOpen: (event: string) => void }> = ({ match, rows, onOpen }) => {
  const byEvent = new Map<string, MatchGap[]>();
  for (const g of match.gaps) byEvent.set(g.event, [...(byEvent.get(g.event) ?? []), g]);
  const score = (event: string) => rows.find((r) => r.event === event)?.quality?.match_quality ?? null;
  const events = [...byEvent.keys()].sort((a, b) => (score(a) ?? 11) - (score(b) ?? 11));
  const p = match.pixel_setup;
  const source = match.server_events_source === 'connection' ? 'Server events go with the store\'s Meta connection (set up when the pixel was picked).'
    : match.server_events_source === 'pasted_token' ? 'Server events go with the access token pasted in API and Integrations. Picking the pixel on the Facebook and Instagram page moves them to the Meta connection.'
    : 'No server events are sent.';
  return (
    <Section title="Match quality" hint={`Meta matches an event to a person by the identifiers it carries. Listed: identifiers on fewer than ${match.match_alert.coverage_below}% of an event; an event under ${match.match_alert.match_quality_below} of 10 is told to the team.`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {!events.length ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /> Every event Meta scored carries each identifier on at least {match.match_alert.coverage_below}% of events.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const sc = score(event);
                const low = sc !== null && sc < match.match_alert.match_quality_below;
                return (
                  <li key={event} className="rounded-md border px-3 py-2">
                    <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <button type="button" className="font-medium text-gray-900 hover:underline" onClick={() => onOpen(event)}>{eventWords(event)}</button>
                      {sc !== null && <StateChip tone={low ? 'warn' : 'good'}>{sc.toFixed(1)} of 10</StateChip>}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
                      {byEvent.get(event)!.map((g) => <li key={g.identifier} className="break-words">{g.line}</li>)}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-2 text-sm text-gray-700">
          <p className="font-medium text-gray-900">How the store sends</p>
          <p>{source}</p>
          {p ? (
            <>
              <p>{p.automatic_matching === true ? `Automatic advanced matching is on${p.fields?.length ? ` for ${p.fields.map((f) => FIELD_WORDS[f] ?? f).join(', ')}` : ''}.` : p.automatic_matching === false ? 'Automatic advanced matching is off at Meta.' : 'Meta did not say whether automatic advanced matching is on.'}</p>
              <p>{p.first_party_cookies === 'FIRST_PARTY_COOKIE_ENABLED' ? 'First party cookies are on.' : p.first_party_cookies === 'FIRST_PARTY_COOKIE_DISABLED' ? 'First party cookies are off at Meta.' : 'Meta did not say whether first party cookies are on.'}</p>
              {p.error && <p className="break-words text-amber-800">{p.error}</p>}
              {p.checked_at && <p className="text-xs text-gray-500">Checked {ago(p.checked_at)}.</p>}
            </>
          ) : (
            <p>Automatic advanced matching and first party cookies are switched on when the pixel is picked on the <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>Facebook and Instagram setup</Link>.</p>
          )}
          <p className="text-xs text-gray-500">The browser pixel also gets the signed in shopper's details and the checkout form's (advanced matching), and the server adds what the store holds for the shopper.</p>
        </div>
      </div>
    </Section>
  );
};

/** META-18: server events Meta did not count, with Meta's words; "Send again" where Meta still takes the event. */
const RefusedSection: React.FC<{ rows: RefusedEvent[]; canResend: boolean; onDone: () => void }> = ({ rows, canResend, onDone }) => {
  const { toast } = useToast();
  const [ask, setAsk] = useState<RefusedEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      const r = await metaMatchApi.resend(ask.event, ask.event_id);
      toast({
        title: r.status === 'sent' ? 'Sent again, Meta counted it' : r.status === 'skipped' ? 'Not sent' : 'Meta refused it again',
        description: r.message ?? undefined,
        variant: r.status === 'sent' ? undefined : 'destructive',
      });
      setAsk(null);
      onDone();
    } catch (e) {
      toast({ title: 'Not sent', description: writeError(e, 'The event was not sent again.'), variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <Section title="Server events Meta did not count" hint="Each with Meta's own words. One sent again keeps its event id and its first time, so Meta never counts it twice.">
      <div id="refused-events" />
      <ul className="divide-y rounded-md border">
        {rows.map((r) => (
          <li key={`${r.event}:${r.event_id}`} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{eventWords(r.event)}{r.order_id ? <span className="font-normal text-gray-600"> for order <span className="font-mono">{r.order_id}</span></span> : null}</p>
              <p className="mt-0.5 break-words text-gray-700">{r.message}</p>
              <p className="mt-0.5 text-xs text-gray-500">First sent {ago(r.at)}{r.attempts && r.attempts > 1 ? `, tried ${plural(r.attempts, 'time')}` : ''}{r.resend.allowed && r.resend.until ? `; Meta takes it until ${localeDate(r.resend.until, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
              {!r.resend.allowed && r.resend.reason && <p className="mt-0.5 text-xs text-gray-600">Cannot be sent again: {r.resend.reason}</p>}
            </div>
            {r.resend.allowed && canResend && <Button size="sm" variant="outline" onClick={() => setAsk(r)}>Send again</Button>}
          </li>
        ))}
      </ul>
      {!canResend && rows.some((r) => r.resend.allowed) && <p className="mt-2 text-xs text-gray-500">Sending again needs the ads manage permission.</p>}
      <Dialog open={!!ask} onOpenChange={(o) => { if (!busy && !o) setAsk(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send this event to Meta again?</DialogTitle>
            <DialogDescription>
              {ask ? <>{eventWords(ask.event)}{ask.order_id ? ` for order ${ask.order_id}` : ''} goes again with the same event id and its first time. Meta said: {ask.message}</> : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)} disabled={busy}>Cancel</Button>
            <Button onClick={send} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Send again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
};

/** One event: each store day, its match keys and Meta's diagnostics. */
const EventDetail: React.FC<{ row: EventRow; gaps?: MatchGap[] }> = ({ row, gaps = [] }) => {
  const q = row.quality;
  return (
    <Section title={`${row.event}, day by day`} hint={q?.read_on ? `Match quality and keys as Meta gave them on ${fmtDay(q.read_on)}.` : undefined}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {!row.days.length ? <p className="text-sm text-gray-600">No day of this period has a count for {row.event}.</p> : (
            <div className="max-h-[26rem] overflow-auto rounded-md border">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Day</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Server</th>
                    <th className="px-3 py-2 text-right font-medium">Deduplicated</th>
                    <th className="px-3 py-2 text-right font-medium">Match</th>
                    <th className="px-3 py-2 text-right font-medium">Sent</th>
                    <th className="px-3 py-2 text-right font-medium">Refused</th>
                  </tr>
                </thead>
                <tbody>
                  {row.days.map((d) => (
                    <tr key={d.date} className="border-t">
                      <td className="whitespace-nowrap px-3 py-1.5">{fmtDay(d.date)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.received === null ? 'n/a' : num(d.received)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.received_server === null ? 'n/a' : num(d.received_server)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(d.deduped)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.match_quality === null ? 'n/a' : d.match_quality.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.sent === null ? 'n/a' : `${num(d.sent)}${d.sending ? ` (${num(d.sending)} sending)` : ''}`}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', (d.failed ?? 0) > 0 && 'font-semibold text-red-700')}>{d.failed === null ? 'n/a' : num(d.failed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">What Meta matches people on</p>
            {!q?.match_keys?.length ? <p className="text-sm text-gray-600">Meta gave no match keys for {row.event}.</p> : (
              <ul className="mt-1 space-y-1.5">
                {q.match_keys.map((k) => (
                  <li key={k.identifier} className="text-sm">
                    <span className="flex justify-between gap-2"><span className="text-gray-700">{keyWords(k.identifier)}</span><span className="tabular-nums text-gray-900">{pct(k.coverage)}</span></span>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gray-700" style={{ width: `${Math.max(0, Math.min(100, k.coverage ?? 0))}%` }} /></span>
                  </li>
                ))}
              </ul>
            )}
            {gaps.filter((g) => g.coverage === 0).length > 0 && (
              <p className="mt-2 text-sm text-amber-800">Not sent at all: {gaps.filter((g) => g.coverage === 0).map((g) => g.label).join(', ')}.</p>
            )}
          </div>
          {(q?.diagnostics ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Meta's advice</p>
              {q!.diagnostics!.map((d, i) => (
                <div key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> {d.name}{d.percentage != null ? ` (${Math.round(d.percentage)}% of events)` : ''}</p>
                  {d.description && <p className="mt-0.5">{d.description}</p>}
                  {d.solution && <p className="mt-0.5 text-amber-800">{d.solution}</p>}
                </div>
              ))}
            </div>
          )}
          {q && !(q.diagnostics ?? []).length && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Meta has no advice for {row.event}.</p>}
        </div>
      </div>
    </Section>
  );
};

/** An id still kept under the older tracking setting: one click saves it as the one pixel id (EVT-08). */
const OldPixelId: React.FC<{ id: string; canSave: boolean; onSaved: () => void }> = ({ id, canSave, onSaved }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await metaApi.saveEventSettings({ pixelId: id }); toast({ title: 'Saved as the pixel id' }); onSaved(); }
    catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The setting was not saved.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Lead tone="info" title="The pixel id is still kept in the older place" actions={canSave ? <Button size="sm" variant="outline" className="bg-white" onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save it as the one pixel id</Button> : undefined}>
      Pixel <span className="font-mono">{id}</span> comes from the older tracking setting. Saving it once keeps the browser pixel and the server events on the same id.
    </Lead>
  );
};

/** The test event code and the two switches of the `metaPixel` setting (also on API and Integrations). */
const EventSwitches: React.FC<{ s: EventSettings; canEdit: boolean; onSaved: () => Promise<void> }> = ({ s, canEdit, onSaved }) => {
  const { toast } = useToast();
  const [code, setCode] = useState(s.testEventCode);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setCode(s.testEventCode); }, [s.testEventCode]);
  const save = async (key: string, patch: Parameters<typeof metaApi.saveEventSettings>[0], title: string) => {
    setBusy(key);
    try { await metaApi.saveEventSettings(patch); toast({ title }); await onSaved(); }
    catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The setting was not saved.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return (
    <Section title="Test events and what is sent" hint={<>Saved on the store's Meta pixel setting, the same one <Link className={linkCls} to="/settings/api-integrations">API and Integrations</Link> shows.</>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <Label htmlFor="ev-test">Test event code</Label>
          <p className="text-xs text-gray-500">From Events Manager, Test events. While set, every server event goes to Test Events instead of your reports.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Input id="ev-test" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TEST12345" className="max-w-[12rem] font-mono" disabled={!canEdit} />
            <Button size="sm" onClick={() => save('code', { testEventCode: code.trim() }, code.trim() ? 'Test events on' : 'Test events off')} disabled={!canEdit || busy !== null || code.trim() === s.testEventCode}>
              {busy === 'code' && <Loader2 className="animate-spin" />} Save
            </Button>
            {s.testEventCode && <Button size="sm" variant="outline" onClick={() => save('code', { testEventCode: '' }, 'Test events off')} disabled={!canEdit || busy !== null}>Remove the code</Button>}
          </div>
        </div>
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={s.businessEvents} disabled={!canEdit || busy !== null} onCheckedChange={(v) => save('business', { businessEvents: v }, v ? 'Business events on' : 'Business events off')} className="mt-0.5" />
            <span><span className="font-medium">Business events</span><span className="block text-xs text-gray-600">Delivered, returned to origin, COD confirmed, staff placed and WhatsApp orders, sent to Meta as their own events.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={s.productLevelEvents} disabled={!canEdit || busy !== null} onCheckedChange={(v) => save('product', { productLevelEvents: v }, v ? 'Product level events on' : 'Product level events off')} className="mt-0.5" />
            <span><span className="font-medium">Product level events</span><span className="block text-xs text-gray-600">Each event names the products (SKUs) in it, so catalog ads learn what sells. Off: only the value and currency.</span></span>
          </label>
        </div>
      </div>
    </Section>
  );
};

/** Route-ready: Events health as a page of its own (Marketing, Setup). */
export const EventsPage: React.FC = () => {
  const ctx = useMetaCtx();
  return (
    <div className="space-y-5">
      <MetaHeader title="Events health" setup={ctx.setup} description="What Meta received from your pixel and server each day, how well it matched people, and what it refused." />
      <EventsTab ctx={ctx} />
    </div>
  );
};

export default EventsTab;
