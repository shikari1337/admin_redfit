import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatGrid, StatCard, EmptyState, BlockSkeleton } from '@/components/erp';
import { ChartCard, TimeSeries, TwinTable } from '@/components/panelAnalytics/Kit';
import { SERIES, STATUS } from '@/components/panelAnalytics/vizTheme';
import DateRangeBar, { useDateRange } from '@/components/panelAnalytics/DateRangeBar';
import { fmtRupeesOrDash } from '@/lib/money';
import {
  messagingAPI, fmtCount, fmtShare, MSG_CHANNEL_LABEL,
  type MessagingAnalytics, type MsgCh,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * A channel's Overview tab: what went out over a period, and what became of
 * it — sent / delivered / read / failed tiles, the daily series, the messages
 * that sent most, and why sends failed. Every number is the server's, counted
 * from the dispatch rows (`GET /comms/analytics`, contract §4.3); this screen
 * adds nothing up beyond a share of two of them.
 *
 * "Read" means a WhatsApp read receipt or an email open; SMS has no such
 * signal, so its tile is left out rather than shown as a zero.
 *
 * The numbers are always shown as the server counts them — never hidden or
 * estimated. WhatsApp delivered/read come from the receipts the WhatsApp
 * Platform reports back (MSG-5/MSG-7): while sends exist but no receipt has
 * arrived, a hint says so instead of the zero reading as "nothing delivered".
 */
const READ_WORD: Partial<Record<MsgCh, string>> = { whatsapp: 'Read', email: 'Opened' };

const ChannelOverview: React.FC<{ channel: MsgCh }> = ({ channel }) => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const [data, setData] = useState<MessagingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const readWord = READ_WORD[channel];

  const load = useCallback(async () => {
    setLoading(true); setFailure(null);
    try {
      setData(await messagingAPI.analytics({ channel, from: range.from, to: range.to }));
    } catch (e: any) {
      setFailure(failureOf(e, `Could not load the ${MSG_CHANNEL_LABEL[channel]} numbers.`));
    } finally { setLoading(false); }
  }, [channel, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const series = useMemo(() => {
    const s = [
      { key: 'sent', name: 'Sent', color: SERIES[0] },
      { key: 'delivered', name: 'Delivered', color: SERIES[1] },
    ];
    if (readWord) s.push({ key: 'read', name: readWord, color: SERIES[2] });
    s.push({ key: 'failed', name: 'Failed', color: STATUS.critical });
    return s;
  }, [readWord]);

  const topKeys = useMemo(() => [...(data?.by_key ?? [])].sort((a, b) => b.sent - a.sent).slice(0, 10), [data]);
  const t = data?.totals;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {failure?.gap ? (
        <GapNotice what={`${MSG_CHANNEL_LABEL[channel]} numbers come from the comms analytics route, which this server does not serve yet.`} />
      ) : failure ? (
        <ErrorNotice message={failure.message} onRetry={load} />
      ) : loading && !data ? (
        <div className="space-y-4" aria-busy="true"><BlockSkeleton lines={2} /><BlockSkeleton lines={6} /></div>
      ) : t && (
        <>
          <StatGrid cols={readWord ? 4 : 3}>
            <StatCard label="Sent" value={fmtCount(t.sent)} sub={t.cost !== null ? `Cost ${fmtRupeesOrDash(t.cost)}` : undefined} />
            <StatCard label="Delivered" value={fmtCount(t.delivered)} sub={`${fmtShare(t.delivered, t.sent)} of sent`} />
            {readWord && <StatCard label={readWord} value={fmtCount(t.read)} sub={`${fmtShare(t.read, t.delivered)} of delivered`} />}
            <StatCard label="Failed" value={fmtCount(t.failed)} tone={t.failed > 0 ? 'bad' : 'default'} sub={`${fmtShare(t.failed, t.sent)} of sent`} />
          </StatGrid>
          {channel === 'whatsapp' && t.sent > 0 && t.delivered === 0 && (
            <p role="note" data-testid="wa-receipts-hint" className="rounded-md border border-info bg-info-bg px-3 py-2 text-xs text-info-ink">
              Receipts appear once the WhatsApp Platform reports them.
            </p>
          )}
          {data.note && <p className="text-[11px] text-ink-soft">{data.note}{data.timezone ? ` · Days in ${data.timezone}.` : ''}</p>}

          {t.sent === 0 && !data.series.some((p) => p.sent > 0) ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState icon={Inbox} title={`No ${MSG_CHANNEL_LABEL[channel]} messages in this period`}
                description="Pick a longer period, or check the Notifications page that this channel is switched on." />
            </div>
          ) : (
            <>
              <ChartCard title="Per day" sub="Counted in the store's time zone." dim={loading}
                table={{
                  columns: [
                    { key: 'date', label: 'Day', align: 'left' },
                    { key: 'sent', label: 'Sent', format: fmtCount },
                    { key: 'delivered', label: 'Delivered', format: fmtCount },
                    ...(readWord ? [{ key: 'read', label: readWord, format: fmtCount }] : []),
                    { key: 'failed', label: 'Failed', format: fmtCount },
                  ],
                  rows: data.series,
                  empty: 'Nothing sent in this period.',
                }}>
                <TimeSeries data={data.series} series={series} granularity="day" xKey="date" />
              </ChartCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Messages that sent most" sub="Top ten in this period.">
                  <TwinTable
                    columns={[
                      { key: 'label', label: 'Message', align: 'left' },
                      { key: 'sent', label: 'Sent', format: fmtCount },
                      { key: 'delivered', label: 'Delivered', format: fmtCount },
                      ...(readWord ? [{ key: 'read', label: readWord, format: fmtCount }] : []),
                      { key: 'failed', label: 'Failed', format: fmtCount },
                    ]}
                    rows={topKeys} empty="Nothing sent in this period." maxHeight={360} />
                </ChartCard>
                <ChartCard title="Why sends failed" sub="As the provider or the store's rules said it.">
                  <TwinTable
                    columns={[
                      { key: 'reason', label: 'Reason', align: 'left', format: (v: string) => String(v).replace(/_/g, ' ') },
                      { key: 'count', label: 'Messages', format: fmtCount },
                    ]}
                    rows={data.failures} empty="No failures in this period." maxHeight={360} />
                </ChartCard>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ChannelOverview;
