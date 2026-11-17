/**
 * ChatGPT ads (`/panel/marketing/chatgpt`, lane CHATGPT-3; plan growcord-rs/docs/briefs/CHATGPT-0-plan.md).
 * Owner, 18 Nov 2026: "conversion integration with option to turn off, multiple pixel and conversion tracking for chat
 * gpt, also integrate API so there will be single Growcord account serving ads for all account".
 *
 * One page: the main switch (D1, off by default), the store's pixels with their Conversions API keys and browser and
 * server switches (D3), the product details switch (D2, off by default because of OpenAI's health data term), the ad
 * account Growcord may manage (D4, the store's own Ads API key first), "Create pixel and key", "Send test event" and
 * what was sent. Settings go through the Settings Center client (`chatgptApi` in lib/v2/areas/chatgpt.ts); the page is
 * built from the Meta pages' kit (meta/common.tsx) and the Settings Center's secret field (SettingFieldControl).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import SettingFieldControl from '@/components/settings/SettingFieldControl';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/date';
import { GapNotice } from '@/pages/payments/common';
import {
  chatgptApi, CHATGPT_SETTING, type ChatgptPixel, type ChatgptPixelStatus, type ChatgptRecentEvent, type ChatgptSettings,
  type ChatgptStatus, type ChatgptTestResult, type KeySource,
} from '@/lib/v2/areas/chatgpt';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, num, plural, useLoad, writeError, type Tone } from '../meta/common';

/** The product details note, in the owner's brief's words. */
const PRODUCT_NOTE = "Off by default. OpenAI's terms do not allow data that could reveal a customer's health. With this off, ChatGPT receives the order value and number only, never product names.";

const KEY_SOURCE: Record<KeySource, { tone: Tone; text: string }> = {
  store: { tone: 'good', text: 'Your own Ads API key is used' },
  growcord: { tone: 'good', text: "Growcord's access is used" },
  none: { tone: 'warn', text: 'No Ads API access yet' },
};

/** A pixel row being edited: the saved fields, whether a key is stored, a newly typed key and a local id for React. */
interface PixelDraft extends ChatgptPixel { rowId: string; newKey: string }

let rowSeq = 0;
const draftOf = (p: ChatgptPixel): PixelDraft => ({ ...p, rowId: `px-${++rowSeq}`, newKey: '' });
const sameRows = (a: PixelDraft[], b: ChatgptPixel[]) =>
  a.length === b.length && a.every((d, i) => d.pixelId.trim() === b[i].pixelId && d.label.trim() === b[i].label && d.browser === b[i].browser && d.server === b[i].server && d.newKey.trim() === '');

const ChatgptAdsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const settingsQ = useLoad(() => chatgptApi.settings(), []);
  const statusQ = useLoad(() => chatgptApi.status(), []);
  const s = settingsQ.data;
  const st = statusQ.data;
  const canWrite = !!s?.canWrite;
  // Test and provision are the marketing routes' own; the server has the last word, so a refusal shows its reason.
  const canAct = canWrite || hasPerm('marketing.manage') || hasPerm('settings.manage');
  const reloadAll = async () => { await Promise.all([settingsQ.reload(), statusQ.reload()]); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">ChatGPT ads</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tell OpenAI what people who came from ChatGPT ads did in your store: one switch for everything, as many pixels as you need, and the ad account Growcord can manage for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s && <StateChip tone={s.enabled ? 'good' : 'neutral'}>{s.enabled ? 'Tracking on' : 'Tracking off'}</StateChip>}
          <Button size="sm" variant="outline" onClick={reloadAll} disabled={settingsQ.loading || statusQ.loading}>
            {settingsQ.loading || statusQ.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
          </Button>
        </div>
      </div>

      {settingsQ.error && !s ? (
        <LoadFailure failure={settingsQ.error} what="The ChatGPT pixel setting could not be read." onRetry={settingsQ.reload} />
      ) : settingsQ.loading && !s ? (
        <p className="text-sm text-gray-500">Loading the ChatGPT settings...</p>
      ) : !s ? (
        <GapNotice what={`The store setting ${CHATGPT_SETTING} (ChatGPT pixel and conversion tracking) is not on this server yet.`} />
      ) : (
        <>
          <Decision s={s} st={st} />
          {!canWrite && <p className="text-sm text-gray-600">You can see these settings but not change them. Ask the store owner for the settings permission.</p>}
          <TrackingSwitches s={s} canWrite={canWrite} onSaved={reloadAll} />
          <PixelsSection s={s} st={st} canWrite={canWrite} canAct={canAct} onSaved={reloadAll} />
          <AdAccountSection s={s} st={st} canWrite={canWrite} onSaved={reloadAll} />
        </>
      )}

      {statusQ.error && !st
        ? <LoadFailure failure={statusQ.error} what="What was sent to ChatGPT (GET /api/v2/marketing/chatgpt/status) is not served yet." onRetry={statusQ.reload} />
        : st?.recentEvents && <RecentEvents rows={st.recentEvents} />}

      <p className="text-xs text-gray-500">
        For your information: OpenAI's ad policy says ads for health services outside the US are generally not allowed.
        {' '}Who may be tracked is set in <Link className={linkCls} to="/panel/marketing/compliance">Compliance</Link>.
      </p>
    </div>
  );
};

/** What to act on, most serious first (dashboards lead with decisions). */
const Decision: React.FC<{ s: ChatgptSettings; st: ChatgptStatus | null }> = ({ s, st }) => {
  const acts: Array<{ tone: Tone; text: React.ReactNode }> = [];
  if (!s.enabled) {
    return <Lead tone="neutral" title="ChatGPT tracking is off">Nothing is sent to OpenAI from the browser or the server. Turn it on below when your pixel is ready.</Lead>;
  }
  if (!s.pixels.length) acts.push({ tone: 'bad', text: 'Tracking is on, but no pixel is added, so nothing is sent.' });
  const live = s.pixels.filter((p) => p.browser || p.server);
  if (s.pixels.length && !live.length) acts.push({ tone: 'bad', text: 'Every pixel has both its browser and its server switch off, so nothing is sent.' });
  for (const p of s.pixels) {
    const ps = st?.pixels.find((x) => x.pixelId === p.pixelId);
    const hasKey = ps ? ps.hasKey : p.keyStored;
    if (p.server && !hasKey) acts.push({ tone: 'warn', text: <>Pixel <span className="font-mono">{p.pixelId}</span> has server events on but no Conversions API key, so only the browser sends.</> });
    if (ps?.lastError) acts.push({ tone: 'bad', text: <>Pixel <span className="font-mono">{p.pixelId}</span>, {ago(ps.lastSentAt)}: {ps.lastError}</> });
  }
  if (st?.error) acts.push({ tone: 'warn', text: st.error });
  if (!acts.length) {
    return <Lead tone="good" title="ChatGPT receives your events">{plural(live.length, 'pixel')} on. Purchases go from the server with the same event id as the browser, so OpenAI counts each once.</Lead>;
  }
  const worst: Tone = acts.some((a) => a.tone === 'bad') ? 'bad' : 'warn';
  return (
    <Lead tone={worst} title={acts.length === 1 ? 'One thing to act on' : `${acts.length} things to act on`}>
      <ul className="mt-1 list-disc space-y-1 pl-5">{acts.map((a, i) => <li key={i}>{a.text}</li>)}</ul>
    </Lead>
  );
};

/** The main switch and the product details switch, each saved on change (as the Meta events switches are). */
const TrackingSwitches: React.FC<{ s: ChatgptSettings; canWrite: boolean; onSaved: () => Promise<void> }> = ({ s, canWrite, onSaved }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (key: 'enabled' | 'productLevelEvents', v: boolean, title: string) => {
    setBusy(key);
    try { await chatgptApi.save({ [key]: v }); toast({ title }); await onSaved(); }
    catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The setting was not saved.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return (
    <Section title="Tracking" hint="One switch turns every ChatGPT pixel on or off, in the browser and on the server.">
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={s.enabled} disabled={!canWrite || busy !== null} onCheckedChange={(v) => save('enabled', v, v ? 'ChatGPT tracking on' : 'ChatGPT tracking off')} className="mt-0.5" />
          <span>
            <span className="font-medium">Send events to ChatGPT</span>
            {busy === 'enabled' && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
            <span className="block text-xs text-gray-600">Off by default. On: each pixel below gets page views, product views, add to cart, checkout and orders, from the browser and the server as its own switches allow. Off: nothing goes to OpenAI.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={s.productLevelEvents} disabled={!canWrite || busy !== null} onCheckedChange={(v) => save('productLevelEvents', v, v ? 'Product details on' : 'Product details off')} className="mt-0.5" />
          <span>
            <span className="font-medium">Send product details</span>
            {busy === 'productLevelEvents' && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
            <span className="block text-xs text-gray-600">{PRODUCT_NOTE}</span>
          </span>
        </label>
      </div>
    </Section>
  );
};

/** The store's pixels: add, remove, label, pixel id, Conversions API key, browser and server switches; test and provision. */
const PixelsSection: React.FC<{ s: ChatgptSettings; st: ChatgptStatus | null; canWrite: boolean; canAct: boolean; onSaved: () => Promise<void> }> = ({ s, st, canWrite, canAct, onSaved }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PixelDraft[]>(() => s.pixels.map(draftOf));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<ChatgptTestResult[] | null>(null);
  const [newLabel, setNewLabel] = useState('Website');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionNote, setProvisionNote] = useState<{ tone: Tone; text: string } | null>(null);
  // Start again from the saved list only when it changed (a switch saved elsewhere on the page keeps these edits).
  const savedKey = JSON.stringify(s.pixels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(s.pixels.map(draftOf)); }, [savedKey]);

  const dirty = !sameRows(rows, s.pixels);
  const problems = useMemo(() => {
    const out: string[] = [];
    const ids = rows.map((r) => r.pixelId.trim());
    if (ids.some((id) => !id)) out.push('Every pixel needs its pixel id.');
    const dup = ids.filter((id, i) => id && ids.indexOf(id) !== i);
    if (dup.length) out.push(`Pixel ${[...new Set(dup)].join(', ')} is listed twice.`);
    return out;
  }, [rows]);

  const edit = (rowId: string, patch: Partial<PixelDraft>) => setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, draftOf({ pixelId: '', label: '', browser: true, server: true, keyStored: false })]);
  const remove = (rowId: string) => setRows((rs) => rs.filter((r) => r.rowId !== rowId));

  const save = async () => {
    if (problems.length) return;
    setSaving(true);
    try {
      await chatgptApi.save({ pixels: rows.map((r) => ({ pixelId: r.pixelId, label: r.label, browser: r.browser, server: r.server, conversionsApiKey: r.newKey })) });
      toast({ title: 'Pixels saved' });
      await onSaved();
      setRows((cur) => cur.map((r) => ({ ...r, newKey: '' })));
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The pixels were not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const test = async (pixelId?: string) => {
    setTesting(pixelId ?? '*');
    try {
      const r = await chatgptApi.test(pixelId);
      setResults(r);
      const bad = r.filter((x) => !x.ok).length;
      toast({ title: !r.length ? 'No pixel was tested' : bad ? `${plural(bad, 'pixel')} refused the test` : 'OpenAI accepted the test event', variant: bad ? 'destructive' : undefined });
    } catch (e) {
      toast({ title: 'Test not sent', description: writeError(e, 'The test event was not sent.'), variant: 'destructive' });
    } finally { setTesting(null); }
  };

  const provision = async () => {
    setProvisioning(true); setProvisionNote(null);
    try {
      const r = await chatgptApi.provision(newLabel.trim() || 'Website');
      if (!r.ok) setProvisionNote({ tone: 'bad', text: r.message || 'OpenAI did not create the pixel.' });
      else {
        setProvisionNote({
          tone: r.keyCreated ? 'good' : 'warn',
          text: r.message || (r.keyCreated ? `Pixel ${r.pixelId ?? ''} and its Conversions API key were created and saved.` : `Pixel ${r.pixelId ?? ''} was created, but no Conversions API key was made.`),
        });
        await onSaved();
      }
    } catch (e) {
      setProvisionNote({ tone: 'bad', text: writeError(e, 'The pixel was not created.') });
    } finally { setProvisioning(false); }
  };

  const statusOf = (pixelId: string): ChatgptPixelStatus | undefined => st?.pixels.find((p) => p.pixelId === pixelId.trim());

  return (
    <Section
      title="Pixels"
      hint="Each pixel has its own Conversions API key and its own browser and server switches. Events go to every pixel that is on."
      actions={canAct && s.pixels.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => test()} disabled={testing !== null || dirty}>
          {testing === '*' && <Loader2 className="animate-spin" />} Send test event
        </Button>
      )}
    >
      <div className="space-y-3">
        {!rows.length && <p className="text-sm text-gray-600">No pixel yet. Add the pixel id from OpenAI Ads Manager, Conversions, Data source, or create one below.</p>}
        {rows.map((r, i) => {
          const ps = statusOf(r.pixelId);
          // A stored key belongs to its saved pixel id: a new or retyped id has none until one is pasted.
          const savedRow = s.pixels.find((p) => p.pixelId === r.pixelId.trim());
          const saved = !!savedRow;
          const keyStored = savedRow ? (ps ? ps.hasKey : savedRow.keyStored) : false;
          return (
            <div key={r.rowId} className="rounded-md border p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor={`cg-id-${r.rowId}`}>Pixel id</Label>
                  <Input id={`cg-id-${r.rowId}`} className="mt-1 h-9 font-mono" value={r.pixelId} placeholder="From Ads Manager, Conversions" disabled={!canWrite} onChange={(e) => edit(r.rowId, { pixelId: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`cg-label-${r.rowId}`}>Label</Label>
                  <Input id={`cg-label-${r.rowId}`} className="mt-1 h-9" value={r.label} placeholder="Website" disabled={!canWrite} onChange={(e) => edit(r.rowId, { label: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`sf-pixels[${i}].conversionsApiKey`}>Conversions API key</Label>
                  <div className="mt-1">
                    <SettingFieldControl
                      field={{ path: `pixels[${i}].conversionsApiKey`, label: 'Conversions API key', type: 'secret' }}
                      value={r.newKey} onChange={(v) => edit(r.rowId, { newKey: String(v ?? '') })}
                      disabled={!canWrite} secretSet={keyStored}
                    />
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-3 text-sm">
                    <Switch checked={r.browser} disabled={!canWrite} onCheckedChange={(v) => edit(r.rowId, { browser: v })} className="mt-0.5" />
                    <span><span className="font-medium">Browser events</span><span className="block text-xs text-gray-600">The OpenAI pixel on your store pages, under the store's cookie consent rules.</span></span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <Switch checked={r.server} disabled={!canWrite} onCheckedChange={(v) => edit(r.rowId, { server: v })} className="mt-0.5" />
                    <span><span className="font-medium">Server events</span><span className="block text-xs text-gray-600">Orders and checkout steps sent by Growcord's server with the Conversions API key, so ad blockers do not lose them.</span></span>
                  </label>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-gray-600">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {saved ? <>
                    <StateChip tone={keyStored ? 'good' : r.server ? 'warn' : 'neutral'}>{keyStored ? 'Key stored' : 'No key'}</StateChip>
                    <span>Last sent {ago(ps?.lastSentAt)}</span>
                    <span>Sent in 24 hours: {ps?.sent24h == null ? 'n/a' : num(ps.sent24h)}</span>
                  </> : <StateChip tone="info">Not saved yet</StateChip>}
                </span>
                <span className="flex flex-wrap gap-2">
                  {canAct && saved && !dirty && (
                    <Button size="sm" variant="outline" onClick={() => test(r.pixelId.trim())} disabled={testing !== null}>
                      {testing === r.pixelId.trim() && <Loader2 className="animate-spin" />} Send test event
                    </Button>
                  )}
                  {canWrite && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(r.rowId)}><Trash2 /> Remove</Button>}
                </span>
              </div>
              {ps?.lastError && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">Last error: {ps.lastError}</p>}
            </div>
          );
        })}

        {problems.length > 0 && <ul className="list-disc pl-5 text-sm text-red-700">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={add}><Plus /> Add pixel</Button>
            <span className="flex-1" />
            {dirty && <Button size="sm" variant="ghost" onClick={() => setRows(s.pixels.map(draftOf))} disabled={saving}>Undo changes</Button>}
            <Button size="sm" onClick={save} disabled={!dirty || saving || problems.length > 0}>{saving && <Loader2 className="animate-spin" />} Save pixels</Button>
          </div>
        )}

        {results && (
          <div className="rounded-md border">
            <p className="border-b bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">Test results (checked by OpenAI only, not counted in your reports)</p>
            <ul className="divide-y">
              {results.length ? results.map((r, i) => (
                <li key={`${r.pixelId}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm">
                  <StateChip tone={r.ok ? 'good' : 'bad'}>{r.ok ? 'Accepted' : 'Refused'}</StateChip>
                  <span className="font-mono text-xs">{r.pixelId || 'n/a'}</span>
                  {r.message && <span className="min-w-0 flex-1 text-gray-700">{r.message}</span>}
                </li>
              )) : <li className="px-3 py-2 text-sm text-gray-600">The server tested no pixel.</li>}
            </ul>
          </div>
        )}

        {canAct && (
          <div className="rounded-md border border-dashed p-3">
            <p className="text-sm font-medium text-gray-900">Create pixel and key</p>
            <p className="text-xs text-gray-600">Growcord asks OpenAI for a new pixel and its Conversions API key through the ad account below, and saves both here. OpenAI has to allow this for the ad account; when it does not, create them in Ads Manager, Conversions, and paste them above.</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="cg-new-label" className="text-xs">Label</Label>
                <Input id="cg-new-label" className="mt-1 h-9 max-w-[16rem]" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              </div>
              <Button size="sm" onClick={provision} disabled={provisioning || dirty}>{provisioning && <Loader2 className="animate-spin" />} Create pixel and key</Button>
            </div>
            {dirty && <p className="mt-1 text-xs text-gray-500">Save or undo your pixel changes first.</p>}
            {provisionNote && <p className={cn('mt-2 rounded-md border px-2 py-1 text-sm', provisionNote.tone === 'bad' ? 'border-red-200 bg-red-50 text-red-800' : provisionNote.tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>{provisionNote.text}</p>}
          </div>
        )}
      </div>
    </Section>
  );
};

/** The ad account Growcord may manage, and the store's own Ads API key (used first when given). */
const AdAccountSection: React.FC<{ s: ChatgptSettings; st: ChatgptStatus | null; canWrite: boolean; onSaved: () => Promise<void> }> = ({ s, st, canWrite, onSaved }) => {
  const { toast } = useToast();
  const [accountId, setAccountId] = useState(s.adAccountId);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAccountId(s.adAccountId); setKey(''); }, [s.adAccountId, s.adsApiKeyStored]);
  const dirty = accountId.trim() !== s.adAccountId || key.trim() !== '';
  const save = async () => {
    setSaving(true);
    try {
      await chatgptApi.save({ adAccountId: accountId, adsApiKey: key });
      toast({ title: 'Ad account saved' });
      await onSaved();
      setKey('');
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The ad account was not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };
  const src = st ? KEY_SOURCE[st.keySource] : null;
  return (
    <Section title="Ad account" hint="Your ChatGPT ad account in OpenAI Ads Manager." actions={src && <StateChip tone={src.tone}>{src.text}</StateChip>}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Growcord can manage this ad account for you when you invite Growcord to it in OpenAI Ads Manager: enter the ad account id and Growcord's access does the rest.
          If you also give your own Ads API key, your key is used first.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="cg-account">Ad account id</Label>
            <Input id="cg-account" className="mt-1 h-9 font-mono" value={accountId} disabled={!canWrite} onChange={(e) => setAccountId(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sf-adsApiKey">Ads API key (optional)</Label>
            <div className="mt-1">
              <SettingFieldControl field={{ path: 'adsApiKey', label: 'Ads API key', type: 'secret' }} value={key} onChange={(v) => setKey(String(v ?? ''))} disabled={!canWrite} secretSet={s.adsApiKeyStored} />
            </div>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Button size="sm" variant="ghost" onClick={() => { setAccountId(s.adAccountId); setKey(''); }} disabled={saving}>Undo changes</Button>}
            <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving && <Loader2 className="animate-spin" />} Save ad account</Button>
          </div>
        )}
      </div>
    </Section>
  );
};

/** OpenAI's own list of the events it received lately, read through the server (kept loose: the first field present). */
const first = (o: ChatgptRecentEvent, keys: string[]): unknown => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
const whenOf = (v: unknown): string => formatDateTime(typeof v === 'number' && v < 1e12 ? v * 1000 : v, 'n/a');
const CHANNEL: Record<string, string> = { pixel_sdk: 'Browser', server_to_server: 'Server' };

const RecentEvents: React.FC<{ rows: ChatgptRecentEvent[] }> = ({ rows }) => (
  <Section title="What OpenAI received lately" hint="OpenAI's own list for the last few minutes. An empty list means nothing arrived in that time.">
    {!rows.length ? <p className="text-sm text-gray-600">No events in the last few minutes.</p> : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">Pixel</th>
              <th className="px-3 py-2 font-medium">Event id</th>
              <th className="py-2 pl-3 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ch = String(first(r, ['api_channel', 'apiChannel', 'channel']) ?? '');
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900">{String(first(r, ['event_name', 'eventName', 'name', 'type', 'event']) ?? 'n/a')}</td>
                  <td className="px-3 py-2">{CHANNEL[ch] ?? (ch || 'n/a')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(first(r, ['pixel_id', 'pixelId', 'pid']) ?? 'n/a')}</td>
                  <td className="break-all px-3 py-2 font-mono text-xs">{String(first(r, ['event_id', 'eventId', 'id']) ?? 'n/a')}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{whenOf(first(r, ['received_at', 'receivedAt', 'event_time', 'eventTime', 'timestamp', 'time', 'created_at']))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Section>
);

export default ChatgptAdsPage;
