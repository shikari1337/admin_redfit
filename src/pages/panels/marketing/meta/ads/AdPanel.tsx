/**
 * The Ads Manager's side panel: one campaign, ad set or ad in full. It opens with what is wrong (review reasons,
 * delivery issues), then the actions, the numbers for the chosen dates, the settings, who sees it, where, and the
 * creative with Meta's previews. Everything shown comes from `GET /meta/ads/{level}/{id}`.
 */
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { countriesNow, useCountries } from '@/lib/v2/reference';
import { metaAdsApi, type AdDetail, type AdLevel, type AdRow, type AdsOptions } from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import { Lead, LoadFailure, StateChip, linkCls, useLoad } from '../common';
import { PreviewGrid } from './pieces';
import type { Op } from './ops';
import {
  Facts, LEVEL_WORD, METRICS, budgetText, humanize, isPausedSelf, isRunning, labelFrom, metricText, objectiveLabel, ownsBudget, statusText, statusTone,
} from './shared';

const nameOf = (x: unknown): string => (typeof x === 'string' ? x : (x as { name?: string; key?: string; id?: string })?.name ?? (x as any)?.key ?? (x as any)?.id ?? '');
const country = (c: string) => countriesNow().find((x) => x.code === c)?.name ?? c;
const day = (d: string | null | undefined) => (d ? localeDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t pt-4">
    <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
    {children}
  </section>
);

export const AdPanel: React.FC<{
  target: { level: AdLevel; id: string; row: AdRow } | null;
  cur: string;
  opts: AdsOptions | null;
  canAct: boolean;
  /** The metrics of the table's date range (the detail call returns settings; numbers follow the table). */
  onClose: () => void;
  onOp: (op: Op) => void;
  onDrill: (row: AdRow) => void;
}> = ({ target, cur, opts, canAct, onClose, onOp, onDrill }) => {
  useCountries(); // re-render when the full list arrives (country names)
  const q = useLoad(() => (target ? metaAdsApi.detail(target.level, target.id) : Promise.resolve(null as AdDetail | null)), [target?.level, target?.id]);
  const row = target?.row ?? null;
  const d = q.data;
  const t = d?.spec.targeting ?? null;
  const cr = d?.spec.creative ?? null;
  const placements = d?.spec.placements;
  return (
    <Sheet open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {row && (
          <div className="space-y-4 p-4 sm:p-6">
            <SheetHeader className="space-y-1 pr-6 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{LEVEL_WORD[row.level][0]}{row.parent_name ? ` in ${row.parent_name}` : ''}</p>
              <SheetTitle className="break-words text-lg">{row.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <StateChip tone={statusTone(row)}>{statusText(row)}</StateChip>
                  {row.objective && <span className="text-xs text-gray-600">{objectiveLabel(row.objective, opts)}</span>}
                  {row.created_by_growcord && <span className="text-xs text-gray-600">made here</span>}
                </div>
              </SheetDescription>
            </SheetHeader>

            {row.review.reasons.length > 0 && (
              <Lead tone="bad" title="Meta rejected this">
                <ul className="list-disc space-y-0.5 pl-5">{row.review.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                <p className="mt-1">Change the text or picture, then ask Meta for another review in Account Quality.</p>
                <a className={`${linkCls} mt-1 inline-flex items-center gap-1`} href="https://business.facebook.com/business-support-home/" target="_blank" rel="noreferrer">Open Account Quality <ExternalLink className="h-3 w-3" /></a>
              </Lead>
            )}
            {row.delivery.issues.length > 0 && (
              <Lead tone="warn" title="Delivery issue">
                <ul className="list-disc space-y-0.5 pl-5">{row.delivery.issues.map((i) => <li key={i.code}>{i.text}</li>)}</ul>
              </Lead>
            )}

            {canAct && (
              <div className="flex flex-wrap gap-2">
                {isRunning(row)
                  ? <Button size="sm" variant="outline" onClick={() => onOp({ kind: 'status', rows: [row], to: 'PAUSED' })}>Pause</Button>
                  : isPausedSelf(row) && <Button size="sm" onClick={() => onOp({ kind: 'status', rows: [row], to: 'ACTIVE' })}>Resume</Button>}
                {ownsBudget(row) && <Button size="sm" variant="outline" onClick={() => onOp({ kind: 'budget', rows: [row] })}>Change budget</Button>}
                <Button size="sm" variant="outline" onClick={() => onOp({ kind: 'end', rows: [row] })}>End date</Button>
                <Button size="sm" variant="outline" onClick={() => onOp({ kind: 'duplicate', rows: [row] })}>Duplicate</Button>
                <Button size="sm" variant="outline" onClick={() => onOp({ kind: 'rename', rows: [row] })}>Rename</Button>
              </div>
            )}
            {row.level !== 'ad' && (
              <button type="button" className={`${linkCls} text-sm`} onClick={() => onDrill(row)}>
                See its {row.level === 'campaign' ? `ad sets${d?.children?.adsets != null ? ` (${d.children.adsets})` : ''}` : `ads${d?.children?.ads != null ? ` (${d.children.ads})` : ''}`}
              </button>
            )}

            <Block title="Numbers for the dates picked">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {METRICS.map((m) => (
                  <div key={m.key} className="rounded-md border px-3 py-2">
                    <dt className="text-xs text-gray-500">{m.label}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-gray-900">{metricText(row.metrics, m, cur)}</dd>
                  </div>
                ))}
              </dl>
              {row.metrics.result_type && <p className="mt-1 text-xs text-gray-500">Results here are {humanize(row.metrics.result_type).toLowerCase()}s.</p>}
            </Block>

            {q.error && !d ? <LoadFailure failure={q.error} what={`The ${LEVEL_WORD[row.level][0]}'s details (GET /api/v2/marketing/meta/ads/${row.level}/{id}) are not served yet.`} onRetry={q.reload} />
              : !d ? <p className="text-sm text-gray-500">Loading the details...</p> : (
                <>
                  <Block title="Settings">
                    <Facts rows={[
                      ['Budget', budgetText(row.budget, cur, row.level)],
                      ['Bid strategy', labelFrom(opts?.bid_strategies, row.bid_strategy)],
                      ['Optimised for', labelFrom(opts?.objectives.flatMap((o) => o.optimization_goals), row.optimization_goal)],
                      ['Conversion event', labelFrom(opts?.conversion_events, d.spec.conversion_event)],
                      ['Destination', labelFrom(opts?.destinations, d.spec.destination)],
                      ['Attribution', d.spec.attribution ?? ''],
                      ['Starts', day(row.schedule.start)],
                      ['Ends', row.schedule.end ? day(row.schedule.end) : 'Runs until paused'],
                      ['Meta id', <span className="font-mono text-xs">{row.id}</span>],
                    ]} />
                  </Block>

                  {t && (
                    <Block title="Who sees it">
                      <Facts rows={[
                        ['Countries', (t.countries ?? []).map(country).join(', ')],
                        ['Cities', (t.cities ?? []).map((c) => `${c.name ?? c.key}${c.radius_km ? ` (${c.radius_km} km)` : ''}`).join(', ')],
                        ['Regions', (t.regions ?? []).map(nameOf).join(', ')],
                        ['Ages', t.age_min || t.age_max ? `${t.age_min ?? 18} to ${t.age_max ?? 65}` : ''],
                        ['Gender', (t.genders ?? []).length ? (t.genders ?? []).map(humanize).join(', ') : 'All'],
                        ['Languages', (t.languages ?? []).map(nameOf).join(', ')],
                        ['Interests', [...(t.interests ?? []), ...(t.behaviors ?? [])].map(nameOf).join(', ')],
                        ['Audiences', (t.custom_audiences ?? []).map(nameOf).join(', ')],
                        ['Left out', (t.excluded_audiences ?? []).map(nameOf).join(', ')],
                        ['Advantage audience', t.advantage_audience ? 'On: Meta may reach beyond these settings' : 'Off'],
                      ]} />
                    </Block>
                  )}

                  {placements && (
                    <Block title="Where it shows">
                      <p className="text-sm text-gray-800">
                        {placements === 'auto' ? 'Advantage+ placements: Meta picks among every placement.' : (placements as string[]).map((p) => labelFrom(opts?.placements, p)).join(', ')}
                      </p>
                    </Block>
                  )}

                  {cr && (
                    <Block title="Creative">
                      <Facts rows={[
                        ['Format', labelFrom(opts?.objectives.flatMap((o) => o.formats), cr.format)],
                        ['Button', labelFrom(opts?.call_to_actions, cr.call_to_action)],
                        ['Link', cr.link ?? ''],
                        ['URL parameters', cr.url_parameters ? <span className="break-all font-mono text-xs">{cr.url_parameters}</span> : ''],
                      ]} />
                      {(['primary', 'headlines', 'descriptions'] as const).map((k) => (cr.texts?.[k]?.length ? (
                        <div key={k} className="mt-3">
                          <p className="text-xs text-gray-500">{k === 'primary' ? 'Primary text' : k === 'headlines' ? 'Headlines' : 'Descriptions'}</p>
                          <ul className="mt-1 space-y-1">{cr.texts[k]!.map((x, i) => <li key={i} className="rounded bg-gray-50 px-2 py-1 text-sm text-gray-800">{x}</li>)}</ul>
                        </div>
                      ) : null))}
                      {cr.previews?.length ? <div className="mt-3"><PreviewGrid previews={cr.previews} height={420} className="grid gap-3 sm:grid-cols-2" /></div> : null}
                    </Block>
                  )}
                </>
              )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default AdPanel;
