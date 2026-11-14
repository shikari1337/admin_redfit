/**
 * The discovery runs, newest first (`GET /commerce/pricing/discovery/runs`): when, which sources
 * were reached, how many prices were seen, suggested and applied, and why the rest were held back.
 */
import React, { useState } from 'react';
import {
  Btn, Pagination, StatusChip, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, num, type Tone,
} from '@/components/erp';
import { ErrorNote, useLoad } from '@/pages/panels/erp/shared';
import { formatDateTime } from '@/utils/date';
import {
  HELD_WORDS, KIND_WORDS, RUN_SOURCE_WORDS, RUN_STATUS_WORDS, listRuns, wordsOf,
  type DiscoveryRun, type RunSource,
} from '@/lib/v2/pricing';

const PAGE = 20;

const STATUS_TONE: Record<string, Tone> = {
  running: 'blue', ok: 'green', partial: 'amber', unreachable: 'red', skipped: 'neutral', failed: 'red',
};

function sourcesOf(run: DiscoveryRun): RunSource[] {
  return Array.isArray(run.sources) ? (run.sources as RunSource[]).filter((s) => s && typeof s === 'object') : [];
}

/** `{a: 2, b: 1}` as "a 2, b 1" in words. */
function counts(map: Record<string, number> | undefined, words: Record<string, string>): string {
  if (!map) return '';
  return Object.entries(map).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${wordsOf(k, words).toLowerCase()} ${num(n)}`).join(', ');
}

const DiscoveryRuns: React.FC<{ onShowChanges: (runId: string) => void }> = ({ onShowChanges }) => {
  const [page, setPage] = useState(1);
  const list = useLoad(() => listRuns(PAGE, (page - 1) * PAGE), [page]);
  const rows = list.data?.rows ?? [];

  return (
    <div className="space-y-4">
      {list.error ? <ErrorNote error={list.error} what="The discovery runs" onRetry={() => void list.reload()} /> : null}
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Started</Th>
            <Th>Outcome</Th>
            <Th>Sources</Th>
            <Th num>Prices seen</Th>
            <Th num>Suggested</Th>
            <Th num>Changed</Th>
            <Th>Held back or skipped</Th>
            <Th className="text-right">Changes</Th>
          </THead>
          <TBody>
            {list.loading && !rows.length ? (
              <EmptyRow colSpan={8}>Loading the runs</EmptyRow>
            ) : !rows.length ? (
              <EmptyRow colSpan={8}>No run yet. Switch on price discovery under Website settings, then Run now or wait for the daily run.</EmptyRow>
            ) : rows.map((r) => {
              const s = r.summary ?? {};
              const held = counts(s.held, HELD_WORDS);
              const skipped = counts(s.skipped, HELD_WORDS);
              const kinds = counts(s.kinds, KIND_WORDS);
              const left = Number(s.left_for_a_person ?? 0);
              return (
                <Tr key={r.id}>
                  <Td muted className="whitespace-nowrap">
                    {formatDateTime(r.started_at, '')}
                    {r.finished_at && <span className="block text-[11px] text-gray-400">ended {formatDateTime(r.finished_at, '')}</span>}
                  </Td>
                  <Td>
                    <StatusChip status={r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} label={wordsOf(r.status, RUN_STATUS_WORDS)} />
                    {r.note && <span className="mt-1 block max-w-xs text-xs text-gray-500">{r.note}</span>}
                  </Td>
                  <Td className="text-xs">
                    {sourcesOf(r).length === 0 ? <span className="text-gray-400">None recorded</span> : (
                      <ul className="space-y-0.5">
                        {sourcesOf(r).map((src, i) => (
                          <li key={`${src.source}-${i}`} className={src.reached ? 'text-gray-700' : 'text-red-700'}>
                            {wordsOf(src.source, RUN_SOURCE_WORDS)}: {src.reached ? `${num(src.observations ?? 0)} prices` : `not reached${src.reason ? ` (${src.reason})` : ''}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td num>{num(r.observations)}</Td>
                  <Td num>{num(r.recommendations)}{kinds && <span className="block text-[11px] text-gray-400">{kinds}</span>}</Td>
                  <Td num className="font-medium">{num(r.applied)}</Td>
                  <Td className="max-w-xs text-xs text-gray-600">
                    {[held && `held: ${held}`, skipped && `skipped: ${skipped}`, left > 0 && `${num(left)} left for a person`]
                      .filter(Boolean).join('; ') || 'Nothing'}
                  </Td>
                  <Td className="text-right">
                    <Btn type="button" size="sm" variant="outline" disabled={!r.applied} onClick={() => onShowChanges(r.id)}
                      title={r.applied ? undefined : 'This run changed no price.'}>
                      See changes
                    </Btn>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>
      <Pagination page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
    </div>
  );
};

export default DiscoveryRuns;
