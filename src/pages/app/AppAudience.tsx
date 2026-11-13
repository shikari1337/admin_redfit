import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Undo2, Users } from 'lucide-react';
import { Btn, Field, Page, PageHeader, SectionCard, SelectInput, TabBar, TextInput } from '@/components/erp';
import { useTabParam } from '@/components/messaging/common';
import { CatalogItemPicker, categorySubtree, useCatalogItems } from '@/components/common/CatalogItemPicker';
import { LocaleWordsEditor } from '@/components/common/LocaleWordsEditor';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import AudienceReport from '@/components/app/AudienceReport';
import {
  codeLabel, getAudience, getHiddenCategories, putAudience, type AudienceDoc, type InterestGroup, type Persona,
} from '@/lib/v2/appSettings';

/**
 * WHO ARE YOU AND INTERESTS (HMAPP design 60, AD05 personas and AD06 interest groups): the two lists
 * the app's first run asks. Store admin data with a starter list the server answers until the store
 * saves its own (`GET/PUT /api/v2/commerce/app/audience/settings`; HMAPP-T1 section 3 and 5).
 *
 * Interest items are catalogue IDS picked from the active brands, categories and product forms,
 * never typed names. The category picker never offers the hidden category trees (the health
 * concerns tree first: owner default, no health concern interests in the app); the server refuses
 * a hidden or inactive item too, naming the field.
 *
 * Persona kinds and where a persona leads are the server's codes; until the server serves its kinds
 * list (design 60 GAP NEW-8), the codes offered are those the lists already use, and the server
 * checks any other.
 *
 * Read `settings.read`; save `settings.manage` and a person signed in. The third tab counts the
 * answers customers gave (HMAPP-3 point 4), with consent, naming nobody (`AudienceReport`).
 */
const TABS = [
  { key: 'personas', label: 'Who are you' },
  { key: 'interests', label: 'What interests you' },
  // HMAPP-3 point 4: the answers so far, counted (lane BB's report).
  { key: 'report', label: 'Answers so far' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const MAX_PERSONAS = 20;
const MAX_GROUPS = 10;
const MAX_ITEMS = 60;

const blankDoc: AudienceDoc = { personas: [], interest_groups: [] };

function localesOf(doc: AudienceDoc): string[] {
  const out = new Set<string>();
  for (const p of doc.personas) Object.keys(p.words ?? {}).forEach((t) => out.add(t));
  for (const g of doc.interest_groups) Object.keys(g.words ?? {}).forEach((t) => out.add(t));
  return [...out];
}

function swap<T>(list: T[], i: number, by: number): T[] {
  const to = i + by;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[i], next[to]] = [next[to], next[i]];
  return next;
}

const AppAudience: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const [tab, setTab] = useTabParam<TabKey>(TABS.map((t) => t.key), 'personas');
  const data = useLoad(getAudience, []);
  const hidden = useLoad(getHiddenCategories, []);
  const categories = useCatalogItems('category');
  const [doc, setDoc] = useState<AudienceDoc>(blankDoc);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const original = useMemo<AudienceDoc>(() => {
    const s = data.data?.settings;
    return { personas: s?.personas ?? [], interest_groups: s?.interest_groups ?? [] };
  }, [data.data]);
  useEffect(() => { setDoc(original); setDirty(false); }, [original]);

  /** Codes the lists already use: the starter list names every kind and destination it knows. */
  const kinds = useMemo(() => {
    const served = (data.data as unknown as { persona_kinds?: string[] } | null)?.persona_kinds ?? [];
    return [...new Set([...served, ...original.personas.map((p) => p.kind), ...doc.personas.map((p) => p.kind)].filter(Boolean))];
  }, [data.data, original, doc.personas]);
  const leadsTo = useMemo(() => [...new Set([...original.personas, ...doc.personas].map((p) => p.leads_to).filter((x): x is string => !!x))], [original, doc.personas]);
  const groupKinds = useMemo(() => [...new Set([...original.interest_groups, ...doc.interest_groups].map((g) => g.kind).filter(Boolean))], [original, doc.interest_groups]);
  const savedIds = useMemo(() => new Set(data.data?.stored ? original.personas.map((p) => p.id) : []), [data.data, original]);

  const hiddenRoots = hidden.data?.settings?.hidden_category_roots ?? [];
  const hiddenSet = useMemo(() => categorySubtree(categories.items, hiddenRoots), [categories.items, hiddenRoots]);

  const change = (next: AudienceDoc) => { setDoc(next); setDirty(true); setSaved(false); };
  const setPersona = (i: number, patch: Partial<Persona>) => change({ ...doc, personas: doc.personas.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setGroup = (i: number, patch: Partial<InterestGroup>) => change({ ...doc, interest_groups: doc.interest_groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const locales = localesOf(doc);
  const firstLocale = locales[0] ?? 'en';
  const itemCount = doc.interest_groups.reduce((n, g) => n + (g.items?.length ?? 0), 0);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const clean: AudienceDoc = {
        personas: doc.personas.map((p) => ({
          id: p.id.trim(), kind: p.kind.trim(), ...(p.leads_to ? { leads_to: p.leads_to } : {}),
          words: Object.fromEntries(Object.entries(p.words).map(([t, w]) => [t, { label: w.label.trim(), ...(w.hint?.trim() ? { hint: w.hint.trim() } : {}) }])),
        })),
        interest_groups: doc.interest_groups.map((g) => ({
          id: g.id.trim(), kind: g.kind,
          words: Object.fromEntries(Object.entries(g.words).map(([t, w]) => [t, { label: w.label.trim(), ...(w.hint?.trim() ? { hint: w.hint.trim() } : {}) }])),
          items: g.items ?? [],
        })),
      };
      await putAudience(clean);
      setSaved(true);
      await data.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const off = whyDisabled(canSave, [!dirty && 'Nothing has changed.', itemCount > MAX_ITEMS && `At most ${MAX_ITEMS} items in all groups.`]);

  return (
    <Page>
      <PageHeader
        icon={Users}
        title="Who are you and interests"
        description="The two short lists the app asks a new customer. Answers stay the customer's own, kept only with their consent."
        actions={<Link to="/settings/app" className="text-sm text-blue-700 underline">Mobile app settings</Link>}
      />
      {tab === 'report' ? (
        <>
          <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />
          <AudienceReport />
        </>
      ) : data.loading && !data.data ? <Loading label="Reading the lists" /> : data.error ? (
        <ErrorNote error={data.error} what="The app's audience lists" onRetry={() => void data.reload()} />
      ) : (
        <>
          {!data.data?.stored && <Notice tone="info" title="Showing the starter list">Change anything and save to make these lists the store's own.</Notice>}
          {data.data?.problem && <Notice tone="bad" title="The saved lists are not in force">{data.data.problem}</Notice>}
          <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

          {tab === 'personas' && (
            <SectionCard
              title="Who are you"
              description="Each answer can lead to the shop, the business application or the partner application. Shopping is never blocked."
              action={(
                <Btn size="sm" variant="outline" disabled={!canSave || doc.personas.length >= MAX_PERSONAS}
                  onClick={() => change({ ...doc, personas: [...doc.personas, { id: '', kind: kinds[0] ?? '', words: { [firstLocale]: { label: '' } } }] })}>
                  <Plus className="h-4 w-4" />Add persona
                </Btn>
              )}
            >
              <datalist id="persona-kinds">{kinds.map((k) => <option key={k} value={k}>{codeLabel(k)}</option>)}</datalist>
              <div className="space-y-4">
                {doc.personas.length === 0 && <p className="text-sm text-gray-500">No persona: the app skips the question.</p>}
                {doc.personas.map((p, i) => (
                  <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <span className="w-6 pb-2 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                      <Field label="Id (a-z, 0-9, _ and -)">
                        <TextInput value={p.id} maxLength={64} disabled={!canSave || savedIds.has(p.id)} title={savedIds.has(p.id) ? 'Fixed once saved: customers\' answers name it.' : undefined}
                          onChange={(e) => setPersona(i, { id: e.target.value })} className="w-40 font-mono text-xs" />
                      </Field>
                      <Field label="Kind">
                        <TextInput list="persona-kinds" value={p.kind} disabled={!canSave} onChange={(e) => setPersona(i, { kind: e.target.value })} className="w-40" />
                      </Field>
                      <Field label="Leads to">
                        <SelectInput value={p.leads_to ?? ''} disabled={!canSave} onChange={(e) => setPersona(i, { leads_to: e.target.value || null })}>
                          <option value="">The shop (default)</option>
                          {leadsTo.filter((l) => l !== 'shop').map((l) => <option key={l} value={l}>{codeLabel(l)}</option>)}
                        </SelectInput>
                      </Field>
                      <span className="ml-auto flex gap-1">
                        <button type="button" disabled={!canSave || i === 0} onClick={() => change({ ...doc, personas: swap(doc.personas, i, -1) })} aria-label="Move up" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" disabled={!canSave || i === doc.personas.length - 1} onClick={() => change({ ...doc, personas: swap(doc.personas, i, 1) })} aria-label="Move down" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" disabled={!canSave} onClick={() => change({ ...doc, personas: doc.personas.filter((_, j) => j !== i) })} aria-label="Remove persona" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                    <LocaleWordsEditor idPrefix={`persona-${i}`} value={p.words} suggest={locales} disabled={!canSave}
                      onChange={(words) => setPersona(i, { words })} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {tab === 'interests' && (
            <SectionCard
              title="What interests you"
              description={`Groups of catalogue items. A group with none picked shows the catalogue's own, 24 at most. ${itemCount} of ${MAX_ITEMS} items picked.`}
              action={(
                <Btn size="sm" variant="outline" disabled={!canSave || doc.interest_groups.length >= MAX_GROUPS}
                  onClick={() => change({ ...doc, interest_groups: [...doc.interest_groups, { id: '', kind: groupKinds[0] ?? 'brand', words: { [firstLocale]: { label: '' } }, items: [] }] })}>
                  <Plus className="h-4 w-4" />Add group
                </Btn>
              )}
            >
              <div className="space-y-4">
                {hidden.error ? (
                  <Notice tone="warn">The hidden categories could not be read, so the category picker cannot leave them out. The server still refuses a hidden category.</Notice>
                ) : !hidden.data?.stored && !hidden.loading ? (
                  <Notice tone="warn">
                    Hidden categories are not saved yet. <Link to="/settings/app?tab=categories" className="underline">Hide the health concerns tree first</Link>; the app offers no category list until then.
                  </Notice>
                ) : null}
                {doc.interest_groups.map((g, i) => {
                  const kind = (['brand', 'category', 'form'] as const).find((k) => k === g.kind);
                  return (
                    <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <span className="w-6 pb-2 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                        <Field label="Id (a-z, 0-9, _ and -)">
                          <TextInput value={g.id} maxLength={64} disabled={!canSave} onChange={(e) => setGroup(i, { id: e.target.value })} className="w-40 font-mono text-xs" />
                        </Field>
                        <Field label="Items are">
                          <SelectInput value={g.kind} disabled={!canSave} onChange={(e) => setGroup(i, { kind: e.target.value, items: [] })}>
                            {groupKinds.map((k) => <option key={k} value={k}>{codeLabel(k)}</option>)}
                          </SelectInput>
                        </Field>
                        <span className="ml-auto flex gap-1">
                          <button type="button" disabled={!canSave || i === 0} onClick={() => change({ ...doc, interest_groups: swap(doc.interest_groups, i, -1) })} aria-label="Move up" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                          <button type="button" disabled={!canSave || i === doc.interest_groups.length - 1} onClick={() => change({ ...doc, interest_groups: swap(doc.interest_groups, i, 1) })} aria-label="Move down" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                          <button type="button" disabled={!canSave} onClick={() => change({ ...doc, interest_groups: doc.interest_groups.filter((_, j) => j !== i) })} aria-label="Remove group" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                        </span>
                      </div>
                      <LocaleWordsEditor idPrefix={`group-${i}`} value={g.words} suggest={locales} disabled={!canSave}
                        onChange={(words) => setGroup(i, { words })} />
                      {kind ? (
                        <CatalogItemPicker
                          kind={kind}
                          label={(g.items ?? []).length === 0 ? 'None picked: the app shows the catalogue\'s own' : 'Picked, in the order shown'}
                          value={g.items ?? []}
                          exclude={kind === 'category' ? hiddenSet : undefined}
                          max={MAX_ITEMS}
                          disabled={!canSave}
                          onChange={(items) => setGroup(i, { items })}
                        />
                      ) : <Notice tone="warn">The server knows no catalogue kind called {g.kind}.</Notice>}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
            <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />{busy ? 'Saving' : 'Save both lists'}</Btn>
            <Btn variant="ghost" disabled={!dirty || busy} onClick={() => { setDoc(original); setDirty(false); setError(null); }}><Undo2 className="h-4 w-4" />Undo changes</Btn>
            {off && canSave && dirty && <span className="text-xs text-amber-700">{off}</span>}
            {!canSave && <span className="text-xs text-gray-500">{off}</span>}
            {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
          </div>
          {error ? <ErrorNote error={error} /> : null}
        </>
      )}
    </Page>
  );
};

export default AppAudience;
