/**
 * Marketing > Ads > Create ad (`/panel/marketing/ads/create`, lane META-15A, contract META-W2 section B).
 *
 * One flow for every objective; its steps change with the objective picked (Awareness has no destination step,
 * Leads asks for the form, Sales asks for the conversion event and offers catalog ads, an existing post needs no
 * texts). Every list on screen (objectives, destinations, optimisation goals, formats, Meta's AI features per
 * format, bid strategies, buttons, placements, special categories, conversion events) comes from
 * `GET /meta/ads/options`; nothing of Meta's vocabulary is typed here. Targeting search, audiences, the creative
 * library, Instagram posts and product sets are their own routes. The last step makes a draft, shows Meta's preview
 * per placement, and creates everything PAUSED: a person resumes it in the Ads Manager.
 *
 * META-19 (ADS-11): an Instant Experience step after the creative: an ad to the site may open one instead of the page,
 * and a collection without the catalog opens one (which formats and destinations come from the options' `canvas`).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { countriesNow, useCountries } from '@/lib/v2/reference';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { majorToMinor } from '@/lib/v2/money';
import { localeDate } from '@/utils/date';
import {
  metaAdsApi, metaApi, metaLeadsApi, metaSocialApi, type AdsDraft, type AdsDraftInput, type AdsObjective, type AdsOptions, type ApplyResult,
  type LeadForm, type MetaAudience, type SocialPost, type TargetingHit, type TargetingType,
} from '@/lib/v2/areas/meta';
import { Segmented } from '@/components/panelAnalytics/Kit';
import MetaHeader from '../MetaHeader';
import RemarketingWizard from '../RemarketingWizard';
import { Lead, LoadFailure, Section, linkCls, money, num, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { ADS_ROUTES, META_ROUTES, metaHref } from '../routes';
import { AiFeatureList, LibThumb, PreviewGrid, aiValues } from './pieces';
import { Facts, NeedsAdAccount, adAccountOf, dayIso, labelFrom, sizeText, useAdsOptions } from './shared';
import { CANVAS_RULE_FALLBACK, type Canvas } from '@/lib/v2/areas/meta'; // META-19
import { CanvasPicker } from './canvases'; // META-19

type StepKey = 'objective' | 'destination' | 'budget' | 'audience' | 'placements' | 'creative' | 'canvas' | 'preview';
const STEP_TITLE: Record<StepKey, string> = {
  objective: 'Objective', destination: 'Destination', budget: 'Budget and bid', audience: 'Audience', placements: 'Placements', creative: 'Creative',
  canvas: 'Instant Experience', preview: 'Preview',
};

interface Place { id: string; name: string; kind: string; radius_km?: number }

/** Text field limits when the options data does not say (Meta's own: five of each). */
const FALLBACK_LIMITS = { primary: 5, headlines: 5, descriptions: 5 };
/** Media each format needs; formats Meta adds later are treated as one picture or video. */
const MEDIA_RULE: Record<string, { min: number; max: number; kinds: string[] }> = {
  image: { min: 1, max: 1, kinds: ['image'] },
  video: { min: 1, max: 1, kinds: ['video'] },
  carousel: { min: 2, max: 10, kinds: ['image', 'video'] },
  /* META-19: a collection from a product set takes no media (Meta's catalog video is the cover); one from an
   * Instant Experience may take a cover (COLLECTION_CANVAS_RULE). */
  collection: { min: 0, max: 0, kinds: [] },
  lead_form: { min: 1, max: 1, kinds: ['image', 'video'] },
  catalog: { min: 0, max: 0, kinds: [] },
  existing_post: { min: 0, max: 0, kinds: [] },
};
const mediaRule = (f: string) => MEDIA_RULE[f] ?? { min: 1, max: 1, kinds: ['image', 'video'] };
/** META-19: the cover of a collection that opens an Instant Experience is optional (its first photo otherwise). */
const COLLECTION_CANVAS_RULE = { min: 0, max: 1, kinds: ['image', 'video'] };
const fmtDay = (d: string) => (d ? localeDate(`${d}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const CreateAdPage: React.FC = () => {
  useCountries(); // re-render when the full country list arrives
  const ctx = useMetaCtx();
  const account = adAccountOf(ctx);
  const optsQ = useAdsOptions();
  const [wizard, setWizard] = useState(false);
  return (
    <div className="space-y-5">
      <MetaHeader title="Create ad" setup={ctx.setup}
        description="Pick what you want, where people go, the money, who sees it and the creative. It is created paused; nothing spends until you resume it in the Ads Manager." />
      {!account && ctx.setup ? <NeedsAdAccount ctx={ctx} />
        : !ctx.can.ads && ctx.setup ? <Lead tone="warn" title="You can look, but not create">Creating ads needs the ads manage permission. Ask the store owner.</Lead>
          : optsQ.error && !optsQ.data ? <LoadFailure failure={optsQ.error} what="The ad options (GET /api/v2/marketing/meta/ads/options) are not served yet." onRetry={optsQ.reload} />
            : !optsQ.data || !ctx.setup ? <p className="text-sm text-gray-500">Loading...</p>
              : <Flow opts={optsQ.data} ctx={ctx} onQuickStart={() => setWizard(true)} />}
      {wizard && <RemarketingWizard ctx={ctx} currency="INR" onClose={() => setWizard(false)} onCreated={() => undefined} />}
    </div>
  );
};

const Flow: React.FC<{ opts: AdsOptions; ctx: ReturnType<typeof useMetaCtx>; onQuickStart: () => void }> = ({ opts, ctx, onQuickStart }) => {
  const cur = 'INR';
  const audiencesQ = useLoad(() => metaAdsApi.audiences(), []);
  const libraryQ = useLoad(() => metaAdsApi.library(), []);
  const rmQ = useLoad(() => metaApi.remarketingOptions().catch(() => null), []);
  const limits = opts.text_limits ?? FALLBACK_LIMITS;

  /* The answers */
  const [objectiveKey, setObjectiveKey] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [special, setSpecial] = useState<string[]>([]);
  /** ADS-12: where a special ad category applies; null follows the countries the ad targets. */
  const [specialCountries, setSpecialCountries] = useState<string[] | null>(null);
  const [spendCap, setSpendCap] = useState('');
  const [app, setApp] = useState('');
  const [destination, setDestination] = useState('');
  const [goal, setGoal] = useState('');
  const [conversionEvent, setConversionEvent] = useState('');
  const [link, setLink] = useState('');
  const [urlParams, setUrlParams] = useState(opts.url_parameters_default ?? '');
  const [phone, setPhone] = useState('');
  const [leadFormId, setLeadFormId] = useState('');
  const [leadFormName, setLeadFormName] = useState('');
  const [cbo, setCbo] = useState(true);
  const [budgetKind, setBudgetKind] = useState<'daily' | 'lifetime'>('daily');
  const [budget, setBudget] = useState('');
  const [bidStrategy, setBidStrategy] = useState(opts.bid_strategies[0]?.key ?? '');
  const [bidAmount, setBidAmount] = useState('');
  const [roasTarget, setRoasTarget] = useState('');
  const [start, setStart] = useState(dayIso(0));
  const [end, setEnd] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all');
  const [languages, setLanguages] = useState<TargetingHit[]>([]);
  const [detailed, setDetailed] = useState<TargetingHit[]>([]);
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [advantage, setAdvantage] = useState(true);
  const [placementsAuto, setPlacementsAuto] = useState(true);
  const [placements, setPlacements] = useState<string[]>([]);
  const [format, setFormat] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [postId, setPostId] = useState('');
  const [postLabel, setPostLabel] = useState('');
  const [boostFrom, setBoostFrom] = useState<'facebook' | 'instagram'>('facebook');
  const [productSetId, setProductSetId] = useState('');
  const [catalogLayout, setCatalogLayout] = useState('');
  /** ADS-12: a carousel card's own words and link, by creative library id (empty fields use the ad's). */
  const [cards, setCards] = useState<Record<string, { headline: string; description: string; link: string }>>({});
  const [primary, setPrimary] = useState<string[]>(['']);
  const [headlines, setHeadlines] = useState<string[]>(['']);
  const [descriptions, setDescriptions] = useState<string[]>(['']);
  const [cta, setCta] = useState(opts.call_to_actions[0]?.key ?? '');
  const [aiBy, setAiBy] = useState<Record<string, Record<string, 'on' | 'off'>>>({});
  /* META-19: the Instant Experience the ad opens, and where a collection's products come from. */
  const [canvasId, setCanvasId] = useState('');
  const [canvasPicked, setCanvasPicked] = useState<Canvas | null>(null);
  const [collectionFrom, setCollectionFrom] = useState<'set' | 'canvas'>('canvas');

  /* The flow */
  const [stepKey, setStepKey] = useState<StepKey>('objective');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<AdsDraft | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [result, setResult] = useState<ApplyResult | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const objective: AdsObjective | null = opts.objectives.find((o) => o.key === objectiveKey) ?? null;
  const destinations = objective?.destinations ?? [];
  const formats = (objective?.formats ?? []).filter((f) => f.key !== 'lead_form' || destination === 'instant_form');
  const formatOpt = formats.find((f) => f.key === format) ?? null;
  const canvasRule = opts.canvas ?? CANVAS_RULE_FALLBACK;
  const collectionCanvas = format === 'collection' && collectionFrom === 'canvas';
  const wantsSet = format === 'catalog' || (format === 'collection' && collectionFrom === 'set');
  const canvasAllowed = canvasRule.formats.includes(format) && canvasRule.destinations.includes(destination) && !wantsSet;
  const features = collectionCanvas ? formatOpt?.canvas_ai_features ?? [] : formatOpt?.ai_features ?? [];
  const ai = aiValues(features, aiBy[format]);
  const bidOpt = opts.bid_strategies.find((b) => b.key === bidStrategy) ?? null;
  const strategies = opts.bid_strategies.filter((b) => b.needs !== 'roas' || objectiveKey === 'sales');
  const wantsConversion = destination === 'website' && (objectiveKey === 'sales' || objectiveKey === 'leads');

  // Steps change with the objective: no destination step when the ad itself is the destination.
  const steps: StepKey[] = useMemo(() => {
    const s: StepKey[] = ['objective'];
    if (!objective || destinations.some((d) => d !== 'on_ad')) s.push('destination');
    s.push('budget', 'audience', 'placements', 'creative');
    if (canvasAllowed) s.push('canvas');
    s.push('preview');
    return s;
  }, [objective, destinations, canvasAllowed]);
  const stepIdx = steps.indexOf(stepKey);

  // Defaults that follow a choice (each can still be changed).
  useEffect(() => { if (places === null && rmQ.data !== undefined && !rmQ.loading) setPlaces((rmQ.data?.countries_default ?? []).map((c) => ({ id: c, name: countriesNow().find((x) => x.code === c)?.name ?? c, kind: 'country' }))); }, [rmQ.data, rmQ.loading, places]);
  useEffect(() => {
    if (!objective) return;
    if (!destinations.includes(destination)) setDestination(destinations[0] ?? '');
    if (!objective.optimization_goals.some((g) => g.key === goal)) setGoal(objective.optimization_goals[0]?.key ?? '');
    if (!strategies.some((b) => b.key === bidStrategy)) setBidStrategy(strategies[0]?.key ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectiveKey]);
  useEffect(() => { if (objective && !formats.some((f) => f.key === format)) setFormat(formats[0]?.key ?? ''); }, [objective, formats, format]);
  // META-19: a collection from a product set is a Sales ad; the others open an Instant Experience.
  useEffect(() => { setCollectionFrom(objectiveKey === 'sales' ? 'set' : 'canvas'); }, [objectiveKey]);
  useEffect(() => { if (wantsConversion && !conversionEvent) setConversionEvent(opts.conversion_events[0]?.key ?? ''); }, [wantsConversion, conversionEvent, opts.conversion_events]);
  useEffect(() => { if (!nameTouched) setName(objective ? `${objective.label}, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''); }, [objective, nameTouched]);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [stepKey, result]);

  const budgetMinor = majorToMinor(budget, cur);
  const bidMinor = majorToMinor(bidAmount, cur);
  const spendCapMinor = spendCap.trim() ? majorToMinor(spendCap, cur) : null;
  const targetedCountries = (places ?? []).filter((p) => p.kind === 'country').map((p) => p.id);
  const specialIn = specialCountries ?? targetedCountries;
  // App promotion is offered by the server only when the store registered an app (META-9B options `apps`).
  const needsApp = objectiveKey === 'app_promotion' && (opts.apps ?? []).length > 0;
  const cardOf = (id: string) => cards[id] ?? { headline: '', description: '', link: '' };
  const rule = collectionCanvas ? COLLECTION_CANVAS_RULE : mediaRule(format);
  const library = (libraryQ.data ?? []).filter((l) => l.status === 'ready' && rule.kinds.includes(String(l.type)));
  const audiences = audiencesQ.data ?? [];
  const usable = audiences.filter((a) => a.type !== 'saved' && a.status === 'ready');
  const saved = audiences.filter((a) => a.type === 'saved');

  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const input = (): AdsDraftInput => {
    const b = budgetMinor && budgetMinor > 0 ? { kind: budgetKind, amount_minor: budgetMinor } : null;
    return {
      kind: objectiveKey,
      name: name.trim(),
      campaign: {
        objective: objectiveKey, budget: cbo ? b : null, bid_strategy: bidStrategy || null,
        bid_amount_minor: bidOpt?.needs === 'bid_amount' || bidOpt?.needs === 'cost_cap' ? bidMinor : null,
        roas_target: bidOpt?.needs === 'roas' ? Number(roasTarget) || null : null,
        special_ad_categories: special, schedule: { start: start || null, end: end || null },
        special_ad_category_country: special.length ? specialIn : [],
        spend_cap_minor: spendCapMinor && spendCapMinor > 0 ? spendCapMinor : null,
      },
      adset: {
        destination, optimization_goal: goal || null, conversion_event: wantsConversion ? conversionEvent || null : null,
        targeting: {
          countries: (places ?? []).filter((p) => p.kind === 'country').map((p) => p.id),
          regions: (places ?? []).filter((p) => p.kind === 'region').map((p) => p.id),
          cities: (places ?? []).filter((p) => p.kind === 'city').map((p) => ({ key: p.id, radius_km: p.radius_km ?? 25 })),
          age_min: Number(ageMin) || 18, age_max: Number(ageMax) || 65,
          genders: gender === 'all' ? [] : [gender],
          languages: languages.map((l) => l.id),
          interests: detailed.filter((d) => d.type !== 'behaviors').map((d) => ({ id: d.id, name: d.name })),
          behaviors: detailed.filter((d) => d.type === 'behaviors').map((d) => ({ id: d.id, name: d.name })),
          custom_audiences: include, excluded_audiences: exclude, advantage_audience: advantage,
        },
        placements: placementsAuto ? 'auto' : placements,
        schedule: { start: start || null, end: end || null },
        budget: cbo ? null : b,
        phone: destination === 'calls' ? phone.trim() || null : null,
        app: needsApp ? app || null : null,
      },
      creative: {
        format, media: rule.max ? media : [], post_id: format === 'existing_post' ? postId || null : null,
        product_set_id: wantsSet ? productSetId || null : null,
        texts: format === 'existing_post' ? { primary: [], headlines: [], descriptions: [] } : { primary: clean(primary), headlines: clean(headlines), descriptions: clean(descriptions) },
        link: destination === 'website' ? link.trim() || null : null,
        call_to_action: format === 'existing_post' ? null : cta || null,
        url_parameters: destination === 'website' ? urlParams.trim() || null : null,
        lead_form_id: destination === 'instant_form' ? leadFormId.trim() || null : null,
        ai_features: Object.fromEntries(features.map((f) => [f.key, ai[f.key]])),
        catalog_layout: format === 'catalog' ? catalogLayout || null : null,
        cards: format === 'carousel' && media.some((id) => Object.values(cardOf(id)).some((v) => v.trim()))
          ? media.map((id) => { const c = cardOf(id); return { headline: c.headline.trim() || null, description: c.description.trim() || null, link: c.link.trim() || null }; })
          : [],
        canvas_id: canvasAllowed && canvasId ? canvasId : null,
      },
    };
  };

  /** What must be right before leaving a step, in words. */
  const problem = (k: StepKey): string => {
    if (k === 'objective') {
      if (!objective) return 'Pick what you want from this campaign.';
      if (!name.trim()) return 'Give the campaign a name.';
      if (needsApp && !app) return 'Pick the app to promote.';
    }
    if (k === 'destination') {
      if (!destination) return 'Pick where people go.';
      if (destination === 'website' && !/^https?:\/\/\S+\.\S+/.test(link.trim())) return 'Type the page address, starting with https://';
      if (destination === 'calls' && phone.replace(/\D/g, '').length < 8) return 'Type the phone number people call.';
      if (destination === 'instant_form' && !leadFormId.trim()) return 'Pick the instant form.';
      if (wantsConversion && !conversionEvent) return 'Pick the conversion event.';
    }
    if (k === 'budget') {
      if (!budgetMinor || budgetMinor <= 0) return 'Type a budget above zero.';
      if (budgetKind === 'lifetime' && !end) return 'A total budget needs an end date.';
      if (end && end < start) return 'The end date is before the start date.';
      if ((bidOpt?.needs === 'bid_amount' || bidOpt?.needs === 'cost_cap') && !(bidMinor && bidMinor > 0)) return `Type the ${bidOpt?.needs === 'cost_cap' ? 'cost per result goal' : 'bid cap'}.`;
      if (bidOpt?.needs === 'roas' && !(Number(roasTarget) > 0)) return 'Type the return on ad spend goal, for example 2.5.';
      if (spendCap.trim() && !(spendCapMinor && spendCapMinor > 0)) return 'Type a spend cap above zero, or leave it empty.';
    }
    if (k === 'audience') {
      if (!(places ?? []).length) return 'Pick at least one place.';
      const a = Number(ageMin); const z = Number(ageMax);
      if (!(a >= 13 && z <= 65 && a <= z)) return 'Ages run from 13 to 65, the first no higher than the second.';
      if (include.some((id) => exclude.includes(id))) return 'An audience cannot be both included and left out.';
      if (special.length && !specialIn.length) return 'Pick the countries the special ad category applies in.';
    }
    if (k === 'placements' && !placementsAuto && !placements.length) return 'Pick at least one placement, or let Meta choose.';
    if (k === 'canvas' && collectionCanvas) {
      if (!canvasId) return 'Pick or make the Instant Experience the collection opens.';
      if (canvasPicked?.collection_ready === false) return canvasPicked.collection_note ?? 'This Instant Experience does not fit a collection yet.';
    }
    if (k === 'creative') {
      if (!format) return 'Pick a format.';
      if (format === 'existing_post' && !postId) return 'Pick the post to boost.';
      if (format === 'carousel' && media.some((id) => { const l = cardOf(id).link.trim(); return !!l && !/^https?:\/\/\S+\.\S+/.test(l); })) return 'A card link must start with https://';
      if (wantsSet && !productSetId) return 'Pick the products (a product set).';
      if (media.length < rule.min) return rule.min === 1 ? 'Pick a picture or video from the library.' : `Pick at least ${rule.min} pictures or videos.`;
      if (format !== 'existing_post' && !clean(primary).length) return 'Write the primary text.';
      if (format !== 'existing_post' && !cta) return 'Pick the button.';
    }
    return '';
  };

  const ensureDraft = async () => {
    const body = input();
    const key = JSON.stringify(body);
    if (draft && key === draftKey) return;
    if (draft) await metaAdsApi.discardDraft(draft.id).catch(() => undefined);
    const created = await metaAdsApi.createDraft(body);
    const full = created.previews ? created : await metaAdsApi.draft(created.id);
    setDraft(full); setDraftKey(key);
  };

  // Leaving the page before creating drops the draft.
  const draftRef = useRef<AdsDraft | null>(null);
  const resultRef = useRef<ApplyResult | null>(null);
  draftRef.current = draft; resultRef.current = result;
  useEffect(() => () => { if (draftRef.current && !resultRef.current) metaAdsApi.discardDraft(draftRef.current.id).catch(() => undefined); }, []);

  const go = async (to: number) => {
    if (to > stepIdx) {
      for (let i = stepIdx; i < to; i++) {
        const p = problem(steps[i]);
        if (p) { setError(p); setStepKey(steps[i]); return; }
      }
    }
    setError('');
    if (steps[to] === 'preview') {
      setBusy(true);
      try { await ensureDraft(); } catch (e) { setError(writeError(e, 'Meta could not make the preview.')); setBusy(false); return; }
      setBusy(false);
    }
    setStepKey(steps[to]);
  };

  const refreshPreviews = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try { setDraft(await metaAdsApi.refreshPreviews(draft.id)); } catch (e) { setError(writeError(e, 'Meta could not refresh the preview.')); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try { setResult(await metaAdsApi.applyDraft(draft.id)); } catch (e) { setError(writeError(e, 'Meta did not create the campaign.')); }
    finally { setBusy(false); }
  };

  const setup = (key: string) => ctx.setup?.items.find((i) => i.key === key)?.picked ?? null;
  const spendLine = budgetMinor && budgetMinor > 0
    ? (budgetKind === 'daily' ? `Up to ${money(budgetMinor, cur)} a day, about ${money(budgetMinor * 30, cur)} over 30 days, once someone resumes it.` : `At most ${money(budgetMinor, cur)} in total, until the end date, once someone resumes it.`)
    : 'The most it may spend.';

  if (result) {
    return (
      <div ref={top} className="rounded-lg border bg-white px-4 py-10 text-center sm:px-6">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold">Created, and paused</p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-gray-700">{result.name ?? name} is on Meta with its ad set and ad, all paused. It spends nothing until someone resumes it in the Ads Manager.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild><Link to={metaHref(ADS_ROUTES.manager, result.campaign_id ? { focus: result.campaign_id } : {})}>Open in Ads Manager</Link></Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Create another</Button>
        </div>
      </div>
    );
  }

  const body = (() => {
    switch (stepKey) {
      case 'objective': return (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">What do you want from this campaign?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {opts.objectives.map((o) => (
                <label key={o.key} className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', objectiveKey === o.key && 'border-gray-900 ring-1 ring-gray-900')}>
                  <input type="radio" className="mt-1" checked={objectiveKey === o.key} onChange={() => setObjectiveKey(o.key)} />
                  <span className="min-w-0"><span className="block font-medium">{o.label}</span>{o.help && <span className="block text-xs text-gray-600">{o.help}</span>}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-md border border-dashed bg-gray-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-gray-900">Showing people the products they looked at?</p>
            <p className="text-gray-600">The remarketing quick start builds a catalog campaign from your pixel in five short steps.</p>
            <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={onQuickStart}><Sparkles /> Remarketing quick start</Button>
          </div>
          <div>
            <Label htmlFor="ca-name">Campaign name</Label>
            <Input id="ca-name" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} className="mt-1 max-w-md" />
          </div>
          {opts.special_ad_categories.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-900">Special ad categories <span className="font-normal text-gray-500">(only if the ad is about one of these; Meta limits targeting for them)</span></legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {opts.special_ad_categories.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={special.includes(c.key)} onChange={(e) => setSpecial(e.target.checked ? [...special, c.key] : special.filter((x) => x !== c.key))} /> {c.label}</label>
                ))}
              </div>
              {special.length > 0 && (
                <div className="mt-3 rounded-md border bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">Countries it applies in</p>
                  <p className="text-xs text-gray-600">Meta asks where the special category applies. {specialCountries === null ? 'Following the countries this ad targets; change them here to set your own.' : 'Your own list, apart from the countries the ad targets.'}</p>
                  <CountryPicks value={specialIn} onChange={setSpecialCountries} />
                  {specialCountries !== null && <button type="button" className={`${linkCls} mt-1 text-xs`} onClick={() => setSpecialCountries(null)}>Follow the targeted countries again</button>}
                </div>
              )}
            </fieldset>
          )}
          {needsApp && (
            <div className="max-w-md">
              <Label htmlFor="ca-app">App to promote</Label>
              <select id="ca-app" value={app} onChange={(e) => setApp(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                <option value="">Pick the app</option>
                {(opts.apps ?? []).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">The apps your store registered in the ads settings.</p>
            </div>
          )}
          {opts.warnings.map((w, i) => <Lead key={i} tone="info" title="Before you start">{w.text}</Lead>)}
        </div>
      );
      case 'destination': return (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Where do people go when they tap the ad?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {destinations.map((d) => {
                const o = opts.destinations.find((x) => x.key === d);
                return (
                  <label key={d} className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', destination === d && 'border-gray-900 ring-1 ring-gray-900')}>
                    <input type="radio" className="mt-1" checked={destination === d} onChange={() => setDestination(d)} />
                    <span className="min-w-0"><span className="block font-medium">{o?.label ?? labelFrom([], d)}</span>{o?.help && <span className="block text-xs text-gray-600">{o.help}</span>}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {destination === 'website' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ca-link">Page address</Label>
                <Input id="ca-link" value={link} onChange={(e) => setLink(e.target.value)} className="mt-1" placeholder="https://" inputMode="url" />
              </div>
              <div>
                <Label htmlFor="ca-utm">URL parameters</Label>
                <Input id="ca-utm" value={urlParams} onChange={(e) => setUrlParams(e.target.value)} className="mt-1 font-mono text-xs" />
                <p className="mt-1 text-xs text-gray-500">Filled from your attribution settings, so orders from this ad are counted as Meta's.</p>
              </div>
            </div>
          )}
          {destination === 'whatsapp' && <SetupFact label="WhatsApp number" picked={setup('whatsapp')} />}
          {destination === 'messenger' && <SetupFact label="Facebook Page" picked={setup('page')} />}
          {destination === 'instagram_direct' && <SetupFact label="Instagram account" picked={setup('instagram')} />}
          {destination === 'calls' && (
            <div className="max-w-xs">
              <Label htmlFor="ca-phone">Phone number people call</Label>
              <Input id="ca-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" inputMode="tel" placeholder="+91" />
            </div>
          )}
          {destination === 'instant_form' && (
            <LeadFormPicker value={leadFormId} onChange={(id, label) => { setLeadFormId(id); setLeadFormName(label); }} />
          )}
          {wantsConversion && (
            <div className="max-w-md">
              <Label htmlFor="ca-event">Conversion event</Label>
              <select id="ca-event" value={conversionEvent} onChange={(e) => setConversionEvent(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                {opts.conversion_events.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">The event from your pixel Meta optimises for.</p>
            </div>
          )}
        </div>
      );
      case 'budget': return (
        <div className="space-y-5">
          <label className="flex items-start gap-3 rounded-md border bg-white px-3 py-2.5 text-sm">
            <Switch checked={cbo} onCheckedChange={setCbo} className="mt-0.5" />
            <span><span className="font-medium">Advantage campaign budget</span><span className="block text-xs text-gray-600">One budget for the campaign; Meta moves it to the ad sets doing best. Off: the budget sits on the ad set.</span></span>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={budgetKind === 'daily'} onChange={() => setBudgetKind('daily')} /> Daily budget</label>
            <label className="flex items-center gap-2"><input type="radio" checked={budgetKind === 'lifetime'} onChange={() => setBudgetKind('lifetime')} /> Total budget</label>
          </div>
          <div className="max-w-xs">
            <Label htmlFor="ca-budget">{budgetKind === 'daily' ? 'Most it may spend in a day' : 'Most it may spend in total'} ({cur})</Label>
            <Input id="ca-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1" placeholder="For example 500" />
            <p className="mt-1 text-xs text-gray-600">{spendLine}</p>
          </div>
          <div className="max-w-xs">
            <Label htmlFor="ca-cap">Spend cap for the whole campaign ({cur}) <span className="font-normal text-gray-500">(optional)</span></Label>
            <Input id="ca-cap" inputMode="decimal" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} className="mt-1" placeholder="No cap" />
            <p className="mt-1 text-xs text-gray-600">{spendCapMinor && spendCapMinor > 0 ? `Meta stops the campaign once it has spent ${money(spendCapMinor, cur)} in all.` : 'Meta stops the campaign once it has spent this much in all. Meta sets a lowest cap it accepts.'}</p>
          </div>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ca-start">Starts</Label>
              <Input id="ca-start" type="date" min={dayIso(0)} value={start} onChange={(e) => setStart(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ca-end">Ends {budgetKind === 'daily' && <span className="font-normal text-gray-500">(optional)</span>}</Label>
              <Input id="ca-end" type="date" min={start || dayIso(0)} value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1" />
            </div>
          </div>
          {objective && objective.optimization_goals.length > 0 && (
            <div className="max-w-md">
              <Label htmlFor="ca-goal">Meta optimises for</Label>
              <select id="ca-goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                {objective.optimization_goals.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
          )}
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Bid strategy</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {strategies.map((b) => (
                <label key={b.key} className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm', bidStrategy === b.key && 'border-gray-900 ring-1 ring-gray-900')}>
                  <input type="radio" className="mt-1" checked={bidStrategy === b.key} onChange={() => setBidStrategy(b.key)} />
                  <span className="min-w-0"><span className="block font-medium">{b.label}</span>{b.help && <span className="block text-xs text-gray-600">{b.help}</span>}</span>
                </label>
              ))}
            </div>
            {(bidOpt?.needs === 'bid_amount' || bidOpt?.needs === 'cost_cap') && (
              <div className="mt-3 max-w-xs">
                <Label htmlFor="ca-bid">{bidOpt.needs === 'cost_cap' ? 'Cost per result goal' : 'Bid cap'} ({cur})</Label>
                <Input id="ca-bid" inputMode="decimal" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} className="mt-1" />
              </div>
            )}
            {bidOpt?.needs === 'roas' && (
              <div className="mt-3 max-w-xs">
                <Label htmlFor="ca-roas">Return on ad spend goal</Label>
                <Input id="ca-roas" inputMode="decimal" value={roasTarget} onChange={(e) => setRoasTarget(e.target.value)} className="mt-1" placeholder="For example 2.5" />
                <p className="mt-1 text-xs text-gray-500">{Number(roasTarget) > 0 ? `Meta aims for ${money(Math.round(Number(roasTarget) * 100), cur)} in sales for each ${money(100, cur)} spent.` : 'Sales Meta aims for per rupee spent.'}</p>
              </div>
            )}
          </fieldset>
        </div>
      );
      case 'audience': return (
        <div className="space-y-5">
          {saved.length > 0 && (
            <div className="max-w-md">
              <Label htmlFor="ca-saved">Start from a saved audience</Label>
              <select id="ca-saved" defaultValue="" onChange={(e) => {
                const a = saved.find((x) => x.id === e.target.value);
                const t = a?.spec?.targeting ?? {};
                if (!a) return;
                setPlaces([
                  ...(t.countries ?? []).map((c: string) => ({ id: c, name: countriesNow().find((x) => x.code === c)?.name ?? c, kind: 'country' })),
                  ...(t.cities ?? []).map((c: any) => ({ id: c.key, name: c.name ?? c.key, kind: 'city', radius_km: c.radius_km })),
                ]);
                if (t.age_min) setAgeMin(String(t.age_min));
                if (t.age_max) setAgeMax(String(t.age_max));
                setGender(t.genders?.[0] === 'female' ? 'female' : t.genders?.[0] === 'male' ? 'male' : 'all');
                setDetailed((t.interests ?? []).map((i: any) => ({ id: i.id, name: i.name, type: 'interests' })));
              }} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                <option value="">Pick one to copy its settings</option>
                {saved.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">Places</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(places ?? []).map((p) => (
                <span key={`${p.kind}:${p.id}`} className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs">
                  {p.name}{p.kind !== 'country' && <span className="text-gray-500">({p.kind})</span>}
                  {p.kind === 'city' && (
                    <select aria-label={`Radius around ${p.name}`} value={p.radius_km ?? 25} onChange={(e) => setPlaces((places ?? []).map((x) => (x.id === p.id ? { ...x, radius_km: Number(e.target.value) } : x)))} className="rounded border bg-white text-xs">
                      {[10, 17, 25, 40, 50, 80].map((r) => <option key={r} value={r}>{r} km</option>)}
                    </select>
                  )}
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPlaces((places ?? []).filter((x) => !(x.id === p.id && x.kind === p.kind)))} className="rounded-full p-0.5 text-gray-500 hover:bg-gray-100"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <TargetingSearch type="locations" placeholder="Add a country, state or city" className="mt-2 max-w-md"
              onPick={(h) => setPlaces([...(places ?? []).filter((x) => x.id !== h.id), { id: h.id, name: h.name, kind: String(h.kind ?? 'country'), radius_km: h.kind === 'city' ? 25 : undefined }])} />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Ages</Label>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Input aria-label="Youngest" type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className="h-9 w-20" /> to
                <Input aria-label="Oldest" type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className="h-9 w-20" />
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-gray-900">Gender</legend>
              <div className="mt-1 flex gap-3 text-sm">
                {(['all', 'female', 'male'] as const).map((g) => <label key={g} className="flex items-center gap-1.5"><input type="radio" checked={gender === g} onChange={() => setGender(g)} /> {g === 'all' ? 'All' : g === 'female' ? 'Women' : 'Men'}</label>)}
              </div>
            </fieldset>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Languages <span className="font-normal text-gray-500">(leave empty for all)</span></p>
            <HitChips hits={languages} onRemove={(id) => setLanguages(languages.filter((l) => l.id !== id))} />
            <TargetingSearch type="languages" placeholder="Add a language" className="mt-2 max-w-md" onPick={(h) => setLanguages([...languages.filter((l) => l.id !== h.id), h])} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Detailed targeting: interests and behaviours</p>
            <HitChips hits={detailed} onRemove={(id) => setDetailed(detailed.filter((l) => l.id !== id))} />
            <div className="mt-2 grid max-w-2xl gap-2 sm:grid-cols-2">
              <TargetingSearch type="interests" placeholder="Search interests" onPick={(h) => setDetailed([...detailed.filter((l) => l.id !== h.id), h])} />
              <TargetingSearch type="behaviors" placeholder="Search behaviours" onPick={(h) => setDetailed([...detailed.filter((l) => l.id !== h.id), h])} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Your audiences</p>
            {audiencesQ.error && !audiencesQ.data ? <LoadFailure failure={audiencesQ.error} what="Audiences (GET /api/v2/marketing/meta/ads/audiences) are not served yet." onRetry={audiencesQ.reload} />
              : !usable.length ? <p className="mt-1 text-sm text-gray-600">No ready audiences yet. <Link className={linkCls} to={metaHref(ADS_ROUTES.audiences)}>Make one</Link>.</p> : (
                <ul className="mt-1 divide-y rounded-md border bg-white">
                  {usable.map((a) => <AudienceRow key={a.id} a={a} mode={include.includes(a.id) ? 'in' : exclude.includes(a.id) ? 'out' : 'none'}
                    onMode={(m) => { setInclude(m === 'in' ? [...include.filter((x) => x !== a.id), a.id] : include.filter((x) => x !== a.id)); setExclude(m === 'out' ? [...exclude.filter((x) => x !== a.id), a.id] : exclude.filter((x) => x !== a.id)); }} />)}
                </ul>
              )}
          </div>
          <SaveAudience targeting={() => input().adset.targeting} cityNames={(places ?? []).filter((p) => p.kind === 'city')} onSaved={audiencesQ.reload} />
          <label className="flex items-start gap-3 rounded-md border bg-white px-3 py-2.5 text-sm">
            <Switch checked={advantage} onCheckedChange={setAdvantage} className="mt-0.5" />
            <span><span className="font-medium">Advantage audience</span><span className="block text-xs text-gray-600">Meta treats the settings above as a suggestion and may reach others likely to respond. Places and the lowest age stay firm.</span></span>
          </label>
        </div>
      );
      case 'placements': return (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', placementsAuto && 'border-gray-900 ring-1 ring-gray-900')}>
              <input type="radio" className="mt-1" checked={placementsAuto} onChange={() => setPlacementsAuto(true)} />
              <span><span className="block font-medium">Advantage+ placements</span><span className="block text-xs text-gray-600">Meta shows the ad wherever it expects the best results for the budget.</span></span>
            </label>
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', !placementsAuto && 'border-gray-900 ring-1 ring-gray-900')}>
              <input type="radio" className="mt-1" checked={!placementsAuto} onChange={() => setPlacementsAuto(false)} />
              <span><span className="block font-medium">Choose placements</span><span className="block text-xs text-gray-600">Only where you tick.</span></span>
            </label>
          </div>
          {!placementsAuto && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...new Set(opts.placements.map((p) => p.platform))].map((plat) => (
                <fieldset key={plat} className="rounded-md border bg-white px-3 py-2">
                  <legend className="px-1 text-sm font-medium">{plat}</legend>
                  {opts.placements.filter((p) => p.platform === plat).map((p) => (
                    <label key={p.key} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={placements.includes(p.key)} onChange={(e) => setPlacements(e.target.checked ? [...placements, p.key] : placements.filter((x) => x !== p.key))} /> {p.label}</label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
        </div>
      );
      case 'creative': return (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Format</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {formats.map((f) => (
                <label key={f.key} className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm', format === f.key && 'border-gray-900 ring-1 ring-gray-900')}>
                  <input type="radio" className="mt-1" checked={format === f.key} onChange={() => { setFormat(f.key); setMedia([]); }} />
                  <span className="min-w-0"><span className="block font-medium">{f.label}</span>{f.help && <span className="block text-xs text-gray-600">{f.help}</span>}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {format === 'existing_post' && (
            <div className="space-y-2">
              <Segmented label="Boost a post from" size="sm" value={boostFrom} onChange={(k) => { setBoostFrom(k as 'facebook' | 'instagram'); setPostId(''); setPostLabel(''); }}
                options={[{ key: 'facebook', label: 'Facebook Page' }, { key: 'instagram', label: 'Instagram' }]} />
              {boostFrom === 'facebook'
                ? <PagePostPicker value={postId} onChange={(id, label) => { setPostId(id); setPostLabel(label); }} />
                : <PostPicker value={postId} onChange={(id) => { setPostId(id); setPostLabel('Instagram post'); }} />}
            </div>
          )}
          {format === 'collection' && (
            <div className="space-y-1">
              {objectiveKey === 'sales'
                ? <Segmented label="The collection's products" size="sm" value={collectionFrom} onChange={(k) => { setCollectionFrom(k as 'set' | 'canvas'); setMedia([]); }}
                  options={[{ key: 'set', label: 'From a product set' }, { key: 'canvas', label: 'From an Instant Experience' }]} />
                : null}
              <p className="text-xs text-gray-600">{collectionCanvas
                ? 'No catalog needed: the next step picks or makes the Instant Experience the collection opens, its first photo the cover and four more of its pictures under it.'
                : "Meta makes the cover video from the product set's products and shows them under it."}</p>
            </div>
          )}
          {wantsSet && <SetPicker channelId={ctx.fbChannel?.id ?? null} value={productSetId} onChange={setProductSetId} />}
          {format === 'catalog' && (opts.catalog_layouts ?? []).length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-900">How the products show</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {(opts.catalog_layouts ?? []).map((l) => (
                  <label key={l.key} className="flex items-center gap-2 text-sm"><input type="radio" checked={catalogLayout === l.key} onChange={() => setCatalogLayout(l.key)} /> {l.label}</label>
                ))}
              </div>
              {!catalogLayout && <p className="mt-1 text-xs text-gray-500">Not picked: the default layout for catalog ads.</p>}
            </fieldset>
          )}
          {rule.max > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{collectionCanvas ? "The collection's cover (optional: the Instant Experience's first photo otherwise)" : rule.max === 1 ? `Pick one ${rule.kinds.join(' or ')}` : `Pick ${rule.min} to ${rule.max} pictures or videos, in the order shown`} <span className="font-normal text-gray-500">({media.length} picked)</span></p>
                <Link className={`${linkCls} text-sm`} to={metaHref(ADS_ROUTES.library)}>Add to the library</Link>
              </div>
              {libraryQ.error && !libraryQ.data ? <LoadFailure failure={libraryQ.error} what="The creative library (GET /api/v2/marketing/meta/ads/library) is not served yet." onRetry={libraryQ.reload} />
                : !library.length ? <p className="mt-1 text-sm text-gray-600">Nothing ready in the library for this format yet.</p> : (
                  <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                    {library.map((l) => {
                      const at = media.indexOf(l.id);
                      return (
                        <li key={l.id}>
                          <button type="button" aria-pressed={at >= 0} onClick={() => setMedia((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : rule.max === 1 ? [l.id] : cur.length < rule.max ? [...cur, l.id] : cur))}
                            className={cn('relative block w-full overflow-hidden rounded-md border bg-gray-50', at >= 0 && 'ring-2 ring-gray-900')}>
                            <LibThumb l={l} />
                            {at >= 0 && <span className="absolute left-1 top-1 rounded-full bg-gray-900 px-1.5 text-[11px] font-semibold text-white">{rule.max === 1 ? 'Picked' : at + 1}</span>}
                          </button>
                          <p className="mt-0.5 truncate text-[11px] text-gray-600" title={l.name}>{l.name}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
          )}
          {format === 'carousel' && media.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-900">Each card <span className="font-normal text-gray-500">(optional; an empty field uses the ad's headline, description and link)</span></legend>
              <ol className="mt-2 space-y-2">
                {media.map((id, n) => {
                  const l = (libraryQ.data ?? []).find((x) => x.id === id);
                  const c = cardOf(id);
                  const upd = (k: 'headline' | 'description' | 'link', v: string) => setCards({ ...cards, [id]: { ...c, [k]: v } });
                  return (
                    <li key={id} className="grid gap-2 rounded-md border bg-gray-50 p-2 sm:grid-cols-[3rem_1fr_1fr_1fr]">
                      <div className="flex items-center gap-2 sm:block">
                        <div className="w-12 overflow-hidden rounded border bg-white">{l ? <LibThumb l={l} /> : null}</div>
                        <span className="text-xs text-gray-500 sm:hidden">Card {n + 1}</span>
                      </div>
                      <Input aria-label={`Card ${n + 1} headline`} placeholder="Headline" value={c.headline} onChange={(e) => upd('headline', e.target.value)} />
                      <Input aria-label={`Card ${n + 1} description`} placeholder="Description" value={c.description} onChange={(e) => upd('description', e.target.value)} />
                      <Input aria-label={`Card ${n + 1} link`} placeholder="https://" inputMode="url" value={c.link} onChange={(e) => upd('link', e.target.value)} />
                    </li>
                  );
                })}
              </ol>
            </fieldset>
          )}
          {format !== 'existing_post' && (
            <>
              <Variations id="ca-primary" label="Primary text" hint="Above the picture. Meta tries each and shows the best." values={primary} onChange={setPrimary} max={limits.primary} multiline />
              <div className="grid gap-4 lg:grid-cols-2">
                <Variations id="ca-headline" label="Headline" values={headlines} onChange={setHeadlines} max={limits.headlines} />
                <Variations id="ca-desc" label="Description" values={descriptions} onChange={setDescriptions} max={limits.descriptions} />
              </div>
              <div className="max-w-xs">
                <Label htmlFor="ca-cta">Button</Label>
                <select id="ca-cta" value={cta} onChange={(e) => setCta(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                  {opts.call_to_actions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            </>
          )}
          <AiFeatureList title={<>Meta's AI features for {formatOpt?.label ?? 'this format'} <span className="font-normal text-gray-500">(you see the result in the preview)</span></>}
            features={features} value={ai} onChange={(k, on) => setAiBy({ ...aiBy, [format]: { ...(aiBy[format] ?? {}), [k]: on ? 'on' : 'off' } })} />
        </div>
      );
      case 'canvas': return (
        <CanvasPicker value={canvasId} forCollection={collectionCanvas} required={collectionCanvas} pageLink={link.trim()} canAct={ctx.can.ads}
          onChange={(id, c) => { setCanvasId(id); setCanvasPicked(c); }} />
      );
      case 'preview': {
        const i = input();
        return (
          <div className="space-y-4">
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">What Meta's AI makes can be accepted or switched off feature by feature (back to Creative); it cannot be edited here. Everything is created paused.</p>
            {(draft?.warnings ?? []).map((w, k) => <Lead key={k} tone="warn" title="Meta may refuse this">{w.text}</Lead>)}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-700">Meta's preview for each placement.</p>
              <Button size="sm" variant="outline" onClick={refreshPreviews} disabled={busy}><RefreshCw /> Refresh</Button>
            </div>
            {!draft?.previews?.length ? <p className="text-sm text-gray-500">{busy ? 'Asking Meta...' : 'Meta sent no preview yet. Press Refresh.'}</p> : <PreviewGrid previews={draft.previews} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" />}
            <div className="rounded-md bg-gray-50 p-3">
              <Facts rows={[
                ['Objective', objective?.label ?? ''],
                ['Special category', special.length ? `${special.map((k) => labelFrom(opts.special_ad_categories, k)).join(', ')}, in ${specialIn.map((c) => countriesNow().find((x) => x.code === c)?.name ?? c).join(', ')}` : ''],
                ['App', needsApp ? labelFrom(opts.apps, app) : ''],
                ['Destination', labelFrom(opts.destinations, destination)],
                ['Lead form', destination === 'instant_form' ? leadFormName || leadFormId : ''],
                ['Budget', budgetMinor ? `${money(budgetMinor, cur)} ${budgetKind === 'daily' ? 'a day' : 'in total'}${cbo ? ', campaign budget' : ', ad set budget'}` : ''],
                ['Spend cap', spendCapMinor && spendCapMinor > 0 ? `${money(spendCapMinor, cur)} in all` : ''],
                ['Bid', `${bidOpt?.label ?? ''}${i.campaign.bid_amount_minor ? `, ${money(i.campaign.bid_amount_minor, cur)}` : ''}${i.campaign.roas_target ? `, ${i.campaign.roas_target}x` : ''}`],
                ['Dates', `${fmtDay(start)}${end ? ` to ${fmtDay(end)}` : ', until paused'}`],
                ['Places', (places ?? []).map((p) => (p.radius_km ? `${p.name} (${p.radius_km} km)` : p.name)).join(', ')],
                ['People', `${ageMin} to ${ageMax}, ${gender === 'all' ? 'all genders' : gender === 'female' ? 'women' : 'men'}${detailed.length ? `, ${detailed.map((d) => d.name).join(', ')}` : ''}${advantage ? ', Advantage audience on' : ''}`],
                ['Audiences', [...include.map((id) => audiences.find((a) => a.id === id)?.name ?? id), ...exclude.map((id) => `not ${audiences.find((a) => a.id === id)?.name ?? id}`)].join(', ')],
                ['Placements', placementsAuto ? 'Advantage+ placements' : placements.map((p) => labelFrom(opts.placements, p)).join(', ')],
                ['Format', `${formatOpt?.label ?? ''}${format === 'catalog' && catalogLayout ? `, ${labelFrom(opts.catalog_layouts, catalogLayout)}` : ''}`],
                ['Boosting', format === 'existing_post' ? postLabel || postId : ''],
                ['Instant Experience', i.creative.canvas_id ? `${canvasPicked?.name ?? i.creative.canvas_id}${canvasPicked?.status === 'draft' && canvasPicked.source !== 'meta' ? ', published when the campaign is created' : ''}` : ''],
                ['Cards with their own words', i.creative.cards?.length ? `${i.creative.cards.filter((c) => c.headline || c.description || c.link).length} of ${i.creative.cards.length}` : ''],
                ['Meta AI on', features.filter((f) => ai[f.key] === 'on').map((f) => f.label).join(', ') || 'none'],
              ]} />
            </div>
          </div>
        );
      }
      default: return null;
    }
  })();

  return (
    <div ref={top} className="grid scroll-mt-4 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Steps" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-1">
          {steps.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => go(i)} disabled={busy}
                className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                  s === stepKey ? 'bg-gray-900 text-white' : i < stepIdx ? 'text-emerald-700 hover:bg-gray-100' : 'text-gray-500 hover:bg-gray-100')}>
                <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]', s === stepKey ? 'border-white' : 'border-current')}>{i + 1}</span>
                {STEP_TITLE[s]}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <Section title={STEP_TITLE[stepKey]} hint={objective && stepKey !== 'objective' ? `${objective.label} campaign: ${name}` : undefined}>
        {body}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="min-w-0 flex-1 text-sm text-red-700" role="alert">{error}</p>
          <div className="flex flex-wrap gap-2">
            {stepIdx > 0 && <Button variant="outline" onClick={() => { setError(''); setStepKey(steps[stepIdx - 1]); }} disabled={busy}>Back</Button>}
            {stepKey !== 'preview'
              ? <Button onClick={() => go(stepIdx + 1)} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {steps[stepIdx + 1] === 'preview' ? 'See preview' : 'Next'}</Button>
              : <Button onClick={create} disabled={busy || !draft}>{busy && <Loader2 className="animate-spin" />} Create paused campaign</Button>}
          </div>
        </div>
      </Section>
    </div>
  );
};

/* Small parts */

/** Keep the audience step's settings as a saved audience, to start later ads from. */
const SaveAudience: React.FC<{ targeting: () => AdsDraftInput['adset']['targeting']; cityNames: Place[]; onSaved: () => void }> = ({ targeting, cityNames, onSaved }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const t = targeting();
      const cities = t.cities.map((c) => ({ ...c, name: cityNames.find((p) => p.id === c.key)?.name ?? c.key }));
      await metaAdsApi.createAudience({ type: 'saved', name: name.trim(), spec: { targeting: { ...t, cities } } });
      toast({ title: `Saved as ${name.trim()}` }); setOpen(false); setName(''); onSaved();
    } catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'The audience was not saved.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  if (!open) return <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}><Plus /> Save as an audience</Button>;
  return (
    <div className="flex max-w-xl flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor="ca-save-aud">Name for these settings</Label>
        <Input id="ca-save-aud" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus />
      </div>
      <Button type="button" size="sm" onClick={save} disabled={busy || !name.trim()}>{busy && <Loader2 className="animate-spin" />} Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
};

const SetupFact: React.FC<{ label: string; picked: { id: string; name: string } | null }> = ({ label, picked }) => (
  picked
    ? <p className="text-sm text-gray-700">{label}: <b>{picked.name}</b>, picked in <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>setup</Link>.</p>
    : <Lead tone="warn" title={`No ${label.toLowerCase()} picked`}>Pick it in <Link className={linkCls} to={metaHref(META_ROUTES.setup)}>Facebook and Instagram setup</Link> first.</Lead>
);

const HitChips: React.FC<{ hits: TargetingHit[]; onRemove: (id: string) => void }> = ({ hits, onRemove }) => (
  hits.length ? (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {hits.map((h) => (
        <span key={h.id} className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs">
          {h.name}
          <button type="button" aria-label={`Remove ${h.name}`} onClick={() => onRemove(h.id)} className="rounded-full p-0.5 text-gray-500 hover:bg-gray-100"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  ) : null
);

/** Meta's targeting search (cached a day on the server); picks a hit. */
const TargetingSearch: React.FC<{ type: TargetingType; placeholder: string; onPick: (h: TargetingHit) => void; className?: string }> = ({ type, placeholder, onPick, className }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<TargetingHit[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState('busy');
    const t = setTimeout(() => {
      metaAdsApi.targeting(type, q.trim())
        .then((h) => { if (alive) { setHits(h); setState('idle'); } })
        .catch(() => { if (alive) setState('error'); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, type]);
  return (
    <div className={cn('relative', className)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder} className="pl-8" aria-label={placeholder} />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white py-1 shadow-md">
          {state === 'error' && <li className="px-3 py-2 text-xs text-red-700">Meta's search did not answer.</li>}
          {state !== 'error' && !hits.length && <li className="px-3 py-2 text-xs text-gray-500">{state === 'busy' ? 'Searching...' : 'Nothing found.'}</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => { onPick(h); setQ(''); setOpen(false); }}>
                <span className="min-w-0"><span className="block">{h.name}</span>{h.path?.length ? <span className="block truncate text-xs text-gray-500">{h.kind ? `${h.kind}, ` : ''}{h.path.join(', ')}</span> : null}</span>
                {h.size_low != null && <span className="shrink-0 text-xs tabular-nums text-gray-500">{num(h.size_low)}+</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const AudienceRow: React.FC<{ a: MetaAudience; mode: 'in' | 'out' | 'none'; onMode: (m: 'in' | 'out' | 'none') => void }> = ({ a, mode, onMode }) => (
  <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
    <span className="min-w-0 text-sm"><span className="block font-medium">{a.name}</span><span className="block text-xs text-gray-500">{labelFrom([], a.type)}, {sizeText(a.size_low, a.size_high)}</span></span>
    <span className="inline-flex rounded-md border bg-gray-50 p-0.5 text-xs">
      {(['none', 'in', 'out'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)} className={cn('rounded px-2 py-1', mode === m ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-500')}>
          {m === 'none' ? 'Not used' : m === 'in' ? 'Include' : 'Leave out'}
        </button>
      ))}
    </span>
  </li>
);


/** Text variations: Meta tries each one and shows the best per person. */
const Variations: React.FC<{ id: string; label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; max: number; multiline?: boolean }> = ({ id, label, hint, values, onChange, max, multiline }) => (
  <div>
    <Label htmlFor={`${id}-0`}>{label} <span className="font-normal text-gray-500">({values.length} of {max})</span></Label>
    {hint && <p className="text-xs text-gray-500">{hint}</p>}
    <div className="mt-1 space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          {multiline
            ? <Textarea id={`${id}-${i}`} rows={2} value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
            : <Input id={`${id}-${i}`} value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />}
          {values.length > 1 && <button type="button" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))} className="mt-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
    </div>
    {values.length < max && <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => onChange([...values, ''])}><Plus /> Add a variation</Button>}
  </div>
);

const PostPicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => {
  const q = useLoad(() => metaApi.igPosts(18), []);
  return (
    <div>
      <p className="text-sm font-medium text-gray-900">Post to boost</p>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Instagram posts are not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading posts...</p>
          : !q.data.length ? <p className="text-sm text-gray-600">No posts found.</p> : (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {q.data.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-pressed={value === p.id} onClick={() => onChange(p.id)} className={cn('block w-full overflow-hidden rounded-md border', value === p.id && 'ring-2 ring-gray-900')}>
                    <img src={p.thumbnail_url ?? p.media_url ?? ''} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">{p.caption}</p>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
};

/** ADS-12: Facebook Page posts published from the Publisher (META-12); the post id Meta takes is that channel's external id. */
const PagePostPicker: React.FC<{ value: string; onChange: (id: string, label: string) => void }> = ({ value, onChange }) => {
  const q = useLoad(() => metaSocialApi.posts({ status: 'published', channel: 'facebook_page', limit: 18 }), []);
  const posts = (q.data?.posts ?? [])
    .map((p) => ({ p, id: p.channels.find((c) => c.key === 'facebook_page')?.external_id ?? null }))
    .filter((x): x is { p: SocialPost; id: string } => !!x.id);
  return (
    <div>
      <p className="text-sm font-medium text-gray-900">Page post to boost</p>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Page posts (GET /api/v2/marketing/social/posts) are not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading posts...</p>
          : !posts.length ? <p className="text-sm text-gray-600">No Page posts published from the Publisher yet.</p> : (
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {posts.map(({ p, id }) => (
                <li key={id}>
                  <button type="button" aria-pressed={value === id} onClick={() => onChange(id, (p.text ?? 'Page post').slice(0, 60))} className={cn('block w-full overflow-hidden rounded-md border bg-gray-50 text-left', value === id && 'ring-2 ring-gray-900')}>
                    {p.media[0]?.url ? <img src={p.media[0].url} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <span className="flex aspect-square items-center p-2 text-xs text-gray-600">{p.text}</span>}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">{p.text}</p>
                  {p.published_at && <p className="text-[11px] text-gray-400">{localeDate(p.published_at, { day: 'numeric', month: 'short' })}</p>}
                </li>
              ))}
            </ul>
          )}
    </div>
  );
};

/** The instant forms on the store's Page (META-11); a typed id only when the list cannot be read. */
const LeadFormPicker: React.FC<{ value: string; onChange: (id: string, name: string) => void }> = ({ value, onChange }) => {
  const q = useLoad(() => metaLeadsApi.forms(), []);
  const active = (q.data?.rows ?? []).filter((f: LeadForm) => (f.status ?? 'ACTIVE').toUpperCase() !== 'ARCHIVED');
  useEffect(() => { if (!value && active.length) onChange(active[0].id, active[0].name ?? active[0].id); }, [active, value, onChange]);
  if (q.error && !q.data) {
    return (
      <div className="max-w-md space-y-2">
        <LoadFailure failure={q.error} what="The forms list (GET /api/v2/marketing/meta/leads/forms) is not served yet." onRetry={q.reload} />
        <Label htmlFor="ca-form">Instant form id</Label>
        <Input id="ca-form" value={value} onChange={(e) => onChange(e.target.value, e.target.value)} className="mt-1 font-mono" inputMode="numeric" />
      </div>
    );
  }
  return (
    <div className="max-w-xl">
      <p className="text-sm font-medium text-gray-900">Instant form</p>
      {!q.data ? <p className="text-sm text-gray-500">Loading forms...</p>
        : !active.length ? (
          <Lead tone="warn" title="No form on your Page yet">Make one in <Link className={linkCls} to={metaHref(ADS_ROUTES.leads)}>Lead forms</Link>, then come back to this step.</Lead>
        ) : (
          <div className="mt-1 space-y-1.5">
            {active.map((f) => (
              <label key={f.id} className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm', value === f.id && 'border-gray-900 ring-1 ring-gray-900')}>
                <input type="radio" className="mt-1" checked={value === f.id} onChange={() => onChange(f.id, f.name ?? f.id)} />
                <span className="min-w-0"><span className="block font-medium">{f.name ?? f.id}</span><span className="block text-xs text-gray-500">{num(f.leads_captured)} leads so far{f.locale ? `, ${f.locale}` : ''}</span></span>
              </label>
            ))}
            <p className="text-xs text-gray-500">Leads arrive in your CRM. <Link className={linkCls} to={metaHref(ADS_ROUTES.leads)}>Make another form</Link></p>
          </div>
        )}
    </div>
  );
};

/** Countries picked from the one country list (`lib/countries`). */
const CountryPicks: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const COUNTRIES = useCountries();
  return (
  <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-1.5">
      {value.length === 0 && <span className="text-xs text-gray-500">None picked.</span>}
      {value.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs">
          {COUNTRIES.find((x) => x.code === c)?.name ?? c}
          <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))} className="text-gray-400 hover:text-gray-700"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
    <select aria-label="Add a country" value="" onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }} className="h-9 w-full max-w-xs rounded-md border bg-white px-2 text-sm">
      <option value="">Add a country</option>
      {COUNTRIES.filter((c) => !value.includes(c.code)).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  </div>
  );
};

const SetPicker: React.FC<{ channelId: string | null; value: string; onChange: (id: string) => void }> = ({ channelId, value, onChange }) => {
  const q = useLoad(() => (channelId ? metaApi.productSets(channelId) : Promise.resolve([])), [channelId]);
  useEffect(() => { if (!value && q.data?.length) onChange(q.data[0].id); }, [q.data, value, onChange]);
  if (!channelId) return <Lead tone="warn" title="Your catalog is not on Meta yet">Put it there first from <Link className={linkCls} to={metaHref(META_ROUTES.catalog)}>Catalog on Meta</Link>.</Lead>;
  return (
    <div className="max-w-md">
      <Label htmlFor="ca-set">Products (product set)</Label>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Product sets are not served yet." onRetry={q.reload} /> : (
        <select id="ca-set" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
          {(q.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.product_count != null ? ` (${num(s.product_count)} products)` : ''}</option>)}
        </select>
      )}
      <p className="mt-1 text-xs text-gray-500">Make a new set in <Link className={linkCls} to={metaHref(META_ROUTES.catalog)}>Catalog on Meta</Link>.</p>
    </div>
  );
};

export default CreateAdPage;
