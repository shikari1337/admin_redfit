/**
 * Marketing > Ads > Rules and tests (`/panel/marketing/ads/rules`, lane META-15A, contract META-W2 section A).
 *
 * Three tabs. Recommendations: Meta's suggestions and the ad account webhooks' issues, fatigue and rejections, each
 * with "apply" as a person's click where Meta allows it (the confirm says what changes, in money). Rules: Meta's
 * automated rules (conditions on metrics over a window; pause, resume, change budget or notify). Tests: split tests
 * across ad sets or campaigns, with Meta's winner and confidence. The metric list comes from the options data.
 */
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TabBar } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import {
  metaAdsApi, type AdLevel, type AdRecommendation, type AdRule, type AdTest, type MetricOption, type RuleInput,
} from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, money, plural, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { ADS_ROUTES, metaHref } from '../routes';
import { LEVEL_WORD, NeedsAdAccount, adAccountOf, dayIso, fmtMetric, useAdsOptions } from './shared';

type Tab = 'recommendations' | 'rules' | 'tests';
const TABS: Array<{ key: Tab; label: string }> = [{ key: 'recommendations', label: 'Recommendations' }, { key: 'rules', label: 'Rules' }, { key: 'tests', label: 'Tests' }];

/** Used only when the options data lists no rule metrics (contract question); Meta's own field names. */
const FALLBACK_METRICS: MetricOption[] = [
  { key: 'spend_minor', label: 'Amount spent', kind: 'money' }, { key: 'cost_per_result_minor', label: 'Cost per result', kind: 'money' },
  { key: 'roas', label: 'Return on spend', kind: 'ratio' }, { key: 'frequency', label: 'Frequency', kind: 'ratio' }, { key: 'ctr', label: 'Click rate', kind: 'percent' },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const OPS: Array<{ key: string; label: string }> = [{ key: 'gt', label: 'is more than' }, { key: 'lt', label: 'is less than' }];

const RulesTestsPage: React.FC = () => {
  const ctx = useMetaCtx();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'recommendations') as Tab;
  const recs = useLoad(() => metaAdsApi.recommendations(), []);
  const opts = useAdsOptions().data;
  const metrics = opts?.rule_metrics.length ? opts.rule_metrics : FALLBACK_METRICS;
  return (
    <div className="space-y-5">
      <MetaHeader title="Rules and tests" setup={ctx.setup} description="Meta's suggestions to act on, rules that watch your ads for you, and tests that find what works better." />
      <TabBar tabs={TABS.map((t) => ({ key: t.key, label: t.key === 'recommendations' && recs.data?.length ? `${t.label} (${recs.data.length})` : t.label }))} active={tab}
        onChange={(k) => { const n = new URLSearchParams(sp); if (k === 'recommendations') n.delete('tab'); else n.set('tab', k); setSp(n, { replace: true }); }} />
      {!adAccountOf(ctx) && ctx.setup ? <NeedsAdAccount ctx={ctx} />
        : tab === 'recommendations' ? <Recommendations q={recs} canAct={ctx.can.ads} />
          : tab === 'rules' ? <Rules metrics={metrics} canAct={ctx.can.ads} />
            : <Tests metrics={metrics} canAct={ctx.can.ads} />}
    </div>
  );
};

/* Recommendations */

const KIND_TONE: Record<string, 'bad' | 'warn' | 'info'> = { rejected: 'bad', account_issue: 'bad', creative_fatigue: 'warn', learning_limited: 'warn' };

const Recommendations: React.FC<{ q: ReturnType<typeof useLoad<AdRecommendation[]>>; canAct: boolean }> = ({ q, canAct }) => {
  const { toast } = useToast();
  const [applying, setApplying] = useState<AdRecommendation | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Recommendations (GET /api/v2/marketing/meta/ads/recommendations) are not served yet." onRetry={q.reload} />;
  if (!q.data) return <p className="text-sm text-gray-500">Loading...</p>;
  const list = [...q.data].sort((a, b) => (KIND_TONE[a.kind] === 'bad' ? -1 : 0) - (KIND_TONE[b.kind] === 'bad' ? -1 : 0));
  const apply = async () => {
    if (!applying) return;
    setBusy(true);
    try { await metaAdsApi.applyRecommendation(applying.id); toast({ title: 'Applied', description: applying.title }); setApplying(null); await q.reload(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'Nothing was changed.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  if (!list.length) return <Lead tone="good" title="Nothing to act on">Meta has no recommendations and no issues for your ads right now.</Lead>;
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {list.map((r) => (
          <li key={r.id} className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StateChip tone={KIND_TONE[r.kind] ?? 'info'}>{KIND_TONE[r.kind] === 'bad' ? 'Fix' : KIND_TONE[r.kind] === 'warn' ? 'Look at' : 'Suggestion'}</StateChip>
                  <p className="font-semibold text-gray-900">{r.title}</p>
                </div>
                {r.object_name && <p className="mt-0.5 text-xs text-gray-500">{cap(LEVEL_WORD[r.level as AdLevel]?.[0] ?? r.level)}: {r.object_name}{r.since ? `, since ${ago(r.since)}` : ''}</p>}
                <p className="mt-1 text-sm text-gray-800">{r.text}</p>
                {r.impact && <p className="mt-1 text-sm text-emerald-700">{r.impact}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {r.object_id && (r.level === 'campaign' || r.level === 'adset' || r.level === 'ad') && (
                  <Button size="sm" variant="outline" asChild><Link to={metaHref(ADS_ROUTES.manager, { ...(r.level !== 'campaign' ? { level: r.level } : {}), focus: r.object_id })}>Open</Link></Button>
                )}
                {canAct && r.can_apply && <Button size="sm" onClick={() => setApplying(r)}>Apply</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {applying && (
        <Dialog open onOpenChange={(o) => { if (!o) setApplying(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Apply this?</DialogTitle><DialogDescription>{applying.title}</DialogDescription></DialogHeader>
            <p className="text-sm text-gray-800">{applying.apply_text ?? 'Meta makes the change it suggests on this object.'}</p>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setApplying(null)}>Cancel</Button><Button onClick={apply} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Apply</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

/* Rules */

const valueText = (m: MetricOption | undefined, v: number) => (m?.kind === 'money' ? money(v, 'INR') : m?.key === 'frequency' ? v.toFixed(2) : fmtMetric(m?.kind ?? 'count', v, 'INR'));

function ruleSentence(r: AdRule, metrics: MetricOption[]): string {
  const cond = r.conditions.map((c) => {
    const m = metrics.find((x) => x.key === c.metric);
    return `the ${(m?.label ?? c.metric).toLowerCase()} ${OPS.find((o) => o.key === c.op)?.label ?? c.op} ${valueText(m, c.value)}`;
  }).join(' and ');
  const act = r.action.kind === 'pause' ? 'pause it' : r.action.kind === 'resume' ? 'resume it' : r.action.kind === 'budget_percent' ? `change its budget by ${r.action.value ?? 0}%` : 'tell me';
  const scope = r.ids.length ? `${plural(r.ids.length, LEVEL_WORD[r.level][0], LEVEL_WORD[r.level][1])} picked` : `any ${LEVEL_WORD[r.level][0]}`;
  return `For ${scope}, over the last ${plural(r.window_days, 'day')}: when ${cond}, ${act}.`;
}

const Rules: React.FC<{ metrics: MetricOption[]; canAct: boolean }> = ({ metrics, canAct }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaAdsApi.rules(), []);
  const [editing, setEditing] = useState<AdRule | 'new' | null>(null);
  const toggle = async (r: AdRule, on: boolean) => {
    try { await metaAdsApi.updateRule(r.id, { enabled: on }); await q.reload(); toast({ title: on ? 'Rule on' : 'Rule off', description: r.name }); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'Nothing changed.'), variant: 'destructive' }); }
  };
  const remove = async (r: AdRule) => {
    try { await metaAdsApi.deleteRule(r.id); await q.reload(); toast({ title: 'Rule deleted', description: r.name }); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'It was not deleted.'), variant: 'destructive' }); }
  };
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Rules (GET /api/v2/marketing/meta/ads/rules) are not served yet." onRetry={q.reload} />;
  if (!q.data) return <p className="text-sm text-gray-500">Loading...</p>;
  const fired = q.data.filter((r) => r.enabled && r.last_triggered_at && Date.now() - new Date(r.last_triggered_at).getTime() < 7 * 86_400_000);
  return (
    <div className="space-y-4">
      {fired.length > 0 && <Lead tone="info" title={`${plural(fired.length, 'rule')} acted this week`}>{fired.map((r) => `${r.name} (${ago(r.last_triggered_at)})`).join('; ')}</Lead>}
      {canAct && <Button size="sm" onClick={() => setEditing('new')}><Plus /> New rule</Button>}
      <Section title="Automated rules" hint="Meta checks them on its own schedule; a rule that changes a budget or resumes an ad spends money without asking again.">
        {!q.data.length ? <p className="text-sm text-gray-600">No rules yet. A common first rule: pause any ad whose cost per result is above what a sale earns you.</p> : (
          <ul className="divide-y">
            {q.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                {canAct ? <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} aria-label={`${r.enabled ? 'Turn off' : 'Turn on'} ${r.name}`} className="mt-0.5" /> : <StateChip tone={r.enabled ? 'good' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</StateChip>}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-sm text-gray-700">{ruleSentence(r, metrics)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {r.schedule === 'daily' ? 'Checked daily' : 'Checked hourly'}{r.last_run_at ? `, last ${ago(r.last_run_at)}` : ', not run yet'}{r.triggered_count ? `; acted ${plural(r.triggered_count, 'time')}` : ''}
                  </p>
                </div>
                {canAct && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                    <button type="button" aria-label={`Delete ${r.name}`} onClick={() => remove(r)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing && <RuleDialog rule={editing === 'new' ? null : editing} metrics={metrics} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await q.reload(); }} />}
    </div>
  );
};

const RuleDialog: React.FC<{ rule: AdRule | null; metrics: MetricOption[]; onClose: () => void; onDone: () => void }> = ({ rule, metrics, onClose, onDone }) => {
  const { toast } = useToast();
  const toField = (m: MetricOption | undefined, v: number) => String(m?.kind === 'money' ? minorToMajor(v, 'INR') : v);
  const [name, setName] = useState(rule?.name ?? '');
  const [level, setLevel] = useState<AdLevel>(rule?.level ?? 'ad');
  const [windowDays, setWindowDays] = useState(String(rule?.window_days ?? 3));
  const [conds, setConds] = useState(rule?.conditions.map((c) => ({ metric: c.metric, op: c.op, value: toField(metrics.find((m) => m.key === c.metric), c.value) })) ?? [{ metric: metrics[0]?.key ?? '', op: 'gt', value: '' }]);
  const [action, setAction] = useState(rule?.action.kind ?? 'pause');
  const [pct, setPct] = useState(String(rule?.action.value ?? 15));
  const [schedule, setSchedule] = useState(rule?.schedule ?? 'hourly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Give the rule a name.'); return; }
    const conditions = conds.map((c) => {
      const m = metrics.find((x) => x.key === c.metric);
      return { metric: c.metric, op: c.op, value: m?.kind === 'money' ? majorToMinor(c.value, 'INR') ?? NaN : Number(c.value) };
    });
    if (conditions.some((c) => !Number.isFinite(c.value))) { setErr('Every condition needs a number.'); return; }
    if (action === 'budget_percent' && !(Number(pct) !== 0 && Math.abs(Number(pct)) <= 100)) { setErr('The budget change runs from minus 100 to 100 percent.'); return; }
    const body: RuleInput = {
      name: name.trim(), enabled: rule?.enabled ?? true, level, ids: rule?.ids ?? [], window_days: Number(windowDays) || 1, conditions,
      action: { kind: action, value: action === 'budget_percent' ? Number(pct) : null }, schedule,
    };
    setBusy(true); setErr('');
    try { if (rule) await metaAdsApi.updateRule(rule.id, body); else await metaAdsApi.createRule(body); toast({ title: rule ? 'Rule saved' : 'Rule created' }); onDone(); }
    catch (e) { setErr(writeError(e, 'Meta did not save the rule.')); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{rule ? 'Edit rule' : 'New rule'}</DialogTitle><DialogDescription>Meta checks it and acts for you.</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <div><Label htmlFor="r-name">Name</Label><Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus /></div>
          <div className="flex flex-wrap items-center gap-2">
            Watch every
            <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as AdLevel)} className="h-9 rounded-md border bg-white px-2">
              <option value="campaign">campaign</option><option value="adset">ad set</option><option value="ad">ad</option>
            </select>
            over the last <Input aria-label="Days" type="number" min={1} max={30} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} className="h-9 w-16" /> days
          </div>
          <div className="space-y-2">
            <p className="font-medium">When</p>
            {conds.map((c, i) => {
              const m = metrics.find((x) => x.key === c.metric);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  {i > 0 && <span className="text-gray-500">and</span>}
                  <select aria-label="Metric" value={c.metric} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, metric: e.target.value } : x)))} className="h-9 rounded-md border bg-white px-2">
                    {metrics.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <select aria-label="Comparison" value={c.op} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} className="h-9 rounded-md border bg-white px-2">
                    {OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <Input aria-label="Value" inputMode="decimal" value={c.value} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-9 w-28" placeholder={m?.kind === 'money' ? 'Rupees' : m?.kind === 'percent' ? 'Percent' : ''} />
                  {conds.length > 1 && <button type="button" aria-label="Remove condition" onClick={() => setConds(conds.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:bg-gray-100"><Trash2 className="h-4 w-4" /></button>}
                </div>
              );
            })}
            <Button type="button" size="sm" variant="ghost" onClick={() => setConds([...conds, { metric: metrics[0]?.key ?? '', op: 'gt', value: '' }])}><Plus /> And</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Then
            <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className="h-9 rounded-md border bg-white px-2">
              <option value="pause">pause it</option><option value="notify">tell me</option><option value="budget_percent">change its budget by</option><option value="resume">resume it</option>
            </select>
            {action === 'budget_percent' && <><Input aria-label="Percent" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="h-9 w-20" /> percent</>}
          </div>
          {(action === 'budget_percent' || action === 'resume') && <p className="text-xs text-amber-800">This rule can raise spending without asking again.</p>}
          <div className="flex flex-wrap items-center gap-3">
            Check
            <label className="flex items-center gap-1.5"><input type="radio" checked={schedule === 'hourly'} onChange={() => setSchedule('hourly')} /> every hour</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={schedule === 'daily'} onChange={() => setSchedule('daily')} /> once a day</label>
          </div>
        </div>
        <DialogFooter className="items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-red-700">{err}</p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {rule ? 'Save rule' : 'Create rule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* Tests */

const TEST_STATE: Record<string, { text: string; tone: 'good' | 'info' | 'neutral' | 'warn' }> = {
  running: { text: 'Running', tone: 'info' }, completed: { text: 'Finished', tone: 'good' }, scheduled: { text: 'Starts soon', tone: 'neutral' }, draft: { text: 'Draft', tone: 'neutral' }, cancelled: { text: 'Stopped', tone: 'warn' },
};

const Tests: React.FC<{ metrics: MetricOption[]; canAct: boolean }> = ({ metrics, canAct }) => {
  const q = useLoad(() => metaAdsApi.tests(), []);
  const [creating, setCreating] = useState(false);
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Tests (GET /api/v2/marketing/meta/ads/tests) are not served yet." onRetry={q.reload} />;
  if (!q.data) return <p className="text-sm text-gray-500">Loading...</p>;
  const decided = q.data.filter((t) => t.status === 'completed' && t.winner_cell_id);
  return (
    <div className="space-y-4">
      {decided.length > 0 && <Lead tone="good" title={`${plural(decided.length, 'test')} found a winner`}>Move budget to the winner, or pause the other side.</Lead>}
      {canAct && <Button size="sm" onClick={() => setCreating(true)}><Plus /> New test</Button>}
      {!q.data.length ? <Section title="Split tests"><p className="text-sm text-gray-600">No tests yet. A test splits people at random between two or more ad sets or campaigns, so only one thing differs.</p></Section> : q.data.map((t) => <TestCard key={t.id} t={t} metrics={metrics} />)}
      {creating && <TestDialog metrics={metrics} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await q.reload(); }} />}
    </div>
  );
};

const TestCard: React.FC<{ t: AdTest; metrics: MetricOption[] }> = ({ t, metrics }) => {
  const m = metrics.find((x) => x.key === t.metric);
  const st = TEST_STATE[t.status] ?? { text: t.status, tone: 'neutral' as const };
  return (
    <Section title={t.name} hint={`${cap(LEVEL_WORD[t.kind as AdLevel]?.[1] ?? t.kind)} compared on ${(m?.label ?? t.metric).toLowerCase()}, ${t.start ? localeDate(t.start, { day: 'numeric', month: 'short' }) : ''}${t.end ? ` to ${localeDate(t.end, { day: 'numeric', month: 'short' })}` : ''}`}
      actions={<StateChip tone={st.tone}>{st.text}</StateChip>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.cells.map((c) => {
          const win = t.winner_cell_id === c.id || c.is_winner;
          const v = c.metrics ? (c.metrics as unknown as Record<string, number | null>)[t.metric] : null;
          return (
            <div key={c.id} className={`rounded-md border p-3 ${win ? 'border-emerald-400 bg-emerald-50' : ''}`}>
              <p className="flex items-center gap-1.5 font-medium text-gray-900">{win && <Trophy className="h-4 w-4 text-emerald-700" aria-label="Winner" />}{c.name}</p>
              {c.metrics ? (
                <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-gray-500">{m?.label ?? t.metric}</dt><dd className="font-semibold tabular-nums">{v == null ? 'n/a' : valueText(m, v)}</dd></div>
                  <div><dt className="text-gray-500">Spend</dt><dd className="tabular-nums">{money(c.metrics.spend_minor, 'INR')}</dd></div>
                  <div><dt className="text-gray-500">Results</dt><dd className="tabular-nums">{c.metrics.results}</dd></div>
                </dl>
              ) : <p className="mt-1 text-xs text-gray-500">No results yet.</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-gray-700">
        {t.winner_cell_id ? `Meta is ${t.confidence ?? 0}% sure ${t.cells.find((c) => c.id === t.winner_cell_id)?.name ?? 'one side'} wins.` : t.confidence != null ? `No winner yet: Meta is ${t.confidence}% sure of the leader so far.` : 'Results appear a day after it starts.'}
      </p>
    </Section>
  );
};

const TestDialog: React.FC<{ metrics: MetricOption[]; onClose: () => void; onDone: () => void }> = ({ metrics, onClose, onDone }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'adset' | 'campaign'>('adset');
  const [metric, setMetric] = useState(metrics.find((m) => m.kind === 'money')?.key ?? metrics[0]?.key ?? '');
  const [start, setStart] = useState(dayIso(1));
  const [end, setEnd] = useState(dayIso(15));
  const [picked, setPicked] = useState<string[]>([]);
  const tree = useLoad(() => metaAdsApi.tree({ level: kind, page_size: 100 }), [kind]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Give the test a name.'); return; }
    if (picked.length < 2 || picked.length > 5) { setErr('Pick two to five to compare.'); return; }
    if (!(end > start)) { setErr('The end date must be after the start.'); return; }
    setBusy(true); setErr('');
    try {
      const rows = tree.data?.rows ?? [];
      await metaAdsApi.createTest({ name: name.trim(), kind, metric, start, end, cells: picked.map((id) => ({ name: rows.find((r) => r.id === id)?.name ?? id, object_ids: [id] })) });
      toast({ title: 'Test created', description: 'Meta splits people between them from the start date.' }); onDone();
    } catch (e) { setErr(writeError(e, 'Meta did not create the test.')); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>New split test</DialogTitle><DialogDescription>Each person sees only one side, so the difference is the thing you changed.</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <div><Label htmlFor="t-name">Name</Label><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus /></div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'adset'} onChange={() => { setKind('adset'); setPicked([]); }} /> Compare ad sets</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'campaign'} onChange={() => { setKind('campaign'); setPicked([]); }} /> Compare campaigns</label>
          </div>
          <div>
            <p className="font-medium">Pick two to five</p>
            {tree.error && !tree.data ? <LoadFailure failure={tree.error} what="The Ads Manager tree is not served yet." onRetry={tree.reload} /> : (
              <ul className="mt-1 max-h-48 divide-y overflow-y-auto rounded-md border">
                {(tree.data?.rows ?? []).map((r) => (
                  <li key={r.id}><label className="flex items-center gap-2 px-3 py-1.5"><input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} /> <span className="min-w-0 truncate">{r.name}</span></label></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="t-metric">Decide the winner on</Label>
            <select id="t-metric" value={metric} onChange={(e) => setMetric(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2">
              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="t-start">Starts</Label><Input id="t-start" type="date" min={dayIso(0)} value={start} onChange={(e) => setStart(e.target.value)} className="mt-1" /></div>
            <div><Label htmlFor="t-end">Ends</Label><Input id="t-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1" /></div>
          </div>
          <p className="text-xs text-gray-500">Each side keeps its own budget. Longer tests give Meta more to decide on. See them in the <Link className={linkCls} to={metaHref(ADS_ROUTES.manager)}>Ads Manager</Link>.</p>
        </div>
        <DialogFooter className="items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-red-700">{err}</p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RulesTestsPage;
