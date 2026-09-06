import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { fmtRupees } from '../../lib/money';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, CategoryBars } from '../../components/panelAnalytics/Kit';
import { SERIES } from '../../components/panelAnalytics/vizTheme';
import { Page, PageHeader, SectionCard, StatusChip, EmptyState } from '../../components/erp';
import { actionLabel } from '../../lib/activityVocab';
import { Inbox, AlertTriangle, ArrowRight, Activity, X } from 'lucide-react';

/**
 * Sales & Team — who sold what, who is managing what, and who did which steps.
 *
 * Reads `/analytics/panels/sales-team` (gated on reports.read — see the route
 * comment for why this is NOT orders.read). Three things this page is careful
 * about, because each was a real trap:
 *
 *  1. ACTIVITY HAS A START DATE. The ledger begins at migration 151; there is
 *     no back-fill, because the only pre-existing record of who did what
 *     (`status_history.changed_by`) mixes names, emails and raw uuids for the
 *     same person. So an empty Steps column must read "not tracked before
 *     <date>", never as "this person did nothing".
 *
 *  2. THE NUMBERS MUST RECONCILE. Agent rows only cover ATTRIBUTED orders.
 *     Self-serve website orders and the 6,599 legacy imports have no agent by
 *     construction, so the unattributed tile is shown next to the total rather
 *     than leaving the reader to wonder where the rest of the revenue went.
 *
 *  3. WORKLOAD IS LIVE, NOT RANGED. "Open orders on my desk" ignores the date
 *     filter on purpose — an order raised in June and still unresolved is on
 *     someone's desk today. The header says so, so the mixed grain is explicit.
 */
const SalesTeam: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, loading, error } = usePanelStats<any>('sales-team', range);

  const [feed, setFeed] = useState<any[] | null>(null);
  const [openAgent, setOpenAgent] = useState<any | null>(null);
  const [agentData, setAgentData] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    api.get('/analytics/panels/activity', { params: { ...range, limit: 25 } })
      .then((r) => { if (alive) setFeed(payload<any>(r)?.items ?? []); })
      .catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  useEffect(() => {
    if (!openAgent) { setAgentData(null); return; }
    let alive = true;
    api.get(`/analytics/panels/sales-team/agent/${openAgent.id}`, { params: range })
      .then((r) => { if (alive) setAgentData(payload<any>(r)); })
      .catch(() => { if (alive) setAgentData({ orders: [], by_action: [], daily: [] }); });
    return () => { alive = false; };
  }, [openAgent?.id, range.from, range.to]);

  const agents: any[] = data?.agents ?? [];
  const t = data?.totals;
  const un = data?.unattributed;
  const trackingSince = data?.first_activity_at
    ? new Date(data.first_activity_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  // Only agents who actually did something rank; the rest are listed after, so
  // a 30-person roster never buries the three people working the desk.
  const active = useMemo(() => agents.filter((a) => a.orders || a.actions || a.open_orders), [agents]);
  const idle = useMemo(() => agents.filter((a) => !a.orders && !a.actions && !a.open_orders), [agents]);

  const actionRows = (data?.action_mix ?? []).slice(0, 8)
    .map((r: any) => ({ label: actionLabel(r.action), value: r.count }));

  return (
    <Page>
      <PageHeader
        title="Sales & Team"
        description="Who sold what, who is managing it, and which steps each person handled."
        actions={<DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && !data && <div className="p-6 text-sm text-gray-500">Loading team performance…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Attributed orders" value={Number(t?.orders ?? 0).toLocaleString('en-IN')}
              sub={`${active.length} of ${agents.length} staff active`} accent={SERIES[0]} />
            <StatTile label="Attributed sales" value={fmtRupees(t?.gross ?? 0)}
              sub={`${fmtRupees(t?.collected ?? 0)} collected`} accent={SERIES[1]} />
            <StatTile label="Steps handled" value={Number(t?.actions ?? 0).toLocaleString('en-IN')}
              sub={trackingSince ? `tracked since ${trackingSince}` : 'tracking starts now'} accent={SERIES[2]} />
            <StatTile label="On the team's desk" value={Number(t?.open_orders ?? 0).toLocaleString('en-IN')}
              sub={`${Number(data.open_unassigned ?? 0).toLocaleString('en-IN')} unassigned`} accent={SERIES[3]} />
          </div>

          {/* Reconciliation strip — where the rest of the revenue sits. */}
          {!!un?.orders && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              <Inbox className="h-4 w-4 shrink-0 text-gray-400" />
              <span>
                <strong className="text-gray-900">{Number(un.orders).toLocaleString('en-IN')}</strong> orders
                ({fmtRupees(un.gross)}) in this range have no sales agent — self-serve website orders
                {un.legacy_imported > 0 && <> and <strong>{Number(un.legacy_imported).toLocaleString('en-IN')}</strong> legacy imports</>}.
                They are excluded from the table below by design.
              </span>
            </div>
          )}

          {/* ── Leaderboard ─────────────────────────────────────────────── */}
          <SectionCard
            title="Team performance"
            description="Sales credit and steps are for the selected range. Open / stale orders are LIVE — an order from any date that is still unresolved counts here."
          >
            {agents.length === 0 ? (
              <EmptyState title="No staff accounts yet" description="Add staff under Settings → Staff to start attributing orders." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 text-right font-medium">Orders</th>
                      <th className="px-3 py-2 text-right font-medium">Sales</th>
                      <th className="px-3 py-2 text-right font-medium">Collected</th>
                      <th className="px-3 py-2 text-right font-medium">AOV</th>
                      <th className="px-3 py-2 text-right font-medium">Cancelled</th>
                      <th className="px-3 py-2 text-right font-medium">Steps</th>
                      <th className="px-3 py-2 text-right font-medium">On desk</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{a.name || a.email}</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="capitalize">{String(a.role || '').replace(/_/g, ' ')}</span>
                            {!a.is_active && <StatusChip status="inactive" />}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.orders.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtRupees(a.gross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtRupees(a.collected)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{a.aov ? fmtRupees(a.aov) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.cancelled > 0
                            ? <span className={a.cancel_rate > 0.2 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                                {a.cancelled} <span className="text-xs">({Math.round(a.cancel_rate * 100)}%)</span>
                              </span>
                            : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.actions > 0
                            ? <>{a.actions.toLocaleString('en-IN')}
                                <span className="ml-1 text-xs text-gray-400">/{a.entities_touched} orders</span></>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.open_orders > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              {a.open_orders}
                              {a.stale_orders > 0 && (
                                <span title={`${a.stale_orders} sitting more than 3 days`}
                                  className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-xs font-medium text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />{a.stale_orders}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setOpenAgent(a)}
                            className="text-xs font-medium text-blue-600 hover:underline">View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {idle.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                    No activity in this range: {idle.map((a) => a.name || a.email).join(', ')}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="What the team spent time on" sub="Steps recorded in this range, by kind">
              {actionRows.length
                ? <CategoryBars data={actionRows} color={SERIES[2]} />
                : <div className="py-10 text-center text-sm text-gray-500">
                    No steps recorded yet.{trackingSince ? '' : ' Tracking begins with the next order action.'}
                  </div>}
            </ChartCard>

            <SectionCard title="Recent activity" description="Newest first — every tracked step, across the team.">
              {feed === null && <div className="p-4 text-sm text-gray-500">Loading…</div>}
              {feed?.length === 0 && (
                <EmptyState title="Nothing tracked yet"
                  description="Activity is recorded from the moment a staff member confirms, assigns, ships or edits an order." />
              )}
              {!!feed?.length && (
                <ul className="divide-y divide-gray-100">
                  {feed.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                      <Activity className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900">{r.actor_name || 'System'}</span>{' '}
                        <span className="text-gray-600">{actionLabel(r.action)}</span>{' '}
                        {r.entity_label && (
                          <Link to={`/orders/${r.entity_id}`} className="font-medium text-blue-600 hover:underline">
                            {r.entity_label}
                          </Link>
                        )}
                        {r.from_value && r.to_value && (
                          <span className="text-xs text-gray-500"> · {r.from_value} → {r.to_value}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {new Date(r.occurred_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {/* ── Agent drill-down ─────────────────────────────────────────── */}
      {openAgent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpenAgent(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{openAgent.name || openAgent.email}</h2>
                <p className="text-xs capitalize text-gray-500">{String(openAgent.role || '').replace(/_/g, ' ')}</p>
              </div>
              <button onClick={() => setOpenAgent(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Orders" value={openAgent.orders} />
                <StatTile label="Sales" value={fmtRupees(openAgent.gross)} />
                <StatTile label="Steps" value={openAgent.actions} />
              </div>

              {!!agentData?.by_action?.length && (
                <SectionCard title="Steps by kind">
                  <ul className="space-y-1 text-sm">
                    {agentData.by_action.map((r: any) => (
                      <li key={r.action} className="flex justify-between">
                        <span className="text-gray-600">{actionLabel(r.action)}</span>
                        <span className="tabular-nums font-medium">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              <SectionCard title="Orders credited in this range">
                {!agentData && <div className="text-sm text-gray-500">Loading…</div>}
                {agentData?.orders?.length === 0 && (
                  <div className="py-4 text-sm text-gray-500">No orders credited to this person in this range.</div>
                )}
                {!!agentData?.orders?.length && (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {agentData.orders.map((o: any) => (
                      <li key={o.id} className="flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <Link to={`/orders/${o.id}`} className="font-medium text-blue-600 hover:underline">{o.order_id}</Link>
                          <div className="truncate text-xs text-gray-500">{o.customer_name || '—'}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusChip status={o.order_status} />
                          <span className="tabular-nums">{fmtRupees(o.total)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <Link to={`/orders?assignedTo=${openAgent.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                See everything on their desk <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default SalesTeam;
