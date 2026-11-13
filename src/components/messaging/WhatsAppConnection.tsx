import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Chip, BlockSkeleton, toneForStatus } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import WhatsAppStatusPanel, { waNamesOf, type WaLiveState } from '@/components/templates/WhatsAppStatusPanel';
import type { MsgCatalogueEntry } from '@/services/api';
import { messagingAPI, errText, MSG_CHANNEL_LABEL, type MsgCh, type WhatsAppConfig } from '@/lib/v2/messaging';
import { productUrl } from '@/lib/menu';
import { cn } from '@/lib/utils';
import { AccountBanner, ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/** Growcord's WhatsApp Platform, where a store connects its own number (MSG-0 §6) — derived like every sibling product link. */
const platformUrl = productUrl('wa', '/phone-numbers');

/**
 * The channel orders the server takes, exactly (growcord-rs comms `domain/notifications.rs` `priority_word`:
 * WhatsApp then SMS, SMS then WhatsApp, WhatsApp only). A free reorder could not reach "WhatsApp only", nor
 * leave it once stored. An order the server answered that is not among them is shown too, so nothing is hidden.
 */
const ORDERS: string[][] = [['whatsapp', 'sms'], ['sms', 'whatsapp'], ['whatsapp']];
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const orderChoices = (current: string[]) =>
  (current.length && !ORDERS.some((o) => sameOrder(o, current)) ? [...ORDERS, current] : ORDERS);
const chName = (c: string) => MSG_CHANNEL_LABEL[c as MsgCh] ?? c;
const orderLabel = (o: string[]) =>
  (o.length === 1 ? `${chName(o[0])} only` : `${chName(o[0])} first, then ${o.slice(1).map(chName).join(', then ')}`);

/**
 * WhatsApp ▸ Connection: which number the store's WhatsApp goes out from
 * (Growcord's shared number, or the store's own WhatsApp Business account),
 * the live status the gateway reports, the order channels are tried in, and a
 * test send (`GET/PUT /comms/whatsapp/config`, `POST /comms/whatsapp/test`,
 * contract §4.6 — backed by the `whatsapp_settings` store setting the
 * WhatsApp provider reads). Everything goes through Growcord's WhatsApp
 * Platform (§6): a store's "own number" is one connected INSIDE the Platform,
 * so no field here asks for Meta credentials — it links to the Platform.
 *
 * `canWrite` is the `whatsapp_settings` row's own permission (`settings.manage`,
 * MSG-2 `channel_config.rs`); `canWriteTemplates` (marketing.manage) is for the
 * template approval panel beside it. Reconciled by ADMIN-MSG-2.
 */
const WhatsAppConnection: React.FC<{ canWrite: boolean; canWriteTemplates: boolean; live: WaLiveState; entries: MsgCatalogueEntry[] }> = ({ canWrite, canWriteTemplates, live, entries }) => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [priority, setPriority] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [to, setTo] = useState('');
  const [testKey, setTestKey] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      const c = await messagingAPI.whatsappConfig();
      setCfg(c); setPriority(c.channel_priority);
    } catch (e: any) { setFailure(failureOf(e, 'Could not load the WhatsApp connection.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!cfg && !sameOrder(priority, cfg.channel_priority);
  const own = (cfg?.number_source ?? cfg?.mode) === 'own';
  // The test send's message: approved on the number first (the gateway's live answer), then the rest.
  const testChoices = useMemo(() => {
    const wa = entries.filter((e) => e.def.channels.includes('whatsapp'));
    const ok = (e: MsgCatalogueEntry) => !!live.status && waNamesOf(e).some((nm) => live.approved.has(nm));
    return [...wa].sort((a, b) => Number(ok(b)) - Number(ok(a)) || a.def.title.localeCompare(b.def.title))
      .map((e) => ({ key: e.def.key, title: e.def.title, approved: ok(e) }));
  }, [entries, live.status, live.approved]);

  const save = async () => {
    setSaving(true);
    try {
      const c = await messagingAPI.saveWhatsAppConfig({ channel_priority: priority });
      setCfg(c); setPriority(c.channel_priority);
      toast({ title: 'WhatsApp connection saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  /** The store's "send on WhatsApp" switch (`PUT /whatsapp/config {enabled}`). */
  const setEnabled = async (enabled: boolean) => {
    setSwitching(true);
    try {
      const c = await messagingAPI.saveWhatsAppConfig({ enabled });
      setCfg(c);
      toast({ title: enabled ? 'WhatsApp sending on' : 'WhatsApp sending off' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    } finally { setSwitching(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await messagingAPI.testWhatsApp(to.trim(), testKey || undefined);
      toast({ variant: r.ok ? undefined : 'destructive', title: r.ok ? 'Test WhatsApp sent' : 'Test WhatsApp not sent', description: r.message });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Test WhatsApp not sent', description: failureOf(e, 'The test was refused.').gap ? 'The test route is not on this server yet.' : errText(e, 'The test was refused.') });
    } finally { setTesting(false); }
  };
  const phoneOk = /^\+?[0-9][0-9 ()-]{6,}$/.test(to.trim());

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        {failure?.gap ? (
          <GapNotice what="The WhatsApp connection route (GET /comms/whatsapp/config) is not on this server yet.">
            A number is connected in <a className="underline" href={platformUrl}>Growcord’s WhatsApp Platform</a>.
          </GapNotice>
        ) : failure ? (
          <ErrorNotice message={failure.message} onRetry={load} />
        ) : !cfg ? (
          <BlockSkeleton lines={6} />
        ) : (
          <>
            <AccountBanner own={own}>
              <p>Sent through Growcord’s WhatsApp Platform{own ? ', from your own number connected in the Platform.' : ', from Growcord’s shared number. Customers see your store’s name in the message.'}</p>
            </AccountBanner>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm font-semibold text-ink">Status</p>
                <Chip tone={cfg.live ? 'green' : 'amber'}>{cfg.live ? 'Live' : 'Test mode'}</Chip>
                {cfg.status && <Chip tone={toneForStatus(cfg.status)}>{cfg.status.replace(/_/g, ' ')}</Chip>}
              </div>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <Switch checked={cfg.enabled} onCheckedChange={setEnabled} disabled={!canWrite || switching} aria-label="Send on WhatsApp" />
                <span className="text-ink">Send on WhatsApp</span>
                {!cfg.enabled && <span className="text-xs text-ink-soft">Off: messages go by the next channel in the order below.</span>}
              </label>
              {cfg.note && <p className="mb-2 text-xs text-ink-soft">{cfg.note}</p>}
              <dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-soft">Sent through</dt><dd className="text-ink">{cfg.via === 'growcord_platform' || !cfg.via ? 'Growcord’s WhatsApp Platform' : cfg.via.replace(/_/g, ' ')}</dd>
                <dt className="text-ink-soft">Number</dt><dd className="text-ink"><span className="font-mono text-xs">{cfg.phone_number || '—'}</span> <span className="text-xs text-ink-soft">({own ? 'your own number' : 'Growcord’s number'})</span></dd>
                <dt className="text-ink-soft">Display name</dt><dd className="text-ink">{cfg.display_name || '—'}</dd>
                <dt className="text-ink-soft">Quality</dt><dd className="text-ink">{cfg.quality ? <Chip tone={toneForStatus(cfg.quality)}>{cfg.quality}</Chip> : '—'}</dd>
                <dt className="text-ink-soft">Platform account</dt><dd className="font-mono text-xs text-ink">{cfg.platform_account || '—'}</dd>
              </dl>
              <a href={platformUrl} className="mt-3 inline-flex items-center gap-1 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
                <ExternalLink className="h-3 w-3" /> {own ? 'Manage your number in the WhatsApp Platform' : 'Connect your own number in the WhatsApp Platform'}
              </a>
            </div>

            <fieldset className="space-y-3 rounded-lg border border-line bg-surface p-4" disabled={!canWrite}>
              <legend className="px-1 text-sm font-semibold text-ink">Channel order</legend>
              <div role="radiogroup" aria-label="Channel order" className="space-y-1.5">
                <p className="mb-2 text-xs text-ink-soft">A message is tried on the first channel; if that cannot send, the next one.</p>
                {orderChoices(cfg.channel_priority).map((o) => {
                  const on = sameOrder(o, priority);
                  return (
                    <label key={o.join(',')} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      on ? 'border-brand bg-brand/5 text-ink' : 'border-line text-ink-soft hover:text-ink')}>
                      <input type="radio" name="wa-channel-order" className="h-4 w-4" checked={on} onChange={() => setPriority(o)} />
                      <span>{orderLabel(o)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                {!canWrite && <span className="mr-auto text-xs text-ink-soft">Read-only: needs the settings.manage permission.</span>}
                <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setPriority(cfg.channel_priority)}>Discard</Button>
                <Button size="sm" disabled={!dirty || saving} onClick={save} title={!dirty ? 'Nothing changed yet' : undefined}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </fieldset>

            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Test send</p>
              <p className="mb-2 text-xs text-ink-soft">Sends one real message, on its sample values, to the number you type. Meta refuses a message it has not approved.</p>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Message to test" value={testKey} onChange={(e) => setTestKey(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm sm:w-72">
                  <option value="">Default: order confirmation</option>
                  {testChoices.map((c) => (
                    <option key={c.key} value={c.key}>{c.title}{live.status && !c.approved ? ' (not approved yet)' : ''}</option>
                  ))}
                </select>
                <Input type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+91 98765 43210"
                  aria-label="Phone number for the test" className="h-9 w-full sm:w-60" />
                <Button size="sm" className="h-9" onClick={test} disabled={testing || !phoneOk || !canWrite}
                  title={!canWrite ? 'Needs the settings.manage permission' : !phoneOk ? 'Type a phone number with its country code' : undefined}>
                  {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-1 text-sm font-semibold text-ink">Live approval on the gateway</p>
        <p className="mb-3 text-xs text-ink-soft">Asked of the WhatsApp gateway itself. A message Meta has not approved will not go out on WhatsApp.</p>
        <WhatsAppStatusPanel live={live} entries={entries} canWrite={canWriteTemplates} />
      </div>
    </div>
  );
};

export default WhatsAppConnection;
