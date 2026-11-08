import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Gift, Loader2, Save, Star, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BlockSkeleton, Chip } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  messagingAppsAPI, errText, googleReviewUrlProblem, INCENTIVE_TRIGGER_LABEL, REVIEW_BOUNDS, REVIEW_CONSENT_DEFAULT,
  REVIEW_CONSENT_MODES,
  type IncentiveRule, type RequestRule, type ReviewConsentMode, type ReviewMessagingInput, type ReviewMessagingSettings,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * TIMING, WHO AND REWARDS for the Reviews group: when the review request goes out
 * after delivery, how many reminders follow and how far apart, who may be asked
 * on which channel, the Google review link and the one Google review ask, whether
 * a reward is promised (and the exact words the next request will state), and
 * the answer and reply notices. ONE read and ONE write over the Reviews app's
 * own settings: `GET|PUT /api/v2/reviews/settings/messaging` (MSG-4, REV-1;
 * `content.read` / `content.manage`). The rules behind a reward (what earns
 * it, coupon or points) and per-product timing are the Reviews rule
 * resources (`/api/v2/reviews/incentives/rules`, `/api/v2/reviews/requests/rules`),
 * listed here with their on/off switch.
 *
 * There is deliberately NO "minimum rating" control, and the Google ask goes to
 * every reviewer whatever the rating: rewarding or asking by rating is review
 * gating, which consumer law and Google's rules forbid (Reviews section 11).
 * Lanes ADMIN-MSG-2, ADMIN-REV-1.
 */
type Form = {
  requests_enabled: boolean; delay_days: string; reminder_count: string; reminder_after_days: string;
  expire_after_days: string; for_outside_sites: boolean; incentives_enabled: boolean; promise_text: string;
  answer_notices: boolean; reply_notices: boolean;
  consent_mode: string; google_url: string; google_ask_after_days: string; google_ask_enabled: boolean;
};
const formOf = (v: ReviewMessagingSettings): Form => ({
  requests_enabled: v.requests_enabled, delay_days: String(v.delay_days), reminder_count: String(v.reminder_count),
  reminder_after_days: String(v.reminder_after_days), expire_after_days: String(v.expire_after_days),
  for_outside_sites: v.for_outside_sites, incentives_enabled: v.incentives_enabled, promise_text: v.promise_text ?? '',
  answer_notices: v.answer_notices, reply_notices: v.reply_notices,
  consent_mode: v.consent_mode ?? '', google_url: v.google_write_review_url ?? '',
  google_ask_after_days: v.google_ask_after_days === null ? '' : String(v.google_ask_after_days),
  google_ask_enabled: v.google_ask_enabled ?? false,
});
const NUMS = ['delay_days', 'reminder_count', 'reminder_after_days', 'expire_after_days'] as const;
const NUM_LABEL: Record<(typeof NUMS)[number], string> = {
  delay_days: 'Days after delivery before asking', reminder_count: 'Reminders (0 = none)',
  reminder_after_days: 'Days between reminders', expire_after_days: 'Days the review link stays valid',
};

/** The three answers to "who gets a review request", in the store owner's words (REV-0 decision). */
const CONSENT_WORDS: Record<ReviewConsentMode, { title: string; help: string }> = {
  email_all_phone_opt_in: {
    title: 'Every buyer by e-mail; WhatsApp and SMS only with consent',
    help: 'Every buyer with an e-mail address gets the request, with a one-click unsubscribe. WhatsApp and SMS go only to buyers who agreed to marketing messages.',
  },
  all: {
    title: 'Every buyer, on every channel',
    help: 'E-mail, WhatsApp and SMS to every buyer, whether or not they agreed to marketing messages. Anyone who unsubscribed is still left out.',
  },
  opt_in_only: {
    title: 'Only buyers who agreed to marketing messages',
    help: 'A buyer without marketing consent gets no request on any channel.',
  },
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

  const urlProblem = form && cfg?.wire.google_write_review_url ? googleReviewUrlProblem(form.google_url) : null;
  const problems = useMemo(() => {
    if (!form || !cfg) return [] as string[];
    const p: string[] = [];
    for (const k of NUMS) {
      const [min, max] = REVIEW_BOUNDS[k];
      const v = Number(form[k]);
      if (form[k] === '' || !Number.isInteger(v) || v < min || v > max) p.push(`${NUM_LABEL[k]}: a whole number from ${min} to ${max}.`);
    }
    if (form.promise_text.length > REVIEW_BOUNDS.promise_text) p.push(`The promise is at most ${REVIEW_BOUNDS.promise_text} characters.`);
    if (cfg.wire.google_ask_after_days) {
      const [min, max] = REVIEW_BOUNDS.google_ask_after_days;
      const v = Number(form.google_ask_after_days);
      if (form.google_ask_after_days === '' || !Number.isInteger(v) || v < min || v > max) {
        p.push(`Days before the Google review ask: a whole number from ${min} to ${max}.`);
      }
    }
    if (urlProblem) p.push(`Google review link: ${urlProblem}`);
    return p;
  }, [form, cfg, urlProblem]);

  const save = async () => {
    if (!form || !base || !cfg) return;
    setSaving(true);
    try {
      const body: ReviewMessagingInput = {};
      (Object.keys(form) as Array<keyof Form>).forEach((k) => {
        if (form[k] === base[k]) return;
        if ((NUMS as readonly string[]).includes(k)) (body as any)[k] = Number(form[k]);
        else if (k === 'promise_text') body.promise_text = form.promise_text.trim();
        else if (k === 'consent_mode') body.consent_mode = form.consent_mode as ReviewConsentMode;
        // An empty link clears the typed one (the Business Profile sync's link is used again, if any).
        else if (k === 'google_url') body.google_write_review_url = form.google_url.trim();
        else if (k === 'google_ask_after_days') body.google_ask_after_days = Number(form.google_ask_after_days);
        else (body as any)[k] = form[k];
      });
      const v = await messagingAppsAPI.saveReviewSettings(body, cfg.wire);
      setCfg(v); setForm(formOf(v));
      toast({ title: 'Review requests saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="review-timing-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Timing, who is asked and rewards</p>
        <Link to="/reviews" className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink">Reviews queue</Link>
      </div>
      {failure?.gap ? (
        <GapNotice what="The review request settings (GET /reviews/settings/messaging) are not on this server yet. Until they are, the Reviews app's defaults apply: requests on, one reminder, no reward." />
      ) : failure ? (
        <ErrorNotice message={failure.message} onRetry={load} />
      ) : !cfg || !form ? (
        <BlockSkeleton lines={4} />
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-3" disabled={!canWrite}>
            <legend className="flex items-center gap-1.5 text-sm font-medium text-ink"><Clock className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Request and reminders</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.requests_enabled} onCheckedChange={(v) => set('requests_enabled', v)} aria-label="Ask for a review after delivery" disabled={!canWrite} />
              <span className="text-ink">
                Ask for a review after delivery
                {cfg.consent_mode === null && <span className="text-xs text-ink-soft"> (only shoppers who agreed to marketing messages)</span>}
              </span>
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

          <fieldset className="space-y-2 border-t border-line pt-3" disabled={!canWrite} data-testid="review-consent">
            <legend className="flex items-center gap-1.5 pt-3 text-sm font-medium text-ink"><Users className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Who gets a review request</legend>
            {cfg.consent_mode === null ? (
              <p className="text-xs text-ink-soft">
                Not available on this server yet. Today only buyers who agreed to marketing messages are asked, by WhatsApp or SMS.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Who gets a review request" className="grid gap-2 lg:grid-cols-3">
                {REVIEW_CONSENT_MODES.map((m) => {
                  const on = form.consent_mode === m;
                  return (
                    <label key={m} className={cn('flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors',
                      on ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-line-strong', !canWrite && 'cursor-default')}>
                      <input type="radio" name="review-consent-mode" value={m} checked={on} onChange={() => set('consent_mode', m)}
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand" disabled={!canWrite} />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{CONSENT_WORDS[m].title}</span>
                        {m === REVIEW_CONSENT_DEFAULT && <Chip tone="green" className="ml-1.5 align-middle text-[10px]">Default</Chip>}
                        <span className="mt-0.5 block text-xs text-ink-soft">{CONSENT_WORDS[m].help}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {cfg.consent_mode !== null && (
              <p className="text-[11px] text-ink-soft">A buyer who says no on one channel can still be asked on another. Nobody who unsubscribed is ever asked.</p>
            )}
          </fieldset>

          <GoogleFields cfg={cfg} form={form} set={set} canWrite={canWrite} urlProblem={urlProblem} />

          <fieldset className="space-y-3 border-t border-line pt-3" disabled={!canWrite}>
            <legend className="flex items-center gap-1.5 pt-3 text-sm font-medium text-ink"><Gift className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Reward for a review</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.incentives_enabled} onCheckedChange={(v) => set('incentives_enabled', v)} aria-label="Reward a review" disabled={!canWrite} />
              <span className="text-ink">Reward a review once it is approved <span className="text-xs text-ink-soft">(costs money: off by default)</span></span>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-ink-soft">The promise in your words (leave empty to state the first rule's reward)</span>
              <Input value={form.promise_text} maxLength={REVIEW_BOUNDS.promise_text} onChange={(e) => set('promise_text', e.target.value)}
                placeholder="Get 10% off your next order for a review" className="h-8" />
            </label>
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs" data-testid="review-promise">
              <span className="font-medium text-ink">The next request will say: </span>
              {cfg.incentive_text
                ? <span className="text-ink">"{cfg.incentive_text}"</span>
                : <span className="text-ink-soft">no reward is promised.</span>}
              {dirty && <span className="block text-ink-mute">As saved. Save your changes to see the new wording.</span>}
            </div>
            <p className="text-[11px] text-ink-soft">
              What earns a reward is a review with a photo, a video, a verified purchase or any review, never its star rating.
              Rewarding or asking only happy customers is review gating, which Google and Growcord do not allow.
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

/**
 * The Google review link and the one Google review ask (REV-0 decision): the typed
 * link wins, else the Business Profile sync's. Once a link is known every review page
 * shows "Share it on Google too", review e-mails carry a "Review us on Google" button,
 * and the ask goes once, N days after the buyer's own review, whatever the rating.
 */
const GoogleFields: React.FC<{
  cfg: ReviewMessagingSettings; form: Form; canWrite: boolean; urlProblem: string | null;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
}> = ({ cfg, form, set, canWrite, urlProblem }) => {
  const known = !!cfg.wire.google_write_review_url;
  const typed = form.google_url.trim();
  const inUse = typed && !urlProblem ? typed : (cfg.google_synced_url ?? (typed ? null : cfg.google_review_url));
  return (
    <fieldset className="space-y-3 border-t border-line pt-3" disabled={!canWrite} data-testid="review-google">
      <legend className="flex items-center gap-1.5 pt-3 text-sm font-medium text-ink"><Star className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> Google reviews</legend>
      {!known ? (
        <p className="text-xs text-ink-soft">Not available on this server yet. Nothing asks a buyer for a Google review today.</p>
      ) : (
        <>
          <label className="block space-y-1 text-xs">
            <span className="text-ink-soft">Your Google review link</span>
            <Input value={form.google_url} onChange={(e) => set('google_url', e.target.value)} inputMode="url" spellCheck={false}
              placeholder="https://g.page/r/your-code/review" aria-invalid={!!urlProblem}
              className={cn('h-8 font-mono text-xs', urlProblem && 'border-bad focus-visible:ring-bad')} />
          </label>
          {urlProblem && <p className="text-xs text-bad-ink" role="alert">{urlProblem}</p>}
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[11px] text-ink-soft">
            <p className="font-medium text-ink">Where to find it</p>
            <p className="mt-0.5">
              Open your Google Business Profile (search your business name on Google while signed in, or go to business.google.com).
              Choose "Ask for reviews" (on some screens "Get more reviews"), then "Copy link". It looks like https://g.page/r/ followed by a code and /review.
            </p>
          </div>
          <p className="text-xs" data-testid="review-google-in-use">
            {inUse ? (
              <>
                <span className="text-ink-soft">{typed && !urlProblem ? 'Requests will use this link.' : 'Using the link from your Business Profile sync:'} </span>
                {!(typed && !urlProblem) && <span className="break-all font-mono text-ink">{inUse}</span>}
              </>
            ) : (
              <span className="text-warn-ink">No Google link yet, so no buyer is asked for a Google review.</span>
            )}
          </p>
        </>
      )}
      {cfg.wire.google_ask_enabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Switch checked={form.google_ask_enabled} onCheckedChange={(v) => set('google_ask_enabled', v)} aria-label="Ask for a Google review after a product review" disabled={!canWrite} />
          <span className="text-ink">Ask for a Google review</span>
          {cfg.wire.google_ask_after_days && (
            <span className="inline-flex items-center gap-2">
              <Input inputMode="numeric" value={form.google_ask_after_days} aria-label="Days after their review"
                onChange={(e) => set('google_ask_after_days', e.target.value.replace(/[^0-9]/g, ''))}
                className="h-8 w-16 text-center" disabled={!canWrite || !form.google_ask_enabled} />
              <span className="text-ink">days after their review</span>
            </span>
          )}
        </div>
      )}
      {known && (
        <p className="text-[11px] text-ink-soft">
          Sent once to every buyer who wrote a product review, whatever their rating: Google does not allow asking only happy buyers.
          Once a link is known, the review page also offers "Share it on Google too" and review e-mails carry a "Review us on Google" button.
        </p>
      )}
    </fieldset>
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
                  <p className="text-ink-soft">{rewardWords(r)} for {INCENTIVE_TRIGGER_LABEL[r.trigger_on] ?? r.trigger_on}{r.validity_days ? `, valid ${r.validity_days} days` : ''}</p>
                  {r.disclosure && <p className="mt-0.5 text-ink-mute">Shown: "{r.disclosure}"</p>}
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
                    {r.product_id ? <>Product ending <span className="font-mono">{r.product_id.slice(-6)}</span></> : 'Store default'}
                    {!r.enabled && <Chip tone="neutral" className="ml-1.5 text-[10px]">Never asked</Chip>}
                  </p>
                  <p className="text-ink-soft">
                    {r.delay_days === null ? 'Store default delay' : `${r.delay_days} days after delivery`};{' '}
                    {r.reminder_after_days ? `reminder after ${r.reminder_after_days} days` : 'no reminder'};{' '}
                    {r.expire_after_days === null ? 'link valid as the store default' : `link valid ${r.expire_after_days} days`}
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
