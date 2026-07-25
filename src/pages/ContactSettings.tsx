import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, ChevronDown, ChevronUp, Trash2, Send, Phone } from 'lucide-react';
import { contactsAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'closed';
  is_read: boolean;
  reply_message?: string;
  replied_at?: string;
  created_at: string;
}

const STATUS_STYLE: Record<Contact['status'], string> = {
  new: 'bg-blue-500/15 text-blue-700 border-blue-200 hover:bg-blue-500/25',
  read: 'bg-gray-500/15 text-gray-700 border-gray-200 hover:bg-gray-500/25',
  replied: 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25',
  closed: 'bg-gray-300/40 text-gray-500 border-gray-200',
};
const STATUS_TABS: Array<'all' | Contact['status']> = ['all', 'new', 'read', 'replied', 'closed'];

const ContactSettings: React.FC = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | Contact['status']>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (status: 'all' | Contact['status']) => {
    setLoading(true);
    try {
      const list = await contactsAPI.getAll(status === 'all' ? {} : { status });
      setContacts(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load contact submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(statusFilter); }, [statusFilter]);

  const toggleExpand = async (c: Contact) => {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    setReplyText(c.reply_message || '');
    if (!c.is_read) {
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, is_read: true } : x));
      // GET /:id already marks it read server-side; fetching also refreshes full detail.
      try {
        const full = await contactsAPI.getById(c.id);
        setContacts(prev => prev.map(x => x.id === c.id ? { ...x, ...full } : x));
      } catch { /* non-fatal */ }
    }
  };

  const handleReply = async (c: Contact) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    setError(null);
    try {
      const updated = await contactsAPI.reply(c.id, replyText.trim());
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (c: Contact, status: Contact['status']) => {
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, status } : x));
    try {
      await contactsAPI.updateStatus(c.id, status);
    } catch {
      setError('Failed to update status');
      load(statusFilter);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this submission permanently?')) return;
    try {
      await contactsAPI.delete(id);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch {
      setError('Failed to delete submission');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Contact Submissions</h1>
        <p className="text-sm text-muted-foreground mt-1">Messages customers sent through the storefront's contact form.</p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex gap-1">
        {STATUS_TABS.map(s => (
          <Button
            key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} className="h-7 text-xs capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <Mail className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No submissions{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} className={`border rounded-lg bg-white ${!c.is_read ? 'border-blue-300' : 'border-gray-200'}`}>
                <button type="button" onClick={() => toggleExpand(c)} className="w-full flex items-center gap-3 p-3 text-left">
                  {!c.is_read && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${!c.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{c.name}</p>
                      <Badge className={`text-[10px] py-0 ${STATUS_STYLE[c.status]}`}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.subject || c.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                  {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t pt-3">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                    </div>
                    {c.subject && <p className="text-sm font-medium">{c.subject}</p>}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.message}</p>

                    {c.reply_message && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-xs font-medium text-green-800 mb-1">Replied {c.replied_at ? new Date(c.replied_at).toLocaleString('en-IN') : ''}</p>
                        <p className="text-sm text-green-900 whitespace-pre-wrap">{c.reply_message}</p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Textarea
                        value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder="Write a reply…" rows={3} className="text-sm"
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {(['new', 'read', 'replied', 'closed'] as const).map(s => (
                            <Button
                              key={s} size="sm" variant={c.status === s ? 'default' : 'outline'} className="h-6 text-[10px] px-2 capitalize"
                              onClick={() => handleStatusChange(c, s)}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleReply(c)} disabled={sendingReply || !replyText.trim()}>
                            {sendingReply ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                            Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <p className="text-xs text-yellow-800">
          <strong>Note:</strong> "Reply" saves your response here for the record — it doesn't currently email the customer automatically.
        </p>
      </div>
    </div>
  );
};

export default ContactSettings;
