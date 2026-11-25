/**
 * Help and support (TICKETS-1, owner 25 Nov 2026): the store's tickets to Growcord.
 *
 * Tabs Open, Closed, All are the server's own filter (GET /support/tickets?status=). Each row says
 * who wrote last, and "Growcord replied" stands out so an answer is never missed. The list is read
 * when the page opens, when the tab changes, after the person's own action, and when they come
 * back to this browser tab (at most every 30 seconds); never on a timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Loader2, Paperclip, Plus, RefreshCw } from 'lucide-react';
import { BlockSkeleton, Btn, Chip, EmptyState, Page, PageHeader, SectionCard, StatusChip, TabBar } from '@/components/erp';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { errorText, supportAPI } from '@/services/api';
import { formatDateTime } from '@/utils/date';
import { useRefetchOnReturn } from '@/lib/pageActive';
import {
  PRIORITY_TONE, STATUS_TONE, asTickets, priorityText, relatedText, statusText, type Ticket,
} from '@/lib/support';
import NewTicketDialog from '@/components/support/NewTicketDialog';

type Tab = 'open' | 'closed' | 'all';
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

const isLate = (t: Ticket) => !!t.due_at && !['resolved', 'closed'].includes(String(t.status)) && new Date(t.due_at).getTime() < Date.now();

/** Who wrote last, in words; a Growcord answer is a coloured chip. */
function LastBy({ t }: { t: Ticket }) {
  if (t.last_message_by === 'growcord') return <Chip tone="green">Growcord replied</Chip>;
  if (t.last_message_by === 'store') return <span className="text-sm text-gray-600">You</span>;
  if (t.last_message_by === 'system') return <span className="text-sm text-gray-500">Status changed</span>;
  return <span className="text-sm text-gray-400">None yet</span>;
}

export default function SupportTickets() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const canManage = hasPerm('support.manage');
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const ask = useRef(0);

  const load = useCallback(async (status: Tab, quiet = false) => {
    const n = (ask.current += 1);
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const d = await supportAPI.list(status);
      if (n !== ask.current) return;
      setRows(asTickets(d));
      setError(null);
    } catch (err) {
      if (n !== ask.current) return;
      setError(errorText(err, 'Your tickets could not be loaded.'));
    } finally {
      if (n === ask.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void load(tab); }, [tab, load]);
  useRefetchOnReturn(() => { void load(tab, true); });

  const empty = tab === 'open'
    ? 'No open tickets. Ask Growcord when you need help.'
    : tab === 'closed' ? 'No closed tickets yet.' : 'No tickets yet. Ask Growcord when you need help.';

  return (
    <Page>
      <PageHeader
        icon={LifeBuoy}
        title="Help and support"
        description="Ask Growcord for help. You get the answer here, and you can reply with photos, files, a voice note or a screenshot."
        actions={canManage ? (
          <Btn onClick={() => setCreating(true)}><Plus /> New ticket</Btn>
        ) : undefined}
      />

      <SectionCard
        flush
        title={<TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as Tab)} className="border-b-0" />}
        action={(
          <Btn variant="ghost" size="sm" onClick={() => load(tab, true)} disabled={loading || refreshing} title="Check for new answers">
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
          </Btn>
        )}
      >
        {error && (
          <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700" role="alert">{error}</p>
        )}
        {loading ? (
          <div className="p-5"><BlockSkeleton lines={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title={empty}
            action={canManage && tab !== 'closed' ? <Btn onClick={() => setCreating(true)}><Plus /> New ticket</Btn> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>About</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Needed by</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Last reply</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow
                    key={t.id} className="cursor-pointer" data-ticket-row
                    onClick={() => navigate(`/support/${t.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/support/${t.id}`); }}
                    tabIndex={0}
                  >
                    <TableCell className="whitespace-nowrap font-medium text-gray-900">{t.ticket_number}</TableCell>
                    <TableCell className="min-w-[220px] max-w-[360px]">
                      <span className="line-clamp-2 text-gray-900">{t.subject}</span>
                    </TableCell>
                    <TableCell><StatusChip status={t.priority} tone={PRIORITY_TONE[t.priority] ?? 'neutral'} label={priorityText(t.priority)} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-gray-700">
                      {relatedText(t.related_to)}
                      {t.related_ref && <span className="block text-xs text-gray-500">{t.related_ref}</span>}
                    </TableCell>
                    <TableCell><StatusChip status={t.status} tone={STATUS_TONE[t.status] ?? 'neutral'} label={statusText(t.status)} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {t.due_at ? (
                        <span className={isLate(t) ? 'font-medium text-red-700' : 'text-gray-700'}>
                          {formatDateTime(t.due_at)}{isLate(t) && <span className="block text-xs">Late</span>}
                        </span>
                      ) : <span className="text-gray-400">Not set</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-gray-700">{formatDateTime(t.last_message_at ?? t.created_at, '')}</TableCell>
                    <TableCell className="whitespace-nowrap"><LastBy t={t} /></TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-gray-700">
                      {t.file_count > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5 text-gray-400" />{t.file_count}</span> : <span className="text-gray-400">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {canManage && <NewTicketDialog open={creating} onOpenChange={setCreating} />}
    </Page>
  );
}
