import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailX, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Chip, EmptyState, FilterChips, Pagination, TableSkeleton, type ChipGroup, type Tone } from '@/components/erp';
import { SearchBox } from '@/components/sales/ListChrome';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/utils/date';
import {
  messagingAPI, errText, fmtCount, MSG_CHANNEL_LABEL,
  type MsgCh, type SuppressionPage, type SuppressionRow,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * The addresses a channel no longer sends offers, cart reminders or review requests to: someone
 * who unsubscribed (an email link, the preferences page) or whose mailbox refused for good (a hard
 * bounce). Order messages, receipts and codes still reach them: the send gate checks a suppression
 * only for non-transactional sends.
 *
 * Reads the comms hub's suppression list (`GET /comms/suppressions?channel=`), which also lists the
 * rows that block every channel; a whole address typed in the search matches by its hash, so an
 * unsubscribe with no message on record is found too. A lift (`POST /suppressions/{id}/lift`,
 * `marketing.manage`) needs a reason: the server keeps it, with the person, in the audit trail.
 * Lane MENU-1 email.
 */

const PAGE = 25;

/** The server's reason words, in the merchant's words. An unknown word is shown as it is. */
const REASON: Record<string, { label: string; tone: Tone; help: string }> = {
  unsubscribed: { label: 'Unsubscribed', tone: 'amber', help: 'They asked to stop, from a link in a message or the preferences page.' },
  hard_bounce: { label: 'Bounced', tone: 'red', help: 'Their mail server said the address does not exist or refuses mail for good.' },
};
const reasonOf = (r: string | null) => (r && REASON[r]) || { label: r ? r.replace(/_/g, ' ') : 'Blocked', tone: 'neutral' as Tone, help: '' };

const looksWhole = (q: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim()) || q.replace(/\D/g, '').length >= 10;

const Suppressions: React.FC<{
  channel: MsgCh;
  /** Message keys and their admin-facing names, to name the message that caused a row. */
  messages?: Array<{ key: string; label: string }>;
  canWrite: boolean;
}> = ({ channel, messages = [], canWrite }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, reason]);

  const [data, setData] = useState<SuppressionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setFailure(null);
    try {
      const d = await messagingAPI.suppressions({ channel, reason: reason || undefined, search: q || undefined, offset: (page - 1) * PAGE, limit: PAGE });
      if (mine === seq.current) setData(d);
    } catch (e: any) {
      if (mine === seq.current) { setData(null); setFailure(failureOf(e, 'Could not load the blocked addresses.')); }
    } finally { if (mine === seq.current) setLoading(false); }
  }, [channel, reason, q, page]);
  useEffect(() => { load(); }, [load]);

  const labelOf = useMemo(() => {
    const m = new Map(messages.map((x) => [x.key, x.label]));
    return (k: string | null) => {
      if (!k) return null;
      return m.get(k) || m.get(k.replace(/^commerce\./, '')) || k.replace(/^commerce\./, '').replace(/_/g, ' ');
    };
  }, [messages]);

  const groups: ChipGroup[] = [{
    key: 'reason', label: 'Why', value: reason, onChange: setReason,
    help: 'Why the address gets no offers or reminders.',
    options: Object.entries(REASON).map(([value, r]) => ({ value, label: r.label })),
  }];
  const filtered = !!(q || reason);
  const clearAll = () => { setSearch(''); setReason(''); };
  const chan = MSG_CHANNEL_LABEL[channel];
  const noun = channel === 'email' ? 'address' : 'number';
  const nouns = channel === 'email' ? 'addresses' : 'numbers';

  // ── lift ──
  const [lifting, setLifting] = useState<SuppressionRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [liftErr, setLiftErr] = useState<string | null>(null);
  const openLift = (r: SuppressionRow) => { setLifting(r); setNote(''); setLiftErr(null); };
  const lift = async () => {
    if (!lifting || note.trim().length < 3) return;
    setBusy(true); setLiftErr(null);
    try {
      const res = await messagingAPI.liftSuppression(lifting.id, note.trim());
      toast({
        variant: res.consent_still_blocks ? 'destructive' : undefined,
        title: res.consent_still_blocks ? 'Unblocked, but they still said no to offers' : 'Unblocked',
        description: res.note || undefined,
      });
      setLifting(null);
      await load();
    } catch (e: any) {
      setLiftErr(errText(e, 'The server refused the change.'));
    } finally { setBusy(false); }
  };

  if (failure?.gap) {
    return <GapNotice what="The list of blocked addresses comes from the comms suppression route, which this server does not serve yet." />;
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const whole = looksWhole(q);

  return (
    <div className="space-y-3">
      <div role="status" className="rounded-lg border border-info bg-info-bg px-4 py-3 text-sm text-info-ink">
        <p className="font-semibold">
          {data && !filtered
            ? (total === 0 ? `Every ${noun} can get your ${chan} offers and reminders.` : `${total === 1 ? `1 ${noun} gets` : `${fmtCount(total)} ${nouns} get`} no ${chan} offers or reminders.`)
            : `Who gets no ${chan} offers or reminders`}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          Order messages, receipts and codes still reach them. Unblock someone only when they ask for it again; the reason you give is kept in the audit trail.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder={channel === 'email' ? 'Search an email address' : 'Search a number'}
          label={`Search the blocked ${nouns}`} className="w-full sm:w-72" />
        <FilterChips groups={groups} onClearAll={clearAll} />
        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={load} disabled={loading} aria-label="Refresh the list">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {search.trim().length > 0 && search.trim().length < 3 && (
        <p className="text-xs text-ink-soft">Type at least 3 characters. A whole {noun} also finds someone who unsubscribed with no message on record.</p>
      )}

      {failure && <ErrorNotice message={failure.message} onRetry={load} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {loading && !data ? (
          <table className="w-full"><TableSkeleton rows={6} cols={5} /></table>
        ) : rows.length === 0 && !failure ? (
          <EmptyState icon={filtered ? MailX : ShieldCheck}
            title={filtered ? (whole ? `This ${noun} is not blocked` : 'Nothing matches') : 'No one is blocked'}
            description={filtered
              ? (whole ? `It can get ${chan} offers and reminders, subject to the usual consent rules.` : `Clear a filter, or type the whole ${noun} to check one person.`)
              : `Nobody has unsubscribed from your ${chan} and no mailbox has refused it.`}
            action={filtered ? <Button size="sm" variant="outline" onClick={clearAll}>Clear the filters</Button> : undefined} />
        ) : rows.length > 0 && (
          <table className="w-full min-w-[680px] text-sm" data-testid={`suppressions-${channel}`}>
            <thead className="border-b border-line bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2">Since</th>
                <th scope="col" className="px-3 py-2">{channel === 'email' ? 'Address' : 'Number'}</th>
                <th scope="col" className="px-3 py-2">Why</th>
                <th scope="col" className="px-3 py-2">After</th>
                <th scope="col" className="px-3 py-2 text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-60' : undefined}>
              {rows.map((r) => {
                const why = reasonOf(r.reason);
                const msg = labelOf(r.event);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-soft">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-2.5">
                      {r.recipient
                        ? <span className="font-mono text-xs text-ink">{r.recipient}</span>
                        : <span className="text-xs text-ink-soft" title="Unsubscribed from a link, with no message on record.">{whole ? 'The one you searched' : 'Not on record'}</span>}
                      {r.customer_id && (
                        <Link to={`/customers/${r.customer_id}`} className="mt-0.5 block text-xs text-brand underline underline-offset-2">Open the customer</Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={why.tone}>{why.label}</Chip>
                        {r.channel === 'all' && <Chip tone="neutral">Every channel</Chip>}
                      </div>
                      {(r.detail || r.error || why.help) && (
                        <p className="mt-0.5 line-clamp-2 max-w-xs text-xs text-ink-soft">{r.error || r.detail || why.help}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{msg ?? <span className="text-xs text-ink-mute">No message</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => openLift(r)} disabled={!canWrite}
                        title={canWrite ? `Let this ${noun} get offers and reminders again` : 'Needs the marketing.manage permission'}>
                        Unblock
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE} total={total} onPage={setPage} />
      {data?.note && <p className="text-[11px] text-ink-soft">{data.note}</p>}

      <Dialog open={!!lifting} onOpenChange={(o) => { if (!o && !busy) setLifting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unblock {lifting?.recipient || `this ${noun}`}?</DialogTitle>
            <DialogDescription>
              It can get {chan} offers and reminders again. If the person also said no to offers, that choice still stands until they say yes again.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-ink">Why</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
              placeholder="For example: the customer asked by phone on 12 Nov to get offers again." />
            <span className="block text-[11px] text-ink-soft">Required. Kept in the audit trail with your name.</span>
          </label>
          {liftErr && <ErrorNotice message={liftErr} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setLifting(null)} disabled={busy}>Keep blocked</Button>
            <Button size="sm" onClick={lift} disabled={busy || note.trim().length < 3}
              title={note.trim().length < 3 ? 'Say why first' : undefined}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Unblock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppressions;
