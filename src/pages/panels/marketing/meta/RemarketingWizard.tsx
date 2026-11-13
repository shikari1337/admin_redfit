/**
 * "Create dynamic remarketing campaign": Products, Audience, Budget and countries, Creative, Preview, Create.
 * Product sets have one home, the Commerce product-set route on the store's facebook_catalog channel: the
 * wizard lists them there and creates a new one there first, then passes its id to the draft. The formats
 * (carousel, single, collection), the Meta AI features each format allows with their help text, and the product
 * placeholders all come from the options call; nothing of them is typed here. The preview is Meta's
 * own placement HTML, each in a sandboxed frame. Create makes the campaign, ad set, creative and ad PAUSED; a
 * person resumes it from the Campaigns table.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCountries } from '@/lib/v2/reference';
import { majorToMinor } from '@/lib/v2/money';
import {
  applyOutcomeOf, metaApi, type ApplyResult, type DraftInput, type ProductSet, type RemarketingDraft, type RemarketingEvent, type RemarketingOptions,
} from '@/lib/v2/areas/meta';
import type { MetaCtx } from './useMetaCtx';
import { EMPTY_SET, SetFields, filterOf, filterText, type SetDraft } from './ProductSetForm';
import { ApplyNotDone, LoadFailure, money, plural, useLoad, writeError } from './common';
import { AiFeatureList, PreviewGrid, aiValues } from './ads/pieces';

const STEPS = ['Products', 'Audience', 'Budget', 'Creative', 'Preview'] as const;
const EVENTS: Array<{ event: RemarketingEvent; label: string }> = [
  { event: 'ViewContent', label: 'Viewed a product' },
  { event: 'AddToCart', label: 'Added to cart' },
  { event: 'InitiateCheckout', label: 'Started checkout' },
];
/** Starting values for a new draft; every one is edited in the wizard. */
const START = { days: { ViewContent: 14, AddToCart: 14, InitiateCheckout: 7 } as Record<RemarketingEvent, number>, excludeDays: 30 };

type Field = 'primary_text' | 'headline' | 'description';

const RemarketingWizard: React.FC<{ ctx: MetaCtx; currency: string; onClose: () => void; onCreated: () => void }> = ({ ctx, currency, onClose, onCreated }) => {
  const COUNTRIES = useCountries();
  const fb = ctx.fbChannel;
  const optsQ = useLoad(() => metaApi.remarketingOptions(), []);
  const setsQ = useLoad(() => (fb ? metaApi.productSets(fb.id) : Promise.resolve([] as ProductSet[])), [fb?.id]);
  const catsQ = useLoad(() => metaApi.categories(), []);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Products
  const [setMode, setSetMode] = useState<'existing' | 'new'>('existing');
  const [setId, setSetId] = useState('');
  const [newSet, setNewSet] = useState<SetDraft>(EMPTY_SET);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  // Audience
  const [include, setInclude] = useState<Record<RemarketingEvent, { on: boolean; days: string }>>({
    ViewContent: { on: true, days: String(START.days.ViewContent) },
    AddToCart: { on: true, days: String(START.days.AddToCart) },
    InitiateCheckout: { on: true, days: String(START.days.InitiateCheckout) },
  });
  const [excludeDays, setExcludeDays] = useState(String(START.excludeDays));
  // Budget
  const [budget, setBudget] = useState('');
  const [countries, setCountries] = useState<string[] | null>(null);
  // Creative
  const [text, setText] = useState<Record<Field, string>>({ primary_text: '', headline: '{{product.name}}', description: '{{product.price}}' });
  const [lastField, setLastField] = useState<Field>('primary_text');
  const [format, setFormat] = useState('');
  /** The switches per format, so going back to a format keeps what was chosen for it. */
  const [aiBy, setAiBy] = useState<Record<string, Record<string, 'on' | 'off'>>>({});
  // Draft and result
  const [draft, setDraft] = useState<RemarketingDraft | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [result, setResult] = useState<ApplyResult | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [step, result]);
  const refs = { primary_text: useRef<HTMLTextAreaElement>(null), headline: useRef<HTMLInputElement>(null), description: useRef<HTMLInputElement>(null) };

  const opts: RemarketingOptions | null = optsQ.data;
  const sets = setsQ.data ?? [];
  useEffect(() => { if (opts && countries === null) setCountries(opts.countries_default); }, [opts, countries]);
  useEffect(() => { if (opts && !format && opts.formats.length) setFormat(String(opts.formats[0].key)); }, [opts, format]);
  const formatOpt = opts?.formats.find((f) => f.key === format) ?? null;
  const features = formatOpt?.ai_features ?? [];
  const ai: Record<string, 'on' | 'off'> = aiValues(features, aiBy[format]);
  const setAi = (key: string, on: boolean) => setAiBy({ ...aiBy, [format]: { ...(aiBy[format] ?? {}), [key]: on ? 'on' : 'off' } });
  useEffect(() => { if (!setId && sets.length) setSetId(sets[0].id); }, [sets, setId]);

  const pickedSet = sets.find((s) => s.id === setId) ?? null;
  const setName_ = setMode === 'new' ? newSet.name.trim() : pickedSet?.name ?? '';
  useEffect(() => { if (!nameTouched) setName(setName_ ? `Remarketing: ${setName_}` : ''); }, [setName_, nameTouched]);

  const budgetMinor = majorToMinor(budget, currency);
  const input = (productSetId: string): DraftInput => ({
    name: name.trim(),
    product_set_id: productSetId,
    include: EVENTS.filter((e) => include[e.event].on).map((e) => ({ event: e.event, days: Number(include[e.event].days) })),
    exclude_purchased_days: Number(excludeDays) || 0,
    daily_budget_minor: budgetMinor ?? 0,
    countries: countries ?? [],
    primary_text: text.primary_text.trim(),
    headline: text.headline.trim(),
    description: text.description.trim(),
    format,
    // Only the features Meta documents for the chosen format.
    ai_features: Object.fromEntries(features.map((f) => [f.key, ai[f.key]])),
  });

  /** What must be right before leaving each step, in words. */
  const problem = (s: number): string => {
    if (s === 0) {
      if (!fb) return 'Put your catalog on Meta first (Catalog tab).';
      if (setMode === 'existing' && !setId) return 'Pick a product set, or make a new one.';
      if (setMode === 'new' && !newSet.name.trim()) return 'Give the new set a name.';
      if (!name.trim()) return 'Give the campaign a name.';
    }
    if (s === 1) {
      const on = EVENTS.filter((e) => include[e.event].on);
      if (!on.length) return 'Pick at least one thing shoppers did.';
      if (on.some((e) => !(Number(include[e.event].days) >= 1 && Number(include[e.event].days) <= 180))) return 'Days must be from 1 to 180.';
      if (!(Number(excludeDays) >= 0)) return 'Days for buyers must be 0 or more.';
    }
    if (s === 2) {
      if (!budgetMinor || budgetMinor <= 0) return 'Type a daily budget above zero.';
      if (!countries?.length) return 'Pick at least one country.';
    }
    if (s === 3) {
      if (!text.primary_text.trim()) return 'Write the primary text.';
      if (!text.headline.trim()) return 'Write the headline.';
      if (!format) return 'Pick a format.';
    }
    return '';
  };

  /** The draft for the current answers: reused when nothing changed, else the old one is discarded. */
  const ensureDraft = async (productSetId: string) => {
    const body = input(productSetId);
    const key = JSON.stringify(body);
    if (draft && key === draftKey) return;
    if (draft) await metaApi.discardDraft(draft.id).catch(() => undefined);
    const created = await metaApi.createDraft(body);
    const full = created.previews ? created : await metaApi.draft(created.id);
    setDraft(full); setDraftKey(key); setResult(null);
  };

  const next = async () => {
    const p = problem(step);
    if (p) { setError(p); return; }
    setError('');
    if (step === 0 && setMode === 'new' && fb) {
      setBusy(true);
      try {
        const s = await metaApi.createProductSet(fb.id, newSet.name.trim(), filterOf(newSet));
        await setsQ.reload();
        setSetId(s.id); setSetMode('existing'); setNewSet(EMPTY_SET);
      } catch (e) { setError(writeError(e, 'The product set was not saved.')); setBusy(false); return; }
      setBusy(false);
    }
    if (step === 3) {
      setBusy(true);
      try { await ensureDraft(setId); } catch (e) { setError(writeError(e, 'Meta could not make the preview.')); setBusy(false); return; }
      setBusy(false);
    }
    setStep(step + 1);
  };

  const refreshPreviews = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try { setDraft(await metaApi.refreshPreviews(draft.id)); } catch (e) { setError(writeError(e, 'Meta could not refresh the preview.')); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const r = await metaApi.applyDraft(draft.id);
      setResult(r);
      const o = applyOutcomeOf(r);
      if (o.kind === 'created' || o.made.length > 0) onCreated();
    }
    catch (e) { setError(writeError(e, 'Meta did not create the campaign.')); }
    finally { setBusy(false); }
  };

  const close = async () => {
    if (draft && !result) await metaApi.discardDraft(draft.id).catch(() => undefined);
    onClose();
  };

  const insert = (key: string) => {
    const el = refs[lastField].current;
    const cur = text[lastField];
    const at = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? at;
    setText({ ...text, [lastField]: `${cur.slice(0, at)}${key}${cur.slice(end)}` });
    setTimeout(() => { el?.focus(); el?.setSelectionRange(at + key.length, at + key.length); }, 0);
  };

  const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
  const countryList = useMemo(() => {
    const codes = new Set([...COUNTRIES.map((c) => c.code), ...(countries ?? [])]);
    return [...codes];
  }, [countries, COUNTRIES]);

  // Success only when the backend says `applied`; a refused step or a mock run stays on the preview.
  const outcome = applyOutcomeOf(result);
  const done = !!result && outcome.kind === 'created';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3 sm:px-6">
          <DialogTitle>Dynamic remarketing campaign</DialogTitle>
          <DialogDescription>Shows people the products they looked at. Created paused: nothing spends until you resume it.</DialogDescription>
          {!done && (
            <ol className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs">
              {STEPS.map((s, i) => (
                <li key={s} className={i === step ? 'font-semibold text-gray-900' : i < step ? 'text-emerald-700' : 'text-gray-400'}>{i + 1}. {s}</li>
              ))}
            </ol>
          )}
        </DialogHeader>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {optsQ.error && !opts ? <LoadFailure failure={optsQ.error} what="Remarketing options (GET /api/v2/marketing/meta/remarketing/options) are not served yet." onRetry={optsQ.reload} />
            : !opts ? <p className="text-sm text-gray-500">Loading...</p>
              : done ? (
                <div className="space-y-3 py-4 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <p className="text-lg font-semibold">Created, and paused</p>
                  <p className="text-sm text-gray-700">
                    {result.name ?? name} is on Meta with its ad set, creative and ad, all paused. It spends nothing until someone resumes it in the Campaigns table.
                  </p>
                </div>
              ) : step === 0 ? (
                <div className="space-y-4">
                  {!fb ? <p className="text-sm text-amber-800">Put your catalog on Meta first, from the Catalog tab.</p> : (
                    <>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <label className="flex items-center gap-2"><input type="radio" checked={setMode === 'existing'} onChange={() => setSetMode('existing')} /> Use a product set</label>
                        <label className="flex items-center gap-2"><input type="radio" checked={setMode === 'new'} onChange={() => setSetMode('new')} /> Make a new set from filters</label>
                      </div>
                      {setMode === 'existing' ? (
                        setsQ.error && !setsQ.data ? <LoadFailure failure={setsQ.error} what="Product sets are not served yet." onRetry={setsQ.reload} />
                          : sets.length === 0 ? <p className="text-sm text-gray-600">No sets yet. Make a new one.</p> : (
                            <ul className="space-y-1.5">
                              {sets.map((s) => (
                                <li key={s.id}>
                                  <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${setId === s.id ? 'border-gray-900 ring-1 ring-gray-900' : ''}`}>
                                    <input type="radio" className="mt-1" checked={setId === s.id} onChange={() => setSetId(s.id)} />
                                    <span className="min-w-0"><span className="block font-medium">{s.name}</span><span className="block text-xs text-gray-600">{filterText(s.filter, catsQ.data ?? [])}{s.product_count != null ? `, ${plural(s.product_count, 'product')}` : ''}</span></span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )
                      ) : <SetFields value={newSet} onChange={setNewSet} categories={catsQ.data ?? []} />}
                      <div>
                        <Label htmlFor="rm-name">Campaign name</Label>
                        <Input id="rm-name" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} className="mt-1" />
                      </div>
                    </>
                  )}
                </div>
              ) : step === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">Show ads to people who, on your store:</p>
                  <ul className="space-y-2">
                    {EVENTS.map((e) => (
                      <li key={e.event} className="flex flex-wrap items-center gap-3">
                        <label className="flex w-44 items-center gap-2 text-sm"><input type="checkbox" checked={include[e.event].on} onChange={(ev) => setInclude({ ...include, [e.event]: { ...include[e.event], on: ev.target.checked } })} /> {e.label}</label>
                        <span className="flex items-center gap-2 text-sm text-gray-600">in the last
                          <Input type="number" min={1} max={180} value={include[e.event].days} disabled={!include[e.event].on} onChange={(ev) => setInclude({ ...include, [e.event]: { ...include[e.event], days: ev.target.value } })} className="h-8 w-20" /> days</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm text-gray-700">
                    Leave out people who bought in the last
                    <Input type="number" min={0} max={180} value={excludeDays} onChange={(e) => setExcludeDays(e.target.value)} className="h-8 w-20" /> days
                  </div>
                  {opts.pixel ? <p className="text-xs text-gray-500">These come from your pixel, {opts.pixel.name}.</p> : <p className="text-xs text-amber-800">No pixel is picked. Pick it in Setup, or this audience stays empty.</p>}
                </div>
              ) : step === 2 ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="rm-budget">Daily budget ({currency})</Label>
                    <Input id="rm-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1 w-48" placeholder="For example 500" />
                    <p className="mt-1 text-xs text-gray-600">{budgetMinor && budgetMinor > 0 ? `Up to ${money(budgetMinor, currency)} a day, about ${money(budgetMinor * 30, currency)} over 30 days, once someone resumes it.` : 'The most it may spend in a day.'}</p>
                  </div>
                  <div>
                    <Label>Countries</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {countryList.map((code) => {
                        const on = (countries ?? []).includes(code);
                        return (
                          <button key={code} type="button" aria-pressed={on} onClick={() => setCountries(on ? (countries ?? []).filter((x) => x !== code) : [...(countries ?? []), code])}
                            className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>
                            {countryName(code)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : step === 3 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-gray-600">Insert into the {lastField === 'primary_text' ? 'primary text' : lastField}:</span>
                    {opts.placeholders.map((p) => <button key={p.key} type="button" onClick={() => insert(p.key)} className="rounded border bg-white px-2 py-0.5 hover:border-gray-400">{p.label}</button>)}
                  </div>
                  <div>
                    <Label htmlFor="rm-primary">Primary text</Label>
                    <Textarea id="rm-primary" ref={refs.primary_text} rows={3} value={text.primary_text} onFocus={() => setLastField('primary_text')} onChange={(e) => setText({ ...text, primary_text: e.target.value })} className="mt-1" placeholder="Still thinking about {{product.name}}? It is waiting in your cart." />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="rm-headline">Headline</Label>
                      <Input id="rm-headline" ref={refs.headline} value={text.headline} onFocus={() => setLastField('headline')} onChange={(e) => setText({ ...text, headline: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="rm-desc">Description</Label>
                      <Input id="rm-desc" ref={refs.description} value={text.description} onFocus={() => setLastField('description')} onChange={(e) => setText({ ...text, description: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <fieldset>
                    <legend className="text-sm font-medium text-gray-900">Format</legend>
                    <div className="mt-1 grid gap-2 sm:grid-cols-3">
                      {opts.formats.map((f) => (
                        <label key={f.key} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${format === f.key ? 'border-gray-900 ring-1 ring-gray-900' : ''}`}>
                          <input type="radio" className="mt-1" checked={format === f.key} onChange={() => setFormat(String(f.key))} />
                          <span className="min-w-0"><span className="block font-medium">{f.label}</span>{f.help && <span className="block text-xs text-gray-600">{f.help}</span>}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <AiFeatureList
                    title={<>Meta's AI features for {formatOpt?.label ?? 'this format'} <span className="font-normal text-gray-500">(you see the result in the preview)</span></>}
                    features={features} value={ai} onChange={setAi} />
                </div>
              ) : (
                <div className="space-y-3">
                  {result && <ApplyNotDone outcome={outcome} again="Press Create paused campaign again to carry on from that step. If you change the ad first, it starts again from the campaign." />}
                  <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    What Meta's AI makes can only be accepted or switched off, feature by feature (Back to Creative); it cannot be edited here. Everything is created paused.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-700">Meta's previews for each placement. Ads use your real products from the set.</p>
                    <Button size="sm" variant="outline" onClick={refreshPreviews} disabled={busy}><RefreshCw /> Refresh</Button>
                  </div>
                  {!draft?.previews?.length ? <p className="text-sm text-gray-500">{busy ? 'Asking Meta...' : 'Meta sent no preview yet. Press Refresh.'}</p> : <PreviewGrid previews={draft.previews} />}
                  <dl className="grid gap-x-4 gap-y-1 rounded-md bg-gray-50 p-3 text-xs sm:grid-cols-2">
                    <div><dt className="inline text-gray-500">Products: </dt><dd className="inline">{pickedSet?.name}</dd></div>
                    <div><dt className="inline text-gray-500">Budget: </dt><dd className="inline">{money(budgetMinor, currency)} a day</dd></div>
                    <div><dt className="inline text-gray-500">Who: </dt><dd className="inline">{EVENTS.filter((e) => include[e.event].on).map((e) => `${e.label.toLowerCase()} (${include[e.event].days} days)`).join(', ')}; not buyers of the last {excludeDays} days</dd></div>
                    <div><dt className="inline text-gray-500">Where: </dt><dd className="inline">{(countries ?? []).map(countryName).join(', ')}</dd></div>
                    <div><dt className="inline text-gray-500">Format: </dt><dd className="inline">{formatOpt?.label ?? format}</dd></div>
                    <div><dt className="inline text-gray-500">Meta AI on: </dt><dd className="inline">{features.filter((f) => ai[f.key] === 'on').map((f) => f.label).join(', ') || 'none'}</dd></div>
                  </dl>
                </div>
              )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-sm text-red-700">{error}</p>
          <div className="flex flex-wrap gap-2">
            {done ? <Button onClick={onClose}>Done</Button> : (
              <>
                <Button variant="outline" onClick={() => (step === 0 ? close() : (setError(''), setStep(step - 1)))} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</Button>
                {step < STEPS.length - 1
                  ? <Button onClick={next} disabled={busy || !opts}>{busy && <Loader2 className="animate-spin" />} {step === 3 ? 'See preview' : 'Next'}</Button>
                  : <Button onClick={create} disabled={busy || !draft}>{busy && <Loader2 className="animate-spin" />} Create paused campaign</Button>}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RemarketingWizard;
