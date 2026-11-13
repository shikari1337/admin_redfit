/**
 * Setup: connect, then the checklist Shopify's app shows (Business, Facebook Page, Instagram account, ad
 * account, pixel, catalog, WhatsApp number). Each row says what is missing in plain words and offers ONE
 * action: pick through the connection's existing resource routes, reconnect through the shared consent flow
 * (`lib/connectorConnect.ts`, the same one Platform Connections uses), or open the place on Meta that finishes it.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDay } from '@/utils/date';
import { metaAdsApi, metaApi, type MetaConnection, type PickableResource, type SetupItem, type WaLinkResult } from '@/lib/v2/areas/meta';
import { useMetaCtx, type MetaCtx } from './useMetaCtx';
import { connectionsHref } from './routes';
import MetaHeader from './MetaHeader';
import { Lead, LoadFailure, PIXEL_ROLE, PIXEL_SERVER, Section, StateChip, daysUntil, linkCls, plural, useLoad, writeError } from './common';

const LABEL: Record<string, { title: string; noun: string; what: string }> = {
  business: { title: 'Business', noun: 'business', what: 'The Meta business account your Page, ads and catalog belong to.' },
  page: { title: 'Facebook Page', noun: 'Facebook Page', what: 'The Page your shop and ads appear under.' },
  instagram: { title: 'Instagram account', noun: 'Instagram account', what: 'The account whose posts show on your store and can carry product tags.' },
  ad_account: { title: 'Ad account', noun: 'ad account', what: 'Where campaigns run and are billed.' },
  pixel: { title: 'Pixel (dataset)', noun: 'pixel (dataset)', what: 'Where your store sends shopper events, for ads and reports.' },
  catalog: { title: 'Catalog', noun: 'catalog', what: 'Your products on Meta, for the shop, tags, WhatsApp and ads.' },
  whatsapp: { title: 'WhatsApp number', noun: 'WhatsApp number', what: 'The business number that shows your catalog in chats.' },
  messaging: { title: 'Messenger and Instagram messages', noun: 'Page for messages', what: 'Lets the inbox receive and answer Messenger and Instagram chats.' },
  leads: { title: 'Lead forms', noun: 'Page for lead forms', what: 'Brings leads from your Facebook and Instagram forms into the CRM.' },
};

/**
 * The connection service a row's picker lists, when the row does not name one (CONTRACT QUESTION in the lane
 * report: `action.service`).
 */
export const SERVICE_FALLBACK: Record<string, string> = {
  business: 'business', page: 'pages', instagram: 'instagram', ad_account: 'ads', pixel: 'pixel', catalog: 'merchant_feed', whatsapp: 'whatsapp',
  messaging: 'messaging', leads: 'lead_ads',
};

/**
 * Days ahead the expiry of a person's token is warned about: the store's own `meta_insights` alert setting
 * (`alerts.token.expires_within_days`, META-10); this number is only the fallback while that cannot be read.
 */
const TOKEN_WARN_DAYS_FALLBACK = 7;

/** The token warning window from the store's alert setting, read once per page. */
export function useTokenWarnDays(): number {
  const q = useLoad(() => metaAdsApi.insightsSettings().catch(() => null), []);
  const d = Number(q.data?.settings?.alerts?.token?.expires_within_days);
  return Number.isFinite(d) && d > 0 ? d : TOKEN_WARN_DAYS_FALLBACK;
}

/** A person's token that ends within the window (a business system user token does not end). */
export function tokenEndsSoon(conn: MetaConnection | null | undefined, withinDays: number): number | null {
  if (!conn || conn.token_never_expires || conn.token_kind === 'system_user' || !conn.token_expires_at) return null;
  const left = daysUntil(conn.token_expires_at);
  return left !== null && left <= withinDays ? left : null;
}

const ASSET_KIND: Record<string, string> = {
  page: 'Facebook Page', ad_account: 'Ad account', catalog: 'Catalog', business: 'Business', whatsapp_business_account: 'WhatsApp account', instagram: 'Instagram account', pixel: 'Pixel',
};

/** What Growcord's WhatsApp system did with one number (META-WA-LINK). */
const WA_OUTCOME: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  updated: { label: 'Updated', tone: 'good' },
  linked: { label: 'Added', tone: 'good' },
  skipped: { label: 'Skipped', tone: 'warn' },
};

const titleOf = (key: string) => LABEL[key]?.title ?? key.replace(/_/g, ' ');
const nounOf = (key: string) => LABEL[key]?.noun ?? key.replace(/_/g, ' ');

/** What is missing, in plain words. */
export function needText(item: SetupItem, perms: string[]): string[] {
  const out: string[] = [];
  for (const n of item.needs) {
    if (n === 'connect') out.push('Not connected yet. Use the button on this row to give access for this step only.');
    else if (n === 'permission') out.push(perms.length ? `Meta has not allowed: ${perms.join(', ')}. Reconnect and tick it on Meta's screen.` : 'A permission is missing. Reconnect and allow everything Meta asks for.');
    else if (n === 'pick') out.push(`Pick the ${nounOf(String(item.key))} this store uses.`);
    else if (n === 'review') out.push('Meta is reviewing it. Nothing to do here; the result shows on this page.');
    else if (n === 'shopping_approval') out.push('Instagram Shopping is not approved for this account yet. Products can be tagged on your store\'s feed, but not on Instagram itself.');
    else out.push(String(n).replace(/_/g, ' '));
  }
  return out;
}

const StateIcon: React.FC<{ state: string }> = ({ state }) => {
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Done" />;
  if (state === 'blocked') return <AlertTriangle className="h-5 w-5 text-amber-600" aria-label="Waiting" />;
  return <Circle className="h-5 w-5 text-gray-400" aria-label="To do" />;
};

const SetupTab: React.FC<{ ctx: MetaCtx }> = ({ ctx }) => {
  const failure = ctx.setupFailure;
  const loading = ctx.setupLoading;
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [resources, setResources] = useState<Record<string, PickableResource[] | null>>({});
  const [waConfirm, setWaConfirm] = useState(false);
  const [waLink, setWaLink] = useState<WaLinkResult | null>(null);
  const setup = ctx.setup;
  const conn = setup?.connection ?? null;
  const warnDays = useTokenWarnDays();

  const connect = async () => {
    setBusy('connect');
    try {
      const provider = await metaApi.provider();
      const services = provider?.services.map((s) => s.key) ?? [];
      const problem = await metaApi.connect(services, conn?.id ?? null, `${window.location.pathname}?tab=setup`);
      if (problem) toast({ title: 'Could not open Meta', description: problem });
    } catch (e) {
      toast({ title: 'Could not open Meta', description: writeError(e, 'The connection could not start.'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  /** The shared consent flow for some services of the connection, back to this tab. */
  const connectServices = async (services: string[], busyKey: string) => {
    if (!services.length) return;
    setBusy(busyKey);
    try {
      const problem = await metaApi.connect(services, conn?.id ?? null, `${window.location.pathname}?tab=setup`);
      if (problem) toast({ title: 'Could not open Meta', description: problem });
    } catch (e) {
      toast({ title: 'Could not open Meta', description: writeError(e, 'The connection could not start.'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  /** One row's own consent: Facebook is asked for this row's permissions only (META-SETS). */
  const connectSet = (item: SetupItem) => (item.login_set ? connectServices(item.login_set.services, `set:${item.login_set.key}`) : Promise.resolve());

  /**
   * The row action `connect` ("Turn on X", a service that is off on a working connection): the same consent as the
   * row's set button, for the row's set, else the row's one service.
   */
  const connectRow = (item: SetupItem) => {
    const one = item.action?.service || SERVICE_FALLBACK[String(item.key)];
    const services = item.login_set?.services?.length ? item.login_set.services : one ? [one] : [];
    return connectServices(services, `row:${String(item.key)}`);
  };

  /** "Use this Meta login for WhatsApp" after the confirm: per number outcome under the WhatsApp row. */
  const linkWhatsApp = async () => {
    setBusy('wa-link');
    try {
      const r = await metaApi.linkWhatsApp();
      setWaLink(r);
      setWaConfirm(false);
      const changed = r.numbers.filter((n) => n.outcome === 'updated' || n.outcome === 'linked').length;
      toast({ title: changed ? `WhatsApp: ${plural(changed, 'number')} updated` : 'WhatsApp: nothing changed', description: changed ? undefined : (r.notes[0] ?? r.numbers.find((n) => n.reason)?.reason ?? undefined) });
      await ctx.reloadSetup();
    } catch (e) {
      toast({ title: 'WhatsApp not updated', description: writeError(e, 'Growcord\'s WhatsApp system did not take this login.'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const openPicker = async (item: SetupItem) => {
    const service = item.action?.service || SERVICE_FALLBACK[String(item.key)];
    if (!conn || !service) return;
    const key = String(item.key);
    if (picking === key) { setPicking(null); return; }
    setPicking(key);
    if (resources[service]) return;
    setResources((r) => ({ ...r, [service]: null }));
    try {
      const list = await metaApi.resources(conn.id, service);
      setResources((r) => ({ ...r, [service]: list }));
    } catch (e) {
      setResources((r) => ({ ...r, [service]: [] }));
      toast({ title: 'Could not list them', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' });
    }
  };

  const choose = async (item: SetupItem, r: PickableResource) => {
    const service = item.action?.service || SERVICE_FALLBACK[String(item.key)];
    if (!conn || !service) return;
    setBusy(String(item.key));
    try {
      await metaApi.pick(conn.id, service, r);
      toast({ title: `${titleOf(String(item.key))}: ${r.name}` });
      setPicking(null);
      await ctx.reloadSetup();
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'Meta refused this choice.'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (failure && !setup) return <LoadFailure failure={failure} what="The Meta setup checklist (GET /api/v2/marketing/meta/setup) is not served yet." onRetry={ctx.reloadSetup} />;
  if (loading || !setup) return <p className="text-sm text-gray-500">Loading the setup...</p>;

  const items = setup.items;
  const open = items.filter((i) => i.state !== 'done');
  const endsIn = tokenEndsSoon(conn, warnDays);
  const tokenBad = conn?.token_valid === false || !!conn?.token_error;

  return (
    <div className="space-y-5">
      {!conn ? (
        <Section title="Connect Facebook and Instagram" hint="Use the button on each row below to give access one step at a time, so a problem on one step does not hold up the others. Sign in with the Facebook account that manages your Page, Instagram, ad account and catalog.">
          <div className="flex flex-wrap items-center gap-3">
            {ctx.can.setup ? (
              <Button variant="outline" onClick={connect} disabled={busy === 'connect'}>
                {busy === 'connect' && <Loader2 className="animate-spin" />} Connect everything at once
              </Button>
            ) : <p className="text-sm text-gray-600">Ask someone who can change settings to connect.</p>}
            <span className="text-sm text-gray-500">Already connected Google or Meta? It is the same sign-in as <Link className={linkCls} to={connectionsHref('meta')}>Platform Connections</Link>.</span>
          </div>
        </Section>
      ) : tokenBad || endsIn !== null ? (
        <Lead tone="bad" title={tokenBad ? 'Meta no longer accepts this connection' : endsIn !== null && endsIn < 0 ? 'Meta access has ended' : `Meta access ends in ${plural(endsIn ?? 0, 'day')}`}
          actions={ctx.can.setup && <Button size="sm" onClick={connect} disabled={busy === 'connect'}>{conn.action?.kind === 'reconnect' && conn.action.label ? conn.action.label : 'Reconnect Meta'}</Button>}>
          {tokenBad ? (conn.token_error ?? 'Reconnect to keep catalog, ads, events and messages working.')
            : 'This connection holds a person\'s token, which expires. Reconnect with the business login so the store gets a token that does not expire; your picks stay.'}
          {open.length > 0 && <p className="mt-1">{plural(open.length, 'step')} below also need you.</p>}
        </Lead>
      ) : open.length ? (
        <Lead tone="warn" title={`${plural(open.length, 'step')} left before everything works`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {open.map((i) => <li key={String(i.key)}><b>{titleOf(String(i.key))}:</b> {needText(i, i.missing_permissions ?? conn.missing)[0] ?? 'Not finished.'}</li>)}
          </ul>
        </Lead>
      ) : (
        <Lead tone="good" title="Everything is set up">Your catalog, Instagram, ads and pixel are all connected to this store.</Lead>
      )}

      <Section title="Checklist" hint={conn ? `${items.length - open.length} of ${items.length} done` : 'Connect each step with its own button, then pick what it needs.'}>
        <ol className="-my-2 divide-y">
          {items.map((item) => {
            const key = String(item.key);
            const perms = item.missing_permissions ?? (item.needs.includes('permission') ? conn?.missing ?? [] : []);
            const needs = needText(item, perms);
            const service = item.action?.service || SERVICE_FALLBACK[key];
            const list = service ? resources[service] : undefined;
            const kind = item.action?.kind;
            return (
              <li key={key} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-0.5 shrink-0"><StateIcon state={String(item.state)} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{titleOf(key)}</span>
                      {item.state === 'done' ? <StateChip tone="good">Done</StateChip>
                        : item.state === 'blocked' ? <StateChip tone="warn">Waiting</StateChip>
                          : <StateChip tone="neutral">To do</StateChip>}
                      {item.picked && <span className="truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700" title={item.picked.id}>{item.picked.name}</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{LABEL[key]?.what}</p>
                    {item.pixels && item.pixels.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {item.pixels.map((p) => (
                          <li key={p.pixel_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-800">
                            <StateChip tone={p.server === 'browser_only' ? 'warn' : 'good'} className="font-normal">{PIXEL_ROLE[p.role] ?? p.role}</StateChip>
                            <span className="font-mono text-xs text-gray-700">{p.name ? `${p.name} ${p.pixel_id}` : p.pixel_id}</span>
                            <span className="text-xs text-gray-600">{PIXEL_SERVER[p.server] ?? p.server}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.note && <p className="mt-1 text-sm text-gray-800">{item.note}</p>}
                    {item.login_set?.error && <p className="mt-1 text-sm text-amber-800">The last attempt for this step did not finish: {item.login_set.error}</p>}
                    {needs.map((t, i) => (
                      <p key={i} className={`mt-1 flex items-start gap-1.5 text-sm ${item.state === 'blocked' ? 'text-amber-800' : 'text-gray-800'}`}>
                        {item.needs[i] === 'review' ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
                        <span>{t}</span>
                      </p>
                    ))}
                    {key === 'whatsapp' && conn && ctx.can.setup && (
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => setWaConfirm(true)} disabled={busy === 'wa-link'}>
                          {busy === 'wa-link' && <Loader2 className="animate-spin" />} Use this Meta login for WhatsApp
                        </Button>
                      </div>
                    )}
                    {key === 'whatsapp' && waLink && (
                      <div className="mt-2 rounded-md border bg-gray-50 p-3 text-sm">
                        <p className="font-medium text-gray-900">What Growcord&apos;s WhatsApp system did</p>
                        {waLink.numbers.length > 0 && (
                          <ul className="mt-1 space-y-1">
                            {waLink.numbers.map((n) => (
                              <li key={`${n.waba_id}:${n.phone_number_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <StateChip tone={WA_OUTCOME[n.outcome]?.tone ?? 'neutral'} className="font-normal">{WA_OUTCOME[n.outcome]?.label ?? n.outcome}</StateChip>
                                <span className="font-medium text-gray-900">{n.display_phone_number || n.phone_number_id}</span>
                                {n.reason && <span className="text-gray-700">{n.reason}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {waLink.notes.map((t, i) => <p key={i} className="mt-1 text-gray-700">{t}</p>)}
                        {!waLink.numbers.length && !waLink.notes.length && <p className="mt-1 text-gray-700">This Meta login reaches no WhatsApp number.</p>}
                      </div>
                    )}
                  </div>
                  {ctx.can.setup && item.login_set?.label && (
                    <div className="w-full shrink-0 pl-8 sm:w-auto sm:pl-0">
                      <Button size="sm" variant={item.state === 'done' ? 'outline' : 'default'} onClick={() => connectSet(item)} disabled={busy === `set:${item.login_set.key}`}>
                        {busy === `set:${item.login_set.key}` && <Loader2 className="animate-spin" />} {item.login_set.label}
                      </Button>
                    </div>
                  )}
                  {conn && item.action && kind !== 'wait' && !(kind === 'reconnect' && item.login_set) && (
                    <div className="w-full shrink-0 pl-8 sm:w-auto sm:pl-0">
                      {kind === 'pick' && ctx.can.setup && (
                        <Button size="sm" variant={item.state === 'done' ? 'outline' : 'default'} onClick={() => openPicker(item)} disabled={busy === key}>
                          {item.action.label || (item.picked ? 'Change' : 'Pick')}
                        </Button>
                      )}
                      {kind === 'reconnect' && ctx.can.setup && (
                        <Button size="sm" onClick={connect} disabled={busy === 'connect'}>{item.action.label || 'Reconnect'}</Button>
                      )}
                      {kind === 'connect' && ctx.can.setup && !item.login_set?.label && (
                        <Button size="sm" onClick={() => connectRow(item)} disabled={busy === `row:${key}`}>
                          {busy === `row:${key}` && <Loader2 className="animate-spin" />} {item.action.label || 'Turn on'}
                        </Button>
                      )}
                      {kind === 'open' && item.action.url && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={item.action.url} target="_blank" rel="noreferrer">{item.action.label || 'Open on Meta'} <ExternalLink /></a>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {picking === key && (
                  <div className="ml-8 mt-3 rounded-md border bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">Pick the {nounOf(key)}</span>
                      <button type="button" onClick={() => setPicking(null)} className="text-xs text-gray-500 hover:text-gray-800">Close</button>
                    </div>
                    {list === null || list === undefined ? <p className="text-sm text-gray-500">Asking Meta...</p>
                      : list.length === 0 ? <p className="text-sm text-gray-600">Meta shows none for this account. Check that the Facebook account you connected can manage one, then reconnect.</p>
                        : (
                          <ul className="max-h-60 space-y-1 overflow-auto">
                            {list.map((r) => (
                              <li key={r.id}>
                                <button type="button" onClick={() => choose(item, r)} disabled={busy === key}
                                  className={`flex w-full flex-wrap items-center justify-between gap-x-3 rounded px-3 py-2 text-left text-sm hover:bg-white disabled:opacity-50 ${item.picked?.id === r.id ? 'bg-white ring-1 ring-primary' : ''}`}>
                                  <span className="min-w-0"><span className="font-medium">{r.name}</span>{r.detail && <span className="ml-2 text-xs text-gray-500">{r.detail}</span>}</span>
                                  <span className="text-xs text-gray-400">{r.id}</span>
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
        </ol>
      </Section>

      {conn && <ConnectionCard conn={conn} warnDays={warnDays} canReconnect={ctx.can.setup} busy={busy === 'connect'} onReconnect={connect} />}

      {waConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o && busy !== 'wa-link') setWaConfirm(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Use this Meta login for WhatsApp?</DialogTitle>
              <DialogDescription>
                This updates the store&apos;s WhatsApp numbers on Growcord&apos;s WhatsApp system with this Meta login: numbers it already
                has get the new access, and numbers this login reaches that it does not have yet are added. It never changes where
                messages go, and it sends nothing.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWaConfirm(false)} disabled={busy === 'wa-link'}>Cancel</Button>
              <Button onClick={linkWhatsApp} disabled={busy === 'wa-link'}>{busy === 'wa-link' && <Loader2 className="animate-spin" />} Use it for WhatsApp</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

/**
 * The Meta connection (LOGIN-07, META-8 section 4): what kind of token it holds and whether Meta still accepts it, the
 * business, when access ends (warned ahead for a person's token, which expires), what the token reaches, and the
 * permissions Meta gave or left out. One action: reconnect.
 */
const ConnectionCard: React.FC<{ conn: MetaConnection; warnDays: number; canReconnect: boolean; busy: boolean; onReconnect: () => void }> = ({ conn, warnDays, canReconnect, busy, onReconnect }) => {
  const systemUser = conn.token_kind === 'system_user' || conn.token_never_expires === true;
  const endsIn = tokenEndsSoon(conn, warnDays);
  const expiresIn = daysUntil(conn.token_expires_at);
  const dataEnds = daysUntil(conn.data_access_expires_at);
  const assets = conn.assets ?? [];
  const actionLabel = conn.action?.kind === 'reconnect' && conn.action.label ? conn.action.label : 'Reconnect';
  return (
    <Section
      title="Meta connection"
      hint={`Connected as ${conn.connected_as ?? 'your Meta account'}${conn.business ? `, business ${conn.business.name}` : ''}`}
      actions={canReconnect && <Button size="sm" variant={conn.action?.kind === 'reconnect' ? 'default' : 'outline'} onClick={onReconnect} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {actionLabel}</Button>}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-gray-500">Kind of access</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium text-gray-900">
            {conn.token_kind ? (systemUser ? 'Business token' : 'A person\'s token') : 'Not checked yet'}
            {conn.token_kind && <StateChip tone={systemUser ? 'good' : 'warn'}>{systemUser ? 'Does not expire' : 'Expires'}</StateChip>}
          </dd>
          <dd className="text-xs text-gray-600">{conn.login === 'classic' ? 'Made with the older Facebook login.' : systemUser ? 'Reaches only the assets the store picked.' : 'Ends when the person\'s session ends.'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Meta's check</dt>
          <dd className={`mt-0.5 font-medium ${conn.token_valid === false ? 'text-red-700' : 'text-gray-900'}`}>
            {conn.token_valid === false ? 'Not accepted' : conn.token_valid ? 'Accepted' : 'Not checked yet'}
          </dd>
          <dd className="text-xs text-gray-600">{conn.token_error ?? (conn.token_checked_at ? `Checked ${formatDay(conn.token_checked_at)}` : 'Checked nightly and on this page.')}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Access ends</dt>
          <dd className={`mt-0.5 font-medium ${endsIn !== null ? 'text-red-700' : 'text-gray-900'}`}>
            {systemUser || !conn.token_expires_at ? 'Does not end' : `${formatDay(conn.token_expires_at)} (${expiresIn !== null && expiresIn >= 0 ? `in ${plural(expiresIn, 'day')}` : 'ended'})`}
          </dd>
          {endsIn !== null && <dd className="text-xs text-red-700">Reconnect before then, or sync, ads and messages stop. Warned {plural(warnDays, 'day')} ahead.</dd>}
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Data access ends</dt>
          <dd className={`mt-0.5 font-medium ${dataEnds !== null && dataEnds <= warnDays ? 'text-red-700' : 'text-gray-900'}`}>{conn.data_access_expires_at ? formatDay(conn.data_access_expires_at) : 'Not given'}</dd>
          <dd className="text-xs text-gray-600">After this day Meta stops sharing data until someone reconnects.</dd>
        </div>
      </dl>
      {conn.note && <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{conn.note}</p>}

      <div className="mt-5">
        <p className="text-xs font-medium text-gray-500">What the token reaches ({assets.length})</p>
        {!assets.length ? <p className="mt-1 text-sm text-gray-600">Meta did not list the assets. They show here after the next check.</p> : (
          <ul className="mt-1 divide-y rounded-md border">
            {assets.map((a) => (
              <li key={`${a.kind}-${a.id}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{a.name ?? a.id}</span>
                  <span className="ml-2 text-xs text-gray-500">{ASSET_KIND[a.kind ?? ''] ?? (a.kind ? a.kind.replace(/_/g, ' ') : 'Asset')}{a.name ? ` ${a.id}` : ''}</span>
                  {!a.name && <span className="ml-2 text-xs text-gray-500">(not picked by this store)</span>}
                </span>
                <span className="flex flex-wrap gap-1">{a.permissions.map((p) => <StateChip key={p} tone="neutral" className="font-normal">{p}</StateChip>)}</span>
              </li>
            ))}
          </ul>
        )}
        {(conn.permissions_for_every_asset ?? []).length > 0 && (
          <p className="mt-2 text-xs text-gray-600">For every asset: {(conn.permissions_for_every_asset ?? []).join(', ')}</p>
        )}
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-gray-500">Permissions Meta gave ({conn.granted.length})</dt>
          <dd className="mt-1 flex flex-wrap gap-1">{conn.granted.map((p) => <StateChip key={p} tone="neutral" className="font-normal">{p}</StateChip>)}</dd>
        </div>
        {conn.missing.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-gray-500">Missing ({conn.missing.length}): reconnect and allow these</dt>
            <dd className="mt-1 flex flex-wrap gap-1">{conn.missing.map((p) => <StateChip key={p} tone="bad" className="font-normal">{p}</StateChip>)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-xs text-gray-500">
        The same connection serves every Meta feature. Its services and webhooks are on <Link className={linkCls} to={connectionsHref('meta')}>Platform Connections</Link>.
      </p>
    </Section>
  );
};

/** Route-ready: this tab as a page of its own (for a Marketing menu item). */
export const SetupPage: React.FC = () => {
  const ctx = useMetaCtx();
  return (
    <div className="space-y-5">
      <MetaHeader setup={ctx.setup} />
      <SetupTab ctx={ctx} />
    </div>
  );
};

export default SetupTab;
