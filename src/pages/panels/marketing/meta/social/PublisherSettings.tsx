/**
 * The Publisher's settings (lane META-15B): the `social` store setting's per channel limits and scheduler timers
 * (`GET|PATCH /marketing/social/settings`, META-12 section 5). Every field shows the seeded default; only the keys the
 * person changed are sent, and the server merges them key by key over what the store has.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { metaSocialApi, type SocialSettingsGroups } from '@/lib/v2/areas/meta';
import { LoadFailure, num, useLoad, writeError } from '../common';
import { ChannelMark } from './shared';

const LIMIT_LABEL: Record<string, string> = {
  max_chars: 'Most characters', max_media: 'Most files in a post', max_hashtags: 'Most hashtags', max_mentions: 'Most mentions', max_links: 'Most links',
  video: 'Videos', carousel: 'Carousels', reels: 'Reels', stories: 'Stories', first_comment: 'First comment', reels_share_to_feed: 'Reels also shown in the feed',
  count_emoji_bytes: 'Count an emoji as its bytes', image_extensions: 'Picture file types', video_extensions: 'Video file types',
};
const TIMER_LABEL: Record<string, string> = {
  batch: 'Posts taken per run', claim_seconds: 'Seconds a run holds a post', check_seconds: 'Seconds between checks on a waiting upload',
  give_up_hours: 'Hours before a waiting post is marked failed', media_link_hours: 'Hours the media link given to Meta lasts',
  min_lead_minutes: 'Earliest schedule, minutes from now', max_days_ahead: 'Latest schedule, days ahead',
  reply_wait_seconds: 'Seconds before a reply is read back', reply_checks: 'Times a reply is read back',
};
const words = (k: string, map: Record<string, string>) => map[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
type Group = Record<string, unknown>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const PublisherSettings: React.FC<{ canWrite: boolean; onClose: () => void }> = ({ canWrite, onClose }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaSocialApi.settings(), []);
  const [channels, setChannels] = useState<Record<string, Group>>({});
  const [scheduler, setScheduler] = useState<Group>({});
  /* META-20 (PAGE-05): push the Page details to Facebook as soon as a store setting that feeds them is saved. */
  const [pushOnChange, setPushOnChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q.data) return;
    setChannels(structuredClone((q.data.settings.channels ?? {}) as Record<string, Group>));
    setScheduler(structuredClone((q.data.settings.scheduler ?? {}) as Group));
    setPushOnChange((q.data.settings.page as Group | undefined)?.push_on_change === true);
  }, [q.data]);

  const patch = useMemo((): SocialSettingsGroups => {
    if (!q.data) return {};
    const out: SocialSettingsGroups = {};
    const inForce = (q.data.settings.channels ?? {}) as Record<string, Group>;
    for (const [ch, vals] of Object.entries(channels)) {
      const diff: Group = {};
      for (const [k, v] of Object.entries(vals)) if (!same(v, inForce[ch]?.[k])) diff[k] = v;
      if (Object.keys(diff).length) out.channels = { ...(out.channels ?? {}), [ch]: diff };
    }
    const sched: Record<string, number> = {};
    for (const [k, v] of Object.entries(scheduler)) if (!same(v, (q.data.settings.scheduler ?? {})[k])) sched[k] = Number(v);
    if (Object.keys(sched).length) out.scheduler = sched;
    if (pushOnChange !== ((q.data.settings.page as Group | undefined)?.push_on_change === true)) out.page = { push_on_change: pushOnChange };
    return out;
  }, [q.data, channels, scheduler, pushOnChange]);
  const changed = Object.keys(patch).length > 0;

  const save = async () => {
    setBusy(true); setError('');
    try { const next = await metaSocialApi.saveSettings(patch); q.setData(next); toast({ title: 'Publisher settings saved' }); onClose(); }
    catch (e) { setError(writeError(e, 'The settings were not saved.')); }
    finally { setBusy(false); }
  };

  const defaults = (q.data?.defaults ?? {}) as SocialSettingsGroups;
  const field = (value: unknown, def: unknown, set: (v: unknown) => void, label: string, id: string) => {
    if (typeof def === 'boolean' || typeof value === 'boolean') {
      return (
        <label className="flex items-center justify-between gap-3 py-1 text-sm">
          <span>{label}</span>
          <Switch checked={!!value} onCheckedChange={set} disabled={!canWrite} aria-label={label} />
        </label>
      );
    }
    if (Array.isArray(def) || Array.isArray(value)) {
      return (
        <div className="py-1">
          <label htmlFor={id} className="text-xs text-gray-600">{label}</label>
          <Input id={id} value={(Array.isArray(value) ? value : []).join(', ')} disabled={!canWrite} className="mt-0.5 h-8"
            placeholder={Array.isArray(def) && def.length ? (def as string[]).join(', ') : 'Any'}
            onChange={(e) => set(e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))} />
        </div>
      );
    }
    return (
      <div className="py-1">
        <label htmlFor={id} className="text-xs text-gray-600">{label}</label>
        <Input id={id} inputMode="numeric" value={value == null ? '' : String(value)} disabled={!canWrite} className="mt-0.5 h-8"
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value.replace(/[^\d]/g, '')))} />
        {def != null && <span className="text-[11px] text-gray-500">Default {typeof def === 'number' ? num(def) : String(def)}</span>}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publisher settings</DialogTitle>
          <DialogDescription>Each channel's limits are checked as people write; change them when Meta or Threads change theirs. Timers decide how scheduled posts go out.</DialogDescription>
        </DialogHeader>
        {q.error && !q.data ? <LoadFailure failure={q.error} what="The Publisher settings (GET /api/v2/marketing/social/settings) are not served yet." onRetry={q.reload} />
          : !q.data ? <p className="text-sm text-gray-500">Loading...</p> : (
            <div className="space-y-5">
              <section>
                <h3 className="text-sm font-semibold text-gray-900">Limits per channel</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  {Object.entries(channels).map(([ch, vals]) => (
                    <div key={ch} className="rounded-md border bg-white p-3">
                      <ChannelMark channel={ch} withName className="mb-1 text-sm" />
                      <div className="divide-y">
                        {Object.entries(vals).map(([k, v]) => (
                          <div key={k}>{field(v, (defaults.channels?.[ch] as Group | undefined)?.[k], (nv) => setChannels({ ...channels, [ch]: { ...vals, [k]: nv } }), words(k, LIMIT_LABEL), `ps-${ch}-${k}`)}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-900">Scheduler</h3>
                <div className="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(scheduler).map(([k, v]) => (
                    <div key={k}>{field(v, (defaults.scheduler as Group | undefined)?.[k], (nv) => setScheduler({ ...scheduler, [k]: nv }), words(k, TIMER_LABEL), `ps-s-${k}`)}</div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-900">Facebook Page details</h3>
                <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block">Send changes to Facebook when store settings are saved</span>
                    <span className="block text-xs text-gray-500">Phone, website and address go to your real Facebook Page as soon as they change. Off by default; while off, they go only when you push them.</span>
                  </span>
                  <Switch checked={pushOnChange} onCheckedChange={setPushOnChange} disabled={!canWrite} aria-label="Send Page details to Facebook when store settings are saved" />
                </label>
              </section>
            </div>
          )}
        <DialogFooter className="gap-2">
          <p className="min-w-0 flex-1 self-center text-sm text-red-700" role="alert">{error}</p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canWrite && <Button onClick={save} disabled={busy || !changed}>{busy && <Loader2 className="animate-spin" />} Save settings</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublisherSettings;
