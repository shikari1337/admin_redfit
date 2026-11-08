/**
 * Catalog health on the Catalog page (CAT-10, lane META-15B; route META-9C `GET /channels/{id}/catalog-health`): whether
 * the API push works, the hosted feed fallback Meta fetches when it does not, Meta's own catalog diagnostics (must fix
 * first), and the country and language overrides. A person stops the fallback (`DELETE /channels/{id}/feed-fallback`)
 * after a confirm, because Meta disables the ads of a deleted feed's items.
 */
import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { metaCatalogApi, type CatalogHealth } from '@/lib/v2/areas/meta';
import type { MetaCtx } from './useMetaCtx';
import { Lead, LoadFailure, Section, StateChip, ago, num, plural, useLoad, writeError, type Tone } from './common';

const FALLBACK: Record<string, { label: string; tone: Tone }> = {
  off: { label: 'Not in use', tone: 'neutral' },
  active: { label: 'Meta fetches the hosted feed', tone: 'warn' },
  standby: { label: 'Still running, API works again', tone: 'info' },
  failed: { label: 'Could not be started', tone: 'bad' },
};

/** The one thing the card leads with, most serious first. */
function headline(h: CatalogHealth): { tone: Tone; title: string; text: React.ReactNode } | null {
  const must = h.diagnostics.filter((d) => d.severity === 'MUST_FIX');
  if (h.fallback.state === 'failed') return { tone: 'bad', title: 'Products are not reaching Meta', text: <>{h.fallback.error ? `Meta: ${h.fallback.error}. ` : ''}{h.note}</> };
  if (h.api_failing_since) return { tone: 'bad', title: `Sending to Meta has failed since ${ago(h.api_failing_since)}`, text: <>{h.api_last_error ? `Meta: ${h.api_last_error}. ` : ''}{h.note}</> };
  if (h.fallback.state === 'active') return { tone: 'warn', title: 'Meta is reading the hosted feed instead of the API', text: h.note };
  if (h.fallback.state === 'standby') return { tone: 'info', title: 'The fallback feed can be stopped', text: h.note };
  if (must.length) return { tone: 'warn', title: `Meta asks you to fix ${plural(must.length, 'thing')}`, text: `${num(must.reduce((t, d) => t + (d.affected_items ?? 0), 0))} products are affected.` };
  return null;
}

const CatalogHealthCard: React.FC<{ ctx: MetaCtx; channelId: string }> = ({ ctx, channelId }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaCatalogApi.health(channelId), [channelId]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const h = q.data;

  const remove = async () => {
    setBusy(true);
    try {
      q.setData(await metaCatalogApi.removeFeedFallback(channelId));
      toast({ title: 'Fallback feed removed', description: 'Products reach Meta through the API only.' });
      setConfirm(false);
    } catch (e) {
      toast({ title: 'Meta did not remove it', description: writeError(e, 'The feed was not removed.'), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (q.error && !h) return <LoadFailure failure={q.error} what="Catalog health (GET /api/v2/commerce/channels/{id}/catalog-health) is not served yet." onRetry={q.reload} />;
  if (!h) return null;
  const lead = headline(h);
  const fb = FALLBACK[h.fallback.state] ?? { label: h.fallback.state, tone: 'neutral' as Tone };
  const canStop = ctx.can.catalog && h.fallback.state !== 'off' && !!h.fallback.feed_id;
  const sorted = [...h.diagnostics].sort((a, b) => Number(b.severity === 'MUST_FIX') - Number(a.severity === 'MUST_FIX') || (b.affected_items ?? 0) - (a.affected_items ?? 0));

  return (
    <Section title="Catalog health" hint={`Meta's diagnostics read ${ago(h.diagnostics_read_at)}. The API push last worked ${ago(h.api_last_ok_at)}.`}
      actions={canStop && <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Remove fallback feed</Button>}>
      <div className="space-y-4">
        {lead && <Lead tone={lead.tone} title={lead.title}>{lead.text}</Lead>}
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-gray-500">Sending through the API</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{h.api_failing_since ? <StateChip tone="bad">Failing</StateChip> : <StateChip tone="good">Working</StateChip>}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Fallback feed</dt>
            <dd className="mt-0.5"><StateChip tone={fb.tone}>{fb.label}</StateChip>{h.fallback.since && h.fallback.state !== 'off' ? <span className="ml-1 text-xs text-gray-500">since {ago(h.fallback.since)}</span> : null}</dd>
            {h.fallback.feed_url && h.fallback.state !== 'off' && <dd className="mt-1 break-all font-mono text-[11px] text-gray-500">{h.fallback.feed_url}</dd>}
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Country and language versions</dt>
            <dd className="mt-0.5 text-gray-900">{h.localized_error ? <span className="text-red-700">{h.localized_error}</span> : h.localized_at ? `Sent ${ago(h.localized_at)}` : 'None sent yet'}</dd>
          </div>
        </dl>

        <div>
          <p className="text-sm font-medium text-gray-900">What Meta's diagnostics say</p>
          {h.diagnostics_error && <p className="mt-1 text-sm text-red-700">Meta's diagnostics could not be read: {h.diagnostics_error}</p>}
          {!sorted.length ? <p className="mt-1 text-sm text-gray-600">{h.diagnostics_read_at ? 'Meta reports nothing to fix in the catalog.' : 'Meta has not been asked yet; the nightly read fills this in.'}</p> : (
            <ul className="mt-2 divide-y rounded-md border">
              {sorted.map((d, i) => (
                <li key={`${d.kind}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{d.title || d.kind}</span>
                      <StateChip tone={d.severity === 'MUST_FIX' ? 'bad' : 'info'}>{d.severity === 'MUST_FIX' ? 'Must fix' : 'Suggestion'}</StateChip>
                      {d.affected_items != null && <span className="text-xs text-gray-500">{plural(d.affected_items, 'product')}</span>}
                    </span>
                    {d.text && <span className="mt-0.5 block text-gray-700">{d.text}</span>}
                    {d.sample_ids.length > 0 && <span className="mt-0.5 block break-all text-xs text-gray-500">For example {d.sample_ids.join(', ')}</span>}
                  </span>
                  {d.action_uri && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={d.action_uri} target="_blank" rel="noreferrer">{d.action || 'Open on Meta'} <ExternalLink /></a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove the fallback feed?</DialogTitle>
            <DialogDescription>
              Meta deletes the hosted feed it reads. Meta disables the ads of products that came only from that feed, so remove it when
              {h.api_failing_since ? ' sending through the API works again. It is failing right now.' : ' the API push works, as it does now.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>Keep it</Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Remove fallback feed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
};

export default CatalogHealthCard;
