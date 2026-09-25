import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, Send, Undo2, Copy, RefreshCw } from 'lucide-react';
import {
  messageTemplatesAPI, smsConfigAPI,
  type MsgCatalogueEntry, type MsgChannel,
} from '@/services/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/erp/StatusChip';
import InfoTip from '@/components/common/InfoTip';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/utils/date';
import { ChannelPreview, smsParts } from '@/pages/panels/marketing/campaigns/ChannelPreview';
import ServerPreview, { type PreviewLayout } from './ServerPreview';
import {
  CHANNEL_LABEL, CHANNEL_ORDER, KIND_LABEL, KIND_TONE, LAYER_FILTER_LABEL, LAYER_TONE,
  approvalOf, defaultBody, fillExamples, isStoreLayer, layerOf, placeholdersIn,
} from './model';

/**
 * ONE event, every channel it uses: Growcord's default (read-only, "Use as
 * base"), this store's override (a save is a NEW version, never an edit),
 * revert, a server-rendered preview in either layout, a test send to the
 * signed-in person, and the version history with provider approval.
 *
 * `category` is never sent on a save — the price tier is derived from the event
 * (docs/MESSAGING_PRICING_POLICY.md §1); a form that could set it could relabel
 * a campaign as a utility message to pay less.
 */

const LIMIT: Partial<Record<MsgChannel, number>> = { whatsapp: 1024, push: 120 };

/** DLT texts say `{#var#}`; ours say `{{name}}`. Swap in order, as the old mapper did. */
const toEditable = (dltText: string, vars: string[]) => {
  let i = 0;
  return dltText.replace(/\{#var#\}/g, () => (vars[i++] ? `{{${vars[i - 1]}}}` : `{{var${i}}}`));
};

const TemplateEditorDrawer: React.FC<{
  entry: MsgCatalogueEntry | null;
  smsOwnHeader?: boolean;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Approved names from the WhatsApp gateway (used when the hub has no approval yet). */
  waApproved?: Set<string>;
}> = ({ entry, smsOwnHeader, canWrite, onClose, onChanged, waApproved }) => {
  const { toast } = useToast();
  const channels = useMemo(() => {
    if (!entry) return [] as MsgChannel[];
    const set = new Set<MsgChannel>([...entry.def.channels, ...(Object.keys(entry.resolved) as MsgChannel[])]);
    return CHANNEL_ORDER.filter((c) => set.has(c));
  }, [entry]);
  const [channel, setChannel] = useState<MsgChannel>('sms');
  useEffect(() => { if (channels.length && !channels.includes(channel)) setChannel(channels[0]); }, [channels, channel]);

  const def = entry?.def;
  const layer = entry ? entry.resolved[channel] : undefined;
  const storeLayer = isStoreLayer(layer);
  const growcord = def ? defaultBody(def, channel) : { body: '' };

  // The store's own words: the catalogue reports the LAYER, the hub registry
  // row carries the TEXT (subject/body) — read it when the channel opens.
  const [storeRow, setStoreRow] = useState<any | null>(null);
  const [rowNonce, setRowNonce] = useState(0);
  useEffect(() => {
    if (!def || !storeLayer) { setStoreRow(null); return; }
    if (layer?.body != null) { setStoreRow({ body: layer.body, subject: layer.subject, provider_ref: layer.providerRef }); return; }
    let cancelled = false;
    messageTemplatesAPI.channelRows(channel)
      .then((rows) => {
        if (cancelled) return;
        const hit = rows.find((r) => r.catalog_key === def.key || r.template_key === def.key || r.template_key === layer?.templateKey
          || (def.product === 'commerce' && r.template_key === def.event));
        setStoreRow(hit ?? null);
      })
      .catch(() => { if (!cancelled) setStoreRow(null); });
    return () => { cancelled = true; };
  }, [def, channel, storeLayer, layer, rowNonce]);

  // ── the override draft ──
  const initial = useMemo(() => ({
    subject: storeLayer ? String(storeRow?.subject ?? '') : '',
    body: storeLayer ? String(storeRow?.body ?? '') : '',
    providerRef: storeLayer ? String(storeRow?.provider_ref ?? layer?.providerRef ?? '') : '',
  }), [storeLayer, storeRow, layer]);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [providerRef, setProviderRef] = useState(initial.providerRef);
  useEffect(() => { setSubject(initial.subject); setBody(initial.body); setProviderRef(initial.providerRef); }, [initial, entry?.def.key, channel]);
  const dirty = subject !== initial.subject || body !== initial.body || providerRef !== initial.providerRef;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [layout, setLayout] = useState<PreviewLayout>('store');
  const [nonce, setNonce] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const [versions, setVersions] = useState<any[] | null>(null);
  useEffect(() => {
    if (!def) return;
    let cancelled = false;
    setVersions(null);
    messageTemplatesAPI.versions(def.key, channel).then((v) => { if (!cancelled) setVersions(v); }).catch(() => { if (!cancelled) setVersions([]); });
    return () => { cancelled = true; };
  }, [def, channel, nonce]);

  const [dlt, setDlt] = useState<Array<{ id: string; template: string }> | null>(null);
  const loadDlt = async () => {
    const r: any = await smsConfigAPI.getProviderTemplates();
    setDlt(r?.ok ? r.templates : []);
    if (!r?.ok) setErr(r?.message || 'Could not load the registered DLT texts.');
  };

  if (!entry || !def) return null;

  const declared = new Set(def.variables.map((v) => v.key));
  const used = placeholdersIn(subject, body);
  const undeclared = used.filter((u) => !declared.has(u) && !['smsSignature', 'brandName', 'storeName', 'supportEmail', 'supportPhone', 'websiteUrl', 'year'].includes(u));
  const otpMissing = !!def.requiresOtp && body.trim() !== '' && !/\{\{\s*otp\s*\}\}/i.test(body);
  const limit = LIMIT[channel];
  const meter = channel === 'sms' ? smsParts(fillExamples(body || growcord.body, def)) : null;
  const layerKey = layerOf(entry, channel, smsOwnHeader);
  const approval = approvalOf(layer)
    ?? (channel === 'whatsapp' && waApproved && [def.event, def.whatsapp?.name].some((n) => n && waApproved.has(n))
      ? { label: 'Approved', tone: 'green' as const } : null);
  const signatureLocked = channel === 'sms' && !smsOwnHeader;

  const insertVar = (k: string) => {
    const el = bodyRef.current;
    const token = `{{${k}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const s = el.selectionStart ?? body.length; const e = el.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };

  const useAsBase = () => {
    setSubject(growcord.subject ?? '');
    setBody(channel === 'whatsapp' ? (def.whatsapp?.preview || '') : growcord.body);
    setProviderRef('');
  };

  const save = async () => {
    if (otpMissing) { setErr(`${def.title} is a sign-in message and must keep the {{otp}} placeholder.`); return; }
    setSaving(true); setErr(null);
    try {
      await messageTemplatesAPI.saveVersion(def.key, {
        channel, name: def.title,
        subject: channel === 'email' || channel === 'push' ? (subject.trim() || null) : null,
        body, variables: used, providerRef: providerRef.trim() || null, activate: true,
      });
      toast({ title: 'Saved as a new version', description: `${def.title} · ${CHANNEL_LABEL[channel]} now sends the store's text.` });
      setNonce((n) => n + 1); setRowNonce((n) => n + 1);
      onChanged();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'The server refused this version.');
    } finally { setSaving(false); }
  };

  const revert = async () => {
    setReverting(true); setErr(null);
    try {
      const r = await messageTemplatesAPI.revert(def.key, channel);
      const nowSource = r?.now?.source;
      if (nowSource && nowSource !== 'growcord_default') {
        toast({ title: 'Your versioned text is off', description: `${def.title} · ${CHANNEL_LABEL[channel]} still sends the older per-event text from the SMS/WhatsApp gateway mapping.` });
      } else {
        toast({ title: 'Back on Growcord’s default', description: `${def.title} · ${CHANNEL_LABEL[channel]}` });
      }
      setConfirmRevert(false);
      setNonce((n) => n + 1); setRowNonce((n) => n + 1);
      onChanged();
    } catch (e: any) {
      setErr(e?.response?.status === 404
        ? 'Reverting needs the backend update that carries the message catalogue. Until then the override stays in force.'
        : (e?.response?.data?.message || e?.message || 'Could not revert.'));
      setConfirmRevert(false);
    } finally { setReverting(false); }
  };

  const testSend = async () => {
    setTesting(true);
    const r = await messageTemplatesAPI.testSend(def.key, channel);
    setTesting(false);
    toast({
      variant: r.ok ? undefined : 'destructive',
      title: r.ok ? `Test ${CHANNEL_LABEL[channel]} sent${r.to ? ` to ${r.to}` : ''}` : `Test ${CHANNEL_LABEL[channel]} not sent`,
      description: r.message,
    });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r: any = await messageTemplatesAPI.syncApproval(channel);
      toast({
        title: r?.reachable ? 'Asked the provider' : 'Provider not reachable',
        description: r?.reachable ? `${r.templates?.length ?? 0} reported · ${r.updated ?? 0} updated.` : (r?.blockers?.join(' · ') || r?.error || 'Nothing was updated.'),
      });
      setNonce((n) => n + 1); onChanged();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not ask the provider', description: e?.response?.data?.message || e?.message });
    } finally { setSyncing(false); }
  };

  // The preview follows the editor AS YOU TYPE: any words in the box are rendered unsaved
  // (`bodySource: 'draft'`); an empty box previews what a send would use now.
  const draft = body.trim() ? { subject, body } : null;
  const quickText = fillExamples(body || (channel === 'whatsapp' ? (def.whatsapp?.preview || '') : growcord.body), def, { smsSignature: smsOwnHeader ? '' : '-GROWCORD' });

  return (
    <>
      <Sheet open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              {def.title}
              <Chip tone={KIND_TONE[def.kind]}>{KIND_LABEL[def.kind]}</Chip>
            </SheetTitle>
            <SheetDescription>{def.description}</SheetDescription>
            <p className="font-mono text-[11px] text-ink-mute">{def.key}{def.trigger ? ` · ${def.trigger}` : ''}</p>
          </SheetHeader>

          <div role="tablist" aria-label="Channel" className="mt-4 flex gap-1 border-b border-line">
            {channels.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={c === channel} onClick={() => setChannel(c)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${c === channel ? 'border-brand font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={LAYER_TONE[layerKey]}>{LAYER_FILTER_LABEL[layerKey]}</Chip>
              {approval && <Chip tone={approval.tone}>{approval.label}</Chip>}
              {layer?.version ? <span className="text-xs text-ink-soft">v{layer.version}</span> : null}
              <div className="ml-auto flex gap-2">
                {(channel === 'sms' || channel === 'whatsapp') && (
                  <Button type="button" size="sm" variant="outline" onClick={sync} disabled={syncing}>
                    {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Sync approval
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={testSend} disabled={testing}>
                  {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Test send to me
                </Button>
              </div>
            </div>

            {/* Growcord default — read-only */}
            <section className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Growcord default</p>
                <InfoTip text="What every store sends until it writes its own. Kept in Growcord's catalogue; it cannot be edited here." />
                {canWrite && (
                  <Button type="button" size="sm" variant="ghost" className="ml-auto h-7" onClick={useAsBase}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Use as base
                  </Button>
                )}
              </div>
              {growcord.subject && <p className="text-sm font-medium text-ink">{growcord.subject}</p>}
              {channel === 'email' ? (
                <p className="text-xs text-ink-soft">A designed email inside the header and footer. See it rendered in the preview below.</p>
              ) : (
                <p className="whitespace-pre-wrap font-mono text-xs text-ink">{channel === 'whatsapp' ? (def.whatsapp?.preview || def.whatsapp?.body || '—') : (growcord.body || '—')}</p>
              )}
              {channel === 'sms' && def.sms && (
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  DLT header {def.sms.dlt.header} · {def.sms.dlt.registered ? `registered${def.sms.dlt.templateId ? ` (${def.sms.dlt.templateId})` : ''}` : 'not registered yet — until it is, this event goes out on the next channel'}
                </p>
              )}
              {channel === 'whatsapp' && def.whatsapp && (
                <p className="mt-1.5 text-[11px] text-ink-soft">Meta template <span className="font-mono">{def.whatsapp.name}</span> · {def.whatsapp.category.toLowerCase()}</p>
              )}
            </section>

            {/* Store override */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your text</p>
                <InfoTip text="Saving makes a new version and sends it from now on. Messages already on their way keep the version they started with." />
                {!storeLayer && !dirty && <span className="text-xs text-ink-soft">None yet — the Growcord default is sending.</span>}
                {layer?.source === 'store_sms' && (
                  <span className="text-xs text-ink-soft">From the older per-event gateway mapping. Saving here makes a versioned text that replaces it.</span>
                )}
              </div>

              {(channel === 'email' || channel === 'push') && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">{channel === 'email' ? 'Subject' : 'Title'}</span>
                  <Input value={subject} disabled={!canWrite} placeholder={growcord.subject ?? ''} onChange={(e) => setSubject(e.target.value)} />
                </label>
              )}

              {channel === 'sms' && canWrite && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {dlt === null ? (
                    <Button type="button" size="sm" variant="outline" onClick={loadDlt}>Pick a registered DLT text</Button>
                  ) : dlt.length === 0 ? (
                    <span className="text-ink-soft">No registered DLT texts on the gateway account.</span>
                  ) : (
                    <select aria-label="Registered DLT text" className="h-8 max-w-full rounded-md border border-input bg-surface px-2 text-xs"
                      value={providerRef} onChange={(e) => {
                        const t = dlt.find((d) => d.id === e.target.value);
                        setProviderRef(e.target.value);
                        if (t) setBody(toEditable(t.template, def.variables.map((v) => v.key)));
                      }}>
                      <option value="">— registered text —</option>
                      {dlt.map((d) => <option key={d.id} value={d.id}>{d.id} — {d.template.slice(0, 60)}</option>)}
                    </select>
                  )}
                </div>
              )}

              <Textarea ref={bodyRef} rows={channel === 'email' ? 8 : 5} className="font-mono text-sm" value={body} disabled={!canWrite}
                placeholder={channel === 'email' ? 'Write the email text. Leave empty to keep Growcord’s designed email.' : 'Write your own text, or use the default as a base.'}
                onChange={(e) => setBody(e.target.value)} />

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
                {meter ? (
                  <span className={meter.parts > 1 || meter.unicode ? 'text-warn-ink' : ''}>
                    {fillExamples(body || growcord.body, def).length} chars · {meter.parts} part{meter.parts > 1 ? 's' : ''} ({meter.per}/part, {meter.unicode ? 'UCS-2' : 'GSM-7'})
                  </span>
                ) : limit ? <span className={body.length > limit ? 'text-bad-ink' : ''}>{body.length} / {limit} chars</span> : <span>{body.length} chars</span>}
                {channel === 'sms' && (
                  <span>· Signature <span className="font-mono">{smsOwnHeader ? 'your registered one' : '-GROWCORD'}</span>{signatureLocked ? ' (fixed until your own DLT header is registered)' : ''}</span>
                )}
              </div>

              {def.variables.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {def.variables.map((v) => (
                    <button key={v.key} type="button" disabled={!canWrite} onClick={() => insertVar(v.key)}
                      title={`${v.description}${v.example ? ` — e.g. ${v.example}` : ''}`}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink hover:border-brand disabled:opacity-60">
                      {`{{${v.key}}}`}{v.example && <span className="font-sans text-ink-mute">{v.example}</span>}
                    </button>
                  ))}
                </div>
              )}

              {undeclared.length > 0 && (
                <p className="rounded-md border border-warn bg-warn-bg px-2.5 py-1.5 text-xs text-warn-ink">
                  Not a variable of this message: {undeclared.map((u) => `{{${u}}}`).join(', ')} — it would go out as written.
                </p>
              )}
              {otpMissing && (
                <p className="rounded-md border border-bad bg-bad-bg px-2.5 py-1.5 text-xs text-bad-ink">
                  A sign-in message must contain {'{{otp}}'} — without it the person is told to enter a code the message does not carry.
                </p>
              )}
              {err && <p className="rounded-md border border-bad bg-bad-bg px-2.5 py-1.5 text-xs text-bad-ink">{err}</p>}

              {canWrite && (
                <div className="flex flex-wrap justify-end gap-2">
                  {layer?.source === 'store_version' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRevert(true)}>
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Revert to Growcord default
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={!dirty} onClick={() => { setSubject(initial.subject); setBody(initial.body); setProviderRef(initial.providerRef); }}>Discard</Button>
                  <Button type="button" size="sm" disabled={!dirty || saving || !body.trim()} onClick={save}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save version
                  </Button>
                </div>
              )}
            </section>

            {/* Preview */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Preview</p>
              {channel !== 'email' && <ChannelPreview channel={channel} subject={subject || growcord.subject} body={quickText} />}
              <ServerPreview templateKey={def.key} channel={channel} draft={draft} layout={layout} onLayout={setLayout} nonce={nonce} />
            </section>

            {/* Versions */}
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Versions</p>
              {versions === null ? <Loader2 className="h-4 w-4 animate-spin text-ink-mute" /> : versions.length === 0 ? (
                <p className="text-xs text-ink-soft">No store versions yet. The first save makes v1.</p>
              ) : (
                <ol className="space-y-1.5">
                  {versions.map((v: any) => {
                    const a = approvalOf({ source: 'store_version', approvalStatus: v.approval_status });
                    return (
                      <li key={v.id ?? v.version} className="rounded-md border border-line px-2.5 py-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-ink">v{v.version}</strong>
                          <Chip tone={v.status === 'active' ? 'green' : 'neutral'}>{v.status || '—'}</Chip>
                          {a && <Chip tone={a.tone}>{a.label}</Chip>}
                          <span className="ml-auto text-ink-mute">{v.created_at ? formatDateTime(v.created_at) : ''}</span>
                        </div>
                        {v.body && <p className="mt-1 truncate font-mono text-ink-soft">{String(v.body).slice(0, 160)}</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmRevert} onOpenChange={setConfirmRevert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert to Growcord’s default?</DialogTitle>
            <DialogDescription>
              {def.title} on {CHANNEL_LABEL[channel]} stops sending the store’s text and sends Growcord’s default from the next message. Your versions stay in the history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevert(false)}>Keep mine</Button>
            <Button onClick={revert} disabled={reverting}>{reverting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Revert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateEditorDrawer;
