/**
 * The Ads Manager's changes, each confirmed in plain words before it is sent: pause or resume (the confirm states
 * the money that can be spent from the moment of resuming), the budget, a percent change for many rows, the end
 * date, the name, and duplicating (copies are created paused). One row goes to its own route, several to the bulk
 * route (contract META-W2 section A). Built on the same dialog, input and toast the wave 1 campaign table used.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import { metaAdsApi, type AdLevel, type AdRow } from '@/lib/v2/areas/meta';
import { money, num, writeError } from '../common';
import { LEVEL_WORD, budgetText, dayIso, levelCount, ownsBudget, spendCapLine } from './shared';

export type OpKind = 'status' | 'budget' | 'bulk_budget' | 'end' | 'rename' | 'duplicate';
export interface Op { kind: OpKind; rows: AdRow[]; to?: 'ACTIVE' | 'PAUSED' }

const Shell: React.FC<{ title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, sub, onClose, children, footer }) => (
  <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {sub && <DialogDescription className="break-words">{sub}</DialogDescription>}
      </DialogHeader>
      {children}
      <DialogFooter className="gap-2">{footer}</DialogFooter>
    </DialogContent>
  </Dialog>
);

const subOf = (rows: AdRow[]) => (rows.length === 1 ? rows[0].name : levelCount(rows[0].level, rows.length));

/** Opens the dialog for one operation; `onDone` reloads the table. */
export const OpDialog: React.FC<{ op: Op; cur: string; onClose: () => void; onDone: () => void | Promise<void> }> = ({ op, cur, onClose, onDone }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const rows = op.rows;
  const level: AdLevel = rows[0].level;
  const one = rows.length === 1 ? rows[0] : null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); await onDone(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'The change was not made.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  /* Pause or resume */
  if (op.kind === 'status') {
    const resume = op.to === 'ACTIVE';
    const go = () => run(
      () => (one ? metaAdsApi.setStatus(level, one.id, op.to!) : metaAdsApi.bulk({ ids: rows.map((r) => r.id), level, action: resume ? 'resume' : 'pause' })),
      resume ? `${subOf(rows)} ${rows.length === 1 ? 'is' : 'are'} running` : `${subOf(rows)} ${rows.length === 1 ? 'is' : 'are'} paused`,
    );
    const line = spendCapLine(rows, cur);
    return (
      <Shell title={resume ? `Resume ${rows.length === 1 ? `this ${LEVEL_WORD[level][0]}` : levelCount(level, rows.length)}?` : `Pause ${rows.length === 1 ? `this ${LEVEL_WORD[level][0]}` : levelCount(level, rows.length)}?`}
        sub={subOf(rows)} onClose={onClose}
        footer={<>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy} variant={resume ? 'default' : 'destructive'}>{busy && <Loader2 className="animate-spin" />}{resume ? (one && one.budget.kind === 'daily' && one.budget.amount_minor !== null ? `Resume, up to ${money(one.budget.amount_minor, cur)} a day` : 'Resume and allow spending') : 'Pause'}</Button>
        </>}>
        <p className="text-sm text-gray-800">
          {resume ? line : 'Its ads stop showing and it stops spending at once. Nothing is deleted; you can resume it later.'}
        </p>
        {resume && rows.some((r) => r.review.status === 'DISAPPROVED') && <p className="text-sm text-amber-800">A rejected ad stays off until Meta approves it.</p>}
      </Shell>
    );
  }

  /* Budget of one row */
  if (op.kind === 'budget' && one) return <BudgetDialog row={one} cur={cur} busy={busy} onClose={onClose} run={run} />;

  /* Budget of many rows, by a percent */
  if (op.kind === 'bulk_budget') return <BulkBudgetDialog rows={rows} cur={cur} busy={busy} onClose={onClose} run={run} />;

  /* End date */
  if (op.kind === 'end') return <EndDialog rows={rows} busy={busy} onClose={onClose} run={run} />;

  /* Rename */
  if (op.kind === 'rename' && one) return <RenameDialog row={one} busy={busy} onClose={onClose} run={run} />;

  /* Duplicate */
  if (op.kind === 'duplicate' && one) return <DuplicateDialog row={one} busy={busy} onClose={onClose} run={run} />;

  return null;
};

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const BudgetDialog: React.FC<{ row: AdRow; cur: string; busy: boolean; onClose: () => void; run: Run }> = ({ row, cur, busy, onClose, run }) => {
  const [kind, setKind] = useState<'daily' | 'lifetime'>(row.budget.kind === 'lifetime' ? 'lifetime' : 'daily');
  const [value, setValue] = useState(row.budget.amount_minor !== null ? String(minorToMajor(row.budget.amount_minor, cur)) : '');
  const minor = majorToMinor(value, cur);
  const valid = minor !== null && minor > 0;
  if (!ownsBudget(row)) {
    return (
      <Shell title="Budget" sub={row.name} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <p className="text-sm text-gray-800">
          {row.level === 'ad' ? 'Ads spend from their ad set\'s budget.' : row.budget.at === 'campaign' ? `This ad set spends from its campaign's budget (${budgetText(row.budget, cur, 'campaign')}). Change it on the campaign.` : 'This campaign has no budget of its own; each ad set has one.'}
        </p>
      </Shell>
    );
  }
  const running = (row.effective_status ?? row.status) === 'ACTIVE';
  return (
    <Shell title={`${LEVEL_WORD[row.level][0].charAt(0).toUpperCase()}${LEVEL_WORD[row.level][0].slice(1)} budget`} sub={row.name} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || busy} onClick={() => run(() => metaAdsApi.setBudget(row.level, row.id, minor!, kind), `Budget is now ${money(minor, cur)}${kind === 'daily' ? ' a day' : ' in total'}`)}>
          {busy && <Loader2 className="animate-spin" />} Save budget
        </Button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={kind === 'daily'} onChange={() => setKind('daily')} /> A day</label>
          <label className="flex items-center gap-2"><input type="radio" checked={kind === 'lifetime'} onChange={() => setKind('lifetime')} /> In total, until it ends</label>
        </div>
        <div>
          <Label htmlFor="ads-budget">Most it may spend ({cur})</Label>
          <Input id="ads-budget" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" autoFocus />
          <p className="mt-1 text-xs text-gray-600">
            {valid ? (kind === 'daily' ? `About ${money(minor! * 30, cur)} over 30 days.` : `At most ${money(minor, cur)} until the end date.`) : 'Type an amount above zero.'}
            {' '}Now: {budgetText(row.budget, cur, row.level)}.{running && ' It is running, so the new budget applies at once.'}
          </p>
        </div>
      </div>
    </Shell>
  );
};

const BulkBudgetDialog: React.FC<{ rows: AdRow[]; cur: string; busy: boolean; onClose: () => void; run: Run }> = ({ rows, cur, busy, onClose, run }) => {
  const [pct, setPct] = useState('10');
  const p = Number(pct);
  const valid = Number.isFinite(p) && p !== 0 && p > -90 && p <= 300;
  const own = rows.filter(ownsBudget);
  const skipped = rows.length - own.length;
  const daily = own.filter((r) => r.budget.kind === 'daily').reduce((s, r) => s + (r.budget.amount_minor ?? 0), 0);
  const change = valid ? Math.round(daily * (p / 100)) : 0;
  return (
    <Shell title="Change budgets" sub={levelCount(rows[0].level, rows.length)} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || busy || !own.length} onClick={() => run(() => metaAdsApi.bulk({ ids: own.map((r) => r.id), level: rows[0].level, action: 'budget_percent', value: p }), `Budgets changed by ${p > 0 ? '+' : ''}${p}%`)}>
          {busy && <Loader2 className="animate-spin" />} Change {own.length} budget{own.length === 1 ? '' : 's'}
        </Button>
      </>}>
      <div className="space-y-3">
        <div>
          <Label htmlFor="ads-pct">Change by percent (use a minus sign to lower)</Label>
          <Input id="ads-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 w-32" autoFocus />
        </div>
        {valid && daily > 0 && (
          <p className="text-sm text-gray-800">
            Daily budgets together go from {money(daily, cur)} to {money(daily + change, cur)} a day: {change >= 0 ? `up to ${money(change * 30, cur)} more` : `${money(-change * 30, cur)} less`} over 30 days.
          </p>
        )}
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-gray-700">
          {own.map((r) => (
            <li key={r.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums">{valid ? `${budgetText(r.budget, cur, r.level)} becomes ${money(Math.round((r.budget.amount_minor ?? 0) * (1 + p / 100)), cur)}` : budgetText(r.budget, cur, r.level)}</span></li>
          ))}
        </ul>
        {skipped > 0 && <p className="text-xs text-gray-500">{num(skipped)} without a budget of their own are left as they are.</p>}
      </div>
    </Shell>
  );
};

const EndDialog: React.FC<{ rows: AdRow[]; busy: boolean; onClose: () => void; run: Run }> = ({ rows, busy, onClose, run }) => {
  const [end, setEnd] = useState(rows[0].schedule.end?.slice(0, 10) ?? dayIso(14));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= dayIso(0);
  const level = rows[0].level;
  return (
    <Shell title="End date" sub={subOf(rows)} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || busy} onClick={() => run(
          () => (rows.length === 1 ? metaAdsApi.setEnd(level, rows[0].id, end) : metaAdsApi.bulk({ ids: rows.map((r) => r.id), level, action: 'end', value: end })),
          `Ends on ${end}`,
        )}>{busy && <Loader2 className="animate-spin" />} Save end date</Button>
      </>}>
      <div>
        <Label htmlFor="ads-end">Stop delivering after</Label>
        <Input id="ads-end" type="date" min={dayIso(0)} value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-48" />
        <p className="mt-1 text-xs text-gray-600">It stops at the end of that day, in the ad account's time zone.</p>
      </div>
    </Shell>
  );
};

const RenameDialog: React.FC<{ row: AdRow; busy: boolean; onClose: () => void; run: Run }> = ({ row, busy, onClose, run }) => {
  const [name, setName] = useState(row.name);
  const valid = name.trim().length > 0 && name.trim() !== row.name;
  return (
    <Shell title="Rename" sub={row.name} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || busy} onClick={() => run(() => metaAdsApi.rename(row.level, row.id, name.trim()), 'Renamed')}>{busy && <Loader2 className="animate-spin" />} Save name</Button>
      </>}>
      <div>
        <Label htmlFor="ads-name">Name</Label>
        <Input id="ads-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus />
      </div>
    </Shell>
  );
};

const DuplicateDialog: React.FC<{ row: AdRow; busy: boolean; onClose: () => void; run: Run }> = ({ row, busy, onClose, run }) => {
  const [deep, setDeep] = useState(row.level !== 'ad');
  return (
    <Shell title={`Duplicate this ${LEVEL_WORD[row.level][0]}?`} sub={row.name} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={() => run(() => metaAdsApi.duplicate(row.level, row.id, deep), 'Copy created, paused')}>{busy && <Loader2 className="animate-spin" />} Duplicate</Button>
      </>}>
      <div className="space-y-3 text-sm text-gray-800">
        <p>The copy is created paused and spends nothing until someone resumes it.</p>
        {row.level !== 'ad' && (
          <label className="flex items-start gap-3">
            <Switch checked={deep} onCheckedChange={setDeep} className="mt-0.5" />
            <span>Copy its {row.level === 'campaign' ? 'ad sets and ads' : 'ads'} too</span>
          </label>
        )}
      </div>
    </Shell>
  );
};
