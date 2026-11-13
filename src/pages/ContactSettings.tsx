import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, ChevronDown, ChevronUp, Trash2, Send, Phone, RefreshCw, X, AlertCircle } from 'lucide-react';
import { contactsAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { localeDate, localeDateTime } from '../utils/date';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  status: 'new' | 'read' | 'replied' | 'closed';
  is_read: boolean;
  source?: string;
  reply_message?: string;
  replied_at?: string;
  created_at: string;
}

interface Stats { total: number; unread: number; new: number; replied: number; last7d: number }

type Filter = 'all' | 'unread' | Contact['status'];

const STATUS_STYLE: Record<Contact['status'], string> = {
  new: 'bg-blue-500/15 text-blue-700 border-blue-200 hover:bg-blue-500/25',
  read: 'bg-gray-500/15 text-gray-700 border-gray-200 hover:bg-gray-500/25',
  replied: 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25',
  closed: 'bg-gray-300/40 text-gray-500 border-gray-200',
};
const STATUSES: Contact['status'][] = ['new', 'read', 'replied', 'closed'];
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'new', label: 'New' },
  { id: 'read', label: 'Read' },
  { id: 'replied', label: 'Replied' },
  { id: 'closed', label: 'Closed' },
];
const PAGE = 50;

const errText = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

/**
 * Contact Submissions: what people sent through the website's contact forms (crm `/api/v2/crm/inbox`).
 *
 * On v2 a read never writes: opening a message marks it read with its own PATCH (`contactsAPI.markRead`),
 * and the message body and the reply are detail fields, so a row is read in full the first time it opens.
 * The header counts are the server's (`GET /crm/inbox/stats`), not the loaded page's.
 */
const ContactSettings: React.FC = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsFor = (f: Filter, offset: number) => ({
    limit: PAGE,
    offset,
    ...(f === 'unread' ? { is_read: false } : f === 'all' ? {} : { status: f }),
  });

  const loadStats = useCallback(async () => {
    try { setStats(await contactsAPI.getStats()); } catch { /* the counts are a nicety; the list still works */ }
  }, []);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const list: any = await contactsAPI.getAll(paramsFor(f, 0));
      const rows: Contact[] = Array.isArray(list) ? list : [];
      setContacts(rows);
      setTotal(typeof list?.total === 'number' ? list.total : null);
    } catch (err: any) {
      setLoadError(errText(err, 'The messages could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);
  useEffect(() => { void loadStats(); }, [loadStats]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const list: any = await contactsAPI.getAll(paramsFor(filter, contacts.length));
      const rows: Contact[] = Array.isArray(list) ? list : [];
      setContacts((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      if (typeof list?.total === 'number') setTotal(list.total);
    } catch (err: any) {
      setError(errText(err, 'More messages could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const patchRow = (id: string, patch: Partial<Contact>) =>
    setContacts((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const toggleExpand = async (c: Contact) => {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    setReplyText(c.reply_message || '');
    // The body and the reply are detail fields: read the message in full the first time it opens.
    if (c.message === undefined || (c.status === 'replied' && c.reply_message === undefined)) {
      setDetailLoading(c.id);
      try {
        const full: Contact = await contactsAPI.getById(c.id);
        if (full && typeof full === 'object') {
          patchRow(c.id, full);
          if (full.reply_message) setReplyText(full.reply_message);
        }
      } catch (err: any) {
        setError(errText(err, 'This message could not be opened.'));
      } finally {
        setDetailLoading(null);
      }
    }
    if (!c.is_read) {
      patchRow(c.id, { is_read: true });
      try {
        await contactsAPI.markRead(c.id);
        setStats((s) => (s ? { ...s, unread: Math.max(0, s.unread - 1) } : s));
      } catch {
        patchRow(c.id, { is_read: false });
      }
    }
  };

  const handleReply = async (c: Contact) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    setError(null);
    try {
      const updated = await contactsAPI.reply(c.id, replyText.trim());
      patchRow(c.id, { ...(updated && typeof updated === 'object' ? updated : {}), status: 'replied', is_read: true, reply_message: replyText.trim() });
      void loadStats();
    } catch (err: any) {
      setError(errText(err, 'The reply was not saved.'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (c: Contact, status: Contact['status']) => {
    const before = c.status;
    patchRow(c.id, { status });
    try {
      await contactsAPI.updateStatus(c.id, status);
      void loadStats();
    } catch (err: any) {
      patchRow(c.id, { status: before });
      setError(errText(err, 'The status was not changed.'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this message permanently? This cannot be undone.')) return;
    try {
      await contactsAPI.delete(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
      void loadStats();
    } catch (err: any) {
      setError(errText(err, 'The message was not deleted.'));
    }
  };

  const more = total != null && contacts.length < total;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="mb-3 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Contact Submissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages people sent through the contact forms on your website.</p>
      </div>

      {/* What to act on first: unread and unanswered, then the totals. */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" onClick={() => setFilter('unread')}
            className={`rounded-lg border p-3 text-left ${stats.unread > 0 ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
            <div className="text-xl font-semibold tabular-nums text-foreground">{stats.unread}</div>
            <div className="text-xs text-muted-foreground">Unread</div>
          </button>
          <button type="button" onClick={() => setFilter('new')} className="rounded-lg border border-gray-200 bg-white p-3 text-left">
            <div className="text-xl font-semibold tabular-nums text-foreground">{stats.new}</div>
            <div className="text-xs text-muted-foreground">New</div>
          </button>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xl font-semibold tabular-nums text-foreground">{stats.last7d}</div>
            <div className="text-xs text-muted-foreground">In the last 7 days</div>
          </div>
          <button type="button" onClick={() => setFilter('replied')} className="rounded-lg border border-gray-200 bg-white p-3 text-left">
            <div className="text-xl font-semibold tabular-nums text-foreground">{stats.replied}</div>
            <div className="text-xs text-muted-foreground">Replied, of {stats.total}</div>
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter messages">
        {FILTERS.map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? 'default' : 'outline'} className="h-7 text-xs"
            onClick={() => setFilter(f.id)} role="tab" aria-selected={filter === f.id}>
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load(filter)} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Try again</Button>
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
          <Mail className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            {filter === 'all' ? 'No messages yet. They appear here when someone uses a contact form on your website.' : 'No messages here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => {
            const expanded = expandedId === c.id;
            const mailto = c.email
              ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(`Re: ${c.subject || 'your message'}`)}${replyText.trim() && expanded ? `&body=${encodeURIComponent(replyText.trim())}` : ''}`
              : null;
            return (
              <div key={c.id} className={`rounded-lg border bg-white ${!c.is_read ? 'border-blue-300' : 'border-gray-200'}`}>
                <button type="button" onClick={() => void toggleExpand(c)} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={expanded}>
                  {!c.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`truncate text-sm ${!c.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{c.name}</p>
                      <Badge className={`py-0 text-[10px] capitalize ${STATUS_STYLE[c.status] ?? STATUS_STYLE.read}`}>{c.status}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.subject || c.message || 'Open to read the message'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{localeDate(c.created_at, undefined, 'en-IN')}</span>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>

                {expanded && (
                  <div className="space-y-3 border-t px-4 pb-4 pt-3">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" /> {c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" /> {c.phone}</a>}
                      {c.source && <span>From: {c.source.replace(/_/g, ' ')}</span>}
                    </div>
                    {c.subject && <p className="text-sm font-medium">{c.subject}</p>}
                    {detailLoading === c.id
                      ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Opening the message</p>
                      : <p className="whitespace-pre-wrap text-sm text-gray-700">{c.message || 'This message has no text.'}</p>}

                    {c.reply_message && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3">
                        <p className="mb-1 text-xs font-medium text-green-800">Replied {c.replied_at ? localeDateTime(c.replied_at, undefined, 'en-IN') : ''}</p>
                        <p className="whitespace-pre-wrap text-sm text-green-900">{c.reply_message}</p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Textarea
                        value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a reply" rows={3} className="text-sm"
                        aria-label="Reply"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Saving a reply records it here and marks the message replied. It is not sent to the customer:
                        send it by email{c.phone ? ' or phone' : ''} with the buttons below.
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {STATUSES.map((s) => (
                            <Button
                              key={s} size="sm" variant={c.status === s ? 'default' : 'outline'} className="h-7 px-2 text-[11px] capitalize"
                              onClick={() => void handleStatusChange(c, s)}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => void handleDelete(c.id)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                          {mailto && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                              <a href={mailto}><Mail className="mr-1 h-3 w-3" /> Email</a>
                            </Button>
                          )}
                          <Button size="sm" className="h-7 text-xs" onClick={() => void handleReply(c)} disabled={sendingReply || !replyText.trim()}>
                            {sendingReply ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                            Save reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {more && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Load more ({contacts.length} of {total})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactSettings;
