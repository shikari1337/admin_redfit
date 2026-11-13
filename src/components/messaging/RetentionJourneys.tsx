import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarClock, ListPlus, Loader2, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BlockSkeleton, Chip, inr } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  errText, isGap, journeyGoalVerb, journeyTriggerLabel, retentionAPI, REORDER_BOUNDS,
  type JourneyArm, type JourneyReport, type RetentionJourney, type RetentionSettings,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';
import RetentionOverview from './RetentionOverview';

/**
 * MESSAGING, RETENTION, JOURNEYS (lane ADMIN-REV-1): Retain's journeys with
 * their trigger, steps, messages sent and buyers converted, each with its own
 * on/off switch; one button installs Retain's recommended set (every journey it
 * adds stays off until a person turns it on); and the reorder interval the
 * reorder reminder waits for. Reads and writes Retain's routes only
 * (`retentionAPI`, `lib/v2/messaging.ts`). Viewing needs marketing.read,
 * installing and the interval marketing.manage, switching marketing.approve
 * (it starts messaging real people).
 */
const isOn = (j: RetentionJourney) => j.status === 'active';
const num = (v: number | null) => (v === null ? null : v.toLocaleString('en-IN'));

const COLS = 'md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_6rem_4rem]';

const RetentionJourneys: React.FC = () => {
  const { hasPerm } = useAuth();
  const canInstall = hasPerm('marketing.manage');
  const canSwitch = hasPerm('marketing.approve');
  const { toast } = useToast();
  const [rows, setRows] = useState<RetentionJourney[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installGap, setInstallGap] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    try { setRows(await retentionAPI.journeys()); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the journeys.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((j) => j.status !== 'retired'), [rows]);
  const ended = (rows?.length ?? 0) - shown.length;
  const onCount = shown.filter(isOn).length;
  const sentTotal = shown.some((j) => j.sent !== null) ? shown.reduce((a, j) => a + (j.sent ?? 0), 0) : null;
  const convTotal = shown.some((j) => j.converted !== null) ? shown.reduce((a, j) => a + (j.converted ?? 0), 0) : null;

  const install = async () => {
    setInstalling(true);
    try {
      const r = await retentionAPI.installRecommended();
      const added = r.added ?? 0;
      toast({
        title: added > 0 ? `${added} journey${added === 1 ? '' : 's'} added` : 'The recommended set is already here',
        description: added > 0 ? 'Each one is off. Turn on the ones you want.' : 'Nothing was added.',
      });
      await load();
    } catch (e: any) {
      if (isGap(e)) setInstallGap(true);
      else toast({ variant: 'destructive', title: 'Not installed', description: errText(e, 'The server refused the install.') });
    } finally { setInstalling(false); }
  };

  const flip = async (j: RetentionJourney, on: boolean) => {
    setBusyId(j.id);
    try {
      const status = await retentionAPI.setJourneyOn(j, on);
      setRows((rs) => (rs ?? []).map((x) => (x.id === j.id ? { ...x, status } : x)));
      toast({ title: on ? `${j.name} is on` : `${j.name} is off`, description: on ? 'Buyers who meet the trigger from now on get its messages.' : 'Nobody new enters it. People already in it finish their steps.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: on ? 'Not switched on' : 'Not switched off', description: errText(e, 'The server refused the change.') });
    } finally { setBusyId(null); }
  };

  const installButton = (
    <Button size="sm" variant={shown.length === 0 ? 'default' : 'outline'} onClick={install}
      disabled={!canInstall || installing} title={!canInstall ? 'Needs the marketing.manage permission' : undefined}>
      {installing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ListPlus className="mr-1.5 h-3.5 w-3.5" />}
      Install the recommended set
    </Button>
  );

  return (
    <div className="space-y-4">
      {failure?.gap ? (
        <GapNotice what="The journey list (GET /retain/journeys) is not on this server yet." />
      ) : failure ? (
        <ErrorNotice message={failure.message} onRetry={load} />
      ) : !rows ? (
        <div aria-busy="true" className="space-y-3"><BlockSkeleton lines={2} /><BlockSkeleton lines={6} /></div>
      ) : (
        <>
          <div role="status" data-testid="retention-summary"
            className={cn('flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm',
              shown.length > 0 && onCount === 0 ? 'border-warn bg-warn-bg text-warn-ink' : onCount > 0 ? 'border-good bg-good-bg text-good-ink' : 'border-line bg-surface-2 text-ink')}>
            <div className="min-w-0 flex-1 basis-60">
              <p className="font-semibold">
                {shown.length === 0 ? 'No journey yet'
                  : onCount === 0 ? `All ${shown.length} journeys are off, so no buyer gets these messages`
                    : `${onCount} of ${shown.length} journeys are on`}
              </p>
              <p className="text-xs opacity-90">
                {shown.length === 0
                  ? 'Install the recommended set to start. Every journey it adds stays off until you turn it on.'
                  : onCount === 0
                    ? 'Turn on the ones you want below. Each one stops by itself for a buyer who orders again or opts out.'
                    : `${sentTotal !== null ? `${sentTotal.toLocaleString('en-IN')} messages sent` : 'Messages sent are not reported yet'}${convTotal !== null ? `, ${convTotal.toLocaleString('en-IN')} converted.` : '.'}`}
              </p>
            </div>
            {installButton}
          </div>
          {installGap && (
            <GapNotice what="Installing the recommended set (POST /retain/journeys/install-recommended) is not on this server yet." />
          )}

          <RetentionOverview />

          {shown.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="retention-journeys">
              <div aria-hidden className={cn('hidden gap-3 border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid', COLS)}>
                <span>Journey</span><span>Starts when</span><span>Steps</span>
                <span className="text-right">Sent</span><span className="text-right">Converted</span><span className="text-right">On</span>
              </div>
              <ul className="divide-y divide-line">
                {shown.map((j) => (
                  <li key={j.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-3 md:items-center', COLS)}>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{j.name}</p>
                      {j.needs_templates.length > 0 && (
                        <p className="mt-0.5 text-xs text-warn-ink">
                          Write {j.needs_templates.length === 1 ? 'this message' : 'these messages'} first:{' '}
                          <span className="font-mono">{j.needs_templates.join(', ')}</span>{' '}
                          (<Link to="/messaging/notifications" className="underline underline-offset-2">Notifications</Link>)
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-ink-soft md:hidden">
                        {journeyTriggerLabel(j.trigger)}{j.steps ? `; ${j.steps}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft md:hidden">
                        {j.sent !== null ? `${num(j.sent)} sent` : 'Sent not reported'}, {j.converted !== null ? `${num(j.converted)} converted` : 'converted not reported'}
                      </p>
                      {j.status !== 'draft' && (
                        <button type="button" onClick={() => setOpenId((o) => (o === j.id ? null : j.id))}
                          aria-expanded={openId === j.id} aria-controls={`journey-results-${j.id}`}
                          className="mt-1 inline-flex min-h-[28px] items-center gap-1 text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
                          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> {openId === j.id ? 'Hide results' : 'Results'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 md:order-last">
                      {!isOn(j) && j.status === 'paused' && <Chip tone="neutral" className="hidden text-[10px] lg:inline-flex">Paused</Chip>}
                      {busyId === j.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" aria-label="Saving" />}
                      <Switch checked={isOn(j)} onCheckedChange={(v) => flip(j, v)} disabled={!canSwitch || busyId !== null}
                        aria-label={`${j.name} on or off`} title={!canSwitch ? 'Needs the marketing.approve permission' : undefined} />
                    </div>
                    <span className="hidden text-sm text-ink md:block">{journeyTriggerLabel(j.trigger)}</span>
                    <span className="hidden text-sm text-ink-soft md:block">{j.steps ?? <Muted />}</span>
                    <span className="hidden text-right text-sm tabular-nums text-ink md:block">{num(j.sent) ?? <Muted />}</span>
                    <span className="hidden text-right text-sm tabular-nums text-ink md:block">{num(j.converted) ?? <Muted />}</span>
                    {openId === j.id && (
                      <div id={`journey-results-${j.id}`} className="col-span-full md:order-last">
                        <JourneyResults journeyId={j.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {ended > 0 && (
                <p className="border-t border-line px-3 py-2 text-xs text-ink-mute">{ended} ended journey{ended === 1 ? ' is' : 's are'} not shown.</p>
              )}
            </div>
          )}
          {!canSwitch && shown.length > 0 && (
            <p className="text-xs text-ink-soft">Switching a journey on or off needs the marketing.approve permission: it starts or stops messages to real buyers.</p>
          )}
          <p className="text-xs text-ink-soft">
            Review requests are not a journey: they are set under{' '}
            <Link to="/messaging/notifications" className="underline underline-offset-2">Notifications, Reviews</Link>.
          </p>
        </>
      )}

      <ReorderIntervalCard />
    </div>
  );
};

const Muted: React.FC = () => <span className="text-xs text-ink-mute" title="This server does not report it yet">n/a</span>;

const rate = (bp: number) => `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;

/** What the result means for the store, said first (Retain's own confidence: 99% high, 95% medium). */
function verdict(r: JourneyReport): { text: string; tone: 'good' | 'warn' | 'neutral' } {
  const t = r.treatment;
  const verb = journeyGoalVerb(r.goal_kind);
  if (r.goal_kind === 'none') return { text: `${t.members.toLocaleString('en-IN')} people got it. It has no goal to measure.`, tone: 'neutral' };
  if (r.holdout_bp === 0) return { text: 'Nobody is kept back from this journey, so whether it works cannot be measured.', tone: 'neutral' };
  if (r.confidence === 'too_few') return { text: 'Too few people have been kept back yet to tell whether it works.', tone: 'neutral' };
  if (r.lift_bp === null) return { text: `Nobody kept back has ${verb} yet, so the lift cannot be worked out.`, tone: 'neutral' };
  const sure = r.confidence === 'high' ? 'sure at 99%' : r.confidence === 'medium' ? 'sure at 95%' : null;
  const diff = `${r.lift_bp > 0 ? 'more' : 'fewer'} people ${verb} (${rate(Math.abs(r.lift_bp))} ${r.lift_bp > 0 ? 'more' : 'fewer'})`;
  if (!sure) return { text: `No clear difference yet: ${diff} among those who got it, but not enough to be sure.`, tone: 'neutral' };
  return r.lift_bp > 0
    ? { text: `It works: ${diff} among those who got it than among those kept back, ${sure}.`, tone: 'good' }
    : { text: `It is not helping: ${diff} among those who got it than among those kept back, ${sure}. Think about pausing it.`, tone: 'warn' };
}

const ArmFacts: React.FC<{ label: string; arm: JourneyArm; verb: string }> = ({ label, arm, verb }) => (
  <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
    <p className="mt-0.5 text-sm text-ink">
      <span className="font-semibold tabular-nums">{arm.members.toLocaleString('en-IN')}</span> people,{' '}
      <span className="font-semibold tabular-nums">{arm.converted.toLocaleString('en-IN')}</span> {verb} ({rate(arm.rate_bp)})
    </p>
    <p className="text-xs text-ink-soft">
      {arm.revenue !== null ? `${inr(arm.revenue)} in orders` : 'Sales not reported'}
      {arm.revenue_per_member !== null && arm.members > 0 ? `, ${inr(arm.revenue_per_member)} a person` : ''}
    </p>
  </div>
);

/**
 * One journey's result against its hold-out (`GET /retain/journeys/{id}/report`, lane MENU-1):
 * what it means first, then the two groups and what the journey added.
 */
const JourneyResults: React.FC<{ journeyId: string }> = ({ journeyId }) => {
  const [r, setR] = useState<JourneyReport | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    try { setR(await retentionAPI.report(journeyId)); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the results.')); }
  }, [journeyId]);
  useEffect(() => { load(); }, [load]);

  if (failure?.gap) return <GapNotice className="mt-2" what="Journey results (GET /retain/journeys/{id}/report) are not on this server yet." />;
  if (failure) return <div className="mt-2"><ErrorNotice message={failure.message} onRetry={load} /></div>;
  if (!r) return <div aria-busy="true" className="mt-2"><BlockSkeleton lines={2} /></div>;

  if (r.treatment.members === 0 && r.holdout.members === 0) {
    return <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-soft">Nobody has entered this journey yet. Its results show here once people do.</p>;
  }
  const v = verdict(r);
  const verb = journeyGoalVerb(r.goal_kind);
  const measured = r.goal_kind !== 'none' && r.holdout_bp > 0;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3" data-testid="journey-results">
      <p className={cn('text-sm font-medium', v.tone === 'good' ? 'text-good-ink' : v.tone === 'warn' ? 'text-warn-ink' : 'text-ink')}>{v.text}</p>
      <div className={cn('grid gap-2', measured && 'sm:grid-cols-2')}>
        <ArmFacts label="Got the messages" arm={r.treatment} verb={verb} />
        {measured && <ArmFacts label={`Kept back (${rate(r.holdout_bp)})`} arm={r.holdout} verb={verb} />}
      </div>
      {measured && r.confidence !== 'too_few' && (
        <p className="text-xs text-ink-soft">
          Added by the journey: {r.incremental_conversions.toLocaleString('en-IN')} {r.incremental_conversions === 1 ? 'person' : 'people'} who {verb}
          {r.incremental_revenue !== null ? `, ${inr(r.incremental_revenue)} in orders` : ''}.
          {r.goal_window_days > 0 ? ` Counted within ${r.goal_window_days} days of entering.` : ''}
        </p>
      )}
    </div>
  );
};

/**
 * The days the reorder reminder waits after an order, for products without an
 * interval of their own (RET-1: a Retain setting, seeded 30 days). Saved by
 * sending the whole `retain` settings value back with that one field changed.
 */
const ReorderIntervalCard: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('marketing.manage');
  const { toast } = useToast();
  const [cfg, setCfg] = useState<RetentionSettings | null>(null);
  const [days, setDays] = useState('');
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      const v = await retentionAPI.settings();
      setCfg(v); setDays(v.reorder_days === null ? '' : String(v.reorder_days));
    } catch (e: any) { setFailure(failureOf(e, 'Could not load the Retention settings.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const [min, max] = REORDER_BOUNDS;
  const v = Number(days);
  const problem = days === '' || !Number.isInteger(v) || v < min || v > max ? `A whole number of days from ${min} to ${max}.` : null;
  const dirty = !!cfg && cfg.reorder_days !== null && days !== String(cfg.reorder_days);

  const save = async () => {
    if (!cfg || problem) return;
    setSaving(true);
    try {
      const next = await retentionAPI.saveReorderDays(cfg, v);
      setCfg(next); setDays(next.reorder_days === null ? '' : String(next.reorder_days));
      toast({ title: 'Reorder timing saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="reorder-interval">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <CalendarClock className="h-4 w-4 text-ink-mute" aria-hidden /> Reorder reminder timing
      </p>
      {failure?.gap ? (
        <GapNotice className="mt-2" what="The Retention settings (GET /retain/settings) are not on this server yet." />
      ) : failure ? (
        <div className="mt-2"><ErrorNotice message={failure.message} onRetry={load} /></div>
      ) : !cfg ? (
        <BlockSkeleton lines={1} />
      ) : cfg.reorder_days === null ? (
        <p className="mt-1 text-xs text-ink-soft">Not available on this server yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-soft">
            How long after an order the reorder reminder goes, for a product without its own interval. A product's own interval, where one is set, wins.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="Days after an order" className="h-8 w-20 text-center" disabled={!canWrite} aria-invalid={!!problem} />
            <span className="text-ink">days after an order</span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setDays(String(cfg.reorder_days))}>Discard</Button>
              <Button size="sm" onClick={save} disabled={!dirty || saving || !!problem || !canWrite}
                title={!canWrite ? 'Needs the marketing.manage permission' : problem ?? undefined}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
              </Button>
            </div>
          </div>
          {problem && <p className="mt-1 text-xs text-bad-ink">{problem}</p>}
        </>
      )}
    </div>
  );
};

export default RetentionJourneys;
