/**
 * CRM — Leads pipeline + Messages inbox, in the admin's standard table UI
 * (shadcn Card/Table/Badge/Select — same look as the original Leads page).
 *
 * LEADS = people to follow up (every storefront form creates one).
 * MESSAGES = the actual text shoppers typed (contact page, CMS contact block,
 * PDP "Enquire" modal) — an inbox you read, reply to and close. One submission
 * produces BOTH: the person in Leads, their message in Messages (cross-linked).
 *
 * Every submission carries first-party attribution (UTM campaign/source,
 * referrer, landing page, visitor, device) and — for product enquiries — the
 * exact product + the page the enquiry was made from. Shown in the detail
 * drawers; product/campaign appear as row badges.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, Users, RefreshCw, Search, Phone, Globe, MousePointerClick,
  MapPin, Monitor, Smartphone, Tablet, BadgeCheck, Megaphone, X, Trash2,
  Send, UserPlus, Download, Plus, Clock, CircleDot, CheckCircle2, Package,
  ExternalLink, MessageCircle, Calendar,
} from 'lucide-react';
import { contactsAPI, leadsAPI, cartsAPI } from '../services/api';
import { downloadCsv } from '../lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { localeDate, localeTime } from '../utils/date';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Dict = Record<string, any>;

const asRows = (r: any): Dict[] => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const fmtDate = (d: any): string => {
  const t = new Date(d);
  return isNaN(t.getTime()) ? '—' : localeDate(t);
};
const fmtTime = (d: any): string => {
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : localeTime(t, { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = (d: any): string => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '—');

function deviceFromUA(ua?: string): { label: string; Icon: React.ComponentType<any> } {
  const s = String(ua || '');
  if (/tablet|ipad/i.test(s)) return { label: 'Tablet', Icon: Tablet };
  if (/mobile|iphone|android/i.test(s)) return { label: 'Mobile', Icon: Smartphone };
  if (!s) return { label: 'Unknown device', Icon: Monitor };
  return { label: 'Desktop', Icon: Monitor };
}
function browserFromUA(ua?: string): string {
  const s = String(ua || '');
  if (/edg\//i.test(s)) return 'Edge';
  if (/chrome\//i.test(s)) return 'Chrome';
  if (/safari\//i.test(s) && !/chrome/i.test(s)) return 'Safari';
  if (/firefox\//i.test(s)) return 'Firefox';
  return '';
}

const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
const MSG_STATUSES = ['new', 'read', 'replied', 'closed'] as const;

const stageSelectClass = (status: string): string => {
  const classes: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-transparent',
    contacted: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-transparent',
    qualified: 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-transparent',
    converted: 'bg-green-100 text-green-800 hover:bg-green-200 border-transparent',
    lost: 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-transparent',
    read: 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-transparent',
    replied: 'bg-green-100 text-green-800 hover:bg-green-200 border-transparent',
    closed: 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent',
  };
  return classes[status] || '';
};

const metaOf = (row: Dict): Dict => row?.meta ?? row?.metadata ?? {};
const attrOf = (row: Dict): Dict => metaOf(row)?.attribution ?? {};
const campaignOf = (row: Dict): string => {
  const a = attrOf(row);
  return a.utm_campaign || a.utm_source || '';
};
/** Product an enquiry is about (PDP Enquire modal context). */
const productOf = (row: Dict): { name?: string; sku?: string; id?: string; brand?: string; url?: string; reason?: string } => {
  const m = metaOf(row);
  const name = row.product_interest || m.product_name;
  if (!name && !m.sku && !m.product_id) return {};
  return { name, sku: m.sku, id: m.product_id, brand: m.brand, url: m.url, reason: m.reason };
};

const leadName = (l: Dict) => l.fullName || l.name || l.email || l.phone || 'Unknown';
const leadPhone = (l: Dict) => l.mobileNumber || l.phone || '';

const openWhatsApp = (phone: string, name: string) => {
  if (!phone) return;
  const number = phone.replace(/\D/g, '');
  const text = `Hi ${name}, greetings from our team!`;
  window.open(`https://wa.me/91${number}?text=${encodeURIComponent(text)}`, '_blank');
};
const openCall = (phone: string) => { if (phone) window.open(`tel:${phone}`); };

/** Row badges shared by both tables: source · product · campaign · known customer. */
function RowBadges({ row }: { row: Dict }) {
  const p = productOf(row);
  return (
    <div className="flex gap-1 mt-2 flex-wrap items-center">
      {row.source && (
        <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0 h-4 rounded-sm">
          {row.source}
        </Badge>
      )}
      {p.name && (
        <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200 px-1.5 py-0 h-4 rounded-sm max-w-[220px] flex items-center gap-0.5">
          <Package className="w-3 h-3 shrink-0" /> <span className="truncate">{p.name}</span>
        </Badge>
      )}
      {campaignOf(row) && (
        <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 px-1.5 py-0 h-4 rounded-sm flex items-center gap-0.5">
          <Megaphone className="w-3 h-3" /> {campaignOf(row)}
        </Badge>
      )}
      {metaOf(row).customer_id && (
        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 px-1.5 py-0 h-4 rounded-sm flex items-center gap-0.5">
          <BadgeCheck className="w-3 h-3" /> Customer
        </Badge>
      )}
    </div>
  );
}

/** Call + WhatsApp quick actions next to the phone number (from the original UI). */
function ContactCell({ row }: { row: Dict }) {
  const phone = leadPhone(row);
  return (
    <div className="flex flex-col gap-1">
      {phone ? (
        <div className="flex items-center gap-2">
          <a href={`tel:${phone}`} className="text-sm font-medium hover:text-primary transition-colors">{phone}</a>
          <div className="flex gap-1">
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
              onClick={(e) => { e.stopPropagation(); openCall(phone); }}
            >
              <Phone className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
              onClick={(e) => { e.stopPropagation(); openWhatsApp(phone, leadName(row)); }}
            >
              <MessageCircle className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic">no phone</span>
      )}
      {row.email && (
        <span className="text-xs text-muted-foreground truncate max-w-[170px]" title={row.email}>{row.email}</span>
      )}
    </div>
  );
}

/** Attribution details — "where did this enquiry come from". */
function AttributionPanel({ row }: { row: Dict }) {
  const meta = metaOf(row);
  const a = attrOf(row);
  const dev = deviceFromUA(meta.user_agent);
  const browser = browserFromUA(meta.user_agent);
  const detail: { icon: React.ComponentType<any>; label: string; value?: string }[] = [
    { icon: Megaphone, label: 'Campaign', value: a.utm_campaign },
    { icon: Globe, label: 'Source / Medium', value: [a.utm_source, a.utm_medium].filter(Boolean).join(' / ') },
    { icon: MousePointerClick, label: 'Ad content / term', value: [a.utm_content, a.utm_term].filter(Boolean).join(' · ') },
    { icon: Globe, label: 'Referrer', value: a.referrer },
    { icon: MapPin, label: 'Page / landing', value: a.landing_page || meta.page || meta.url },
    { icon: Clock, label: 'Timezone', value: a.timezone },
    { icon: dev.Icon, label: 'Device', value: meta.user_agent ? `${dev.label}${browser ? ` · ${browser}` : ''}` : undefined },
    { icon: CircleDot, label: 'Visitor ID', value: a.visitorId },
  ].filter((r) => r.value);
  const clickId = ['gclid', 'fbclid', 'msclkid', 'ttclid', 'gbraid', 'wbraid'].find((k) => a[k]);
  return (
    <div className="border rounded-lg p-3 bg-muted/40">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Tracking &amp; source</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {row.source && <Badge variant="secondary" className="text-[10px]">{String(row.source)}</Badge>}
        {clickId && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">Paid click · {clickId}</Badge>}
        {metaOf(row).customer_id && (
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
            Known customer{metaOf(row).customer_name ? ` · ${metaOf(row).customer_name}` : ''}
          </Badge>
        )}
      </div>
      {detail.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attribution captured (direct visit or no analytics consent).</p>
      ) : (
        <div className="space-y-1.5">
          {detail.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <r.icon size={12} className="text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground w-28 shrink-0">{r.label}</span>
              <span className="font-medium break-all">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Which product + from where" card for product enquiries. */
function ProductEnquiryCard({ row }: { row: Dict }) {
  const p = productOf(row);
  if (!p.name && !p.sku) return null;
  return (
    <div className="border border-teal-200 rounded-lg p-3 bg-teal-50/50">
      <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Package size={12} /> Product enquiry
      </p>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">{p.name || p.sku}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[p.sku && `SKU ${p.sku}`, p.brand].filter(Boolean).join(' · ')}
            {p.reason === 'out_of_stock' && <span className="text-amber-600 font-semibold"> · asked to be notified (out of stock)</span>}
          </p>
        </div>
        {p.id && (
          <Link to={`/products/${p.id}/edit`} className="shrink-0 text-[11px] font-bold text-teal-700 hover:underline">
            Open product →
          </Link>
        )}
      </div>
      {p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 hover:underline break-all">
          <ExternalLink size={11} className="shrink-0" /> Enquired from: {p.url}
        </a>
      )}
    </div>
  );
}

/** Abandoned carts inside the CRM — filled carts with contact info ARE warm leads. */
const AbandonedCartsCrmPanel: React.FC = () => {
  const [carts, setCarts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    cartsAPI.listAdmin({ status: 'abandoned' })
      .then((data: any) => setCarts(asRows(data)))
      .catch(() => setCarts([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || carts.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="font-semibold text-foreground">
              🛒 {carts.length} abandoned cart{carts.length === 1 ? '' : 's'} waiting for follow-up
            </p>
            <p className="text-xs text-muted-foreground">Filled carts with contact details — the warmest leads you have.</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/orders/abandoned-carts">Open cart recovery</Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {carts.slice(0, 6).map((c: any) => (
            <Link
              key={c._id ?? c.id}
              to={`/orders/abandoned-carts/${c._id ?? c.id}`}
              className="border rounded-md bg-background px-3 py-2 hover:border-amber-400 transition-colors"
            >
              <p className="text-sm font-medium truncate">
                {c.user?.name || 'Guest'} · {(c.items?.length ?? 0)} item(s)
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {c.user?.phoneNumber || 'no phone'} · last active {c.lastActiveAt ? localeDate(c.lastActiveAt, undefined, 'en-IN') : '—'}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Detail drawers + add modal ───────────────────────────────────────────────

function MessageDrawer({ msg, onClose, onChanged, onAddLead }: {
  msg: Dict; onClose: () => void; onChanged: () => void; onAddLead: (m: Dict) => void;
}) {
  const [reply, setReply] = useState(msg.reply_message || '');
  const [busy, setBusy] = useState('');

  async function saveReply() {
    if (!reply.trim()) return;
    setBusy('reply');
    try { await contactsAPI.reply(msg.id, reply.trim()); onChanged(); } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm('Delete this message permanently?')) return;
    setBusy('del');
    try { await contactsAPI.delete(msg.id); onChanged(); onClose(); } finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-background shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold truncate">{msg.name || 'Anonymous'}</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(msg.created_at)}</p>
          </div>
          <Badge className={stageSelectClass(msg.status)}>{msg.status}</Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={16} /></Button>
        </div>

        <div className="p-5 space-y-4">
          <ContactCell row={msg} />

          <div className="border rounded-lg p-4">
            {msg.subject && <p className="text-sm font-bold mb-1.5">{msg.subject}</p>}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message || <span className="text-muted-foreground italic">No message body</span>}</p>
          </div>

          <ProductEnquiryCard row={msg} />
          <AttributionPanel row={msg} />

          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Reply (recorded on the thread)</p>
            {msg.replied_at && <p className="text-xs text-green-600 mb-1.5">Replied {fmtDateTime(msg.replied_at)}</p>}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Write your reply… (saved on the message; send it via your email/WhatsApp channel)"
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            />
            <Button size="sm" className="mt-2" onClick={saveReply} disabled={!reply.trim() || busy === 'reply'}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> {busy === 'reply' ? 'Saving…' : 'Save reply & mark replied'}
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-3 border-t">
            <Button size="sm" variant="outline" onClick={() => onAddLead(msg)}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add as lead
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={remove}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadDrawer({ lead, onClose, onChanged }: { lead: Dict; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(lead.notes || '');
  const [followUp, setFollowUp] = useState(lead.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : '');
  const [busy, setBusy] = useState('');
  const knownCustomerId = metaOf(lead).customer_id || lead.converted_customer_id;

  async function save(patch: Dict, key = 'save') {
    setBusy(key);
    try { await leadsAPI.update(lead.id, patch); onChanged(); } finally { setBusy(''); }
  }
  async function convert() {
    let customerId = knownCustomerId;
    if (!customerId) customerId = window.prompt('Customer ID to link this lead to (find it on the Customers page):') || '';
    if (!customerId) return;
    setBusy('convert');
    try { await leadsAPI.convert(lead.id, customerId); onChanged(); onClose(); } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm(`Delete lead "${leadName(lead)}" permanently?`)) return;
    setBusy('del');
    try { await leadsAPI.delete(lead.id); onChanged(); onClose(); } finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-background shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold truncate">{leadName(lead)}</p>
            <p className="text-xs text-muted-foreground">Created {fmtDateTime(lead.created_at)} · score {lead.score ?? 0}</p>
          </div>
          <Badge className={stageSelectClass(lead.status)}>{lead.status}</Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={16} /></Button>
        </div>

        <div className="p-5 space-y-4">
          <ContactCell row={lead} />

          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Stage</p>
            <div className="flex gap-1.5 flex-wrap">
              {LEAD_STAGES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={lead.status === s ? 'default' : 'outline'}
                  className="capitalize h-7 text-xs"
                  disabled={busy !== ''}
                  onClick={() => save({ status: s }, s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <ProductEnquiryCard row={lead} />
          <AttributionPanel row={lead} />

          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Message / notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            />
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Button size="sm" onClick={() => save({ notes })} disabled={busy !== ''}>
                {busy === 'save' ? 'Saving…' : 'Save notes'}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Follow-up
                <input
                  type="date"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onBlur={() => followUp && save({ follow_up_date: followUp }, 'fu')}
                  className="border rounded px-2 py-1.5 text-xs bg-background"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-3 border-t">
            {lead.status !== 'converted' && (
              <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50" onClick={convert} disabled={busy !== ''}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {knownCustomerId ? 'Convert (linked customer)' : 'Convert to customer'}
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={remove}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddLeadModal({ initial, onClose, onCreated }: { initial?: Dict; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name || '', email: initial?.email || '', phone: initial?.phone || '',
    source: initial?.source || 'manual', status: 'new',
    notes: initial ? [initial.subject, initial.message].filter(Boolean).join(' — ') : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function create() {
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) return;
    setBusy(true);
    try {
      await leadsAPI.create({ ...form, metadata: initial ? { ...metaOf(initial), contact_id: initial.id } : {} });
      onCreated();
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-background rounded-xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold">{initial ? 'Add message as lead' : 'Add new lead'}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X size={15} /></Button>
        </div>
        <div className="space-y-2.5">
          <Input placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <Input placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <Input placeholder="Source (e.g. manual, exhibition, referral)" value={form.source} onChange={(e) => set('source', e.target.value)} />
          <textarea
            className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            rows={3} placeholder="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)}
          />
        </div>
        <Button
          className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white"
          onClick={create}
          disabled={busy || (!form.name.trim() && !form.email.trim() && !form.phone.trim())}
        >
          {busy ? 'Creating…' : 'Create lead'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const Leads: React.FC = () => {
  const [tab, setTab] = useState<'leads' | 'messages'>('leads');
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Dict[]>([]);
  const [leads, setLeads] = useState<Dict[]>([]);
  const [msgStats, setMsgStats] = useState<Dict | null>(null);
  const [leadStats, setLeadStats] = useState<Dict | null>(null);

  const [filter, setFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [msgFilter, setMsgFilter] = useState('all');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const [openMsg, setOpenMsg] = useState<Dict | null>(null);
  const [openLead, setOpenLead] = useState<Dict | null>(null);
  const [addLead, setAddLead] = useState<{ initial?: Dict } | null>(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const [msgs, lds, ms, ls] = await Promise.all([
        contactsAPI.getAll({ limit: 300 }).catch(() => []),
        leadsAPI.getAll({ limit: 300 }).catch(() => []),
        contactsAPI.getStats().catch(() => null),
        leadsAPI.getStats().catch(() => null),
      ]);
      setMessages(asRows(msgs));
      setLeads(asRows(lds));
      setMsgStats(ms);
      setLeadStats(ls);
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchAll(); }, []);

  async function handleStageChange(id: string, status: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try { await leadsAPI.update(id, { status }); } catch { fetchAll(); }
  }
  async function handleMsgStatusChange(id: string, status: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    try { await contactsAPI.updateStatus(id, status as any); } catch { fetchAll(); }
  }
  async function openMessage(m: Dict) {
    setOpenMsg(m);
    if (!m.is_read) {
      try {
        const full = await contactsAPI.getById(m.id); // marks read server-side
        const fresh = (full as any)?.data ?? full ?? m;
        setOpenMsg(fresh);
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...fresh, is_read: true } : x)));
      } catch { /* keep the row we have */ }
    }
  }

  const q = filter.trim().toLowerCase();
  const rowMatches = (row: Dict, extra: string[] = []) =>
    !q
    || [leadName(row), leadPhone(row), row.email, row.source, row.notes, row.subject, row.message,
        campaignOf(row), productOf(row).name, productOf(row).sku, ...extra]
      .some((v) => String(v ?? '').toLowerCase().includes(q));

  const allSources = useMemo(
    () => [...new Set(leads.map((l) => l.source || 'unknown'))].sort(),
    [leads],
  );
  const leadCounts = useMemo(() => {
    const m: Dict = {};
    (leadStats?.byStatus || []).forEach((r: Dict) => { m[r.status] = r.count; });
    return m;
  }, [leadStats]);

  const filteredLeads = leads.filter((l) =>
    (stageFilter === 'all' || l.status === stageFilter)
    && (sourceFilter === 'all' || (l.source || 'unknown') === sourceFilter)
    && rowMatches(l));

  const filteredMessages = messages.filter((m) =>
    (msgFilter === 'all' || (msgFilter === 'unread' ? !m.is_read : m.status === msgFilter))
    && rowMatches(m));

  const handleSelectAll = (checked: boolean) =>
    setSelectedLeads(checked ? filteredLeads.map((l) => l.id) : []);
  const handleSelectRow = (id: string, checked: boolean) =>
    setSelectedLeads((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  function handleExport() {
    const rows = selectedLeads.length > 0 ? leads.filter((l) => selectedLeads.includes(l.id)) : filteredLeads;
    downloadCsv(`leads_export_${new Date().toISOString().split('T')[0]}.csv`, [
      { key: 'name', label: 'Name', format: (r: Dict) => leadName(r) },
      { key: 'phone', label: 'Phone', format: (r: Dict) => leadPhone(r) },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Stage' },
      { key: 'source', label: 'Source' },
      { key: 'product', label: 'Product', format: (r: Dict) => productOf(r).name || '' },
      { key: 'campaign', label: 'Campaign', format: (r: Dict) => campaignOf(r) },
      { key: 'notes', label: 'Message / notes' },
      { key: 'created_at', label: 'Date', format: (r: Dict) => fmtDateTime(r.created_at) },
    ] as any, rows as any);
  }

  const unread = msgStats?.unread ?? messages.filter((m) => !m.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Leads pipeline and storefront messages — {leadStats?.total ?? leads.length} leads
            ({leadStats?.last7d ?? 0} this week) · {msgStats?.total ?? messages.length} messages
            {unread > 0 ? <span className="text-blue-600 font-semibold"> · {unread} unread</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchAll} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setAddLead({})}>
            <Plus className="w-4 h-4 mr-2" /> Add New Lead
          </Button>
        </div>
      </div>

      <AbandonedCartsCrmPanel />

      <Card>
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="p-4 border-b bg-muted/40 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              {/* Tabs */}
              <div className="inline-flex rounded-md border bg-background overflow-hidden shrink-0">
                <button
                  onClick={() => setTab('leads')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${tab === 'leads' ? 'bg-red-600 text-white' : 'hover:bg-muted'}`}
                >
                  <Users className="w-4 h-4" /> Leads
                </button>
                <button
                  onClick={() => setTab('messages')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${tab === 'messages' ? 'bg-red-600 text-white' : 'hover:bg-muted'}`}
                >
                  <Inbox className="w-4 h-4" /> Messages
                  {unread > 0 && (
                    <span className={`text-[10px] font-black px-1.5 py-px rounded-full ${tab === 'messages' ? 'bg-white/25 text-white' : 'bg-blue-600 text-white'}`}>{unread}</span>
                  )}
                </button>
              </div>

              <div className="relative flex-1 md:flex-none w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={tab === 'leads' ? 'Search leads…' : 'Search messages…'}
                  className="pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>

              {tab === 'leads' ? (
                <>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Stages" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {LEAD_STAGES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}{leadCounts[s] ? ` (${leadCounts[s]})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="All Sources" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {allSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <Select value={msgFilter} onValueChange={setMsgFilter}>
                  <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Messages" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Messages</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    {MSG_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {tab === 'leads' && (
              <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                <Button
                  variant={selectedLeads.length > 0 ? 'default' : 'outline'}
                  onClick={handleExport}
                  className={selectedLeads.length > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' : ''}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {selectedLeads.length > 0 ? `Export (${selectedLeads.length})` : 'Export All'}
                </Button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {tab === 'leads' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length}
                        onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      />
                    </TableHead>
                    <TableHead>Lead Details</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Follow Up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id} className={selectedLeads.includes(lead.id) ? 'bg-muted/50' : ''}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={(checked) => handleSelectRow(lead.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{leadName(lead)}</span>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            <span>{fmtDate(lead.created_at)}</span>
                            <span>|</span>
                            <span>{fmtTime(lead.created_at)}</span>
                          </div>
                          <RowBadges row={lead} />
                        </div>
                      </TableCell>
                      <TableCell><ContactCell row={lead} /></TableCell>
                      <TableCell>
                        <Select value={lead.status} onValueChange={(val) => handleStageChange(lead.id, val)}>
                          <SelectTrigger className={`h-8 text-xs font-bold uppercase tracking-wide w-[140px] ${stageSelectClass(lead.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[...new Set([...LEAD_STAGES, lead.status].filter(Boolean))].map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">{String(s).replace(/_/g, ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {lead.follow_up_date ? (
                          <div className="text-xs flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-1 rounded-md inline-flex border border-orange-100">
                            <Clock className="w-3 h-3" /> {fmtDate(lead.follow_up_date)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No follow-up</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="hover:text-primary hover:bg-primary/10" onClick={() => setOpenLead(lead)}>
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Search className="w-8 h-8 opacity-20" />
                          <p>No leads found matching your filters.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((m) => (
                    <TableRow key={m.id} className={!m.is_read ? 'bg-blue-50/40' : ''}>
                      <TableCell>
                        <div className="flex items-start gap-2 max-w-[420px]">
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.is_read ? 'bg-transparent' : 'bg-blue-500'}`} />
                          <div className="flex flex-col min-w-0">
                            <span className={`text-sm truncate ${m.is_read ? 'font-medium' : 'font-bold'}`}>{m.name || m.email || 'Anonymous'}</span>
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {m.subject ? <span className="font-semibold text-foreground/70">{m.subject} — </span> : null}
                              {m.message || <span className="italic">no message body</span>}
                            </span>
                            <RowBadges row={m} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><ContactCell row={m} /></TableCell>
                      <TableCell>
                        <Select value={m.status} onValueChange={(val) => handleMsgStatusChange(m.id, val)}>
                          <SelectTrigger className={`h-8 text-xs font-bold uppercase tracking-wide w-[120px] ${stageSelectClass(m.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MSG_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> {fmtDate(m.created_at)} <span>|</span> {fmtTime(m.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="hover:text-primary hover:bg-primary/10" onClick={() => openMessage(m)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredMessages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Inbox className="w-8 h-8 opacity-20" />
                          <p>No messages yet — contact-form and product-enquiry messages land here.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {openMsg && (
        <MessageDrawer
          msg={openMsg}
          onClose={() => setOpenMsg(null)}
          onChanged={fetchAll}
          onAddLead={(m) => { setOpenMsg(null); setAddLead({ initial: m }); }}
        />
      )}
      {openLead && <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} onChanged={fetchAll} />}
      {addLead && <AddLeadModal initial={addLead.initial} onClose={() => setAddLead(null)} onCreated={fetchAll} />}
    </div>
  );
};

export default Leads;
