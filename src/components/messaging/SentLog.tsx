import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip, FilterChips, EmptyState, TableSkeleton, type ChipGroup, type Tone } from '@/components/erp';
import { SearchBox } from '@/components/sales/ListChrome';
import { formatDateTime } from '@/utils/date';
import {
  messagingAPI, dispatchStatusLabel, MSG_CHANNEL_LABEL, MSG_CHANNELS,
  type DispatchDetail, type DispatchFilter, type DispatchRow, type MsgCh,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * The Sent log of one channel (or every channel): the dispatch rows the comms
 * hub wrote, newest first, a keyset page at a time (`GET /comms/dispatches`,
 * contract §4.4). The recipient is masked by the server and no row carries a
 * message body; the detail drawer shows the status timeline the provider
 * reported, in its own words — "sent" is never upgraded to "delivered".
 */

const STATUS_TONE: Record<string, Tone> = {
  delivered: 'green', read: 'green', sent: 'blue', accepted: 'blue', queued: 'neutral', pending: 'neutral',
  failed: 'red', error: 'red', undelivered: 'red', bounced: 'red', refused: 'red', skipped: 'amber', deferred: 'amber',
};
const toneOf = (st: string | null): Tone => (st && STATUS_TONE[st.toLowerCase()]) || 'neutral';

/** The statuses a dispatch row can carry (comms dispatch states). */
const STATUS_OPTIONS = ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'deferred'];

const SentLog: React.FC<{
  /** Fixed channel; omit to let the reader pick. */
  channel?: MsgCh;
  /** Message keys and their admin-facing names (from the notifications list), for the filter and the rows. */
  messages?: Array<{ key: string; label: string }>;
  /** Only this message (e.g. `cart_recovery`); the message filter is then hidden. */
  fixedKey?: string;
}> = ({ channel, messages = [], fixedKey }) => {
  const [status, setStatus] = useState('');
  const [key, setKey] = useState('');
  const [chan, setChan] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const filter: DispatchFilter = useMemo(() => ({
    channel: channel ?? (chan || undefined), status: status || undefined, key: fixedKey ?? (key || undefined),
    from: from || undefined, to: to || undefined, q: q || undefined,
  }), [channel, chan, status, key, fixedKey, from, to, q]);

  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setFailure(null);
    try {
      const page = await messagingAPI.dispatches(filter);
      if (mine !== seq.current) return;
      setRows(page.items); setCursor(page.cursor);
    } catch (e: any) {
      if (mine !== seq.current) return;
      setRows([]); setCursor(null);
      setFailure(failureOf(e, 'Could not load the sent log.'));
    } finally { if (mine === seq.current) setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await messagingAPI.dispatches(filter, cursor);
      setRows((r) => [...r, ...page.items]); setCursor(page.cursor);
    } catch (e: any) {
      setFailure(failureOf(e, 'Could not load more of the sent log.'));
    } finally { setMore(false); }
  };

  const labelOf = useMemo(() => {
    const m = new Map(messages.map((x) => [x.key, x.label]));
    return (r: DispatchRow) => {
      const k = r.template_key || r.event || '';
      return m.get(k) || m.get(k.replace(/^commerce\./, '')) || (k ? k.replace(/^commerce\./, '').replace(/_/g, ' ') : 'Message');
    };
  }, [messages]);

  const groups: ChipGroup[] = [
    ...(!channel ? [{
      key: 'channel', label: 'Channel', value: chan, onChange: setChan,
      options: MSG_CHANNELS.map((c) => ({ value: c, label: MSG_CHANNEL_LABEL[c] })),
    }] : []),
    {
      key: 'status', label: 'Status', value: status, onChange: setStatus,
      help: 'What the provider last said about the message.',
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: dispatchStatusLabel(s) })),
    },
    ...(!fixedKey ? [{
      key: 'key', label: 'Message', value: key, onChange: setKey,
      options: messages.map((m) => ({ value: m.key, label: m.label })),
    }] : []),
  ];
  const filtered = !!(status || key || chan || from || to || q);
  const clearAll = () => { setStatus(''); setKey(''); setChan(''); setFrom(''); setTo(''); setSearch(''); };

  const [openId, setOpenId] = useState<string | null>(null);

  if (failure?.gap) {
    return <GapNotice what="The sent log reads the comms dispatch route, which this server does not serve yet." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search recipient" label="Search by recipient (masked)" className="w-full sm:w-64" />
        <FilterChips groups={groups} onClearAll={clearAll} />
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          <label className="flex items-center gap-1">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From day"
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs text-ink" />
          </label>
          <label className="flex items-center gap-1">to
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To day"
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs text-ink" />
          </label>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={load} disabled={loading} aria-label="Refresh the sent log">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {failure && <ErrorNotice message={failure.message} onRetry={load} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {loading && rows.length === 0 ? (
          <table className="w-full"><TableSkeleton rows={8} cols={5} /></table>
        ) : rows.length === 0 && !failure ? (
          <EmptyState icon={Inbox}
            title={filtered ? 'Nothing matches those filters' : 'Nothing sent yet'}
            description={filtered ? 'Clear a filter or widen the days.' : 'Messages appear here as soon as the store sends one.'}
            action={filtered ? <Button size="sm" variant="outline" onClick={clearAll}>Clear the filters</Button> : undefined} />
        ) : rows.length > 0 && (
          <table className="w-full min-w-[640px] text-sm" data-testid="sent-log">
            <thead className="border-b border-line bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2">When</th>
                <th scope="col" className="px-3 py-2">Message</th>
                {!channel && <th scope="col" className="px-3 py-2">Channel</th>}
                <th scope="col" className="px-3 py-2">To</th>
                <th scope="col" className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2"
                  onClick={() => setOpenId(r.id)}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{formatDateTime(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-left font-medium text-ink hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                      {labelOf(r)}
                    </button>
                    {r.is_automated === false && r.actor_name && <span className="ml-1.5 text-xs text-ink-mute">by {r.actor_name}</span>}
                  </td>
                  {!channel && <td className="px-3 py-2 text-ink-soft">{r.channel ? (MSG_CHANNEL_LABEL[r.channel as MsgCh] ?? r.channel) : '—'}</td>}
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.recipient || '—'}</td>
                  <td className="px-3 py-2">
                    <Chip tone={toneOf(r.status)}>{dispatchStatusLabel(r.status)}</Chip>
                    {(r.error || r.skipped_reason) && (
                      <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-ink-soft">{r.error || String(r.skipped_reason).replace(/_/g, ' ')}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={more}>
            {more && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Load older messages
          </Button>
        </div>
      )}

      <DispatchDrawer id={openId} onClose={() => setOpenId(null)} label={(r) => labelOf(r)} />
    </div>
  );
};

/** One dispatch: its facts and the status timeline the provider reported. */
const DispatchDrawer: React.FC<{ id: string | null; onClose: () => void; label: (r: DispatchRow) => string }> = ({ id, onClose, label }) => {
  const [d, setD] = useState<DispatchDetail | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setD(null); setFailure(null);
    messagingAPI.dispatch(id)
      .then((x) => { if (!cancelled) setD(x); })
      .catch((e) => { if (!cancelled) setFailure(failureOf(e, 'Could not load this message.')); });
    return () => { cancelled = true; };
  }, [id]);

  const facts: Array<[string, React.ReactNode]> = d ? [
    ['Channel', d.channel ? (MSG_CHANNEL_LABEL[d.channel as MsgCh] ?? d.channel) : '—'],
    ['To', <span className="font-mono text-xs">{d.recipient || '—'}</span>],
    ['Sent through', [d.provider, d.account_source === 'store' ? 'your own account' : d.account_source === 'platform' ? 'Growcord’s account' : d.account_source].filter(Boolean).join(' · ') || '—'],
    ['Template', d.template_key ? `${d.template_key}${d.template_version ? ` · version ${d.template_version}` : ''}` : '—'],
    ['Kind', [d.purpose_category, d.send_purpose].filter(Boolean).join(' · ').replace(/_/g, ' ') || '—'],
    ['Sent by', d.is_automated ? 'Automatic' : d.actor_name || '—'],
    ['Provider message id', d.provider_message_id ? <span className="break-all font-mono text-xs">{d.provider_message_id}</span> : '—'],
    ['Held until', d.deferred_until ? formatDateTime(d.deferred_until) : null],
    ['Order', d.order_id ? <Link className="text-brand underline" to={`/orders/${d.order_id}`}>Open the order</Link> : null],
  ] : [];

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d ? label(d) : 'Message'}</SheetTitle>
          <SheetDescription>{d ? formatDateTime(d.created_at) : 'Loading…'}</SheetDescription>
        </SheetHeader>
        {failure ? (
          <div className="mt-4">{failure.gap ? <GapNotice what="This server does not serve a single dispatch yet." /> : <ErrorNotice message={failure.message} />}</div>
        ) : !d ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={toneOf(d.status)}>{dispatchStatusLabel(d.status)}</Chip>
              {(d.error || d.skipped_reason) && <span className="text-sm text-bad-ink">{d.error || String(d.skipped_reason).replace(/_/g, ' ')}</span>}
            </div>
            <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-2 text-sm">
              {facts.filter(([, v]) => v !== null).map(([k, v]) => (
                <React.Fragment key={k}><dt className="text-ink-soft">{k}</dt><dd className="min-w-0 text-ink">{v}</dd></React.Fragment>
              ))}
            </dl>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">What happened</p>
              {d.timeline.length === 0 ? (
                <p className="text-sm text-ink-soft">The provider has not reported anything back for this message.</p>
              ) : (
                <ol className="space-y-2 border-l border-line pl-4">
                  {d.timeline.map((e, i) => (
                    <li key={e.id ?? i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ink-mute" aria-hidden />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Chip tone={toneOf(e.status)}>{dispatchStatusLabel(e.status)}</Chip>
                        <span className="tabular-nums text-xs text-ink-soft">{formatDateTime(e.occurred_at)}</span>
                      </div>
                      {(e.detail || e.provider_status) && (
                        <p className="mt-0.5 text-xs text-ink-soft">{[e.provider_status, e.detail].filter(Boolean).join(' · ')}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default SentLog;
