import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, SectionCard, StatusChip, EmptyState,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, inrMinor, ExportMenu, type CsvColumn,
} from '../../components/erp';

/**
 * Scheduled jobs — "what does the system do on its own, and did it work?"
 *
 * Three background jobs keep the books and the stock honest without anyone
 * clicking anything:
 *   • monthly depreciation — works out the month's figure and says it is ready
 *   • daily reorder scan   — lists SKUs at or below their reorder point
 *   • daily expiry scan    — flags batches expiring soon
 *
 * READ-ONLY v1 (ERP_BUILD_STATE #91): this page reports, it does not run
 * anything. The human-initiated equivalents already live where they belong —
 * Fixed Assets → "Run depreciation", Inventory → Reorder, Inventory → Batches.
 */

const CADENCE_LABEL: Record<string, string> = { monthly: 'Once a month', daily: 'Every day' };

interface Run {
  id: string;
  job_key: string;
  run_key: string;
  status: string;
  item_count: number;
  amount_minor: string;
  summary: any;
  detail: string | null;
  notified: boolean;
  started_at: string | null;
  finished_at: string | null;
}

interface Job {
  key: string;
  label: string;
  what: string;
  cadence: string;
  envFlag: string;
  periodShape: string;
  enabled: boolean;
  nextPeriod: string;
  nextPeriodLabel: string;
  nextPeriodAlreadyDone: boolean;
  lastRun: Run | null;
}

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

/** Plain-language outcome for a run status (never a raw enum in front of the owner). */
const OUTCOME_TEXT: Record<string, string> = {
  posted: 'Posted to the books',
  draft: 'Ready for you to review and post',
  ok: 'Ran, nothing needed doing',
  skipped: 'Already handled for this period',
  failed: 'Something went wrong',
  pending: 'Running now',
};

const runCols: CsvColumn<Run>[] = [
  { key: 'job_key', label: 'Job' },
  { key: 'run_key', label: 'Period covered' },
  { key: 'status', label: 'Outcome', format: (r) => OUTCOME_TEXT[r.status] ?? r.status },
  { key: 'item_count', label: 'Items' },
  { key: 'amount_minor', label: 'Amount', money: true },
  { key: 'notified', label: 'Owner told?', format: (r) => (r.notified ? 'Yes' : 'No') },
  { key: 'started_at', label: 'Ran at', format: (r) => when(r.started_at) },
  { key: 'detail', label: 'What happened', format: (r) => r.detail ?? '' },
];

const ScheduledJobs: React.FC = () => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await api.get('/scheduled-jobs');
      setJobs(payload<any>(res)?.jobs ?? []);
      const hist = await api.get('/scheduled-jobs/runs', { params: { limit: 60 } });
      setRuns(payload<Run[]>(hist) ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
      setJobs([]);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <Page>
      <PageHeader
        title="Scheduled jobs"
        description="Work the system does on its own — the monthly depreciation figure, and the daily sweeps for stock that needs reordering or is about to expire. Nothing here posts to your books or buys stock by itself."
        actions={<Btn variant="outline" onClick={load}>Refresh</Btn>}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        {(jobs ?? []).map((j) => {
          const last = j.lastRun;
          return (
            <SectionCard key={j.key} title={j.label}>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusChip
                    status={j.enabled ? 'active' : 'inactive'}
                    label={j.enabled ? 'Switched on' : 'Switched off'}
                  />
                  <span className="text-xs text-gray-500">{CADENCE_LABEL[j.cadence] ?? j.cadence}</span>
                </div>

                <p className="text-gray-600">{j.what}</p>

                <dl className="space-y-1.5 border-t border-gray-100 pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Last run</dt>
                    <dd className="text-right text-gray-800">{when(last?.started_at ?? null)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Covered</dt>
                    <dd className="text-right font-mono text-gray-800">{last?.run_key ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Outcome</dt>
                    <dd className="text-right">
                      {last
                        ? <StatusChip status={last.status} label={OUTCOME_TEXT[last.status] ?? last.status} />
                        : <span className="text-gray-400">has not run yet</span>}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Next covers</dt>
                    <dd className="text-right text-gray-800">
                      {j.nextPeriodLabel}
                      {j.nextPeriodAlreadyDone && <span className="text-gray-400"> (already done)</span>}
                    </dd>
                  </div>
                </dl>

                {last?.detail && (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {last.detail}
                  </p>
                )}
                {last && last.status === 'draft' && Number(last.amount_minor) > 0 && (
                  <p className="text-xs text-amber-700">
                    {inrMinor(last.amount_minor)} is waiting to be posted — open Fixed Assets and run
                    depreciation for {last.run_key}.
                  </p>
                )}
                {!j.enabled && (
                  <p className="text-xs text-gray-400">
                    Turned off on the server with <code className="font-mono">{j.envFlag}=false</code>.
                    Ask your administrator to switch it back on.
                  </p>
                )}

                <button
                  onClick={() => setOpenJob(openJob === j.key ? null : j.key)}
                  className="text-xs font-medium text-gray-900 hover:underline"
                >
                  {openJob === j.key ? 'Hide history' : 'Show history'}
                </button>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {jobs && jobs.length === 0 && !error && (
        <EmptyState
          title="No scheduled jobs reported"
          description="The background jobs have not registered yet. They report here after their first run."
        />
      )}

      {openJob && (
        <SectionCard
          title={`History — ${(jobs ?? []).find((j) => j.key === openJob)?.label ?? openJob}`}
          action={<ExportMenu filename={`scheduled-job-${openJob}-runs`} columns={runCols} rows={runs.filter((r) => r.job_key === openJob)} />}
        >
          <TableShell maxHeight="50vh">
            <table className="w-full text-sm">
              <THead>
                <Th>Ran at</Th><Th>Period covered</Th><Th>Outcome</Th>
                <Th num>Items</Th><Th num>Amount</Th><Th>Owner told?</Th><Th>What happened</Th>
              </THead>
              <TBody>
                {runs.filter((r) => r.job_key === openJob).length === 0 && (
                  <EmptyRow colSpan={7}>No runs recorded yet for this job.</EmptyRow>
                )}
                {runs.filter((r) => r.job_key === openJob).map((r) => (
                  <Tr key={r.id}>
                    <Td>{when(r.started_at)}</Td>
                    <Td className="font-mono text-xs">{r.run_key}</Td>
                    <Td><StatusChip status={r.status} label={OUTCOME_TEXT[r.status] ?? r.status} /></Td>
                    <Td num>{r.item_count}</Td>
                    <Td num>{Number(r.amount_minor) > 0 ? inrMinor(r.amount_minor) : '—'}</Td>
                    <Td>{r.notified ? 'Yes' : <span className="text-gray-400">no</span>}</Td>
                    <Td className="max-w-md text-xs text-gray-600">{r.detail ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      )}

      <p className="text-xs text-gray-400">
        Depreciation is only posted to your books automatically if BOTH “post to the general ledger
        automatically” (Accounting → Settings) and auto-post depreciation are switched on. Otherwise it
        is worked out, saved as a draft, and you are told it is ready. The reorder scan never buys
        anything — if you want a draft purchase order raised automatically, write a “stock below …”
        rule under Orders → Automation rules.
      </p>
    </Page>
  );
};

export default ScheduledJobs;
