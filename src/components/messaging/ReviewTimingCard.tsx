import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Gift, Loader2, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BlockSkeleton, Chip } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import {
  messagingAppsAPI, errText, INCENTIVE_TRIGGER_LABEL, REVIEW_BOUNDS,
  type IncentiveRule, type RequestRule, type ReviewMessagingInput, type ReviewMessagingSettings,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * TIMING & REWARDS for the Reviews group: when the review request goes out
 * after delivery, how many reminders follow and how far apart, whether a
 * reward is promised (and the exact words the next request will state), and
 * the answer / reply notices. ONE read and ONE write over the Reviews app's
 * own settings — `GET|PUT /api/v2/reviews/settings/messaging` (MSG-4,
 * `content.read` / `content.manage`). The rules behind a reward (what earns
 * it, coupon or points) and per-product timing are the Reviews rule
 * resources (`/api/v2/reviews/incentives/rules`, `/api/v2/reviews/requests/rules`),
 * listed here with their on/off switch.
 *
 * There is deliberately NO "minimum rating" control: rewarding or asking by
 * rating is review gating, which consumer law forbids (Reviews §11). Lane
 * ADMIN-MSG-2.
 */
type Form = {
  requests_enabled: boolean; delay_days: string; reminder_count: string; reminder_after_days: string;
  expire_after_days: string; for_outside_sites: boolean; incentives_enabled: boolean; promise_text: string;
  answer_notices: boolean; reply_notices: boolean;
};
const formOf = (v: ReviewMessagingSettings): Form => ({
  requests_enabled: v.requests_enabled, delay_days: String(v.delay_days), reminder_count: String(v.reminder_count),
  reminder_after_days: String(v.reminder_after_days), expire_after_days: String(v.expire_after_days),
  for_outside_sites: v.for_outside_sites, incentives_enabled: v.incentives_enabled, promise_text: v.promise_text ?? '',
  answer_notices: v.answer_notices, reply_notices: v.reply_notices,
});
const NUMS = ['delay_days', 'reminder_count', 'reminder_after_days', 'expire_after_days'] as const;
const NUM_LABEL: Record<(typeof NUMS)[number], string> = {
  delay_days: 'Days after delivery before asking', reminder_count: 'Reminders (0 = none)',
  reminder_after_days: 'Days between reminders', expire_after_days: 'Days the review link stays valid',
};

function rewardWords(r: IncentiveRule): string {
  if (r.reward === 'points') return r.points ? `${r.points.toLocaleString('en-IN')} points` : 'points';
  if (r.percent_milli) return `${(r.percent_milli / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })}% off coupon`;
  if (r.amount) return `${r.currency === 'INR' || !r.currency ? '₹' : `${r.currency} `}${r.amount.toLocaleString('en-IN')} off coupon`;
  return 'a coupon';
}

const ReviewTimingCard: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('content.manage');
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ReviewMessagingSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try { const v = await messagingAppsAPI.reviewSettings(); setCfg(v); setForm(formOf(v)); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the review request settings.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const base = useMemo(() => (cfg ? formOf(cfg) : null), [cfg]);
  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const problems = useMemo(() => {
    if (!form) return [] as string[];
    const p: string[] = [];
    for (const k of NUMS) {
      const [min, max] = REVIEW_BOUNDS[k];
      const v = Number(form[k]);
      if (form[k] === '' || !Number.isInteger(v) || v < min || v > max) p.push(`${NUM_LABEL[k]}: a whole number from ${min} to ${max}.`);
    }
    if (form.promise_text.length > REVIEW_BOUNDS.promise_text) p.push(`The promise is at most ${REVIEW_BOUNDS.promise_text} characters.`);
    return p;
  }, [form]);

  const save = async () => {
    if (!form || !base) return;
    setSaving(true);
    try {
      const body: ReviewMessagingInput = {};
      (Object.keys(form) as Array<keyof Form>).forEach((k) => {
        if (form[k] === base[k]) return;
        if ((NUMS as readonly string[]).includes(k)) (body as any)[k] = Number(form[k]);
        else if (k === 'promise_text') body.promise_text = form.promise_text.trim();
        else (body as any)[k] = form[k];
      });
      const v = await messagingAppsAPI.saveReviewSettings(body);
      setCfg(v); setForm(formOf(v));
      toast({ title: 'Review requests saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="review-timing-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Timing &amp; rewards</p>
        <Link to="/reviews" className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink">Reviews queue</Link>
      </div>
      {failure?.gap ? (
        <GapNotice what="The review request settings (GET /reviews/settings/messaging) are not on this server yet. Until they are, the Reviews app’s defaults apply: requests on, one reminder, no reward." />
      ) : failure ? (
        <ErrorNotice message={failure.message} onRetry={load} />
      ) : !cfg || !form ? (
        <BlockSkeleton lines={4} />
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-3" disabled={!canWrite}>
            <legend className="flex items-center gap-1.5 text-sm font-medium text-ink"><Clock className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Request &amp; reminders</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.requests_enabled} onCheckedChange={(v) => set('requests_enabled', v)} aria-label="Ask for a review after delivery" disabled={!canWrite} />
              <span className="text-ink">Ask for a review after delivery <span className="text-xs text-ink-soft">(only shoppers who agreed to marketing messages)</span></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {NUMS.map((k) => (
                <label key={k} className="block space-y-1 text-xs">
                  <span className="text-ink-soft">{NUM_LABEL[k]}</span>
                  <Input inputMode="numeric" value={form[k]} onChange={(e) => set(k, e.target.value.replace(/[^0-9]/g, ''))} className="h-8"
                    disabled={!canWrite || (k === 'reminder_after_days' && form.reminder_count === '0')} />
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.for_outside_sites} onCheckedChange={(v) => set('for_outside_sites', v)} aria-label="Also for orders from other sites" disabled={!canWrite} />
              <span className="text-ink">Also for orders placed on your other sites</span>
            </label>
          </fieldset>

          <fieldset className="space-y-3 border-t border-line pt-3" disabled={!canWrite}>
            <legend className="flex items-center gap-1.5 pt-3 text-sm font-medium text-ink"><Gift className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Reward for a review</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.incentives_enabled} onCheckedChange={(v) => set('incentives_enabled', v)} aria-label="Reward a review" disabled={!canWrite} />
              <span className="text-ink">Reward a review once it is approved <span className="text-xs text-ink-soft">(costs money: off by default)</span></span>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-ink-soft">The promise in your words (leave empty to state the first rule’s reward)</span>
              <Input value={form.promise_text} maxLength={REVIEW_BOUNDS.promise_text} onChange={(e) => set('promise_text', e.target.value)}
                placeholder="Get 10% off your next order for a review" className="h-8" />
            </label>
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs" data-testid="review-promise">
              <span className="font-medium text-ink">The next request will say: </span>
              {cfg.incentive_text
                ? <span className="text-ink">“{cfg.incentive_text}”</span>
                : <span className="text-ink-soft">no reward is promised.</span>}
              {dirty && <span className="block text-ink-mute">As saved — save your changes to see the new wording.</span>}
            </div>
            <p className="text-[11px] text-ink-soft">
              What earns a reward is a review with a photo, a video, a verified purchase or any review — never its star rating.
              Rewarding or asking only happy customers is review gating, which the law forbids.
            </p>
          </fieldset>

          <fieldset className="space-y-2 border-t border-line pt-3" disabled={!canWrite}>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.answer_notices} onCheckedChange={(v) => set('answer_notices', v)} aria-label="Tell the asker when a question is answered" disabled={!canWrite} />
              <span className="text-ink">Tell the shopper when their question is answered</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.reply_notices} onCheckedChange={(v) => set('reply_notices', v)} aria-label="Tell the reviewer when you reply" disabled={!canWrite} />
              <span className="text-ink">Tell the reviewer when you reply to their review</span>
            </label>
          </fieldset>

          {problems.length > 0 && <ul className="space-y-0.5 text-xs text-bad-ink">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {!canWrite && <span className="mr-auto text-xs text-ink-soft">Read-only: needs the content.manage permission.</span>}
            <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setForm(formOf(cfg))}>Discard</Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || problems.length > 0 || !canWrite}
              title={!dirty ? 'Nothing changed yet' : problems[0]}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
            </Button>
          </div>

          <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
            <IncentiveRules canWrite={canWrite} />
            <RequestRules canWrite={canWrite} />
          </div>
        </div>
      )}
    </div>
  );
};

/** The reward rules (`/api/v2/reviews/incentives/rules`): what earns which reward; each switchable. */
const IncentiveRules: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<IncentiveRule[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const load = useCallback(() => {
    setFailure(null);
    messagingAppsAPI.incentiveRules().then(setRows).catch((e) => setFailure(failureOf(e, 'Could not load the reward rules.')));
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (r: IncentiveRule, on: boolean) => {
    setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, enabled: on } : x)));
    try { await messagingAppsAPI.setIncentiveRule(r.id, on); }
    catch (e: any) {
      setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)));
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reward rules</p>
      {failure ? (failure.gap ? <p className="text-xs text-ink-mute">Not available on this server yet.</p> : <ErrorNotice message={failure.message} onRetry={load} />)
        : !rows ? <BlockSkeleton lines={2} /> : rows.length === 0 ? (
          <p className="text-xs text-ink-soft">No reward rule yet, so no reward is issued even when rewards are on.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-2.5 py-2 text-xs">
                <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} disabled={!canWrite} aria-label={`Rule ${r.name}`} />
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-ink-soft">{rewardWords(r)} for {INCENTIVE_TRIGGER_LABEL[r.trigger_on] ?? r.trigger_on}{r.validity_days ? ` · valid ${r.validity_days} days` : ''}</p>
                  {r.disclosure && <p className="mt-0.5 text-ink-mute">Shown: “{r.disclosure}”</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

/** Per-product request timing (`/api/v2/reviews/requests/rules`); a rule without a product is the store default. */
const RequestRules: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<RequestRule[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const load = useCallback(() => {
    setFailure(null);
    messagingAppsAPI.requestRules().then(setRows).catch((e) => setFailure(failureOf(e, 'Could not load the per-product timing.')));
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (r: RequestRule, on: boolean) => {
    setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, enabled: on } : x)));
    try { await messagingAppsAPI.setRequestRule(r.id, on); }
    catch (e: any) {
      setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)));
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Per-product timing</p>
      {failure ? (failure.gap ? <p className="text-xs text-ink-mute">Not available on this server yet.</p> : <ErrorNotice message={failure.message} onRetry={load} />)
        : !rows ? <BlockSkeleton lines={2} /> : rows.length === 0 ? (
          <p className="text-xs text-ink-soft">Every product follows the timing above.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-2.5 py-2 text-xs">
                <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} disabled={!canWrite} aria-label="Ask about this product" />
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {r.product_id ? <>Product <span className="font-mono">…{r.product_id.slice(-6)}</span></> : 'Store default'}
                    {!r.enabled && <Chip tone="neutral" className="ml-1.5 text-[10px]">Never asked</Chip>}
                  </p>
                  <p className="text-ink-soft">
                    {r.delay_days ?? '—'} days after delivery · {r.reminder_after_days ? `reminder after ${r.reminder_after_days} days` : 'no reminder'} · link valid {r.expire_after_days ?? '—'} days
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

export default ReviewTimingCard;
