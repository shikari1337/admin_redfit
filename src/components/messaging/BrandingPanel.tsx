import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Save } from 'lucide-react';
import { settingsRegistryAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import SettingFieldControl, { type RegistryField } from '@/components/settings/SettingFieldControl';
import MessageLayoutForm, { draftLayout, gateMessageLayoutDef } from '@/components/settings/MessageLayoutForm';
import { messagingAPI, errText, type LayoutPreviewResult } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import { ErrorNotice, GapNotice, failureOf, useSettingsRegistry, type LoadFailure, type RegistryDefLite } from './common';

/**
 * BRANDING — the frame every message from this store goes out in, and which
 * template pack its words come from (contract §3, DEC-070).
 *
 * It edits the SAME store setting the Settings Center calls 8.6
 * `messageLayout` (registry fields, `SettingFieldControl`, saved with
 * `PATCH /commerce/settings/registry/messageLayout`), so there is still one
 * place the value lives. `templatePack` is a field of that same setting:
 * `growcord` (the default, brand-neutral) or `homeomed` (an overlay of
 * Homeomed's own wording). The store's own edited template still wins over
 * either pack.
 *
 * Two previews: the instant frame drawn here while typing
 * (`MessageLayoutForm`), and the real render from the server on the
 * catalogue's sample data with the unsaved layout (`POST /comms/layout/preview`).
 */

const KEY = 'messageLayout';
const PACK_PATH = 'templatePack';

/** The packs the contract names (§3); the registry's own options win when it declares them. */
const PACK_FALLBACK = [
  { value: 'growcord', label: 'Growcord (default)', hint: 'Plain, brand-neutral wording that suits any store and any product.' },
  { value: 'homeomed', label: 'Homeomed', hint: 'Homeomed’s own wording (remedies, potency) in place of the default where it has one.' },
];

const getPath = (obj: any, path: string): any =>
  (!path ? obj : path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj));

const BrandingPanel: React.FC<{
  /** Messages to preview (key + admin-facing name); the server picks a sample when none is chosen. */
  messages?: Array<{ key: string; label: string }>;
  /** Start the server preview on this channel. */
  previewChannel?: 'email' | 'whatsapp' | 'sms';
}> = ({ messages = [], previewChannel = 'email' }) => {
  const reg = useSettingsRegistry();
  const raw = reg.defFor(KEY);

  if (reg.loading && !reg.defs) return <div aria-busy="true"><BlockSkeleton lines={8} /></div>;
  if (reg.failure?.gap) return <GapNotice what="The store settings registry is not served by this server yet, so the message header and footer cannot be read here." />;
  if (reg.failure) return <ErrorNotice message={reg.failure.message} onRetry={reg.reload} />;
  if (!raw) return <GapNotice what="This server's settings registry has no message header & footer (8.6) setting." />;
  return <BrandingEditor raw={raw} onSaved={reg.reload} messages={messages} previewChannel={previewChannel} />;
};

const BrandingEditor: React.FC<{
  raw: RegistryDefLite; onSaved: () => void;
  messages: Array<{ key: string; label: string }>; previewChannel: 'email' | 'whatsapp' | 'sms';
}> = ({ raw, onSaved, messages, previewChannel }) => {
  const { toast } = useToast();
  // G-M5: the SMS signature is read-only unless the server says the store may set it.
  const def = useMemo(() => gateMessageLayoutDef(raw as any) as unknown as RegistryDefLite, [raw]);
  const packField = def.fields.find((f) => f.path === PACK_PATH);
  const fields = useMemo(() => def.fields.filter((f) => f.path !== PACK_PATH), [def]);
  const packOptions = (def.options?.[PACK_PATH]?.length ? def.options[PACK_PATH] : packField?.options?.length ? packField.options : PACK_FALLBACK) as Array<{ value: string; label: string; hint?: string }>;

  const initial = useMemo(() => {
    const o: Record<string, any> = Object.fromEntries(fields.map((f) => [f.path, f.type === 'secret' ? '' : getPath(def.value, f.path)]));
    o[PACK_PATH] = getPath(def.value, PACK_PATH) ?? 'growcord';
    return o;
  }, [def, fields]);
  const [work, setWork] = useState<Record<string, any>>(initial);
  useEffect(() => { setWork(initial); }, [initial]);

  const dirty = useMemo(() => [...fields.filter((f) => !f.readonly).map((f) => f.path), PACK_PATH]
    .filter((p) => JSON.stringify(work[p]) !== JSON.stringify(initial[p])), [fields, work, initial]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canWrite = !!def.canWrite;

  const save = async () => {
    if (!dirty.length || !canWrite) return;
    setSaving(true); setErr(null);
    try {
      const patch: Record<string, any> = {};
      for (const p of dirty) patch[p] = work[p];
      await settingsRegistryAPI.update(KEY, patch);
      toast({ title: 'Branding saved', description: `${dirty.length} change${dirty.length === 1 ? '' : 's'} applied to every message from now on.` });
      onSaved();
    } catch (e: any) {
      setErr(errText(e, 'Could not save the branding.'));
    } finally { setSaving(false); }
  };

  // The server preview ALWAYS gets the pack (saved, or the unsaved choice): `layout_preview.rs` picks the body by
  // the unsaved layout's `templatePack` (MSG-1 `RenderOptions::template_pack`), so a missing one would preview
  // the saved pack's words under a radio that says otherwise. Set last, so the draft can never drop it.
  const pack = String(work[PACK_PATH] || getPath(def.value, PACK_PATH) || 'growcord');
  const layout = useMemo(() => ({ ...draftLayout(def.value, work, fields), [PACK_PATH]: pack }), [def.value, work, fields, pack]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <fieldset className="rounded-lg border border-line bg-surface p-4" disabled={!canWrite}>
          <legend className="px-1 text-sm font-semibold text-ink">Template pack</legend>
          <p className="mb-3 text-xs text-ink-soft">Which default wording your messages use. Any message you have rewritten keeps your words.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {packOptions.map((o) => {
              const on = String(work[PACK_PATH]) === String(o.value);
              return (
                <label key={String(o.value)}
                  className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', on ? 'border-brand bg-brand/5' : 'border-line hover:border-line-strong', !canWrite && 'cursor-not-allowed opacity-70')}>
                  <input type="radio" name="templatePack" className="mt-0.5" checked={on} value={String(o.value)}
                    onChange={() => setWork((w) => ({ ...w, [PACK_PATH]: o.value }))} />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{o.label}</span>
                    {o.hint && <span className="mt-0.5 block text-xs text-ink-soft">{o.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">{def.title || 'Message header & footer'}</p>
              <p className="mt-0.5 max-w-xl text-xs text-ink-soft">{def.description}</p>
            </div>
            <Link to={`/settings?key=${KEY}`} className="inline-flex items-center gap-1 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
              <ExternalLink className="h-3 w-3" /> Settings {def.code || '8.6'}
            </Link>
          </div>
          {fields.map((f) => (
            <div key={f.path} className="grid gap-1.5 md:grid-cols-[180px_1fr] md:gap-4">
              <div>
                <label htmlFor={`sf-${f.path}`} className="text-sm font-medium text-ink">{f.label}</label>
                {(f.description || f.help) && <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{f.description || f.help}</p>}
              </div>
              <SettingFieldControl field={f as unknown as RegistryField} value={work[f.path]}
                onChange={(v) => setWork((w) => ({ ...w, [f.path]: v }))}
                options={def.options?.[f.path] as any} disabled={!canWrite || f.readonly}
                secretSet={def.secretsStored?.includes(f.path)} folder={`settings/${KEY}`} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-xs text-ink-soft">
              {!canWrite ? `Read-only: needs the ${def.permission?.write ?? 'settings.manage'} permission.`
                : dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}` : 'No changes'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!dirty.length || saving} onClick={() => setWork(initial)}>Discard</Button>
              <Button size="sm" disabled={!dirty.length || saving || !canWrite} onClick={save}
                title={!canWrite ? 'Needs the settings.manage permission' : !dirty.length ? 'Nothing changed yet' : undefined}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
              </Button>
            </div>
          </div>
          {err && <ErrorNotice message={err} />}
        </div>
      </div>

      <div className="space-y-4">
        <MessageLayoutForm def={def as any} work={work} />
        <ServerLayoutPreview layout={layout} messages={messages} initialChannel={previewChannel} />
      </div>
    </div>
  );
};

/** The server's own render of one message in the (unsaved) layout and pack. */
const ServerLayoutPreview: React.FC<{
  layout: Record<string, unknown>; messages: Array<{ key: string; label: string }>; initialChannel: 'email' | 'whatsapp' | 'sms';
}> = ({ layout, messages, initialChannel }) => {
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'sms'>(initialChannel);
  const [key, setKey] = useState('');
  const [res, setRes] = useState<LayoutPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const layoutJson = JSON.stringify(layout);

  const run = useCallback(async (signal: { cancelled: boolean }) => {
    setBusy(true); setFailure(null);
    try {
      const r = await messagingAPI.layoutPreview({ channel, key: key || undefined, layout: JSON.parse(layoutJson) });
      if (!signal.cancelled) setRes(r);
    } catch (e: any) {
      if (!signal.cancelled) { setRes(null); setFailure(failureOf(e, 'The server could not render the preview.')); }
    } finally { if (!signal.cancelled) setBusy(false); }
  }, [channel, key, layoutJson]);

  useEffect(() => {
    const signal = { cancelled: false };
    const t = setTimeout(() => run(signal), 600);
    return () => { signal.cancelled = true; clearTimeout(t); };
  }, [run]);

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="server-layout-preview">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold uppercase tracking-wide text-ink">As the server sends it</p>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" aria-label="Rendering" />}
        <select aria-label="Preview channel" value={channel} onChange={(e) => setChannel(e.target.value as any)}
          className="h-8 rounded-md border border-input bg-surface px-2 text-xs">
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
        <select aria-label="Preview message" value={key} onChange={(e) => setKey(e.target.value)}
          className="h-8 max-w-[14rem] rounded-md border border-input bg-surface px-2 text-xs">
          <option value="">A sample message</option>
          {messages.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      {failure?.gap ? (
        <GapNotice what="The server-side layout preview is not on this server yet. The frame above is drawn here from what you typed." />
      ) : failure ? (
        <ErrorNotice message={failure.message} />
      ) : !res ? (
        <BlockSkeleton lines={5} />
      ) : (
        <div className={cn('space-y-2 transition-opacity', busy && 'opacity-60')}>
          {res.subject && <p className="text-sm"><span className="text-ink-soft">Subject: </span><span className="font-medium text-ink">{res.subject}</span></p>}
          {channel === 'email' && res.html ? (
            // The server's own HTML, shown with no script permission at all.
            <iframe title="Email preview" sandbox="" srcDoc={res.html} className="h-[520px] w-full rounded-md border border-line bg-surface" />
          ) : (
            <pre className="whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 font-sans text-sm text-ink">{res.text || '—'}</pre>
          )}
        </div>
      )}
    </div>
  );
};

export default BrandingPanel;
