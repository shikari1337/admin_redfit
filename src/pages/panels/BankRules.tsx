import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, StatusChip, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  FilterBar, Field, TextInput, SelectInput, SearchInput, TabBar, inrMinor,
  ExportMenu, Pagination, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * BANK RULES — "teach it once, and next month's statement files itself".
 *
 * Every month the same lines come down the bank feed: the rent, the electricity
 * bill, the bank's own charges, the Razorpay settlement. A rule says "anything
 * containing RAZORPAY that is money IN is a gateway payout", and from then on
 * those lines arrive already labelled.
 *
 * Honesty is the whole design here: a rule's label is a GUESS until a person
 * agrees with it. "Suggested" (amber) and "Confirmed" (green) are deliberately
 * different, and nothing on this page ever writes to the books — categorising a
 * bank line files it, it does not post a journal.
 */

type MarkAs = 'expense' | 'gateway_payout' | 'transfer' | 'income' | 'ignore';

interface RuleMatch {
  contains?: string; regex?: string; direction?: 'credit' | 'debit';
  amount_min_minor?: number; amount_max_minor?: number;
}
interface RuleAction {
  category?: string; account_code?: string; label?: string; mark_as?: MarkAs;
}
interface Rule {
  id: string; name: string; priority: number; active: boolean;
  match: RuleMatch; action: RuleAction;
  hit_count: number; last_hit_at: string | null; summary: string;
}
interface LineRow {
  id: string; statement_id: string; line_date: string | null;
  description: string | null; ref_no: string | null;
  debit_minor: string; credit_minor: string;
  auto_category: string | null; auto_account_code: string | null;
  auto_label: string | null; auto_mark_as: string | null;
  auto_rule_id: string | null; category_confirmed: boolean;
  rule_name: string | null; file_name: string | null; account: string;
}
interface Stats { total: number; uncategorised: number; suggested: number; confirmed: number }
interface Options {
  categories: { value: string; label: string }[];
  markAs: { value: string; label: string }[];
}
interface Preview {
  summary: string; wouldMatch: number; alreadyConfirmed: number;
  totalScanned: number; sample: LineRow[];
}

const rup = (m: string | number | null | undefined) => inrMinor(m ?? '0');
const rupeesToMinor = (v: string): number | undefined => {
  const s = v.trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};
const minorToRupees = (m: number | undefined): string =>
  m === undefined || m === null ? '' : String(m / 100);

const EMPTY_DRAFT = {
  name: '', priority: '100', active: true,
  contains: '', regex: '', direction: '' as '' | 'credit' | 'debit',
  amountMin: '', amountMax: '',
  category: '', markAs: '' as '' | MarkAs, label: '', accountCode: '',
};
type Draft = typeof EMPTY_DRAFT;

const draftToPayload = (d: Draft) => ({
  name: d.name,
  priority: Number(d.priority) || 100,
  active: d.active,
  match: {
    contains: d.contains || undefined,
    regex: d.regex || undefined,
    direction: d.direction || undefined,
    amount_min_minor: rupeesToMinor(d.amountMin),
    amount_max_minor: rupeesToMinor(d.amountMax),
  },
  action: {
    category: d.category || undefined,
    mark_as: d.markAs || undefined,
    label: d.label || undefined,
    account_code: d.accountCode || undefined,
  },
});

const ruleToDraft = (r: Rule): Draft => ({
  name: r.name,
  priority: String(r.priority),
  active: r.active,
  contains: r.match?.contains ?? '',
  regex: r.match?.regex ?? '',
  direction: (r.match?.direction ?? '') as Draft['direction'],
  amountMin: minorToRupees(r.match?.amount_min_minor),
  amountMax: minorToRupees(r.match?.amount_max_minor),
  category: r.action?.category ?? '',
  markAs: (r.action?.mark_as ?? '') as Draft['markAs'],
  label: r.action?.label ?? '',
  accountCode: r.action?.account_code ?? '',
});

const TABS = [
  { key: 'rules', label: 'Rules' },
  { key: 'lines', label: 'Statement lines' },
] as const;

interface TotalRow { category: string | null; mark_as: string | null; lines: number; in_minor: string; out_minor: string }

// Client-side CSV exports. (humanish/categoryLabel referenced lazily in closures.)
const RULE_COLS: CsvColumn<Rule>[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'name', label: 'Rule' },
  { key: 'summary', label: 'What it does' },
  { key: 'hit_count', label: 'Times used' },
  { key: 'last_hit_at', label: 'Last used', format: (r) => (r.last_hit_at ? r.last_hit_at.slice(0, 10) : 'never') },
  { key: 'active', label: 'Status', format: (r) => (r.active ? 'Active' : 'Inactive') },
];

const TOTALS_COLS: CsvColumn<TotalRow>[] = [
  { key: 'category', label: 'Category', format: (t) => t.category ?? '(uncategorised)' },
  { key: 'mark_as', label: 'Marked as', format: (t) => (t.mark_as ? humanish(t.mark_as) : '') },
  { key: 'lines', label: 'Lines' },
  { key: 'in_minor', label: 'Money in', money: true },
  { key: 'out_minor', label: 'Money out', money: true },
];

const BankRules: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [tab, setTab] = useState<string>('rules');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [options, setOptions] = useState<Options>({ categories: [], markAs: [] });
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [applying, setApplying] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const res = await api.get('/bank-rules');
      setRules(payload<Rule[]>(res) ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  }, []);

  useEffect(() => {
    loadRules();
    api.get('/bank-rules/options')
      .then((res) => setOptions(payload<Options>(res) ?? { categories: [], markAs: [] }))
      .catch(() => { /* the form still works with free text */ });
  }, [loadRules]);

  const applyToUncategorised = async () => {
    setApplying(true); setError(''); setNotice('');
    try {
      const res = await api.post('/bank-rules/apply', { onlyUncategorised: true });
      const d = payload<any>(res);
      setNotice(
        d.categorised === 0
          ? `Nothing new to file — ${d.stillUncategorised} line${d.stillUncategorised === 1 ? '' : 's'} still need a category, and no rule matches them yet.`
          : `Filed ${d.categorised} line${d.categorised === 1 ? '' : 's'}. ${d.stillUncategorised} still need a category.`
          + (d.skippedConfirmed ? ` ${d.skippedConfirmed} already-confirmed line${d.skippedConfirmed === 1 ? ' was' : 's were'} left alone.` : ''),
      );
      loadRules();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setApplying(false); }
  };

  const removeRule = async (r: Rule) => {
    if (!window.confirm(`Delete the rule "${r.name}"? Lines it has already labelled keep their category.`)) return;
    setError('');
    try { await api.delete(`/bank-rules/${r.id}`); loadRules(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const toggleActive = async (r: Rule) => {
    setError('');
    try {
      await api.put(`/bank-rules/${r.id}`, { ...draftToPayload(ruleToDraft(r)), active: !r.active });
      loadRules();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <Page>
      <PageHeader
        title="Bank Rules"
        description="Every month the same lines appear — rent, bank charges, Razorpay payouts. Teach it once, and new statements categorise themselves."
        actions={canPost && (
          <>
            <Btn variant="outline" onClick={applyToUncategorised} disabled={applying}>
              {applying ? 'Filing…' : 'Apply to uncategorised'}
            </Btn>
            <Btn onClick={() => { setEditing('new'); setTab('rules'); }}>New rule</Btn>
          </>
        )}
      />

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
        A rule puts a <span className="font-medium">label</span> on a bank line so you can see at a glance what it was.
        It never posts to your accounts — expenses, bills and journals are still recorded by you.
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'rules' ? (
        <>
          {editing && canPost && (
            <RuleEditor
              key={editing === 'new' ? 'new' : editing.id}
              rule={editing === 'new' ? null : editing}
              options={options}
              onCancel={() => setEditing(null)}
              onSaved={(msg) => { setEditing(null); setNotice(msg); setError(''); loadRules(); }}
              onError={setError}
            />
          )}

          <SectionCard
            title="Your rules"
            description="Checked from the top down — the first rule that fits a line wins. A lower priority number is checked earlier."
            flush
            action={<ExportMenu filename="bank-rules" columns={RULE_COLS} rows={rules} disabled={rules.length === 0} />}
          >
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th num>Priority</Th><Th>Rule</Th><Th>What it does</Th>
                  <Th num>Times used</Th><Th>Last used</Th><Th>Status</Th>
                  {canPost && <Th num>Actions</Th>}
                </THead>
                <TBody>
                  {rules.length === 0 && (
                    <EmptyRow colSpan={canPost ? 7 : 6}>
                      No rules yet. Add one — for example: money in containing "RAZORPAY" is a gateway payout.
                    </EmptyRow>
                  )}
                  {rules.map((r) => (
                    <Tr key={r.id} className={r.active ? '' : 'opacity-60'}>
                      <Td num className="tabular-nums">{r.priority}</Td>
                      <Td className="font-medium text-gray-900">{r.name}</Td>
                      <Td className="max-w-md text-gray-600">{r.summary}</Td>
                      <Td num className="tabular-nums">{r.hit_count}</Td>
                      <Td className="text-xs text-gray-500">{r.last_hit_at ? r.last_hit_at.slice(0, 10) : 'never'}</Td>
                      <Td><StatusChip status={r.active ? 'active' : 'inactive'} /></Td>
                      {canPost && (
                        <Td num>
                          <div className="flex justify-end gap-2 text-xs">
                            <button onClick={() => setEditing(r)} className="font-medium text-gray-900 hover:underline">Edit</button>
                            <button onClick={() => toggleActive(r)} className="text-gray-600 hover:underline">{r.active ? 'Turn off' : 'Turn on'}</button>
                            <button onClick={() => removeRule(r)} className="text-red-600 hover:underline">Delete</button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>
        </>
      ) : (
        <LinesTab canPost={canPost} options={options} onError={setError} onNotice={setNotice} />
      )}
    </Page>
  );
};

// ── Rule editor with LIVE PREVIEW ────────────────────────────────────────────
const RuleEditor: React.FC<{
  rule: Rule | null;
  options: Options;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (m: string) => void;
}> = ({ rule, options, onCancel, onSaved, onError }) => {
  const [d, setD] = useState<Draft>(rule ? ruleToDraft(rule) : EMPTY_DRAFT);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const hasCondition = !!(d.contains || d.regex || d.direction || d.amountMin || d.amountMax);
  const hasAction = !!(d.category || d.markAs || d.label || d.accountCode);
  const body = useMemo(() => draftToPayload(d), [d]);

  // Live preview: debounced, dry-run, writes nothing.
  useEffect(() => {
    if (!hasCondition || !hasAction) { setPreview(null); setPreviewError(''); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/bank-rules/preview', { ...body, name: body.name || 'Draft rule', sampleSize: 5 });
        if (!cancelled) { setPreview(payload<Preview>(res)); setPreviewError(''); }
      } catch (e: any) {
        if (!cancelled) { setPreview(null); setPreviewError(e?.response?.data?.message ?? e.message); }
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [body, hasCondition, hasAction]);

  const save = async () => {
    setBusy(true); onError('');
    try {
      if (rule) {
        await api.put(`/bank-rules/${rule.id}`, body);
        onSaved(`Saved "${body.name}". Use "Apply to uncategorised" to file lines with it.`);
      } else {
        await api.post('/bank-rules', body);
        onSaved(`Created "${body.name}". Use "Apply to uncategorised" to file existing lines with it.`);
      }
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard
      title={rule ? `Edit rule — ${rule.name}` : 'New rule'}
      description="Describe the lines to look for, then say what they should be called. The preview below shows exactly what it would match, before you save."
      action={<Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
    >
      <div className="space-y-5 text-sm">
        <FilterBar>
          <Field label="Rule name" className="min-w-[16rem] flex-1">
            <TextInput value={d.name} placeholder='e.g. "Razorpay payouts"' onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Priority (lower is checked first)">
            <TextInput type="number" className="w-40 text-right" value={d.priority} onChange={(e) => set('priority', e.target.value)} />
          </Field>
          <Field label="Active">
            <SelectInput value={d.active ? 'yes' : 'no'} onChange={(e) => set('active', e.target.value === 'yes')}>
              <option value="yes">Yes — use this rule</option>
              <option value="no">No — switched off</option>
            </SelectInput>
          </Field>
        </FilterBar>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">When a bank line…</div>
          <FilterBar>
            <Field label="Contains this text" className="min-w-[16rem] flex-1">
              <TextInput value={d.contains} placeholder="RAZORPAY" onChange={(e) => set('contains', e.target.value)} />
            </Field>
            <Field label="Direction">
              <SelectInput value={d.direction} onChange={(e) => set('direction', e.target.value as Draft['direction'])}>
                <option value="">Either way</option>
                <option value="credit">Money in (credit)</option>
                <option value="debit">Money out (debit)</option>
              </SelectInput>
            </Field>
            <Field label="At least (₹)">
              <TextInput type="number" step="0.01" className="w-36 text-right" value={d.amountMin} placeholder="any" onChange={(e) => set('amountMin', e.target.value)} />
            </Field>
            <Field label="At most (₹)">
              <TextInput type="number" step="0.01" className="w-36 text-right" value={d.amountMax} placeholder="any" onChange={(e) => set('amountMax', e.target.value)} />
            </Field>
          </FilterBar>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Advanced: match with a pattern instead</summary>
            <div className="mt-2">
              <Field label="Pattern (regular expression)">
                <TextInput value={d.regex} placeholder="^NEFT-\d+" className="max-w-lg font-mono" onChange={(e) => set('regex', e.target.value)} />
              </Field>
              <p className="mt-1 text-xs text-gray-400">
                We look at the narration and the reference number. Patterns that could run forever are refused when you save — "contains" is always safe.
              </p>
            </div>
          </details>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">…call it</div>
          <FilterBar>
            <Field label="Kind">
              <SelectInput value={d.markAs} onChange={(e) => set('markAs', e.target.value as Draft['markAs'])}>
                <option value="">— not set —</option>
                {options.markAs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Category">
              <SelectInput value={d.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">— not set —</option>
                {options.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Your own label (optional)" className="min-w-[14rem] flex-1">
              <TextInput value={d.label} placeholder="Razorpay settlement" onChange={(e) => set('label', e.target.value)} />
            </Field>
            <Field label="Account code (optional)">
              <TextInput value={d.accountCode} className="w-32" placeholder="5170" onChange={(e) => set('accountCode', e.target.value)} />
            </Field>
          </FilterBar>
          <p className="mt-1 text-xs text-gray-400">
            An account code is a suggestion for your accountant — nothing is posted to that account.
          </p>
        </div>

        {/* Live preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          {!hasCondition || !hasAction ? (
            <p className="text-xs text-gray-500">
              Fill in at least one condition and one label to see what this rule would match.
            </p>
          ) : previewError ? (
            <p className="text-sm text-red-700">{previewError}</p>
          ) : !preview ? (
            <p className="text-xs text-gray-500">Checking your existing statement lines…</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">{preview.summary}</p>
              <p className="mt-1 text-sm text-gray-600">
                This would match <span className="font-semibold">{preview.wouldMatch}</span> existing line
                {preview.wouldMatch === 1 ? '' : 's'} out of {preview.totalScanned}.
                {preview.alreadyConfirmed > 0 && ` (${preview.alreadyConfirmed} more already have a confirmed category and would be left alone.)`}
              </p>
              {preview.sample.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {preview.sample.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="text-gray-400">{l.line_date ?? '—'}</span>{' '}
                        {l.description || '(no description)'}
                      </span>
                      <span className={`shrink-0 font-medium tabular-nums ${Number(l.credit_minor) ? 'text-emerald-700' : 'text-red-700'}`}>
                        {Number(l.credit_minor) ? `+${rup(l.credit_minor)}` : `-${rup(l.debit_minor)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {preview.wouldMatch === 0 && preview.totalScanned > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Nothing matches right now. That is fine for a rule meant for next month's statement — just check the spelling of the text you typed.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Btn onClick={save} disabled={busy || !hasCondition || !hasAction}>{busy ? 'Saving…' : rule ? 'Save rule' : 'Create rule'}</Btn>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
    </SectionCard>
  );
};

// ── Statement lines: the working queue ───────────────────────────────────────
const STATE_TABS = [
  { key: 'uncategorised', label: 'Needs a category' },
  { key: 'suggested', label: 'Suggested (not confirmed)' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'all', label: 'All lines' },
] as const;

const LinesTab: React.FC<{
  canPost: boolean; options: Options;
  onError: (m: string) => void; onNotice: (m: string) => void;
}> = ({ canPost, options, onError, onNotice }) => {
  const [state, setState] = useState<string>('uncategorised');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, uncategorised: 0, suggested: 0, confirmed: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (which: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/bank-rules/lines/list?state=${which}&limit=200`);
      const d = payload<{ lines: LineRow[]; stats: Stats }>(res);
      setLines(d?.lines ?? []);
      setStats(d?.stats ?? { total: 0, uncategorised: 0, suggested: 0, confirmed: 0 });
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, [onError]);

  useEffect(() => { load(state); }, [state, load]);

  const confirm = async (l: LineRow) => {
    onError('');
    try { await api.post(`/bank-rules/lines/${l.id}/confirm`, {}); load(state); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  const clear = async (l: LineRow) => {
    onError('');
    try { await api.post(`/bank-rules/lines/${l.id}/clear`, {}); load(state); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  const setManually = async (l: LineRow, category: string) => {
    if (!category) return;
    onError('');
    try {
      await api.post(`/bank-rules/lines/${l.id}/confirm`, { category });
      onNotice('Saved your choice for that line.');
      load(state);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  // Client-side search + pagination over the current state's lines (server caps at 200).
  const lc = useListControls({ pageSize: 25 });
  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => `${l.description ?? ''} ${l.ref_no ?? ''} ${l.file_name ?? ''}`.toLowerCase().includes(q));
  }, [lines, lc.debouncedSearch]);
  const pageLines = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  const lineCols = useMemo<CsvColumn<LineRow>[]>(() => [
    { key: 'line_date', label: 'Date', format: (l) => l.line_date ?? '' },
    { key: 'description', label: 'Details', format: (l) => l.description ?? '' },
    { key: 'ref_no', label: 'Ref', format: (l) => l.ref_no ?? '' },
    { key: 'account', label: 'Statement account' },
    { key: 'credit_minor', label: 'Money in', money: true },
    { key: 'debit_minor', label: 'Money out', money: true },
    { key: 'category', label: 'Category', format: (l) => (l.auto_category ? categoryLabel(l.auto_category, options) : (l.auto_label ?? '')) },
    { key: 'auto_mark_as', label: 'Marked as', format: (l) => (l.auto_mark_as ? humanish(l.auto_mark_as) : '') },
    { key: 'category_confirmed', label: 'Status', format: (l) => (l.category_confirmed ? 'Confirmed' : (l.auto_category || l.auto_mark_as || l.auto_label) ? 'Suggested' : 'Not categorised') },
    { key: 'rule_name', label: 'Rule', format: (l) => l.rule_name ?? '' },
  ], [options]);

  return (
    <>
      <StatGrid cols={4}>
        <StatCard label="Lines imported" value={stats.total} sub="Across every statement you have uploaded" />
        <StatCard label="Needs a category" value={stats.uncategorised}
          tone={stats.uncategorised === 0 ? 'good' : 'default'}
          sub="No rule matched these yet" />
        <StatCard label="Suggested" value={stats.suggested} sub="A rule guessed — waiting for your nod" />
        <StatCard label="Confirmed" value={stats.confirmed} tone="good" sub="You agreed; rules leave these alone" />
      </StatGrid>

      <CategoryTotals onError={onError} />

      <TabBar tabs={STATE_TABS} active={state} onChange={(k) => { setState(k); lc.setPage(1); }} />

      {lines.length > 0 && (
        <FilterBar>
          <Field label="Search"><SearchInput value={lc.search} placeholder="Description, ref or file…" onChange={(e) => lc.setSearch(e.target.value)} /></Field>
        </FilterBar>
      )}

      <SectionCard
        title={STATE_TABS.find((t) => t.key === state)?.label}
        description="A suggested category is a guess from one of your rules. Confirming it makes it yours — no rule will change it afterwards."
        flush
        action={<ExportMenu filename={`bank-lines-${state}`} columns={lineCols} rows={filtered} disabled={filtered.length === 0} />}
      >
        <TableShell maxHeight="65vh">
          <table className="w-full text-sm">
            <THead>
              <Th>Date</Th><Th>Details</Th>
              <Th num>Money in</Th><Th num>Money out</Th>
              <Th>Category</Th><Th>Status</Th>
              {canPost && <Th num>Action</Th>}
            </THead>
            <TBody>
              {!loading && filtered.length === 0 && (
                <EmptyRow colSpan={canPost ? 7 : 6}>
                  {lc.debouncedSearch.trim()
                    ? 'No lines match your search.'
                    : state === 'uncategorised'
                      ? 'Nothing waiting — every imported line has a category.'
                      : 'No lines here yet.'}
                </EmptyRow>
              )}
              {loading && <EmptyRow colSpan={canPost ? 7 : 6}>Loading…</EmptyRow>}
              {pageLines.map((l) => {
                const labelled = !!(l.auto_category || l.auto_mark_as || l.auto_label);
                return (
                  <Tr key={l.id}>
                    <Td>{l.line_date ?? '—'}</Td>
                    <Td className="max-w-sm">
                      <div className="truncate" title={l.description ?? ''}>{l.description || '(no description)'}</div>
                      <div className="text-xs text-gray-400">
                        {l.file_name ?? 'statement'}{l.ref_no ? ` · ${l.ref_no}` : ''}
                      </div>
                    </Td>
                    <Td num className="text-emerald-700">{Number(l.credit_minor) ? rup(l.credit_minor) : '—'}</Td>
                    <Td num className="text-red-700">{Number(l.debit_minor) ? rup(l.debit_minor) : '—'}</Td>
                    <Td>
                      {labelled ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {l.auto_mark_as && <Chip tone="blue">{humanish(l.auto_mark_as)}</Chip>}
                          {l.auto_category && <span className="text-gray-800">{categoryLabel(l.auto_category, options)}</span>}
                          {l.auto_label && <span className="text-xs text-gray-500">“{l.auto_label}”</span>}
                          {l.auto_account_code && <span className="text-xs text-gray-400">{l.auto_account_code}</span>}
                        </div>
                      ) : canPost ? (
                        <SelectInput
                          className="h-8 text-xs"
                          defaultValue=""
                          onChange={(e) => setManually(l, e.target.value)}
                        >
                          <option value="">Choose a category…</option>
                          {options.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </SelectInput>
                      ) : <span className="text-gray-400">—</span>}
                    </Td>
                    <Td>
                      {l.category_confirmed
                        ? <StatusChip status="confirmed" />
                        : labelled
                          ? <StatusChip status="suggested" tone="amber" label="Suggested" />
                          : <StatusChip status="none" tone="neutral" label="Not categorised" />}
                      {!l.category_confirmed && l.rule_name && (
                        <div className="mt-0.5 text-xs text-gray-400">by “{l.rule_name}”</div>
                      )}
                    </Td>
                    {canPost && (
                      <Td num>
                        <div className="flex justify-end gap-2 text-xs">
                          {labelled && !l.category_confirmed && (
                            <button onClick={() => confirm(l)} className="font-medium text-emerald-700 hover:underline">Confirm</button>
                          )}
                          {labelled && (
                            <button onClick={() => clear(l)} className="text-gray-600 hover:underline">Clear</button>
                          )}
                          {!labelled && <span className="text-gray-300">—</span>}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
      </SectionCard>
    </>
  );
};

// ── Category totals ("spend by category" roll-up) — GET /bank-rules/lines/totals ─
const CategoryTotals: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [rows, setRows] = useState<TotalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); onError('');
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (confirmedOnly) params.confirmedOnly = 'true';
      const res = await api.get('/bank-rules/lines/totals', { params });
      setRows(payload<TotalRow[]>(res) ?? []);
      setLoaded(true);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, [from, to, confirmedOnly, onError]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ inM: acc.inM + Number(r.in_minor || 0), outM: acc.outM + Number(r.out_minor || 0) }),
    { inM: 0, outM: 0 },
  ), [rows]);

  return (
    <SectionCard
      title="Category totals"
      description="Roll-up of categorised bank lines — money in and out per category, for a chosen period."
      action={
        open ? <ExportMenu filename="bank-category-totals" columns={TOTALS_COLS} rows={rows} disabled={rows.length === 0} />
          : <Btn variant="outline" onClick={() => { setOpen(true); if (!loaded) load(); }}>Show category totals</Btn>
      }
    >
      {open && (
        <>
          <FilterBar>
            <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Confirmed only">
              <SelectInput value={confirmedOnly ? 'yes' : 'no'} onChange={(e) => setConfirmedOnly(e.target.value === 'yes')}>
                <option value="no">All labelled lines</option>
                <option value="yes">Confirmed only</option>
              </SelectInput>
            </Field>
            <div className="flex items-end"><Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</Btn></div>
          </FilterBar>
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Category</Th><Th>Marked as</Th><Th num>Lines</Th><Th num>Money in</Th><Th num>Money out</Th>
              </THead>
              <TBody>
                {loading && <EmptyRow colSpan={5}>Loading…</EmptyRow>}
                {!loading && rows.length === 0 && <EmptyRow colSpan={5}>No categorised lines in this period yet.</EmptyRow>}
                {rows.map((t, i) => (
                  <Tr key={`${t.category ?? ''}-${t.mark_as ?? ''}-${i}`}>
                    <Td className="font-medium text-gray-900">{t.category ?? '(uncategorised)'}</Td>
                    <Td>{t.mark_as ? <Chip tone="blue">{humanish(t.mark_as)}</Chip> : '—'}</Td>
                    <Td num className="tabular-nums">{t.lines}</Td>
                    <Td num className="text-emerald-700">{Number(t.in_minor) ? rup(t.in_minor) : '—'}</Td>
                    <Td num className="text-red-700">{Number(t.out_minor) ? rup(t.out_minor) : '—'}</Td>
                  </Tr>
                ))}
                {!loading && rows.length > 0 && (
                  <Tr className="border-t-2 border-gray-200 font-semibold">
                    <Td className="text-gray-900">Total</Td>
                    <Td />
                    <Td num>{rows.reduce((n, r) => n + Number(r.lines || 0), 0)}</Td>
                    <Td num className="text-emerald-700">{rup(String(totals.inM))}</Td>
                    <Td num className="text-red-700">{rup(String(totals.outM))}</Td>
                  </Tr>
                )}
              </TBody>
            </table>
          </TableShell>
        </>
      )}
    </SectionCard>
  );
};

const humanish = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const categoryLabel = (value: string, options: Options) =>
  options.categories.find((c) => c.value === value)?.label ?? value;

export default BankRules;
