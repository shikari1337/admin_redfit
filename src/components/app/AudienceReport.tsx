import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Btn } from '@/components/erp';
import { ChartCard, CompareBars, KpiTile, Unavailable } from '@/components/panelAnalytics/Kit';
import { ErrorNote, Loading, Notice, useLoad } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { KIND_WORDS } from '@/components/common/CatalogItemPicker';
import { codeLabel } from '@/lib/v2/appSettings';
import { getAudienceReport, type InterestCount } from '@/lib/v2/appGrowth';

/**
 * THE AUDIENCE REPORT (HMAPP-3 point 4): how many customers gave each "who are you" answer and each
 * interest, counting only answers kept with the customer's consent, never naming anyone. Server: lane
 * BB, `GET /api/v2/commerce/app/audience/report` (`reports.read`, while the lists on this page need
 * `settings.read`), which names each row itself. It counts the answers kept now, so it has no dates.
 */
const pct = (n: number, of: number | null) => (of && of > 0 ? ` (${Math.round((n / of) * 100)}%)` : '');
const kindWord = (kind: string) => codeLabel((KIND_WORDS as Record<string, string>)[kind] ?? kind);

const AudienceReport: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('reports.read');
  const report = useLoad(getAudienceReport, [], canRead);
  const r = report.data;

  const byKind = new Map<string, InterestCount[]>();
  for (const i of r?.interests ?? []) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);

  if (!canRead) return <Notice tone="info">You need the View reports permission to see the answers counted.</Notice>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Answers kept now, with consent, counted. No customer is named.</p>
        <Btn variant="outline" size="sm" onClick={() => void report.reload()}><RefreshCw className="h-4 w-4" />Refresh</Btn>
      </div>
      {report.loading && !r ? <Loading label="Counting the answers" /> : report.error ? (
        <ErrorNote error={report.error} what="The audience report" onRetry={() => void report.reload()} />
      ) : r ? (
        <>
          {!r.plane_on && <Notice tone="warn">Answers are not kept on this server: the person records are switched off.</Notice>}
          {r.plane_on && !r.kept && <Notice tone="warn">The place answers are kept is not set up on this server yet.</Notice>}
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Customers with answers" value={r.answered === null ? null : r.answered.toLocaleString('en-IN')} unavailable={r.answered === null ? 'Not given by the server' : undefined} />
            <KpiTile label="Of them, no persona named" value={r.without_persona === null ? null : r.without_persona.toLocaleString('en-IN')}
              unavailable={r.without_persona === null ? 'Not given by the server' : undefined} />
          </div>
          <ChartCard title="Who they are">
            {r.personas.length ? (
              <CompareBars rows={r.personas.map((p) => ({
                label: p.label ?? `${p.id} (no longer listed)`, value: p.count, text: `${p.count.toLocaleString('en-IN')}${pct(p.count, r.answered)}`,
              }))} />
            ) : <Unavailable>No persona answer yet.</Unavailable>}
          </ChartCard>
          <ChartCard title="What interests them">
            {byKind.size ? (
              <div className="space-y-4">
                {[...byKind.entries()].map(([kind, rows]) => (
                  <div key={kind}>
                    <div className="mb-1.5 text-xs font-medium text-gray-500">{kindWord(kind)}</div>
                    <CompareBars rows={rows.map((i) => ({
                      label: i.name ?? 'No longer active', value: i.count, text: `${i.count.toLocaleString('en-IN')}${pct(i.count, r.answered)}`,
                    }))} />
                  </div>
                ))}
              </div>
            ) : <Unavailable>No interest answer yet.</Unavailable>}
          </ChartCard>
        </>
      ) : null}
    </div>
  );
};

export default AudienceReport;
