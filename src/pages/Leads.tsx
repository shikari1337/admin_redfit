/**
 * CRM workspace — Messages inbox + Leads pipeline in one place.
 *
 * Messages = storefront contact submissions (`contacts` table). Both storefront
 * forms (the /contact page posting to POST /leads and the CMS contact-form
 * block posting to POST /contact/submit) now land here — the /leads route used
 * to silently DROP subject/message, so shopper messages never showed anywhere.
 *
 * Every submission carries first-party attribution captured client-side
 * (storefront lib/attribution.ts): UTM source/medium/campaign, click ids,
 * referrer, landing page, visitor/session, timezone — rendered in the detail
 * drawer so you can see which campaign produced each enquiry. Known customers
 * (matched by email against the global customer base) get a badge.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, Users, RefreshCw, Search, Mail, Phone, Globe, MousePointerClick,
  MapPin, Monitor, Smartphone, Tablet, BadgeCheck, Megaphone, X, Trash2,
  Send, UserPlus, Download, Plus, ChevronLeft, ChevronRight, Clock,
  CircleDot, TrendingUp, CheckCircle2, Package, ExternalLink,
} from 'lucide-react';
import { contactsAPI, leadsAPI, cartsAPI } from '../services/api';
import { downloadCsv } from '../lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Dict = Record<string, any>;

const asRows = (r: any): Dict[] => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const fmtDate = (d: any): string => {
  if (!d) return '—';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '—' : t.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const timeAgo = (d: any): string => {
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

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

const MSG_STATUS_TONE: Dict = {
  new: 'bg-blue-50 text-blue-700', read: 'bg-gray-100 text-gray-600',
  replied: 'bg-emerald-50 text-emerald-700', closed: 'bg-gray-200 text-gray-500',
};
const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
const LEAD_TONE: Dict = {
  new: 'bg-blue-50 text-blue-700', contacted: 'bg-amber-50 text-amber-700',
  qualified: 'bg-violet-50 text-violet-700', converted: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-gray-200 text-gray-500', closed: 'bg-gray-200 text-gray-500',
};
const tone = (map: Dict, key: string) => map[key] ?? 'bg-gray-100 text-gray-600';

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

/** "Which product + from where" card for product enquiries. */
function ProductEnquiryCard({ row }: { row: Dict }) {
  const p = productOf(row);
  if (!p.name && !p.sku) return null;
  return (
    <div className="border border-teal-200 rounded-xl p-3 bg-teal-50/50">
      <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Package size={12} /> Product enquiry
      </p>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold text-gray-900">{p.name || p.sku}</p>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
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
        <a href={p.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-[11.5px] text-blue-600 hover:underline break-all">
          <ExternalLink size={11} className="shrink-0" /> Enquired from: {p.url}
        </a>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone: cardTone = 'text-blue-600 bg-blue-50' }: {
  icon: React.ComponentType<any>; label: string; value: React.ReactNode; hint?: string; tone?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 min-w-[150px]">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cardTone}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[20px] font-extrabold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 mt-1 truncate">{label}{hint ? <span className="text-gray-400"> · {hint}</span> : null}</p>
      </div>
    </div>
  );
}

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded ${className}`}>{children}</span>;
}

/** Attribution details card — the "where did this enquiry come from" panel. */
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
    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/60">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Tracking &amp; source</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {row.source && <Chip className="bg-sky-50 text-sky-700">{String(row.source)}</Chip>}
        {clickId && <Chip className="bg-violet-50 text-violet-700">Paid click · {clickId}</Chip>}
        {meta.customer_id && (
          <Chip className="bg-emerald-50 text-emerald-700"><BadgeCheck size={11} /> Known customer{meta.customer_name ? ` · ${meta.customer_name}` : ''}</Chip>
        )}
      </div>
      {detail.length === 0 ? (
        <p className="text-xs text-gray-400">No attribution captured (direct visit or no analytics consent).</p>
      ) : (
        <div className="space-y-1.5">
          {detail.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <r.icon size={12} className="text-gray-400 mt-0.5 shrink-0" />
              <span className="text-gray-500 w-28 shrink-0">{r.label}</span>
              <span className="text-gray-800 font-medium break-all">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Abandoned carts inside the CRM — these ARE warm leads (a filled cart with
 * contact info). Carried over from the previous Leads page.
 */
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
                {c.user?.phoneNumber || 'no phone'} · last active {c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString('en-IN') : '—'}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Message drawer ───────────────────────────────────────────────────────────

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
  async function setStatus(status: 'new' | 'read' | 'replied' | 'closed') {
    setBusy(status);
    try { await contactsAPI.updateStatus(msg.id, status); onChanged(); } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm('Delete this message permanently?')) return;
    setBusy('del');
    try { await contactsAPI.delete(msg.id); onChanged(); onClose(); } finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-gray-900 truncate">{msg.name || 'Anonymous'}</p>
            <p className="text-[11.5px] text-gray-400">{fmtDate(msg.created_at)} · {timeAgo(msg.created_at)}</p>
          </div>
          <Chip className={tone(MSG_STATUS_TONE, msg.status)}>{msg.status}</Chip>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-3 text-[13px]">
            {msg.email && <a href={`mailto:${msg.email}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Mail size={13} /> {msg.email}</a>}
            {msg.phone && <a href={`tel:${msg.phone}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Phone size={13} /> {msg.phone}</a>}
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            {msg.subject && <p className="text-[13px] font-bold text-gray-900 mb-1.5">{msg.subject}</p>}
            <p className="text-[13.5px] text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.message || <span className="text-gray-400 italic">No message body</span>}</p>
          </div>

          <ProductEnquiryCard row={msg} />
          <AttributionPanel row={msg} />

          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Reply (recorded on the thread)</p>
            {msg.replied_at && (
              <p className="text-[11px] text-emerald-600 mb-1.5">Replied {fmtDate(msg.replied_at)}</p>
            )}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Write your reply… (saved on the message; send it via your email/WhatsApp channel)"
              className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={saveReply}
              disabled={!reply.trim() || busy === 'reply'}
              className="mt-2 flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg"
            >
              <Send size={12} /> {busy === 'reply' ? 'Saving…' : 'Save reply & mark replied'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100">
            <button onClick={() => onAddLead(msg)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg">
              <UserPlus size={12} /> Add as lead
            </button>
            {msg.status !== 'closed'
              ? <button onClick={() => setStatus('closed')} className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Close</button>
              : <button onClick={() => setStatus('read')} className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Reopen</button>}
            <div className="flex-1" />
            <button onClick={remove} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Lead drawer + add modal ──────────────────────────────────────────────────

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
    if (!customerId) {
      customerId = window.prompt('Customer ID to link this lead to (find it on the Customers page):') || '';
    }
    if (!customerId) return;
    setBusy('convert');
    try { await leadsAPI.convert(lead.id, customerId); onChanged(); onClose(); } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm(`Delete lead "${lead.name || lead.email || lead.phone}" permanently?`)) return;
    setBusy('del');
    try { await leadsAPI.delete(lead.id); onChanged(); onClose(); } finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-gray-900 truncate">{lead.name || lead.email || lead.phone || 'Lead'}</p>
            <p className="text-[11.5px] text-gray-400">Created {fmtDate(lead.created_at)} · score {lead.score ?? 0}</p>
          </div>
          <Chip className={tone(LEAD_TONE, lead.status)}>{lead.status}</Chip>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-3 text-[13px]">
            {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Mail size={13} /> {lead.email}</a>}
            {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Phone size={13} /> {lead.phone}</a>}
          </div>

          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stage</p>
            <div className="flex gap-1.5 flex-wrap">
              {LEAD_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => save({ status: s }, s)}
                  disabled={busy !== ''}
                  className={`px-2.5 py-1.5 text-[11.5px] font-bold rounded-lg capitalize transition-colors ${
                    lead.status === s ? tone(LEAD_TONE, s) + ' ring-1 ring-current' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <ProductEnquiryCard row={lead} />
          <AttributionPanel row={lead} />

          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Message / notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <button
                onClick={() => save({ notes })}
                disabled={busy !== ''}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg"
              >
                {busy === 'save' ? 'Saving…' : 'Save notes'}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Follow-up
                <input
                  type="date"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onBlur={() => followUp && save({ follow_up_date: followUp }, 'fu')}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100">
            {lead.status !== 'converted' && (
              <button onClick={convert} disabled={busy !== ''} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">
                <CheckCircle2 size={12} /> {knownCustomerId ? 'Convert (linked customer)' : 'Convert to customer'}
              </button>
            )}
            <div className="flex-1" />
            <button onClick={remove} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 size={12} /> Delete
            </button>
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
      await leadsAPI.create({
        ...form,
        metadata: initial ? { ...metaOf(initial), contact_id: initial.id } : {},
      });
      onCreated();
      onClose();
    } finally { setBusy(false); }
  }

  const field = 'w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-gray-900">{initial ? 'Add message as lead' : 'Add lead'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="space-y-2.5">
          <input className={field} placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <input className={field} placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <input className={field} placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <input className={field} placeholder="Source (e.g. manual, exhibition, referral)" value={form.source} onChange={(e) => set('source', e.target.value)} />
          <textarea className={field} rows={3} placeholder="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <button
          onClick={create}
          disabled={busy || (!form.name.trim() && !form.email.trim() && !form.phone.trim())}
          className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-lg"
        >
          {busy ? 'Creating…' : 'Create lead'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

const Leads: React.FC = () => {
  const [tab, setTab] = useState<'messages' | 'leads'>('messages');
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Dict[]>([]);
  const [leads, setLeads] = useState<Dict[]>([]);
  const [msgStats, setMsgStats] = useState<Dict | null>(null);
  const [leadStats, setLeadStats] = useState<Dict | null>(null);

  const [msgFilter, setMsgFilter] = useState<string>('all');
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

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
  useEffect(() => { setPage(0); }, [tab, msgFilter, leadFilter, sourceFilter, q]);

  const leadCounts = useMemo(() => {
    const m: Dict = {};
    (leadStats?.byStatus || []).forEach((r: Dict) => { m[r.status] = r.count; });
    return m;
  }, [leadStats]);
  const leadSources: Dict[] = leadStats?.bySource || [];

  const search = q.trim().toLowerCase();
  const match = (row: Dict, fields: string[]) =>
    !search
    || fields.some((f) => String(row[f] ?? '').toLowerCase().includes(search))
    || campaignOf(row).toLowerCase().includes(search)
    || String(productOf(row).name ?? '').toLowerCase().includes(search)
    || String(productOf(row).sku ?? '').toLowerCase().includes(search);

  const shownMessages = useMemo(() => messages.filter((m) => {
    if (msgFilter === 'unread' && m.is_read) return false;
    if (msgFilter !== 'all' && msgFilter !== 'unread' && m.status !== msgFilter) return false;
    return match(m, ['name', 'email', 'phone', 'subject', 'message', 'source']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [messages, msgFilter, search]);

  const shownLeads = useMemo(() => leads.filter((l) => {
    if (leadFilter !== 'all' && l.status !== leadFilter) return false;
    if (sourceFilter !== 'all' && (l.source || 'unknown') !== sourceFilter) return false;
    return match(l, ['name', 'email', 'phone', 'source', 'notes']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [leads, leadFilter, sourceFilter, search]);

  const activeRows = tab === 'messages' ? shownMessages : shownLeads;
  const pages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const pageRows = activeRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function openMessage(m: Dict) {
    setOpenMsg(m);
    if (!m.is_read) {
      try {
        const full = await contactsAPI.getById(m.id); // marks read server-side
        const fresh = full?.data ?? full ?? m;
        setOpenMsg(fresh);
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...fresh, is_read: true } : x)));
      } catch { /* keep the row we have */ }
    }
  }

  function exportLeadsCsv() {
    downloadCsv('leads.csv', [
      { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Stage' }, { key: 'source', label: 'Source' },
      { key: 'product', label: 'Product', format: (r: Dict) => productOf(r).name || '' },
      { key: 'campaign', label: 'Campaign', format: (r: Dict) => campaignOf(r) },
      { key: 'score', label: 'Score' }, { key: 'notes', label: 'Notes' },
      { key: 'created_at', label: 'Created', format: (r: Dict) => fmtDate(r.created_at) },
    ] as any, shownLeads as any);
  }

  const conversion = leadStats?.total ? Math.round(((leadStats.converted || 0) / leadStats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">CRM</h1>
          <p className="text-xs text-gray-500">Storefront messages, leads pipeline, and campaign attribution</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddLead({})} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            <Plus size={13} /> Add lead
          </button>
          <button onClick={exportLeadsCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">
            <Download size={13} /> Export leads
          </button>
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-lg" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 pt-4 flex gap-3 flex-wrap">
        <StatCard icon={Inbox} label="Unread messages" value={msgStats?.unread ?? '—'} tone="text-blue-600 bg-blue-50" />
        <StatCard icon={Mail} label="Messages" hint={`${msgStats?.last7d ?? 0} this week`} value={msgStats?.total ?? '—'} tone="text-sky-600 bg-sky-50" />
        <StatCard icon={Users} label="Leads" hint={`${leadStats?.last7d ?? 0} this week`} value={leadStats?.total ?? '—'} tone="text-violet-600 bg-violet-50" />
        <StatCard icon={TrendingUp} label="Converted" hint={`${conversion}% of leads`} value={leadStats?.converted ?? '—'} tone="text-emerald-600 bg-emerald-50" />
      </div>

      {/* Abandoned carts = warm leads */}
      <div className="px-6 pt-4">
        <AbandonedCartsCrmPanel />
      </div>

      {/* Tabs + filters */}
      <div className="px-6 pt-4 flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
          <button
            onClick={() => setTab('messages')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold ${tab === 'messages' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Inbox size={14} /> Messages
            {(msgStats?.unread ?? 0) > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-px rounded-full ${tab === 'messages' ? 'bg-white/25' : 'bg-blue-600 text-white'}`}>{msgStats?.unread}</span>
            )}
          </button>
          <button
            onClick={() => setTab('leads')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold ${tab === 'leads' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Users size={14} /> Leads
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl min-w-[220px]">
          <Search size={13} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'messages' ? 'Search messages…' : 'Search leads…'}
            className="text-[13px] w-full focus:outline-none"
          />
        </div>

        {tab === 'messages' ? (
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'unread', 'new', 'replied', 'closed'].map((f) => (
              <button
                key={f}
                onClick={() => setMsgFilter(f)}
                className={`px-2.5 py-1.5 text-[11.5px] font-bold rounded-lg capitalize ${msgFilter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {f}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 flex-wrap items-center">
            {['all', ...LEAD_STAGES].map((f) => (
              <button
                key={f}
                onClick={() => setLeadFilter(f)}
                className={`px-2.5 py-1.5 text-[11.5px] font-bold rounded-lg capitalize ${leadFilter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {f}{f !== 'all' && leadCounts[f] ? ` · ${leadCounts[f]}` : ''}
              </button>
            ))}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="text-[11.5px] font-semibold border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
            >
              <option value="all">All sources</option>
              {leadSources.map((s: Dict) => <option key={s.source} value={s.source}>{s.source} ({s.count})</option>)}
            </select>
          </div>
        )}
      </div>

      {/* List */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-500" /></div>
        ) : pageRows.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-16 text-center text-gray-400">
            <Inbox size={26} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm">{tab === 'messages' ? 'No messages match' : 'No leads match'}</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {tab === 'messages'
              ? pageRows.map((m) => (
                  <button key={m.id} onClick={() => openMessage(m)} className="w-full text-left px-4 py-3 hover:bg-blue-50/40 transition-colors flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.is_read ? 'bg-transparent' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[13.5px] truncate ${m.is_read ? 'font-semibold text-gray-700' : 'font-extrabold text-gray-900'}`}>{m.name || m.email || 'Anonymous'}</span>
                        <Chip className={tone(MSG_STATUS_TONE, m.status)}>{m.status}</Chip>
                        {m.source && <Chip className="bg-sky-50 text-sky-700">{m.source}</Chip>}
                        {productOf(m).name && <Chip className="bg-teal-50 text-teal-700 max-w-[220px]"><Package size={10} className="shrink-0" /> <span className="truncate">{productOf(m).name}</span></Chip>}
                        {campaignOf(m) && <Chip className="bg-violet-50 text-violet-700"><Megaphone size={10} /> {campaignOf(m)}</Chip>}
                        {metaOf(m).customer_id && <Chip className="bg-emerald-50 text-emerald-700"><BadgeCheck size={10} /> customer</Chip>}
                      </div>
                      <p className="text-[12.5px] text-gray-500 truncate mt-0.5">
                        {m.subject ? <span className="font-semibold text-gray-600">{m.subject} — </span> : null}
                        {m.message || <span className="italic text-gray-400">no message body</span>}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0 mt-0.5">{timeAgo(m.created_at)}</span>
                  </button>
                ))
              : pageRows.map((l) => (
                  <button key={l.id} onClick={() => setOpenLead(l)} className="w-full text-left px-4 py-3 hover:bg-violet-50/40 transition-colors flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-bold text-gray-900 truncate">{l.name || l.email || l.phone || 'Lead'}</span>
                        <Chip className={tone(LEAD_TONE, l.status)}>{l.status}</Chip>
                        {l.source && <Chip className="bg-sky-50 text-sky-700">{l.source}</Chip>}
                        {productOf(l).name && <Chip className="bg-teal-50 text-teal-700 max-w-[220px]"><Package size={10} className="shrink-0" /> <span className="truncate">{productOf(l).name}</span></Chip>}
                        {campaignOf(l) && <Chip className="bg-violet-50 text-violet-700"><Megaphone size={10} /> {campaignOf(l)}</Chip>}
                        {(l.score ?? 0) > 0 && <Chip className="bg-amber-50 text-amber-700">score {l.score}</Chip>}
                      </div>
                      <p className="text-[12.5px] text-gray-500 truncate mt-0.5">
                        {[l.email, l.phone].filter(Boolean).join(' · ')}
                        {l.notes ? <span className="text-gray-400"> — {l.notes}</span> : null}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-gray-400 block">{timeAgo(l.created_at)}</span>
                      {l.follow_up_date && <span className="text-[10.5px] text-amber-600 font-semibold flex items-center gap-1 justify-end mt-0.5"><Clock size={10} /> {String(l.follow_up_date).slice(0, 10)}</span>}
                    </div>
                  </button>
                ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span className="text-xs text-gray-500">Page {page + 1} of {pages} · {activeRows.length} rows</span>
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>

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
