import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Chip, BlockSkeleton, toneForStatus } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import WhatsAppStatusPanel, { type WaLiveState } from '@/components/templates/WhatsAppStatusPanel';
import type { MsgCatalogueEntry } from '@/services/api';
import { messagingAPI, errText, MSG_CHANNEL_LABEL, type MsgCh, type WhatsAppConfig } from '@/lib/v2/messaging';
import { productUrl } from '@/lib/menu';
import { AccountBanner, ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/** Growcord's WhatsApp Platform, where a store connects its own number (MSG-0 §6) — derived like every sibling product link. */
const platformUrl = productUrl('wa', '/phone-numbers');

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
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      const c = await messagingAPI.whatsappConfig();
      setCfg(c); setPriority(c.channel_priority);
    } catch (e: any) { setFailure(failureOf(e, 'Could not load the WhatsApp connection.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!cfg && JSON.stringify(priority) !== JSON.stringify(cfg.channel_priority);
  const own = (cfg?.number_source ?? cfg?.mode) === 'own';
  const move = (i: number, d: -1 | 1) => setPriority((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const n = p.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });

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
      const r = await messagingAPI.testWhatsApp(to.trim());
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
                {!cfg.enabled && <span className="text-xs text-ink-soft">— off: messages go by the next channel in the order below.</span>}
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
              <div>
                <p className="mb-2 text-xs text-ink-soft">A message is tried on the first channel; if that cannot send, the next one.</p>
                {priority.length === 0 ? <p className="text-xs text-ink-mute">The server sent no channel order.</p> : (
                  <ol className="space-y-1">
                    {priority.map((ch, i) => (
                      <li key={ch} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
                        <span className="w-5 text-xs tabular-nums text-ink-mute">{i + 1}.</span>
                        <span className="flex-1 text-ink">{MSG_CHANNEL_LABEL[ch as MsgCh] ?? ch}</span>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${ch} up`}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, 1)} disabled={i === priority.length - 1} aria-label={`Move ${ch} down`}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      </li>
                    ))}
                  </ol>
                )}
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
              <p className="mb-2 text-xs text-ink-soft">Sends one approved test message to the number you type.</p>
              <div className="flex flex-wrap gap-2">
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
