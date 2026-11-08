/**
 * Marketing > Ads > Ads Manager (`/panel/marketing/ads/manager`, lane META-15A, contract META-W2 section A).
 *
 * Every campaign, ad set and ad of the picked Meta ad account, three levels as tabs with drill down (open a
 * campaign's ad sets, an ad set's ads). It leads with what to act on (rejected, delivery issues, money losing),
 * then the table: columns the person chooses (kept per level in this browser), status filter, search, the date
 * range, a totals row, inline on and off and budget (each confirmed in money first), a side panel with the full
 * detail and Meta's previews, duplicate, and bulk pause, resume, budget percent and end date. Nothing spends until a
 * person resumes it. The dynamic remarketing wizard stays here as a quick start.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bot, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ColumnChooser, FilterChips, Pagination, SearchInput, TabBar, TableSkeleton, useColumnChoice, type ChipGroup } from '@/components/erp';
import DateRangeBar, { DASHBOARD_PRESETS, useDateRange } from '@/components/panelAnalytics/DateRangeBar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { metaAdsApi, metaApi, type AdLevel, type AdRow, type AdTree, type AdsOptions } from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import MetaHeader from '../MetaHeader';
import RemarketingWizard from '../RemarketingWizard';
import { Lead, LoadFailure, StateChip, ago, linkCls, money, plural, useLoad, writeError } from '../common';
import { useMetaCtx, type MetaCtx } from '../useMetaCtx';
import { ADS_ROUTES, metaHref } from '../routes';
import { AdPanel } from './AdPanel';
import { AssistantPanel } from './AssistantPanel';
import { OpDialog, type Op } from './ops';
import {
  LEVEL_TITLE, LEVEL_WORD, METRICS, NeedsAdAccount, adAccountOf, budgetText, columnsFor, hasProblem, isLosing, isPausedSelf,
  isRunning, labelFrom, levelCount, metricText, objectiveLabel, ownsBudget, roasText, statusText, statusTone, useAdsOptions,
} from './shared';

const LEVELS: AdLevel[] = ['campaign', 'adset', 'ad'];
const STATUS_FILTERS = [
  { value: 'active', label: 'Running' }, { value: 'paused', label: 'Paused' },
  { value: 'issues', label: 'Rejected or has issues' }, { value: 'in_review', label: 'In review' },
];
const PAGE_SIZE = 25;

const AdsManagerPage: React.FC = () => {
  const ctx = useMetaCtx();
  const account = adAccountOf(ctx);
  const [wizard, setWizard] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /* META-17: the assistant side panel (it lives in Manager, which knows the account's currency). */
  const [assistant, setAssistant] = useState(false);
  return (
    <div className="space-y-5">
      <MetaHeader title="Ads Manager" setup={ctx.setup}
        description={account ? `Campaigns, ad sets and ads of ${account.name}. Everything made here starts paused; nothing spends until a person resumes it.` : 'Campaigns, ad sets and ads of your Meta ad account.'}
        actions={account ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setAssistant(true)}><Bot /> Ask the assistant</Button>
            {ctx.can.ads && (
              <>
                <Button size="sm" variant="outline" onClick={() => setWizard(true)}><Sparkles /> Remarketing quick start</Button>
                <Button size="sm" asChild><Link to={metaHref(ADS_ROUTES.create)}><Plus /> Create ad</Link></Button>
              </>
            )}
          </>
        ) : null} />
      {!account && ctx.setup ? <NeedsAdAccount ctx={ctx} /> : !ctx.setup ? (ctx.setupFailure ? <LoadFailure failure={ctx.setupFailure} what="The Meta setup (GET /api/v2/marketing/meta/setup) is not served yet." onRetry={ctx.reloadSetup} /> : <p className="text-sm text-gray-500">Loading...</p>)
        : <Manager key={reloadKey} ctx={ctx} assistant={assistant} onAssistantClose={() => setAssistant(false)} />}
      {wizard && <RemarketingWizard ctx={ctx} currency="INR" onClose={() => setWizard(false)} onCreated={() => setReloadKey((k) => k + 1)} />}
    </div>
  );
};

const Manager: React.FC<{ ctx: MetaCtx; assistant: boolean; onAssistantClose: () => void }> = ({ ctx, assistant, onAssistantClose }) => {
  const { toast } = useToast();
  const [sp, setSp] = useSearchParams();
  const level = (LEVELS.includes(sp.get('level') as AdLevel) ? sp.get('level') : 'campaign') as AdLevel;
  const parent = sp.get('parent') ?? '';
  const parentName = sp.get('parent_name') ?? '';
  const focus = sp.get('focus') ?? '';
  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next, { replace: true });
  };

  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d', DASHBOARD_PRESETS);
  const [status, setStatus] = useState<string[]>([]);
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(term.trim()), 300); return () => clearTimeout(t); }, [term]);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [level, parent, status.join(), q, range.from, range.to]);

  const tree = useLoad(() => metaAdsApi.tree({
    level, parent_id: parent || undefined, from: range.from, to: range.to, status: status.join(',') || undefined, q: q || undefined, page, page_size: PAGE_SIZE,
  }), [level, parent, range.from, range.to, status.join(), q, page]);
  const opts = useAdsOptions().data;
  const recs = useLoad(() => metaAdsApi.recommendations(), []);
  const cur = tree.data?.currency || 'INR';

  const [op, setOp] = useState<Op | null>(null);
  const [panel, setPanel] = useState<{ level: AdLevel; id: string; row: AdRow } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected([]); }, [level, parent, page]);
  const [syncing, setSyncing] = useState(false);

  const rows = tree.data?.rows ?? [];
  // A link from an alert or a recommendation opens that row's panel once it is on screen.
  useEffect(() => {
    if (!focus || !rows.length) return;
    const r = rows.find((x) => x.id === focus);
    if (r) { setPanel({ level: r.level, id: r.id, row: r }); setQuery({ focus: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, rows]);

  const drill = (r: AdRow) => {
    setPanel(null);
    setQuery({ level: r.level === 'campaign' ? 'adset' : 'ad', parent: r.id, parent_name: r.name });
  };
  const goLevel = (l: AdLevel) => setQuery({ level: l === 'campaign' ? null : l, parent: l === 'campaign' ? null : parent || null, parent_name: l === 'campaign' ? null : parentName || null });

  const sync = async () => {
    setSyncing(true);
    try { await metaApi.syncCampaigns(); await tree.reload(); toast({ title: 'Updated from Meta' }); }
    catch (e) { toast({ title: 'Could not update', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' }); }
    finally { setSyncing(false); }
  };
  const done = async () => { setOp(null); setSelected([]); await tree.reload(); };

  const statusChips: ChipGroup[] = [{ key: 'status', label: 'Status', options: STATUS_FILTERS, value: status, onChange: setStatus, multiple: true }];
  const chosen = rows.filter((r) => selected.includes(r.id));
  const canAct = ctx.can.ads;

  return (
    <div className="space-y-4">
      <ActOn rows={rows} level={level} cur={cur} recCount={recs.data?.length ?? 0} onOpen={(r) => setPanel({ level: r.level, id: r.id, row: r })} />

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} presets={DASHBOARD_PRESETS} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tree.data && <span className="text-xs text-gray-500">Updated {ago(tree.data.synced_at)}</span>}
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Update from Meta</Button>
        </div>
      </div>

      <TabBar tabs={LEVELS.map((l) => ({ key: l, label: LEVEL_TITLE[l] }))} active={level} onChange={(k) => goLevel(k as AdLevel)} />

      {parent && level !== 'campaign' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Showing the {LEVEL_WORD[level][1]} of</span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-white px-2.5 py-0.5 font-medium text-gray-900">
            <span className="truncate">{parentName || parent}</span>
            <button type="button" aria-label="Show all" onClick={() => setQuery({ parent: null, parent_name: null })} className="rounded-full p-0.5 text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      )}

      <LevelTable key={level} level={level} tree={tree.data} loading={tree.loading} failure={tree.error} reload={tree.reload} rows={rows} cur={cur} opts={opts}
        canAct={canAct} selected={selected} setSelected={setSelected} statusChips={statusChips} onClearFilters={() => setStatus([])}
        term={term} setTerm={setTerm} onOpen={(r) => setPanel({ level: r.level, id: r.id, row: r })} onOp={setOp} onDrill={drill} />

      {chosen.length > 0 && canAct && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-md">
          <span className="text-sm font-medium">{levelCount(level, chosen.length)} picked</span>
          <Button size="sm" variant="outline" onClick={() => setOp({ kind: 'status', rows: chosen, to: 'PAUSED' })}>Pause</Button>
          <Button size="sm" variant="outline" onClick={() => setOp({ kind: 'status', rows: chosen, to: 'ACTIVE' })}>Resume</Button>
          {level !== 'ad' && <Button size="sm" variant="outline" onClick={() => setOp({ kind: 'bulk_budget', rows: chosen })}>Change budgets</Button>}
          <Button size="sm" variant="outline" onClick={() => setOp({ kind: 'end', rows: chosen })}>End date</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {tree.data && <Pagination page={page} pageSize={PAGE_SIZE} total={tree.data.total} onPage={setPage} />}

      <AdPanel target={panel} cur={cur} opts={opts} canAct={canAct} onClose={() => setPanel(null)} onOp={setOp} onDrill={drill} />
      <AssistantPanel open={assistant} cur={cur} canAct={canAct} onClose={onAssistantClose} onApplied={() => { tree.reload(); }} />
      {op && <OpDialog op={op} cur={cur} onClose={() => setOp(null)} onDone={done} />}
    </div>
  );
};

/** The lead box: rejected or limited first, then the ones losing money, then Meta's recommendations. */
const ActOn: React.FC<{ rows: AdRow[]; level: AdLevel; cur: string; recCount: number; onOpen: (r: AdRow) => void }> = ({ rows, level, cur, recCount, onOpen }) => {
  const problems = rows.filter(hasProblem);
  const losing = rows.filter((r) => isRunning(r) && isLosing(r) && !hasProblem(r));
  if (!rows.length && !recCount) return null;
  if (!problems.length && !losing.length) {
    return (
      <Lead tone="good" title={`Nothing needs you in these ${LEVEL_WORD[level][1]}`}
        actions={recCount ? <Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(ADS_ROUTES.rules, { tab: 'recommendations' })}>{plural(recCount, 'recommendation')} from Meta</Link></Button> : undefined}>
        No rejections or delivery issues, and every running one earns back more than it spends in this period.
      </Lead>
    );
  }
  return (
    <Lead tone={problems.length ? 'bad' : 'warn'} title={[problems.length ? `${levelCount(level, problems.length)} need${problems.length === 1 ? 's' : ''} attention` : '', losing.length ? `${levelCount(level, losing.length)} spent more than ${losing.length === 1 ? 'it' : 'they'} brought back` : ''].filter(Boolean).join('; ')}
      actions={recCount ? <Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(ADS_ROUTES.rules, { tab: 'recommendations' })}>{plural(recCount, 'recommendation')} from Meta</Link></Button> : undefined}>
      <ul className="mt-1 space-y-1">
        {problems.slice(0, 4).map((r) => (
          <li key={r.id}>
            <button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => onOpen(r)}>{r.name}</button>
            {': '}{r.review.reasons[0] ?? r.delivery.issues[0]?.text ?? statusText(r)}
          </li>
        ))}
        {losing.slice(0, 4).map((r) => (
          <li key={`l-${r.id}`}>
            <button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => onOpen(r)}>{r.name}</button>
            {`: spent ${money(r.metrics.spend_minor, cur)}, sales ${money(r.metrics.purchase_value_minor, cur)} (${roasText(r.metrics.roas)})`}
          </li>
        ))}
      </ul>
    </Lead>
  );
};

type SortKey = string | null;

const LevelTable: React.FC<{
  level: AdLevel; tree: AdTree | null; loading: boolean; failure: ReturnType<typeof useLoad>['error']; reload: () => Promise<void>;
  rows: AdRow[]; cur: string; opts: AdsOptions | null; canAct: boolean;
  selected: string[]; setSelected: (ids: string[]) => void; statusChips: ChipGroup[]; onClearFilters: () => void;
  term: string; setTerm: (s: string) => void;
  onOpen: (r: AdRow) => void; onOp: (op: Op) => void; onDrill: (r: AdRow) => void;
}> = ({ level, tree, loading, failure, reload, rows, cur, opts, canAct, selected, setSelected, statusChips, onClearFilters, term, setTerm, onOpen, onOp, onDrill }) => {
  const columns = useMemo(() => columnsFor(level), [level]);
  const choice = useColumnChoice(`meta-ads-${level}`, columns);
  const metricCols = METRICS.filter((m) => choice.shows(m.key));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: null, dir: -1 });

  const sorted = useMemo(() => {
    if (!sort.key) {
      // Problems first, then money losing, then running, then spend.
      return [...rows].sort((a, b) => (Number(hasProblem(b)) - Number(hasProblem(a))) || (Number(isLosing(b) && isRunning(b)) - Number(isLosing(a) && isRunning(a)))
        || (Number(isRunning(b)) - Number(isRunning(a))) || (b.metrics.spend_minor - a.metrics.spend_minor));
    }
    const k = sort.key as keyof AdRow['metrics'];
    return [...rows].sort((a, b) => ((Number(a.metrics[k] ?? -Infinity) - Number(b.metrics[k] ?? -Infinity)) * sort.dir));
  }, [rows, sort]);

  const allOn = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const goal = (k: string | null) => labelFrom(opts?.objectives.flatMap((o) => o.optimization_goals), k);

  const onSwitch = (r: AdRow, on: boolean) => onOp({ kind: 'status', rows: [r], to: on ? 'ACTIVE' : 'PAUSED' });
  const switchable = (r: AdRow) => isRunning(r) || isPausedSelf(r);

  const rowMenu = (r: AdRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More for ${r.name}`} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"><MoreHorizontal className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(r)}>Details and preview</DropdownMenuItem>
        {r.level !== 'ad' && <DropdownMenuItem onSelect={() => onDrill(r)}>Open its {r.level === 'campaign' ? 'ad sets' : 'ads'}</DropdownMenuItem>}
        {canAct && (
          <>
            <DropdownMenuSeparator />
            {ownsBudget(r) && <DropdownMenuItem onSelect={() => onOp({ kind: 'budget', rows: [r] })}>Change budget</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => onOp({ kind: 'end', rows: [r] })}>End date</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOp({ kind: 'duplicate', rows: [r] })}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOp({ kind: 'rename', rows: [r] })}>Rename</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nameCell = (r: AdRow) => (
    <div className="min-w-0">
      <button type="button" onClick={() => onOpen(r)} className="text-left font-medium text-gray-900 underline-offset-2 hover:underline">{r.name}</button>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
        {level === 'campaign' && r.objective && <span>{objectiveLabel(r.objective, opts)}</span>}
        {level !== 'campaign' && r.parent_name && <span className="truncate">in {r.parent_name}</span>}
        {r.created_by_growcord && <span>made here</span>}
        {r.level !== 'ad' && <button type="button" className={linkCls} onClick={() => onDrill(r)}>{r.level === 'campaign' ? 'Ad sets' : 'Ads'}</button>}
      </div>
      {(r.review.reasons[0] || r.delivery.issues[0]) && (
        <p className="mt-1 text-xs text-red-700">{r.review.reasons[0] ?? r.delivery.issues[0].text}</p>
      )}
    </div>
  );

  const budgetCell = (r: AdRow) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {budgetText(r.budget, cur, r.level)}
      {canAct && ownsBudget(r) && (
        <button type="button" onClick={() => onOp({ kind: 'budget', rows: [r] })} aria-label={`Change the budget of ${r.name}`} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
      )}
    </span>
  );

  const head = (key: string, label: string, right = true) => {
    const active = sort.key === key;
    return (
      <th key={key} className={cn('whitespace-nowrap px-3 py-2 font-medium', right && 'text-right')}>
        <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => setSort(active ? { key, dir: sort.dir === -1 ? 1 : -1 } : { key, dir: -1 })}>
          {label}{active && (sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
        </button>
      </th>
    );
  };

  const totals = tree?.totals;
  const colCount = 3 + (choice.shows('delivery') ? 1 : 0) + (level !== 'ad' && choice.shows('budget') ? 1 : 0) + (choice.shows('objective') ? 1 : 0) + (choice.shows('bid') ? 1 : 0) + (choice.shows('goal') ? 1 : 0) + (choice.shows('ends') ? 1 : 0) + metricCols.length + 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${LEVEL_WORD[level][1]}`} className="w-full sm:w-64" />
        <FilterChips groups={statusChips} onClearAll={onClearFilters}>
          <ColumnChooser columns={columns} visible={choice.visible} onToggle={choice.toggle} onReset={choice.reset} />
        </FilterChips>
      </div>

      {failure && !tree ? <LoadFailure failure={failure} what="The Ads Manager tree (GET /api/v2/marketing/meta/ads/tree) is not served yet." onRetry={reload} /> : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-lg border bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs text-gray-500 [&_th]:normal-case [&_th]:tracking-normal">
                <tr>
                  <th className="w-8 px-3 py-2">{canAct && <Checkbox aria-label="Pick all on this page" checked={allOn} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} />}</th>
                  <th className="w-12 px-1 py-2 font-medium">On</th>
                  <th className="min-w-[16rem] px-3 py-2 font-medium">{LEVEL_TITLE[level].slice(0, -1)}</th>
                  {choice.shows('delivery') && <th className="px-3 py-2 font-medium">Delivery</th>}
                  {level !== 'ad' && choice.shows('budget') && <th className="px-3 py-2 text-right font-medium">Budget</th>}
                  {choice.shows('objective') && <th className="px-3 py-2 font-medium">Objective</th>}
                  {choice.shows('bid') && <th className="px-3 py-2 font-medium">Bid strategy</th>}
                  {choice.shows('goal') && <th className="px-3 py-2 font-medium">Optimised for</th>}
                  {choice.shows('ends') && <th className="px-3 py-2 font-medium">Ends</th>}
                  {metricCols.map((m) => head(m.key, m.label))}
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              {loading && !tree ? <TableSkeleton rows={6} cols={colCount} /> : (
                <tbody>
                  {sorted.length === 0 && <tr><td colSpan={colCount} className="px-3 py-8 text-center text-gray-500">Nothing here for these filters and dates.</td></tr>}
                  {sorted.map((r) => (
                    <tr key={r.id} className={cn('border-b align-top last:border-0 hover:bg-gray-50', selected.includes(r.id) && 'bg-gray-50')}>
                      <td className="px-3 py-2.5">{canAct && <Checkbox aria-label={`Pick ${r.name}`} checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} />}</td>
                      <td className="px-1 py-2">
                        {canAct && switchable(r)
                          ? <Switch checked={isRunning(r)} onCheckedChange={(v) => onSwitch(r, v)} aria-label={isRunning(r) ? `Pause ${r.name}` : `Resume ${r.name}`} />
                          : <span className="text-xs text-gray-400">{isRunning(r) ? 'On' : 'Off'}</span>}
                      </td>
                      <td className="max-w-[24rem] px-3 py-2">{nameCell(r)}</td>
                      {choice.shows('delivery') && <td className="px-3 py-2"><StateChip tone={statusTone(r)}>{statusText(r)}</StateChip></td>}
                      {level !== 'ad' && choice.shows('budget') && <td className="px-3 py-2 text-right tabular-nums">{budgetCell(r)}</td>}
                      {choice.shows('objective') && <td className="px-3 py-2">{objectiveLabel(r.objective, opts)}</td>}
                      {choice.shows('bid') && <td className="px-3 py-2">{labelFrom(opts?.bid_strategies, r.bid_strategy)}</td>}
                      {choice.shows('goal') && <td className="px-3 py-2">{goal(r.optimization_goal)}</td>}
                      {choice.shows('ends') && <td className="whitespace-nowrap px-3 py-2">{r.schedule.end ? localeDate(r.schedule.end, { day: 'numeric', month: 'short' }) : 'Ongoing'}</td>}
                      {metricCols.map((m) => (
                        <td key={m.key} className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', m.key === 'roas' && isLosing(r) && 'font-semibold text-red-700')}>{metricText(r.metrics, m, cur)}</td>
                      ))}
                      <td className="px-2 py-2 text-right">{rowMenu(r)}</td>
                    </tr>
                  ))}
                </tbody>
              )}
              {totals && sorted.length > 0 && (
                <tfoot className="border-t-2 bg-gray-50 font-semibold">
                  <tr>
                    <td />
                    <td />
                    <td className="px-3 py-2">Total of {levelCount(level, tree?.total ?? rows.length)}</td>
                    {choice.shows('delivery') && <td />}
                    {level !== 'ad' && choice.shows('budget') && <td />}
                    {choice.shows('objective') && <td />}
                    {choice.shows('bid') && <td />}
                    {choice.shows('goal') && <td />}
                    {choice.shows('ends') && <td />}
                    {/* Results and their cost mix purchases, page views and likes across rows, so they have no total. */}
                    {metricCols.map((m) => <td key={m.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{m.key === 'results' || m.key === 'cost_per_result_minor' ? '' : metricText(totals, m, cur)}</td>)}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Phone and tablet */}
          <div className="space-y-2 lg:hidden">
            {loading && !tree && <p className="text-sm text-gray-500">Loading...</p>}
            {tree && sorted.length === 0 && <p className="rounded-lg border bg-white px-3 py-6 text-center text-sm text-gray-500">Nothing here for these filters and dates.</p>}
            {totals && sorted.length > 0 && (
              <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm">
                <p className="font-semibold">Total of {levelCount(level, tree?.total ?? rows.length)}</p>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  {metricCols.filter((m) => m.key !== 'results' && m.key !== 'cost_per_result_minor').slice(0, 3).map((m) => (
                    <div key={m.key} className="min-w-0"><dt className="text-gray-500">{m.label}</dt><dd className="font-semibold tabular-nums text-gray-900">{metricText(totals, m, cur)}</dd></div>
                  ))}
                </dl>
              </div>
            )}
            {sorted.map((r) => (
              <div key={r.id} className={cn('rounded-lg border bg-white px-3 py-3', selected.includes(r.id) && 'ring-1 ring-gray-900')}>
                <div className="flex items-start gap-2">
                  {canAct && <Checkbox className="mt-1" aria-label={`Pick ${r.name}`} checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} />}
                  <div className="min-w-0 flex-1">{nameCell(r)}</div>
                  {canAct && switchable(r) && <Switch checked={isRunning(r)} onCheckedChange={(v) => onSwitch(r, v)} aria-label={isRunning(r) ? `Pause ${r.name}` : `Resume ${r.name}`} />}
                  {rowMenu(r)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <StateChip tone={statusTone(r)}>{statusText(r)}</StateChip>
                  {r.level !== 'ad' && budgetCell(r)}
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  {metricCols.slice(0, 6).map((m) => (
                    <div key={m.key} className="min-w-0">
                      <dt className="truncate text-gray-500">{m.label}</dt>
                      <dd className={cn('tabular-nums text-gray-900', m.key === 'roas' && isLosing(r) && 'font-semibold text-red-700')}>{metricText(r.metrics, m, cur)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AdsManagerPage;
