/**
 * Marketing > Ads > Audiences (`/panel/marketing/ads/audiences`, lane META-15A, contract META-W2 section B).
 *
 * Two tabs. "Meta audiences": website visitors from pixel events, people who engaged with the Page, Instagram,
 * a video or a form, lookalikes and saved audiences, each with its size and state, leading with the ones Meta
 * refused or is still building. "Customer lists": the existing consent and approval gated lists for Google and Meta
 * (`AdsAudiences`, unchanged, so the double gate stays the one copy).
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TabBar } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { countriesNow, useCountries } from '@/lib/v2/reference';
import { metaAdsApi, type AudienceType, type MetaAudience } from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import AdsAudiences from '../../AdsAudiences';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, plural, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { NeedsAdAccount, adAccountOf, labelFrom, sizeText, useAdsOptions } from './shared';

const TYPE_TEXT: Record<string, { label: string; help: string }> = {
  website: { label: 'Website visitors', help: 'People who did something on your store, from your pixel.' },
  engagement: { label: 'Engaged people', help: 'People who engaged with your Page, Instagram, a video or a form.' },
  lookalike: { label: 'Lookalike', help: 'New people who resemble one of your audiences.' },
  saved: { label: 'Saved audience', help: 'Places, ages and interests kept to reuse in new ads.' },
  customer_list: { label: 'Customer list', help: 'Consented customers, hashed, from the Customer lists tab.' },
};
const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = { ready: 'good', populating: 'info', too_small: 'warn', blocked: 'bad', error: 'bad' };
const STATE_TEXT: Record<string, string> = { ready: 'Ready', populating: 'Being built', too_small: 'Too small to use', blocked: 'Refused by Meta', error: 'Failed' };

const AudiencesPage: React.FC = () => {
  const ctx = useMetaCtx();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'lists' ? 'lists' : 'meta';
  return (
    <div className="space-y-5">
      <MetaHeader title="Audiences" setup={ctx.setup} description="Who your ads reach: people from your store and your posts, lookalikes, saved settings and consented customer lists." />
      <TabBar tabs={[{ key: 'meta', label: 'Meta audiences' }, { key: 'lists', label: 'Customer lists' }]} active={tab}
        onChange={(k) => { const n = new URLSearchParams(sp); if (k === 'lists') n.set('tab', 'lists'); else n.delete('tab'); setSp(n, { replace: true }); }} />
      {tab === 'lists' ? <AdsAudiences /> : !adAccountOf(ctx) && ctx.setup ? <NeedsAdAccount ctx={ctx} /> : <MetaAudiences canAct={ctx.can.ads} />}
    </div>
  );
};

const MetaAudiences: React.FC<{ canAct: boolean }> = ({ canAct }) => {
  useCountries(); // re-render when the full list arrives (country names)
  const { toast } = useToast();
  const q = useLoad(() => metaAdsApi.audiences(), []);
  const events = useAdsOptions().data?.conversion_events ?? [];
  const [creating, setCreating] = useState<AudienceType | null>(null);
  const [deleting, setDeleting] = useState<MetaAudience | null>(null);
  const [busy, setBusy] = useState(false);
  const list = q.data ?? [];
  const refused = list.filter((a) => a.status === 'blocked' || a.status === 'error' || a.status === 'too_small');
  const building = list.filter((a) => a.status === 'populating');

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await metaAdsApi.deleteAudience(deleting.id); toast({ title: `${deleting.name} deleted` }); setDeleting(null); await q.reload(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'It was not deleted.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Meta audiences (GET /api/v2/marketing/meta/ads/audiences) are not served yet." onRetry={q.reload} />;
  if (!q.data) return <p className="text-sm text-gray-500">Loading audiences...</p>;

  return (
    <div className="space-y-4">
      {refused.length > 0 ? (
        <Lead tone="bad" title={`${plural(refused.length, 'audience')} cannot be used`}>
          <ul className="list-disc space-y-0.5 pl-5">{refused.map((a) => <li key={a.id}><b>{a.name}:</b> {a.note ?? STATE_TEXT[a.status] ?? a.status}</li>)}</ul>
        </Lead>
      ) : building.length > 0 ? (
        <Lead tone="info" title={`${plural(building.length, 'audience')} still being built`}>Meta fills new audiences within a day; they can be picked in ads once ready.</Lead>
      ) : list.length ? <Lead tone="good" title="Every audience is ready to use">{plural(list.length, 'audience')} on your ad account.</Lead> : null}

      {canAct && (
        <div className="flex flex-wrap gap-2">
          {(['website', 'engagement', 'lookalike', 'saved'] as AudienceType[]).map((t) => (
            <Button key={t} size="sm" variant={t === 'website' ? 'default' : 'outline'} onClick={() => setCreating(t)}><Plus /> {TYPE_TEXT[t].label}</Button>
          ))}
        </div>
      )}

      <Section title="Your Meta audiences" hint={list.length ? `${plural(list.length, 'audience')}` : undefined}>
        {!list.length ? <p className="text-sm text-gray-600">No audiences yet. Start with website visitors: people who viewed a product or added to cart.</p> : (
          <ul className="divide-y">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500">{TYPE_TEXT[a.type]?.label ?? labelFrom([], a.type)}{specText(a, events) ? `: ${specText(a, events)}` : ''}</p>
                  {a.note && a.status !== 'ready' && <p className="mt-0.5 text-xs text-gray-600">{a.note}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <span className="text-sm tabular-nums text-gray-700">{sizeText(a.size_low, a.size_high)}</span>
                  <StateChip tone={STATE_TONE[a.status] ?? 'neutral'}>{STATE_TEXT[a.status] ?? a.status}</StateChip>
                  {a.created_at && <span className="hidden text-xs text-gray-500 sm:inline">{localeDate(a.created_at, { day: 'numeric', month: 'short' })}</span>}
                  {canAct && a.type !== 'customer_list' && (
                    <button type="button" aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {creating && <CreateAudience type={creating} audiences={list} onClose={() => setCreating(null)} onDone={async () => { setCreating(null); await q.reload(); }} />}
      {deleting && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleting(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Delete this audience?</DialogTitle><DialogDescription>{deleting.name}</DialogDescription></DialogHeader>
            <p className="text-sm text-gray-800">Ad sets using it stop reaching these people. Meta deletes it from your ad account; this cannot be undone.</p>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Delete</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const country = (c: string) => countriesNow().find((x) => x.code === c)?.name ?? c;
function specText(a: MetaAudience, events: Array<{ key: string; label: string }>): string {
  const s = a.spec ?? {};
  if (a.type === 'website') return (s.rules ?? []).map((r: any) => `${labelFrom(events, r.event).toLowerCase()} in ${r.days} days`).join(', ');
  if (a.type === 'engagement') return `${labelFrom([], s.source)}, ${s.days} days`;
  if (a.type === 'lookalike') return `${s.percent}% in ${country(s.country)}`;
  if (a.type === 'saved') {
    const t = s.targeting ?? {};
    return [[...(t.countries ?? []).map(country), ...(t.cities ?? []).map((c: any) => c.name ?? c.key)].join(', '), t.age_min ? `${t.age_min} to ${t.age_max}` : ''].filter(Boolean).join(', ');
  }
  return '';
}

/** One form per audience type; what it may hold comes from the options data where Meta defines it. */
const CreateAudience: React.FC<{ type: AudienceType; audiences: MetaAudience[]; onClose: () => void; onDone: () => void }> = ({ type, audiences, onClose, onDone }) => {
  const COUNTRIES = useCountries();
  const { toast } = useToast();
  const opts = useAdsOptions().data;
  const events = opts?.conversion_events ?? [];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** The server's words when the name or rules name a health condition (422); the person may still go ahead. */
  const [health, setHealth] = useState('');
  // website
  const [rules, setRules] = useState<Array<{ event: string; days: string }>>([{ event: '', days: '30' }]);
  const [excludeBuyers, setExcludeBuyers] = useState('');
  // engagement
  const [source, setSource] = useState('instagram');
  const [days, setDays] = useState('90');
  // lookalike
  const sources = audiences.filter((a) => a.type !== 'lookalike' && a.type !== 'saved' && a.status === 'ready');
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [ctry, setCtry] = useState('IN');
  const [pct, setPct] = useState('1');
  // saved
  const [countries, setCountries] = useState<string[]>(['IN']);
  const [ageMin, setAgeMin] = useState('25');
  const [ageMax, setAgeMax] = useState('55');

  const spec = (): Record<string, unknown> => {
    if (type === 'website') return { rules: rules.map((r) => ({ event: r.event || events[0]?.key, days: Number(r.days) })), exclude_purchased_days: Number(excludeBuyers) || null };
    if (type === 'engagement') return { source, days: Number(days) };
    if (type === 'lookalike') return { source_id: sourceId, country: ctry, percent: Number(pct) };
    return { targeting: { countries, age_min: Number(ageMin), age_max: Number(ageMax) } };
  };
  const problem = (): string => {
    if (!name.trim()) return 'Give it a name.';
    if (type === 'website' && rules.some((r) => !(Number(r.days) >= 1 && Number(r.days) <= 180))) return 'Days run from 1 to 180.';
    if (type === 'engagement' && !(Number(days) >= 1 && Number(days) <= 365)) return 'Days run from 1 to 365.';
    if (type === 'lookalike' && !sourceId) return 'Pick the audience to resemble.';
    if (type === 'lookalike' && !(Number(pct) >= 1 && Number(pct) <= 10)) return 'The size runs from 1 to 10 percent.';
    if (type === 'saved' && !countries.length) return 'Pick at least one country.';
    if (type === 'saved' && !(Number(ageMin) >= 13 && Number(ageMax) <= 65 && Number(ageMin) <= Number(ageMax))) return 'Ages run from 13 to 65.';
    return '';
  };
  const save = async (confirm = false) => {
    const p = problem();
    if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try {
      await metaAdsApi.createAudience({ type, name: name.trim(), spec: spec(), description: description.trim() || null, ...(confirm ? { confirm: true } : {}) });
      toast({ title: `${name.trim()} is being built` }); setHealth(''); onDone();
    } catch (e: any) {
      // META-9B/9D answer 422 with `details.reason = health_condition` when the audience names a health condition of the
      // catalogue (any other 422 is a plain refusal); the person decides.
      const reason = e?.response?.data?.details?.reason ?? e?.response?.data?.error?.details?.reason;
      if (e?.response?.status === 422 && reason === 'health_condition' && !confirm) setHealth(writeError(e, 'This audience may name a health condition.'));
      else setErr(writeError(e, 'Meta did not create it.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>New audience: {TYPE_TEXT[type].label.toLowerCase()}</DialogTitle><DialogDescription>{TYPE_TEXT[type].help}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="au-name">Name</Label>
            <Input id="au-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus />
            <p className="mt-1 text-xs text-gray-500">Describe what people did, not a health condition: Meta refuses audiences that suggest one.</p>
          </div>
          <div>
            <Label htmlFor="au-desc">Description <span className="font-normal text-gray-500">(optional, kept on Meta)</span></Label>
            <Input id="au-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder="For example For the winter remarketing ads" />
          </div>
          {type === 'website' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">People who, on your store</p>
              {rules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <select aria-label="Event" value={r.event || events[0]?.key || ''} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, event: e.target.value } : x)))} className="h-9 rounded-md border bg-white px-2">
                    {events.map((ev) => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
                  </select>
                  in the last <Input aria-label="Days" type="number" min={1} max={180} value={r.days} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} className="h-9 w-20" /> days
                  {rules.length > 1 && <button type="button" aria-label="Remove rule" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:bg-gray-100"><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => setRules([...rules, { event: '', days: '30' }])}><Plus /> Or people who</Button>
              <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">Leave out buyers of the last <Input aria-label="Days" type="number" min={0} max={180} value={excludeBuyers} onChange={(e) => setExcludeBuyers(e.target.value)} className="h-9 w-20" placeholder="0" /> days</div>
            </div>
          )}
          {type === 'engagement' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              People who engaged with your
              <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className="h-9 rounded-md border bg-white px-2">
                <option value="instagram">Instagram account</option><option value="page">Facebook Page</option><option value="video">videos (half watched)</option><option value="lead_form">instant forms</option>
              </select>
              in the last <Input aria-label="Days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-20" /> days
            </div>
          )}
          {type === 'lookalike' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="au-src">Resemble</Label>
                <select id="au-src" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                  {sources.map((a) => <option key={a.id} value={a.id}>{a.name} ({sizeText(a.size_low, a.size_high)})</option>)}
                </select>
                {!sources.length && <p className="mt-1 text-xs text-amber-800">Make a website or customer audience first; a lookalike needs at least 100 people to start from.</p>}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="au-ctry">Country</Label>
                  <select id="au-ctry" value={ctry} onChange={(e) => setCtry(e.target.value)} className="mt-1 h-9 rounded-md border bg-white px-2 text-sm">
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="au-pct">Size, percent of the country</Label>
                  <Input id="au-pct" type="number" min={1} max={10} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 h-9 w-24" />
                </div>
              </div>
              <p className="text-xs text-gray-500">1% is closest to your source; 10% is broader and less alike.</p>
            </div>
          )}
          {type === 'saved' && (
            <div className="space-y-3 text-sm">
              <fieldset>
                <legend className="font-medium">Countries</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {COUNTRIES.map((c) => {
                    const on = countries.includes(c.code);
                    return (
                      <button key={c.code} type="button" aria-pressed={on} onClick={() => setCountries(on ? countries.filter((x) => x !== c.code) : [...countries, c.code])}
                        className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>{c.name}</button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex items-center gap-2">Ages <Input aria-label="Youngest" type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className="h-9 w-20" /> to <Input aria-label="Oldest" type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className="h-9 w-20" /></div>
              <p className="text-xs text-gray-500">For cities and interests, use "Save as an audience" on the Create ad flow's audience step.</p>
            </div>
          )}
        </div>
        <DialogFooter className="items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-red-700">{err}</p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create audience</Button>
        </DialogFooter>
      </DialogContent>
      {health && (
        <Dialog open onOpenChange={(o) => { if (!o) setHealth(''); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Meta may refuse ads that use this audience</DialogTitle>
              {/* The server's sentence is written for the person (META-9D); the buttons below are its two choices. */}
              <DialogDescription>{health}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setHealth('')}>Rename it</Button>
              <Button variant="destructive" onClick={() => save(true)} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Make it anyway</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};

export default AudiencesPage;
