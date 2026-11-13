/**
 * CRM: the lead journal and the storefront inbox, in the admin's standard table UI.
 *
 * LEADS = people to follow up (every storefront form creates one; staff add the rest).
 * MESSAGES = the text shoppers typed (contact page, CMS contact block, PDP "Enquire"): an
 * inbox you read, reply to and close. One submission produces BOTH, cross-linked.
 *
 * On v2 (growcord-rs `apps/crm`): the lists are pages of the `leads` and `inbox` resources
 * (`/api/v2/crm/leads|inbox`, at most 200 a page), so this screen pages them and filters stage and
 * source on the server. Notes, the form's metadata and a message's attribution are on the RECORD
 * only, so a drawer always reads the record before it edits (editing the list row used to overwrite
 * the stored enquiry). A read never marks a message read: opening one sends `PATCH {is_read}`.
 * The numbers come from `/leads/stats`, `/inbox/stats` and `/leads/follow-ups`, never from the
 * rows that happen to be loaded. Deals, tasks and the contact book live in the CRM app
 * (`productUrl('crm')`), which reads the party register.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, Users, RefreshCw, Search, Phone, Globe, MousePointerClick,
  MapPin, Monitor, Smartphone, Tablet, BadgeCheck, Megaphone, X, Trash2,
  Send, UserPlus, Download, Plus, Clock, CircleDot, CheckCircle2, Package,
  ExternalLink, MessageCircle, Calendar, Mail, MessageSquare, Workflow,
  Plug, ArrowUpRight, ShoppingCart, AlertTriangle, LayoutGrid, ListChecks, Contact, CalendarCheck,
} from 'lucide-react';
import { api, contactsAPI, leadsAPI, cartsAPI, smsConfigAPI, errorText } from '../services/api';
import { downloadCsv } from '../lib/csv';
import { productUrl } from '../lib/menu';
import { isUuid } from '../lib/uuid';
import { useCountries } from '../lib/v2/reference';
import { useAuth } from '../contexts/AuthContext';
import PhoneInput, { DEFAULT_DIAL } from '../components/PhoneInput';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { localeDate, localeTime, isoDate, fromStoreDateTimeInput } from '../utils/date';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Helpers

type Dict = Record<string, any>;

/** Rows per page asked of the server (the resources serve at most 200). */
const PAGE_SIZE = 100;
/** The follow-up queue is bounded on the server (`leads_due_for_follow_up`). */
const FOLLOW_UP_CAP = 500;

const asRows = (r: any): Dict[] => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const totalOf = (r: any): number | null => (typeof r?.total === 'number' ? r.total : null);
const recordOf = (r: any, fallback: Dict): Dict => {
  const v = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : r;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
};
const fmtDate = (d: any): string => {
  if (!d) return '-';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '-' : localeDate(t);
};
const fmtTime = (d: any): string => {
  if (!d) return '';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : localeTime(t, { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = (d: any): string => (d ? `${fmtDate(d)} ${fmtTime(d)}`.trim() : '-');

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

/** The lead journal's stages and the inbox's statuses: the server's own lists (`resources::LEADS|INBOX`). */
const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
const MSG_STATUSES = ['new', 'read', 'replied', 'closed'] as const;
const label = (s: string) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

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

const isDone = (status?: string) => status === 'converted' || status === 'lost' || status === 'closed';
const isOverdue = (l: Dict) => !!l.follow_up_date && !isDone(l.status) && new Date(l.follow_up_date).getTime() <= Date.now();

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
/** The customer a lead already is, when the form knew (a signed-in shopper) or a convert recorded it. */
const knownCustomerOf = (l: Dict): string => metaOf(l).customer_id || l.converted_customer_id || '';
const responseData = (value: any): any => value?.data?.data ?? value?.data ?? value ?? {};

/**
 * A WhatsApp chat link. v2 stores a phone in international form (the intake and the staff write
 * both normalise it through the reference registry), so the digits already carry the country.
 */
const waHref = (phone: string, name: string): string => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hi ${name},`)}` : '';
};

const scrollToWorkspace = () => document.getElementById('crm-workspace')?.scrollIntoView({ behavior: 'smooth' });

/** A person who can handle a lead (`GET /crm/staff`). */
type StaffLite = { id: string; name: string | null; role: string | null };
/** The Select value for "nobody" (Radix forbids an empty item value). */
const UNASSIGNED = '__none__';
const staffName = (staff: StaffLite[], id?: string | null, meId?: string): string => {
  if (!id) return '';
  if (meId && id === meId) return 'You';
  return staff.find((s) => s.id === id)?.name || 'Staff member';
};

/** Row badges shared by both tables: source, product, campaign, known customer. */
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

/** Call and WhatsApp quick actions next to the phone number. */
function ContactCell({ row }: { row: Dict }) {
  const phone = leadPhone(row);
  const wa = waHref(phone, leadName(row));
  return (
    <div className="flex flex-col gap-1">
      {phone ? (
        <div className="flex items-center gap-2">
          <a href={`tel:${phone}`} className="text-sm font-medium hover:text-primary transition-colors whitespace-nowrap">{phone}</a>
          <div className="flex gap-1">
            <a
              href={`tel:${phone}`}
              title={`Call ${leadName(row)}`}
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 inline-flex items-center justify-center"
            >
              <Phone className="w-3 h-3" />
            </a>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                title={`WhatsApp ${leadName(row)}`}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-6 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 inline-flex items-center justify-center"
              >
                <MessageCircle className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic">No phone</span>
      )}
      {row.email && (
        <div className="flex items-center gap-1">
          <a href={`mailto:${row.email}`} className="text-xs text-muted-foreground truncate max-w-[170px] hover:text-primary" title={`Email ${row.email}`}>{row.email}</a>
          <a href={`mailto:${row.email}`} title={`Email ${leadName(row)}`} className="text-muted-foreground hover:text-primary"><Mail className="h-3 w-3" /></a>
        </div>
      )}
    </div>
  );
}

type IntegrationHealth = {
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  connectedServices: number;
  loading: boolean;
};

/** What to act on now: each tile opens the list that holds the work. */
function ActionQueue({ followUps, unread, fresh, carts, loading, onDue, onUnread, onFresh }: {
  followUps: number; unread: number; fresh: number; carts: number | null; loading: boolean;
  onDue: () => void; onUnread: () => void; onFresh: () => void;
}) {
  const shown = (n: number, cap?: number) => (loading ? '...' : cap && n >= cap ? `${cap}+` : String(n));
  const tile = 'flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors';
  return (
    <section aria-label="To do now" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button onClick={onDue} className={`${tile} ${followUps ? 'border-amber-200 bg-amber-50 hover:border-amber-300' : 'bg-background hover:bg-muted/50'}`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Clock className="h-3.5 w-3.5" /> Follow-ups due</span>
        <span className="mt-1 text-2xl font-black tracking-tight">{shown(followUps, FOLLOW_UP_CAP)}</span>
        <span className="text-[11px] text-muted-foreground">Open leads whose date has come</span>
      </button>
      <button onClick={onUnread} className={`${tile} ${unread ? 'border-blue-200 bg-blue-50 hover:border-blue-300' : 'bg-background hover:bg-muted/50'}`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-900"><Inbox className="h-3.5 w-3.5" /> Unread messages</span>
        <span className="mt-1 text-2xl font-black tracking-tight">{shown(unread)}</span>
        <span className="text-[11px] text-muted-foreground">From the contact and enquiry forms</span>
      </button>
      <button onClick={onFresh} className={`${tile} ${fresh ? 'border-sky-200 bg-sky-50 hover:border-sky-300' : 'bg-background hover:bg-muted/50'}`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-900"><UserPlus className="h-3.5 w-3.5" /> New, not contacted</span>
        <span className="mt-1 text-2xl font-black tracking-tight">{shown(fresh)}</span>
        <span className="text-[11px] text-muted-foreground">Leads still at the first stage</span>
      </button>
      <Link to="/orders/abandoned-carts" className={`${tile} ${carts ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300' : 'bg-background hover:bg-muted/50'}`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900"><ShoppingCart className="h-3.5 w-3.5" /> Abandoned carts</span>
        <span className="mt-1 text-2xl font-black tracking-tight">{carts === null ? '-' : carts}</span>
        <span className="text-[11px] text-muted-foreground">Filled carts with contact details</span>
      </Link>
    </section>
  );
}

/** The numbers: stages from the server's counts (never the loaded page), sources, channels, the CRM app. */
function PipelineNumbers({ stats, loading, integration }: { stats: Dict | null; loading: boolean; integration: IntegrationHealth }) {
  const byStatus: Dict[] = asRows(stats?.by_status ?? stats?.byStatus);
  const bySource: Dict[] = asRows(stats?.by_source ?? stats?.bySource);
  const count = (s: string) => Number(byStatus.find((r) => r.status === s)?.count ?? 0);
  const converted = count('converted');
  const lost = count('lost');
  const closed = converted + lost;
  const winRate = closed ? `${Math.round((converted / closed) * 100)}%` : '-';
  const max = Math.max(1, ...LEAD_STAGES.map(count));
  const palette: Record<string, string> = { new: 'bg-sky-500', contacted: 'bg-amber-500', qualified: 'bg-violet-500', converted: 'bg-emerald-500', lost: 'bg-slate-400' };
  const channelCards = [
    { label: 'WhatsApp', detail: integration.whatsapp ? 'Ready' : 'Set up', ready: integration.whatsapp, icon: MessageCircle, to: '/messaging/whatsapp' },
    { label: 'Email', detail: integration.email ? 'Ready' : 'Set up', ready: integration.email, icon: Mail, to: '/messaging/email' },
    { label: 'SMS', detail: integration.sms ? 'Ready' : 'Set up', ready: integration.sms, icon: MessageSquare, to: '/messaging/sms' },
  ];
  const crmLinks = [
    { label: 'Today', icon: CalendarCheck, href: productUrl('crm', '/today') },
    { label: 'Deals', icon: LayoutGrid, href: productUrl('crm', '/deals') },
    { label: 'Tasks', icon: ListChecks, href: productUrl('crm', '/tasks') },
    { label: 'Contacts', icon: Contact, href: productUrl('crm', '/contacts') },
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pipeline</p>
              <h2 className="mt-1 text-lg font-bold">Leads by stage</h2>
            </div>
            <Link to="/panel/marketing/automation" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <Workflow className="h-3.5 w-3.5" /> Automate follow-ups
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:max-w-md">
            <div className="rounded-lg bg-muted/50 px-2 py-2"><div className="text-lg font-black">{loading ? '...' : Number(stats?.total ?? 0)}</div><div className="text-[11px] text-muted-foreground">All leads</div></div>
            <div className="rounded-lg bg-muted/50 px-2 py-2"><div className="text-lg font-black">{loading ? '...' : Number(stats?.last7d ?? 0)}</div><div className="text-[11px] text-muted-foreground">This week</div></div>
            <div className="rounded-lg bg-muted/50 px-2 py-2"><div className="text-lg font-black">{loading ? '...' : winRate}</div><div className="text-[11px] text-muted-foreground">Won of closed</div></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {LEAD_STAGES.map((stage) => {
              const value = count(stage);
              return (
                <div key={stage} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-bold">{label(stage)}</span><span className="text-sm font-black">{loading ? '' : value}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${palette[stage]}`} style={{ width: `${Math.max(4, Math.round((value / max) * 100))}%` }} /></div>
                </div>
              );
            })}
          </div>
          {bySource.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Top sources</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {bySource.map((s) => (
                  <span key={String(s.source)} className="rounded-full border bg-background px-2 py-0.5 text-xs">
                    {s.source || 'unknown'} <span className="font-bold">{Number(s.count ?? 0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="border-emerald-100 bg-emerald-50/35">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-emerald-700" /><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Channels for replies</p></div>
            <div className="mt-3 grid gap-2">
              {channelCards.map(({ label: l, detail, ready, icon: Icon, to }) => (
                <Link key={l} to={to} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-background/80 px-3 py-2 transition-colors hover:border-emerald-300">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-emerald-700" />{l}</span>
                  <span className={`text-xs font-bold ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>{integration.loading ? 'Checking' : detail}</span>
                </Link>
              ))}
            </div>
            <Link to="/panel/marketing/connections" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline">
              {integration.connectedServices} connected analytics and ads services <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">CRM app</p>
            <p className="mt-1 text-sm text-muted-foreground">Deals, tasks and the contact book, one row per person.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {crmLinks.map(({ label: l, icon: Icon, href }) => (
                <a key={l} href={href} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary">
                  <Icon className="h-4 w-4" /> {l}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/** Attribution details: where did this enquiry come from. */
function AttributionPanel({ row }: { row: Dict }) {
  const meta = metaOf(row);
  const a = attrOf(row);
  const dev = deviceFromUA(meta.user_agent);
  const browser = browserFromUA(meta.user_agent);
  const detail: { icon: React.ComponentType<any>; label: string; value?: string }[] = [
    { icon: Megaphone, label: 'Campaign', value: a.utm_campaign },
    { icon: Globe, label: 'Source, medium', value: [a.utm_source, a.utm_medium].filter(Boolean).join(', ') },
    { icon: MousePointerClick, label: 'Ad content, term', value: [a.utm_content, a.utm_term].filter(Boolean).join(', ') },
    { icon: Globe, label: 'Referrer', value: a.referrer },
    { icon: MapPin, label: 'Page', value: a.landing_page || meta.page || meta.url },
    { icon: Clock, label: 'Timezone', value: a.timezone },
    { icon: dev.Icon, label: 'Device', value: meta.user_agent ? `${dev.label}${browser ? `, ${browser}` : ''}` : undefined },
    { icon: CircleDot, label: 'Visitor ID', value: a.visitorId ?? a.visitor_id },
  ].filter((r) => r.value);
  const clickId = ['gclid', 'fbclid', 'msclkid', 'ttclid', 'gbraid', 'wbraid'].find((k) => a[k]);
  return (
    <div className="border rounded-lg p-3 bg-muted/40">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Tracking and source</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {row.source && <Badge variant="secondary" className="text-[10px]">{String(row.source)}</Badge>}
        {clickId && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">Paid click: {clickId}</Badge>}
        {meta.customer_id && (
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
            Known customer{meta.customer_name ? `: ${meta.customer_name}` : ''}
          </Badge>
        )}
      </div>
      {detail.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attribution captured (a direct visit, or no analytics consent).</p>
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

/** Which product, and from where, for product enquiries. */
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
            {[p.sku && `SKU ${p.sku}`, p.brand].filter(Boolean).join(', ')}
            {p.reason === 'out_of_stock' && <span className="text-amber-600 font-semibold"> Asked to be told when it is back in stock.</span>}
          </p>
        </div>
        {p.id && (
          <Link to={`/products/${p.id}/edit`} className="shrink-0 text-[11px] font-bold text-teal-700 hover:underline">
            Open product
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

/** Abandoned carts inside the CRM: filled carts with contact details are warm leads. */
function AbandonedCartsStrip({ carts, total }: { carts: Dict[]; total: number | null }) {
  if (carts.length === 0) return null;
  const n = total ?? carts.length;
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-4 px-4 sm:px-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4 text-amber-700" /> {n} abandoned cart{n === 1 ? '' : 's'} waiting for follow-up
            </p>
            <p className="text-xs text-muted-foreground">Filled carts with contact details, the warmest leads you have.</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/orders/abandoned-carts">Open cart recovery</Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {carts.slice(0, 6).map((c) => {
            const last = c.lastActiveAt ?? c.last_active_at ?? c.updatedAt ?? c.updated_at;
            return (
              <Link
                key={c._id ?? c.id}
                to={`/orders/abandoned-carts/${c._id ?? c.id}`}
                className="border rounded-md bg-background px-3 py-2 hover:border-amber-400 transition-colors"
              >
                <p className="text-sm font-medium truncate">
                  {c.user?.name || 'Guest'}, {(c.items?.length ?? 0)} item{(c.items?.length ?? 0) === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.user?.phoneNumber || 'No phone'}{last ? `, last active ${fmtDate(last)}` : ''}
                </p>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Detail drawers and the add modal

function Drawer({ title, subtitle, badge, onClose, children }: {
  title: string; subtitle: string; badge?: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg h-full bg-background shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b px-4 sm:px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold truncate">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {badge && <Badge className={stageSelectClass(badge)}>{label(badge)}</Badge>}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>
        <div className="p-4 sm:p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function MessageDrawer({ msg, onClose, onPatched, onDeleted, onAddLead }: {
  msg: Dict; onClose: () => void; onPatched: (id: string, patch: Dict) => void; onDeleted: (id: string) => void; onAddLead: (m: Dict) => void;
}) {
  const { toast } = useToast();
  const [full, setFull] = useState<Dict | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState('');
  const row = full ?? msg;

  useEffect(() => {
    let live = true;
    contactsAPI.getById(msg.id)
      .then((r) => {
        if (!live) return;
        const rec = recordOf(r, msg);
        setFull(rec);
        setReply(rec.reply_message || '');
      })
      .catch((e) => { if (live) setLoadError(errorText(e, 'This message could not be opened.')); });
    // A v2 read never writes: mark it read with its own call.
    if (!msg.is_read) {
      contactsAPI.markRead(msg.id)
        .then(() => onPatched(msg.id, { is_read: true }))
        .catch(() => { /* stays unread; the next open tries again */ });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id]);

  async function saveReply() {
    if (!reply.trim()) return;
    setBusy('reply');
    try {
      const r = await contactsAPI.reply(msg.id, reply.trim());
      const patch = { ...recordOf(r, {}), reply_message: reply.trim() };
      setFull((f) => ({ ...(f ?? msg), ...patch }));
      onPatched(msg.id, patch);
      toast({ title: 'Reply recorded', description: 'Send it to the shopper on your email or WhatsApp channel.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Reply not saved', description: errorText(e) });
    } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm('Delete this message permanently?')) return;
    setBusy('del');
    try { await contactsAPI.delete(msg.id); onDeleted(msg.id); onClose(); }
    catch (e) { toast({ variant: 'destructive', title: 'Not deleted', description: errorText(e) }); }
    finally { setBusy(''); }
  }

  return (
    <Drawer title={row.name || 'Anonymous'} subtitle={fmtDateTime(row.created_at)} badge={row.status} onClose={onClose}>
      <ContactCell row={row} />
      {loadError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>}

      <div className="border rounded-lg p-4">
        {row.subject && <p className="text-sm font-bold mb-1.5">{row.subject}</p>}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {row.message || (full || loadError ? <span className="text-muted-foreground italic">No message body</span> : <span className="text-muted-foreground">Loading the message...</span>)}
        </p>
      </div>

      {full && <ProductEnquiryCard row={full} />}
      {full && <AttributionPanel row={full} />}

      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Reply (recorded on the message)</p>
        {row.replied_at && <p className="text-xs text-green-600 mb-1.5">Replied {fmtDateTime(row.replied_at)}</p>}
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          disabled={!full}
          placeholder="Write your reply. It is saved on the message; send it on your email or WhatsApp channel."
          className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background disabled:opacity-60"
        />
        <Button size="sm" className="mt-2" onClick={saveReply} disabled={!full || !reply.trim() || busy !== ''}>
          <Send className="w-3.5 h-3.5 mr-1.5" /> {busy === 'reply' ? 'Saving...' : 'Save reply and mark replied'}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t">
        <Button size="sm" variant="outline" onClick={() => onAddLead(row)} disabled={!full}>
          <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add as lead
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={remove} disabled={busy !== ''}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
        </Button>
      </div>
    </Drawer>
  );
}

function LeadDrawer({ lead, staff, meId, onClose, onPatched, onDeleted }: {
  lead: Dict; staff: StaffLite[]; meId?: string;
  onClose: () => void; onPatched: (id: string, patch: Dict) => void; onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [full, setFull] = useState<Dict | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState('');
  const row = full ?? lead;

  useEffect(() => {
    let live = true;
    leadsAPI.getById(lead.id)
      .then((r) => {
        if (!live) return;
        const rec = recordOf(r, lead);
        setFull(rec);
        setNotes(rec.notes || '');
        setFollowUp(rec.follow_up_date ? isoDate(rec.follow_up_date) : '');
        setCustomerId(knownCustomerOf(rec));
      })
      .catch((e) => { if (live) setLoadError(errorText(e, 'This lead could not be opened.')); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  function merged(patch: Dict, answer: any): Dict {
    return { ...patch, ...recordOf(answer, {}) };
  }
  async function save(patch: Dict, key: string, done: string) {
    setBusy(key);
    try {
      const next = merged(patch, await leadsAPI.update(lead.id, patch));
      setFull((f) => ({ ...(f ?? lead), ...next }));
      onPatched(lead.id, next);
      toast({ title: done });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: errorText(e) });
    } finally { setBusy(''); }
  }
  async function convert() {
    const id = customerId.trim();
    if (id && !isUuid(id)) {
      toast({ variant: 'destructive', title: 'Not converted', description: 'The customer ID is not a valid ID. Leave it empty to mark the lead won without one.' });
      return;
    }
    setBusy('converted');
    try {
      const next = merged({ status: 'converted' }, await leadsAPI.convert(lead.id, id || undefined));
      setFull((f) => ({ ...(f ?? lead), ...next }));
      onPatched(lead.id, next);
      toast({ title: 'Lead converted' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not converted', description: errorText(e) });
    } finally { setBusy(''); }
  }
  function setStage(s: string) {
    if (s === row.status) return;
    if (s === 'converted') { convert(); return; }
    save({ status: s }, s, `Stage set to ${label(s)}`);
  }
  function setOwner(value: string) {
    const next = value === UNASSIGNED ? null : value;
    if (next === (row.assigned_to ?? null)) return;
    save({ assigned_to: next }, 'owner', next ? `Handed to ${staffName(staff, next, meId)}` : 'Lead unassigned');
  }
  function saveFollowUp(clear = false) {
    if (clear) { setFollowUp(''); save({ follow_up_date: null }, 'fu', 'Follow-up cleared'); return; }
    // A date means the start of that day on the store's clock (an RFC 3339 instant, which the field takes).
    const at = followUp ? fromStoreDateTimeInput(`${followUp}T00:00`) : null;
    if (!at) return;
    save({ follow_up_date: at }, 'fu', 'Follow-up set');
  }
  async function remove() {
    if (!window.confirm(`Delete lead "${leadName(row)}" permanently?`)) return;
    setBusy('del');
    try { await leadsAPI.delete(lead.id); onDeleted(lead.id); onClose(); }
    catch (e) { toast({ variant: 'destructive', title: 'Not deleted', description: errorText(e) }); }
    finally { setBusy(''); }
  }

  const ready = !!full;
  return (
    <Drawer
      title={leadName(row)}
      subtitle={`${row.created_at ? `Created ${fmtDateTime(row.created_at)}, ` : ''}score ${row.score ?? 0}`}
      badge={row.status}
      onClose={onClose}
    >
      <ContactCell row={row} />
      {loadError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>}
      {!ready && !loadError && <p className="text-xs text-muted-foreground">Loading the lead...</p>}

      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Stage</p>
        <div className="flex gap-1.5 flex-wrap">
          {LEAD_STAGES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={row.status === s ? 'default' : 'outline'}
              className="h-7 text-xs"
              disabled={!ready || busy !== ''}
              onClick={() => setStage(s)}
            >
              {busy === s ? 'Saving...' : label(s)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Handled by</p>
        {staff.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={row.assigned_to || UNASSIGNED} onValueChange={setOwner} disabled={!ready || busy !== ''}>
              <SelectTrigger className="h-8 w-full sm:w-[220px] text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {row.assigned_to && !staff.some((s) => s.id === row.assigned_to) && (
                  <SelectItem value={row.assigned_to}>{staffName(staff, row.assigned_to, meId)}</SelectItem>
                )}
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.id === meId ? `${s.name || 'You'} (you)` : s.name || 'Staff member'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {meId && row.assigned_to !== meId && staff.some((s) => s.id === meId) && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOwner(meId)} disabled={!ready || busy !== ''}>
                {busy === 'owner' ? 'Saving...' : 'Take it'}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{row.assigned_to ? staffName(staff, row.assigned_to, meId) : 'Unassigned'}</p>
        )}
      </div>

      {full && <ProductEnquiryCard row={full} />}
      {full && <AttributionPanel row={full} />}

      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Message and notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={!ready}
          className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background disabled:opacity-60"
        />
        <Button size="sm" className="mt-2" onClick={() => save({ notes: notes.trim() ? notes : null }, 'notes', 'Notes saved')} disabled={!ready || busy !== '' || notes === (full?.notes || '')}>
          {busy === 'notes' ? 'Saving...' : 'Save notes'}
        </Button>
      </div>

      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Follow up on</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={followUp}
            disabled={!ready}
            onChange={(e) => setFollowUp(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          />
          <Button size="sm" variant="outline" onClick={() => saveFollowUp()} disabled={!ready || !followUp || busy !== ''}>
            {busy === 'fu' ? 'Saving...' : 'Set date'}
          </Button>
          {row.follow_up_date && (
            <Button size="sm" variant="ghost" onClick={() => saveFollowUp(true)} disabled={!ready || busy !== ''}>Clear</Button>
          )}
        </div>
        {isOverdue(row) && <p className="mt-1 text-xs font-semibold text-red-600">Due since {fmtDate(row.follow_up_date)}</p>}
      </div>

      {row.status !== 'converted' ? (
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Won</p>
          <Input
            placeholder="Customer ID (optional)"
            value={customerId}
            disabled={!ready}
            onChange={(e) => setCustomerId(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Filled in when the form knew the shopper. Find others on the Customers page.</p>
          <Button size="sm" variant="outline" className="mt-2 text-green-700 border-green-200 hover:bg-green-50" onClick={convert} disabled={!ready || busy !== ''}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {busy === 'converted' ? 'Saving...' : 'Mark as converted'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-green-700">
          Converted {fmtDateTime(row.converted_at)}
          {row.converted_customer_id ? <> to <Link className="underline" to={`/customers/${row.converted_customer_id}`}>this customer</Link></> : null}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t">
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={remove} disabled={busy !== ''}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
        </Button>
      </div>
    </Drawer>
  );
}

function AddLeadModal({ initial, onClose, onCreated }: { initial?: Dict; onClose: () => void; onCreated: (lead: Dict) => void }) {
  const countries = useCountries();
  const [form, setForm] = useState({
    name: initial?.name || '', email: initial?.email || '',
    source: initial?.source || 'manual',
    notes: initial ? [initial.subject, initial.message].filter(Boolean).join('. ') : '',
  });
  const [phone, setPhone] = useState<{ number: string; dialCode: string }>({ number: '', dialCode: DEFAULT_DIAL });
  const phoneTouched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // A message's phone is stored in international form: split it on the longest dial code that fits.
  useEffect(() => {
    const raw = String(initial?.phone || '').trim();
    if (!raw || phoneTouched.current) return;
    if (!raw.startsWith('+')) { setPhone((p) => ({ ...p, number: raw.replace(/\D/g, '') })); return; }
    const dial = countries.map((c) => c.dial).filter((d) => d && raw.startsWith(d)).sort((a, b) => b.length - a.length)[0];
    if (dial) setPhone({ dialCode: dial, number: raw.slice(dial.length).replace(/\D/g, '') });
  }, [initial?.phone, countries]);

  const phoneValue = phone.number ? `${phone.dialCode}${phone.number}` : '';
  const canCreate = !!(form.name.trim() || form.email.trim() || phoneValue);

  async function create() {
    if (!canCreate) return;
    setBusy(true); setError('');
    const body: Dict = {
      name: form.name.trim() || phoneValue || form.email.trim(),
      source: form.source.trim() || 'manual',
      status: 'new',
    };
    if (form.email.trim()) body.email = form.email.trim();
    if (phoneValue) body.phone = phoneValue;
    if (form.notes.trim()) body.notes = form.notes.trim();
    if (initial) body.metadata = { ...metaOf(initial), contact_id: initial.id };
    try {
      const created = await leadsAPI.create(body);
      onCreated(recordOf(created, body));
      onClose();
    } catch (e) {
      setError(errorText(e, 'The lead could not be created.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add lead" className="w-full max-w-md bg-background rounded-xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold">{initial ? 'Add message as lead' : 'Add new lead'}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close"><X size={15} /></Button>
        </div>
        <div className="space-y-2.5">
          <Input placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <PhoneInput
            value={phone.number}
            dialCode={phone.dialCode}
            placeholder="Phone"
            onChange={(next) => { phoneTouched.current = true; setPhone(next); }}
          />
          <Input placeholder="Source, for example manual, exhibition, referral" value={form.source} onChange={(e) => set('source', e.target.value)} />
          <textarea
            className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            rows={3} placeholder="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)}
          />
        </div>
        {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <Button
          className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white"
          onClick={create}
          disabled={busy || !canCreate}
        >
          {busy ? 'Creating...' : 'Create lead'}
        </Button>
      </div>
    </div>
  );
}

// Main page

const Leads: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const meId = user?._id ? String(user._id) : undefined;
  const [tab, setTab] = useState<'leads' | 'messages'>('leads');

  const [leads, setLeads] = useState<Dict[]>([]);
  const [leadTotal, setLeadTotal] = useState<number | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState('');
  const [messages, setMessages] = useState<Dict[]>([]);
  const [msgTotal, setMsgTotal] = useState<number | null>(null);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [msgsError, setMsgsError] = useState('');
  const [followUps, setFollowUps] = useState<Dict[]>([]);
  const [leadStats, setLeadStats] = useState<Dict | null>(null);
  const [msgStats, setMsgStats] = useState<Dict | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [carts, setCarts] = useState<Dict[]>([]);
  const [cartTotal, setCartTotal] = useState<number | null>(null);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [integration, setIntegration] = useState<IntegrationHealth>({
    email: false, whatsapp: false, sms: false, connectedServices: 0, loading: true,
  });

  const [filter, setFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  /** 'all', or a staff id ('me' is the signed-in person's own id). */
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [leadView, setLeadView] = useState<'all' | 'due'>('all');
  const [msgFilter, setMsgFilter] = useState('all');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const [openMsg, setOpenMsg] = useState<Dict | null>(null);
  const [openLead, setOpenLead] = useState<Dict | null>(null);
  const [addLead, setAddLead] = useState<{ initial?: Dict } | null>(null);
  const leadReq = useRef(0);
  const msgReq = useRef(0);

  /** One page of leads, newest first, stage and source filtered on the server. */
  async function loadLeads(offset = 0) {
    const my = ++leadReq.current;
    setLeadsLoading(true);
    setLeadsError('');
    try {
      const params: { limit: number; offset: number; sort: string; status?: string; source?: string; assigned_to?: string } = { limit: PAGE_SIZE, offset, sort: '-created_at' };
      if (stageFilter !== 'all') params.status = stageFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (ownerFilter !== 'all') params.assigned_to = ownerFilter;
      const res: any = await leadsAPI.getAll(params);
      if (my !== leadReq.current) return;
      const rows = asRows(res);
      setLeads((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setLeadTotal(totalOf(res));
      if (offset === 0) setSelectedLeads([]);
    } catch (e) {
      if (my !== leadReq.current) return;
      setLeadsError(errorText(e, 'Leads could not be loaded.'));
      if (offset === 0) setLeads([]);
    } finally {
      if (my === leadReq.current) setLeadsLoading(false);
    }
  }

  /** One page of inbox messages, newest first, the status or unread filter applied on the server. */
  async function loadMessages(offset = 0) {
    const my = ++msgReq.current;
    setMsgsLoading(true);
    setMsgsError('');
    try {
      const params: { limit: number; offset: number; status?: string; is_read?: boolean } = { limit: PAGE_SIZE, offset };
      if (msgFilter === 'unread') params.is_read = false;
      else if (msgFilter !== 'all') params.status = msgFilter;
      const res: any = await contactsAPI.getAll(params);
      if (my !== msgReq.current) return;
      const rows = asRows(res);
      setMessages((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setMsgTotal(totalOf(res));
    } catch (e) {
      if (my !== msgReq.current) return;
      setMsgsError(errorText(e, 'Messages could not be loaded.'));
      if (offset === 0) setMessages([]);
    } finally {
      if (my === msgReq.current) setMsgsLoading(false);
    }
  }

  /** The numbers and the follow-up queue (server-side, never counted off the loaded page). */
  async function loadStats() {
    const [ls, ms, due] = await Promise.all([
      leadsAPI.getStats().catch(() => null),
      contactsAPI.getStats().catch(() => null),
      leadsAPI.getFollowUps().catch(() => null),
    ]);
    setLeadStats(ls);
    setMsgStats(ms);
    setFollowUps(Array.isArray(due) ? due : []);
    setStatsLoading(false);
  }

  /** Channel readiness and the abandoned-cart strip: owned by other screens, read here. */
  async function loadContext() {
    const [settingsResult, smsResult, connectorsResult, cartsResult, staffResult] = await Promise.all([
      api.get('/settings/admin').catch(() => null),
      smsConfigAPI.get().catch(() => null),
      api.get('/connectors').catch(() => null),
      cartsAPI.listAdmin({ status: 'abandoned', limit: 6 }).catch(() => null),
      leadsAPI.staff().catch(() => [] as StaffLite[]),
    ]);
    setStaff(staffResult.filter((s) => s && s.id));
    const settings = responseData(settingsResult);
    const smsConfig = responseData(smsResult);
    const connectors = asRows(responseData(connectorsResult));
    const connectedServices = connectors.reduce((n: number, c: Dict) => n + (c.services || []).filter((s: Dict) => s.isEnabled).length, 0);
    const whatsApp = settings.whatsapp || {};
    const whatsAppGateway = settings.whatsapp_settings || {};
    setIntegration({
      email: !!settings.smtp?.isEnabled,
      whatsapp: !!(whatsApp.isEnabled || whatsAppGateway.isEnabled),
      sms: !!smsConfig.isEnabled,
      connectedServices,
      loading: false,
    });
    setCarts(asRows(cartsResult));
    setCartTotal(totalOf(cartsResult));
  }

  useEffect(() => { loadLeads(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stageFilter, sourceFilter, ownerFilter]);
  useEffect(() => { loadMessages(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [msgFilter]);
  useEffect(() => { loadStats(); loadContext(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function refreshAll() { loadLeads(0); loadMessages(0); loadStats(); loadContext(); }

  const patchLead = (id: string, patch: Dict) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setFollowUps((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setOpenLead((o) => (o && o.id === id ? { ...o, ...patch } : o));
  };
  const onLeadChanged = (id: string, patch: Dict) => { patchLead(id, patch); loadStats(); };
  const onLeadDeleted = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setFollowUps((prev) => prev.filter((l) => l.id !== id));
    setLeadTotal((t) => (t === null ? t : Math.max(0, t - 1)));
    setSelectedLeads((prev) => prev.filter((x) => x !== id));
    loadStats();
  };
  const onLeadCreated = (lead: Dict) => {
    if (lead?.id && leadView === 'all' && (stageFilter === 'all' || stageFilter === lead.status) && (sourceFilter === 'all' || sourceFilter === lead.source)
      && (ownerFilter === 'all' || ownerFilter === lead.assigned_to)) {
      setLeads((prev) => [lead, ...prev]);
      setLeadTotal((t) => (t === null ? t : t + 1));
    }
    toast({ title: 'Lead added' });
    loadStats();
  };
  const patchMsg = (id: string, patch: Dict) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    if ('is_read' in patch || 'status' in patch) loadStats();
  };
  const onMsgDeleted = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setMsgTotal((t) => (t === null ? t : Math.max(0, t - 1)));
    loadStats();
  };

  async function handleStageChange(lead: Dict, status: string) {
    if (status === lead.status) return;
    const prev = lead.status;
    patchLead(lead.id, { status });
    try {
      let answer: any;
      if (status === 'converted') {
        // Converting stamps when and to whom: the record says which customer the form knew.
        const rec = recordOf(await leadsAPI.getById(lead.id).catch(() => null), lead);
        const customer = knownCustomerOf(rec);
        answer = await leadsAPI.convert(lead.id, isUuid(customer) ? customer : undefined);
      } else {
        answer = await leadsAPI.update(lead.id, { status });
      }
      onLeadChanged(lead.id, { status, ...recordOf(answer, {}) });
    } catch (e) {
      patchLead(lead.id, { status: prev });
      toast({ variant: 'destructive', title: 'Stage not changed', description: errorText(e) });
    }
  }
  async function handleMsgStatusChange(id: string, status: string) {
    const prev = messages.find((m) => m.id === id)?.status;
    patchMsg(id, { status });
    try { await contactsAPI.updateStatus(id, status as any); }
    catch (e) {
      patchMsg(id, { status: prev });
      toast({ variant: 'destructive', title: 'Status not changed', description: errorText(e) });
    }
  }

  const q = filter.trim().toLowerCase();
  const rowMatches = (row: Dict) =>
    !q
    || [leadName(row), leadPhone(row), row.email, row.source, row.notes, row.subject, row.message,
        campaignOf(row), productOf(row).name, productOf(row).sku]
      .some((v) => String(v ?? '').toLowerCase().includes(q));

  const byStatus: Dict[] = asRows(leadStats?.by_status ?? leadStats?.byStatus);
  const stageCount = (s: string) => Number(byStatus.find((r) => r.status === s)?.count ?? 0);
  const sourceOptions = useMemo(() => {
    const list = asRows(leadStats?.by_source ?? leadStats?.bySource).map((r) => String(r.source || '')).filter(Boolean);
    if (sourceFilter !== 'all' && !list.includes(sourceFilter)) list.push(sourceFilter);
    return list;
  }, [leadStats, sourceFilter]);

  const dueRows = ownerFilter === 'all' ? followUps : followUps.filter((l) => l.assigned_to === ownerFilter);
  const leadRows = leadView === 'due' ? dueRows : leads;
  const filteredLeads = leadRows.filter(rowMatches);
  const filteredMessages = messages.filter((m) =>
    (msgFilter === 'all' || (msgFilter === 'unread' ? !m.is_read : m.status === msgFilter))
    && rowMatches(m));

  const handleSelectAll = (checked: boolean) =>
    setSelectedLeads(checked ? filteredLeads.map((l) => l.id) : []);
  const handleSelectRow = (id: string, checked: boolean) =>
    setSelectedLeads((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  function handleExport() {
    const rows = selectedLeads.length > 0 ? leadRows.filter((l) => selectedLeads.includes(l.id)) : filteredLeads;
    downloadCsv(`leads_export_${isoDate()}.csv`, [
      { key: 'name', label: 'Name', format: (r: Dict) => leadName(r) },
      { key: 'phone', label: 'Phone', format: (r: Dict) => leadPhone(r) },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Stage' },
      { key: 'source', label: 'Source' },
      { key: 'product_interest', label: 'Interested in' },
      { key: 'score', label: 'Score' },
      { key: 'follow_up_date', label: 'Follow up on', format: (r: Dict) => (r.follow_up_date ? fmtDate(r.follow_up_date) : '') },
      { key: 'created_at', label: 'Created', format: (r: Dict) => (r.created_at ? fmtDateTime(r.created_at) : '') },
    ] as any, rows as any);
  }

  const unread = Number(msgStats?.unread ?? messages.filter((m) => !m.is_read).length);
  const goDue = () => { setTab('leads'); setLeadView('due'); scrollToWorkspace(); };
  const goUnread = () => { setTab('messages'); setMsgFilter('unread'); scrollToWorkspace(); };
  const goNew = () => { setTab('leads'); setLeadView('all'); setStageFilter('new'); scrollToWorkspace(); };
  const moreLeads = leadView === 'all' && leadTotal !== null && leads.length < leadTotal;
  const moreMsgs = msgTotal !== null && messages.length < msgTotal;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {statsLoading ? 'Loading the numbers...' : (
              <>
                {Number(leadStats?.total ?? leadTotal ?? 0)} leads, {Number(leadStats?.last7d ?? 0)} this week.{' '}
                {Number(msgStats?.total ?? msgTotal ?? 0)} messages
                {unread > 0 ? <span className="text-blue-600 font-semibold">, {unread} unread</span> : null}.
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={refreshAll} title="Refresh" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${leadsLoading || msgsLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setAddLead({})}>
            <Plus className="w-4 h-4 mr-2" /> Add lead
          </Button>
        </div>
      </div>

      <ActionQueue
        followUps={followUps.length}
        unread={unread}
        fresh={stageCount('new')}
        carts={cartTotal ?? (carts.length || null)}
        loading={statsLoading}
        onDue={goDue}
        onUnread={goUnread}
        onFresh={goNew}
      />

      <PipelineNumbers stats={leadStats} loading={statsLoading} integration={integration} />

      <AbandonedCartsStrip carts={carts} total={cartTotal} />

      <Card id="crm-workspace" className="scroll-mt-4">
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="p-3 sm:p-4 border-b bg-muted/40 flex flex-col lg:flex-row gap-3 justify-between lg:items-center">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full lg:w-auto">
              <div className="inline-flex rounded-md border bg-background overflow-hidden shrink-0 self-start">
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

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={tab === 'leads' ? 'Search loaded leads' : 'Search loaded messages'}
                  className="pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>

              {tab === 'leads' && staff.length > 0 && (
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="w-full sm:w-[170px]" aria-label="Handled by"><SelectValue placeholder="Anyone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Anyone</SelectItem>
                    {meId && staff.some((s) => s.id === meId) && <SelectItem value={meId}>Mine</SelectItem>}
                    {staff.filter((s) => s.id !== meId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name || 'Staff member'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {tab === 'leads' ? (
                leadView === 'due' ? (
                  <button onClick={() => setLeadView('all')} className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                    <Clock className="h-3.5 w-3.5" /> Follow-ups due ({dueRows.length}) <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <>
                    <Select value={stageFilter} onValueChange={setStageFilter}>
                      <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="All stages" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All stages</SelectItem>
                        {LEAD_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {label(s)}{stageCount(s) ? ` (${stageCount(s)})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="All sources" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </>
                )
              ) : (
                <Select value={msgFilter} onValueChange={setMsgFilter}>
                  <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All messages" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All messages</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    {MSG_STATUSES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {tab === 'leads' && (
              <Button
                variant={selectedLeads.length > 0 ? 'default' : 'outline'}
                onClick={handleExport}
                disabled={filteredLeads.length === 0 && selectedLeads.length === 0}
                className={`self-start lg:self-auto ${selectedLeads.length > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' : ''}`}
              >
                <Download className="w-4 h-4 mr-2" />
                {selectedLeads.length > 0 ? `Export (${selectedLeads.length})` : 'Export shown'}
              </Button>
            )}
          </div>

          {/* Errors */}
          {tab === 'leads' && leadsError && leadView === 'all' && (
            <div className="m-3 sm:m-4 flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="flex-1 min-w-0">{leadsError}</span>
              <Button size="sm" variant="outline" onClick={() => loadLeads(0)}>Try again</Button>
            </div>
          )}
          {tab === 'messages' && msgsError && (
            <div className="m-3 sm:m-4 flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="flex-1 min-w-0">{msgsError}</span>
              <Button size="sm" variant="outline" onClick={() => loadMessages(0)}>Try again</Button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            {tab === 'leads' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        aria-label="Select all shown"
                        checked={filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length}
                        onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      />
                    </TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Follow up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id} className={selectedLeads.includes(lead.id) ? 'bg-muted/50' : ''}>
                      <TableCell className="text-center">
                        <Checkbox
                          aria-label={`Select ${leadName(lead)}`}
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={(checked) => handleSelectRow(lead.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="flex flex-col">
                          <button className="text-left font-semibold text-sm hover:text-primary" onClick={() => setOpenLead(lead)}>{leadName(lead)}</button>
                          {lead.created_at && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              <span>{fmtDate(lead.created_at)}, {fmtTime(lead.created_at)}</span>
                            </div>
                          )}
                          <RowBadges row={lead} />
                        </div>
                      </TableCell>
                      <TableCell><ContactCell row={lead} /></TableCell>
                      <TableCell>
                        <Select value={lead.status} onValueChange={(val) => handleStageChange(lead, val)}>
                          <SelectTrigger className={`h-8 text-xs font-bold uppercase tracking-wide w-[140px] ${stageSelectClass(lead.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[...new Set([...LEAD_STAGES, lead.status].filter(Boolean))].map((s) => (
                              <SelectItem key={s} value={s}>{label(String(s))}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {staff.length > 0 && (
                          <p className={`mt-1 text-[11px] ${lead.assigned_to ? 'text-muted-foreground' : 'text-amber-700 font-semibold'}`}>
                            {lead.assigned_to ? staffName(staff, lead.assigned_to, meId) : 'Unassigned'}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.follow_up_date ? (
                          <div className={`text-xs inline-flex items-center gap-1.5 px-2 py-1 rounded-md border whitespace-nowrap ${isOverdue(lead) ? 'text-red-700 bg-red-50 border-red-100' : 'text-orange-600 bg-orange-50 border-orange-100'}`}>
                            <Clock className="w-3 h-3" /> {isOverdue(lead) ? 'Due ' : ''}{fmtDate(lead.follow_up_date)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="hover:text-primary hover:bg-primary/10" onClick={() => setOpenLead(lead)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          {leadsLoading && leadView === 'all' ? (
                            <p>Loading leads...</p>
                          ) : (
                            <>
                              <Search className="w-8 h-8 opacity-20" />
                              <p>
                                {leadView === 'due'
                                  ? 'No follow-ups are due. Set a date on a lead to see it here when it comes.'
                                  : q || stageFilter !== 'all' || sourceFilter !== 'all' || ownerFilter !== 'all'
                                    ? 'No leads match these filters.'
                                    : 'No leads yet. Storefront enquiries land here, or add one yourself.'}
                              </p>
                            </>
                          )}
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
                      <TableCell className="min-w-[240px]">
                        <button className="flex items-start gap-2 max-w-[420px] text-left" onClick={() => setOpenMsg(m)}>
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.is_read ? 'bg-transparent' : 'bg-blue-500'}`} />
                          <span className="flex flex-col min-w-0">
                            <span className={`text-sm truncate ${m.is_read ? 'font-medium' : 'font-bold'}`}>{m.name || m.email || 'Anonymous'}</span>
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {m.subject ? <span className="font-semibold text-foreground/70">{m.subject}: </span> : null}
                              {m.message || <span className="italic">No message body</span>}
                            </span>
                            <RowBadges row={m} />
                          </span>
                        </button>
                      </TableCell>
                      <TableCell><ContactCell row={m} /></TableCell>
                      <TableCell>
                        <Select value={m.status} onValueChange={(val) => handleMsgStatusChange(m.id, val)}>
                          <SelectTrigger className={`h-8 text-xs font-bold uppercase tracking-wide w-[120px] ${stageSelectClass(m.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MSG_STATUSES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                          <Calendar className="w-3 h-3" /> {fmtDate(m.created_at)}, {fmtTime(m.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="hover:text-primary hover:bg-primary/10" onClick={() => setOpenMsg(m)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredMessages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          {msgsLoading ? (
                            <p>Loading messages...</p>
                          ) : (
                            <>
                              <Inbox className="w-8 h-8 opacity-20" />
                              <p>{q || msgFilter !== 'all' ? 'No messages match these filters.' : 'No messages yet. Contact form and product enquiry messages land here.'}</p>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Paging */}
          {tab === 'leads' && leadView === 'all' && leads.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 sm:px-4 py-3 text-xs text-muted-foreground">
              <span>Showing {leads.length}{leadTotal !== null ? ` of ${leadTotal}` : ''} leads{q ? '. Search looks through the loaded ones.' : ''}</span>
              {moreLeads && (
                <Button size="sm" variant="outline" onClick={() => loadLeads(leads.length)} disabled={leadsLoading}>
                  {leadsLoading ? 'Loading...' : 'Load more'}
                </Button>
              )}
            </div>
          )}
          {tab === 'messages' && messages.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 sm:px-4 py-3 text-xs text-muted-foreground">
              <span>Showing {messages.length}{msgTotal !== null ? ` of ${msgTotal}` : ''} messages</span>
              {moreMsgs && (
                <Button size="sm" variant="outline" onClick={() => loadMessages(messages.length)} disabled={msgsLoading}>
                  {msgsLoading ? 'Loading...' : 'Load more'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {openMsg && (
        <MessageDrawer
          msg={openMsg}
          onClose={() => setOpenMsg(null)}
          onPatched={patchMsg}
          onDeleted={onMsgDeleted}
          onAddLead={(m) => { setOpenMsg(null); setAddLead({ initial: m }); }}
        />
      )}
      {openLead && <LeadDrawer lead={openLead} staff={staff} meId={meId} onClose={() => setOpenLead(null)} onPatched={onLeadChanged} onDeleted={onLeadDeleted} />}
      {addLead && <AddLeadModal initial={addLead.initial} onClose={() => setAddLead(null)} onCreated={onLeadCreated} />}
    </div>
  );
};

export default Leads;
