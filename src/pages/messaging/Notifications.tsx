import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, FileText, Loader2, Save, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SettingFieldControl, { type RegistryField } from '@/components/settings/SettingFieldControl';
import { settingsRegistryAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Chip, FilterChips, BlockSkeleton, type ChipGroup, type Tone } from '@/components/erp';
import { SearchBox, EmptyRowState } from '@/components/sales/ListChrome';
import { useToast } from '@/hooks/use-toast';
import { formatDayShort, formatDateTime } from '@/utils/date';
import TemplateEditorDrawer from '@/components/templates/TemplateEditorDrawer';
import type { MsgChannel } from '@/services/api';
import {
  messagingAPI, cellNeedsAttention, rowNeedsAttention, groupLabel, groupRank, errText, fmtCount,
  MSG_CHANNELS, MSG_CHANNEL_LABEL, GROUP_ORDER,
  type MsgCh, type NotificationCell, type NotificationRow,
} from '@/lib/v2/messaging';
import {
  ErrorNotice, GapNotice, MessagingHeader, MessagingTabs, failureOf, useCommerceCatalogue, useSettingsRegistry, useTabParam,
  type LoadFailure, type RegistryDefLite,
} from '@/components/messaging/common';
import BrandingPanel from '@/components/messaging/BrandingPanel';
import ReviewTimingCard from '@/components/messaging/ReviewTimingCard';
import { cn } from '@/lib/utils';

/**
 * MESSAGING ▸ NOTIFICATIONS — every message this store sends, in one list
 * (contract MSG-0 §2/§4.1): grouped (Orders … Staff alerts, Marketing), what
 * triggers it in plain words, and a cell per channel with its ONE on/off
 * switch (`PUT /comms/notifications/{key}/channels/{channel}` — the same flag
 * the send path checks), what is in the way of it going out (no template,
 * Meta approval, DLT mapping), and how often it went out in 30 days.
 * A cell opens the shared template editor on that channel. The Branding tab
 * is the frame and template pack every message wears.
 *
 * Built beside the old Message templates page (Settings ▸ Message templates);
 * it replaces nothing until the owner approves.
 */

const TABS = [{ key: 'messages', label: 'Messages' }, { key: 'branding', label: 'Branding' }] as const;

const APPROVAL: Record<string, { label: string; tone: Tone }> = {
  approved: { label: 'Meta approved', tone: 'green' },
  pending: { label: 'Meta pending', tone: 'amber' },
  rejected: { label: 'Meta rejected', tone: 'red' },
  not_submitted: { label: 'Not sent to Meta', tone: 'amber' },
};

const Notifications: React.FC = () => {
  const { hasPerm } = useAuth();
  // The same permissions the Message templates page uses: read = marketing.read, write = marketing.manage.
  const canWrite = hasPerm('marketing.manage');
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'messages');

  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const load = useCallback(async () => {
    setFailure(null);
    try { setRows(await messagingAPI.notifications('commerce')); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the notifications.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const catalogue = useCommerceCatalogue();
  const messages = useMemo(() => (rows ?? []).map((r) => ({ key: r.key, label: r.label })), [rows]);

  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={Bell} title="Notifications"
        purpose="Every message your store sends — what sends it, on which channel, and whether it can go out. Growcord's wording until you write your own." />
      <MessagingTabs label="Notifications" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'messages' ? (
        <MessagesTab rows={rows} failure={failure} reload={load} setRows={setRows} canWrite={canWrite} catalogue={catalogue} />
      ) : (
        <BrandingPanel messages={messages} />
      )}
    </div>
  );
};

const MessagesTab: React.FC<{
  rows: NotificationRow[] | null; failure: LoadFailure | null; reload: () => void;
  setRows: React.Dispatch<React.SetStateAction<NotificationRow[] | null>>;
  canWrite: boolean; catalogue: ReturnType<typeof useCommerceCatalogue>;
}> = ({ rows, failure, reload, setRows, canWrite, catalogue }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [channel, setChannel] = useState('');
  const [audience, setAudience] = useState('');
  const [attention, setAttention] = useState(false);
  const [open, setOpen] = useState<{ key: string; channel: MsgCh } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // One registry read for the two setting cards (Staff alerts contacts, Orders invoice auto-send).
  const registry = useSettingsRegistry();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (q && !`${r.label} ${r.key} ${r.trigger}`.toLowerCase().includes(q)) return false;
      if (group && r.group !== group) return false;
      if (audience && r.audience !== audience) return false;
      if (channel && !r.channels[channel as MsgCh]) return false;
      if (attention && !(channel ? cellNeedsAttention(channel as MsgCh, r.channels[channel as MsgCh]) : rowNeedsAttention(r))) return false;
      return true;
    });
  }, [rows, search, group, audience, channel, attention]);

  const sections = useMemo(() => {
    const by = new Map<string, NotificationRow[]>();
    for (const r of filtered) { const l = by.get(r.group) ?? []; l.push(r); by.set(r.group, l); }
    return [...by.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]) || a[0].localeCompare(b[0]));
  }, [filtered]);

  const attentionCount = useMemo(() => (rows ?? []).filter(rowNeedsAttention).length, [rows]);
  const present = useMemo(() => new Set((rows ?? []).map((r) => r.group)), [rows]);
  const columns = useMemo(() => MSG_CHANNELS.filter((c) => (rows ?? []).some((r) => r.channels[c])), [rows]);

  const groups: ChipGroup[] = [
    {
      key: 'group', label: 'Group', value: group, onChange: setGroup,
      options: [...GROUP_ORDER.filter((g) => present.has(g.key)).map((g) => g.key), ...[...present].filter((g) => !GROUP_ORDER.some((x) => x.key === g))]
        .map((g) => ({ value: g, label: groupLabel(g), hint: String((rows ?? []).filter((r) => r.group === g).length) })),
    },
    { key: 'channel', label: 'Channel', value: channel, onChange: setChannel, options: columns.map((c) => ({ value: c, label: MSG_CHANNEL_LABEL[c] })) },
    {
      key: 'audience', label: 'Goes to', value: audience, onChange: setAudience,
      options: [{ value: 'customer', label: 'Customer' }, { value: 'staff', label: 'Your team' }].filter((o) => (rows ?? []).some((r) => r.audience === o.value)),
    },
  ];
  const clearAll = () => { setSearch(''); setGroup(''); setChannel(''); setAudience(''); setAttention(false); };

  /** The ONE switch. Optimistic, rolled back on a refusal, replaced by the server's own cell on success. */
  const toggle = async (row: NotificationRow, ch: MsgCh, enabled: boolean) => {
    const id = `${row.key}:${ch}`;
    const put = (c: NotificationCell | null) => setRows((rs) => (rs ?? []).map((r) => (r.key === row.key ? { ...r, channels: { ...r.channels, [ch]: c } } : r)));
    const before = row.channels[ch];
    if (!before) return;
    setBusy(id);
    put({ ...before, enabled });
    try {
      const cell = await messagingAPI.setChannel(row.key, ch, enabled);
      put(cell ?? { ...before, enabled });
      toast({ title: `${row.label} · ${MSG_CHANNEL_LABEL[ch]} ${enabled ? 'on' : 'off'}` });
    } catch (e: any) {
      put(before);
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    } finally { setBusy(null); }
  };

  if (failure?.gap) {
    return (
      <GapNotice what="The notifications list (GET /comms/notifications) is not served by this server yet.">
        Meanwhile every template can be read and edited on <Link to="/settings/sms-templates" className="underline">Settings ▸ Message templates</Link>.
      </GapNotice>
    );
  }
  if (failure) return <ErrorNotice message={failure.message} onRetry={reload} />;
  if (!rows) return <div aria-busy="true" className="space-y-3"><BlockSkeleton lines={3} /><BlockSkeleton lines={8} /></div>;

  const openEntry = open ? catalogue.entryFor(open.key) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search messages" className="w-full sm:w-72" />
        <FilterChips groups={groups} onClearAll={clearAll}>
          <button type="button" aria-pressed={attention} onClick={() => setAttention((a) => !a)}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
              attention ? 'border-warn bg-warn-bg text-warn-ink' : 'border-line bg-surface text-ink-soft hover:text-ink')}
            title="Switched on, but cannot go out: no template, not approved by Meta, or SMS not mapped to DLT.">
            <AlertTriangle className="h-3.5 w-3.5" /> Needs attention{attentionCount ? ` (${attentionCount})` : ''}
          </button>
        </FilterChips>
      </div>

      {catalogue.failure && !catalogue.failure.gap && (
        <ErrorNotice message={`The template editor cannot open: ${catalogue.failure.message}`} onRetry={catalogue.reload} />
      )}

      {sections.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyRowState pristine={rows.length === 0} noun="notifications" firstLine="This server lists no Commerce messages for the store." onClear={clearAll} />
        </div>
      ) : sections.map(([g, list]) => (
        <section key={g} aria-labelledby={`grp-${g}`} className="space-y-2">
          <h2 id={`grp-${g}`} className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            {groupLabel(g)} <span className="text-xs font-normal normal-case tracking-normal text-ink-mute">{list.length}</span>
          </h2>
          {g === 'reviews' && <ReviewTimingCard />}
          {g === 'staff' && <StaffAlertContactsCard registry={registry} />}
          {g === 'orders' && <InvoiceAutoSendCard registry={registry} />}
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div aria-hidden className={cn('hidden gap-3 border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid', gridCols(columns.length))}>
              <span>Message</span>
              {columns.map((c) => <span key={c}>{MSG_CHANNEL_LABEL[c]}</span>)}
            </div>
            <ul>
              {list.map((r) => (
                <li key={r.key} data-key={r.key}
                  className={cn('grid gap-3 border-b border-line px-3 py-3 last:border-0', gridCols(columns.length))}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{r.label}</span>
                      {r.audience === 'staff' && <Chip tone="blue">Your team</Chip>}
                      {r.purpose === 'marketing' && <Chip tone="amber">Marketing</Chip>}
                      {r.automatic && <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-mute" title="Sent by the store's own events, without anyone pressing send."><Zap className="h-3 w-3" aria-hidden /> Automatic</span>}
                    </div>
                    {r.trigger && <p className="mt-0.5 text-xs text-ink-soft">{r.trigger}</p>}
                  </div>
                  {columns.map((c) => (
                    <ChannelCell key={c} row={r} channel={c} canWrite={canWrite} busy={busy === `${r.key}:${c}`}
                      onToggle={(on) => toggle(r, c, on)} onOpen={() => setOpen({ key: r.key, channel: c })}
                      canOpen={!catalogue.failure} />
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <p className="text-xs text-ink-soft">
        {filtered.length} of {rows.length} messages · {attentionCount} need{attentionCount === 1 ? 's' : ''} attention.
      </p>

      <TemplateEditorDrawer entry={openEntry} smsOwnHeader={catalogue.cat?.smsOwnHeader} canWrite={canWrite}
        initialChannel={open?.channel as MsgChannel | undefined}
        onClose={() => setOpen(null)} onChanged={() => { catalogue.reload(); reload(); }} />
      {open && !openEntry && !catalogue.loading && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn-ink shadow-lg sm:inset-x-auto sm:right-4">
          “{open.key}” is not in this server's template catalogue yet, so it cannot be edited here.
          <button type="button" className="ml-2 underline" onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </div>
  );
};

/* ── setting cards (ADMIN-MSG-2; MSG-6 items 2 and 6) ─────────────────────────
 * Both are Settings Center rows, read from `GET /settings/registry` and written
 * with `PATCH /commerce/settings/registry/{key}` (the legacy `PUT
 * /settings/registry/:key` row) — the same store setting the send path reads,
 * never a copy. Until this server's registry carries the field, the card says
 * what applies meanwhile instead of inventing a form.
 */
type Registry = ReturnType<typeof useSettingsRegistry>;
const getPath = (obj: any, path: string): any => (!path ? obj : path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj));

/** Where the staff alert contacts live: MSG-6's `staffAlertContacts` = `{emails[], whatsapp[] (E.164), push}`, max 5 each. */
const STAFF_DEF_KEYS = ['staffAlertContacts', 'staff_alert_contacts', 'staffAlerts', 'staff_alerts', 'notifications.staff'];
const STAFF_FIELD = /(^|\.)(staff|alertContacts|alert_contacts)/i;

function findStaffContacts(defs: RegistryDefLite[] | null): { def: RegistryDefLite; fields: RegistryDefLite['fields'] } | null {
  if (!defs) return null;
  const own = defs.find((d) => STAFF_DEF_KEYS.includes(d.key));
  if (own) return { def: own, fields: own.fields };
  for (const d of defs) {
    if (d.key === 'push.staff_alerts') continue; // the push app's per-event alert switches, not contacts
    const fields = d.fields.filter((f) => STAFF_FIELD.test(f.path));
    if (fields.length) return { def: d, fields };
  }
  return null;
}
function findInvoiceSwitch(defs: RegistryDefLite[] | null): { def: RegistryDefLite; field: RegistryDefLite['fields'][number] } | null {
  // MSG-6: the switch is its own writable key `invoiceEmail` (field `emailOnIssue`, default off, settings.manage).
  // `invoice_config` stays read-only and is never written from here.
  const def = defs?.find((d) => d.key === 'invoiceEmail');
  const field = def?.fields.find((f) => f.path === 'emailOnIssue');
  return def && field ? { def, field } : null;
}

const SettingCardShell: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; what: string; children: React.ReactNode }> = ({ icon: Icon, title, what, children }) => (
  <div className="rounded-lg border border-line bg-surface p-4">
    <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Icon className="h-3.5 w-3.5 text-ink-mute" aria-hidden /> {title}</div>
    <p className="mt-0.5 text-xs text-ink-soft">{what}</p>
    <div className="mt-3">{children}</div>
  </div>
);

/** Notifications ▸ Staff alerts: who on the team gets the `admin_*` messages, by email, WhatsApp and push. */
const StaffAlertContactsCard: React.FC<{ registry: Registry }> = ({ registry }) => {
  const { toast } = useToast();
  const hit = useMemo(() => findStaffContacts(registry.defs), [registry.defs]);
  const initial = useMemo(() => Object.fromEntries((hit?.fields ?? []).map((f) => [f.path, f.type === 'secret' ? '' : getPath(hit!.def.value, f.path)])), [hit]);
  const [work, setWork] = useState<Record<string, any>>(initial);
  useEffect(() => { setWork(initial); }, [initial]);
  const [saving, setSaving] = useState(false);
  const dirty = (hit?.fields ?? []).filter((f) => !f.readonly && JSON.stringify(work[f.path]) !== JSON.stringify(initial[f.path])).map((f) => f.path);
  const canWrite = !!hit?.def.canWrite;

  const save = async () => {
    if (!hit || !dirty.length) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = {};
      for (const p of dirty) patch[p] = work[p];
      await settingsRegistryAPI.update(hit.def.key, patch);
      toast({ title: 'Staff alert contacts saved' });
      registry.reload();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  return (
    <SettingCardShell icon={Users} title="Who gets staff alerts"
      what="New orders, returns, questions, reviews, failed deliveries and low stock go to these people — by email, WhatsApp and push.">
      {registry.loading && !registry.defs ? <BlockSkeleton lines={2} />
        : registry.failure && !registry.failure.gap ? <ErrorNotice message={registry.failure.message} onRetry={registry.reload} />
          : !hit ? (
            <p className="text-xs text-ink-mute" data-testid="staff-contacts-gap">
              Not available on this server yet. Until it is, staff alerts go by email to the admin address in{' '}
              <Link to="/settings?key=smtp" className="underline">Settings ▸ Email (SMTP)</Link>, else to the store owner.
            </p>
          ) : (
            <fieldset className="space-y-3" disabled={!canWrite}>
              {hit.fields.map((f) => (
                <div key={f.path} className="grid gap-1.5 md:grid-cols-[200px_1fr] md:gap-4">
                  <div>
                    <label htmlFor={`sf-${f.path}`} className="text-sm font-medium text-ink">{f.label}</label>
                    {(f.description || f.help) && <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{f.description || f.help}</p>}
                  </div>
                  <SettingFieldControl field={f as unknown as RegistryField} value={work[f.path]}
                    onChange={(v) => setWork((w) => ({ ...w, [f.path]: v }))}
                    options={hit.def.options?.[f.path] as any} disabled={!canWrite || f.readonly}
                    secretSet={hit.def.secretsStored?.includes(f.path)} folder={`settings/${hit.def.key}`} />
                </div>
              ))}
              <p className="text-[11px] text-ink-soft">Up to 5 email addresses and 5 WhatsApp numbers; numbers with their country code (for example +91 98765 43210).</p>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                {!canWrite && <span className="mr-auto text-xs text-ink-soft">Read-only: needs the {hit.def.permission?.write ?? 'settings.manage'} permission.</span>}
                <Button variant="outline" size="sm" disabled={!dirty.length || saving} onClick={() => setWork(initial)}>Discard</Button>
                <Button size="sm" disabled={!dirty.length || saving || !canWrite} onClick={save} title={!dirty.length ? 'Nothing changed yet' : undefined}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </fieldset>
          )}
    </SettingCardShell>
  );
};

/** Notifications ▸ Orders: email the tax invoice to the customer as soon as it is issued (`invoiceEmail.emailOnIssue`, default off). */
const InvoiceAutoSendCard: React.FC<{ registry: Registry }> = ({ registry }) => {
  const { toast } = useToast();
  const hit = useMemo(() => findInvoiceSwitch(registry.defs), [registry.defs]);
  const saved = !!(hit && getPath(hit.def.value, hit.field.path));
  const [on, setOn] = useState(saved);
  useEffect(() => { setOn(saved); }, [saved]);
  const [busy, setBusy] = useState(false);
  const canWrite = !!hit?.def.canWrite && !hit?.field.readonly;

  const flip = async (next: boolean) => {
    if (!hit) return;
    setBusy(true); setOn(next);
    try {
      await settingsRegistryAPI.update(hit.def.key, { [hit.field.path]: next });
      toast({ title: next ? 'Invoices will be emailed when issued' : 'Invoices are no longer emailed automatically' });
      registry.reload();
    } catch (e: any) {
      setOn(!next);
      toast({ variant: 'destructive', title: 'Not changed', description: errText(e, 'The server refused the change.') });
    } finally { setBusy(false); }
  };

  return (
    <SettingCardShell icon={FileText} title="Email the invoice automatically"
      what="When a tax invoice is issued for an order, email it to the customer straight away.">
      {registry.loading && !registry.defs ? <BlockSkeleton lines={1} />
        : registry.failure && !registry.failure.gap ? <ErrorNotice message={registry.failure.message} onRetry={registry.reload} />
          : !hit ? (
            <p className="text-xs text-ink-mute" data-testid="invoice-autosend-gap">
              Not available on this server yet. Until it is, invoices are not emailed automatically; send one from the order.
            </p>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={on} onCheckedChange={flip} disabled={!canWrite || busy} aria-label={hit.field.label || 'Email the invoice when issued'}
                title={!canWrite ? `Needs the ${hit.def.permission?.write ?? 'settings.manage'} permission` : undefined} />
              <span className="text-ink">{on ? 'On — every issued invoice is emailed' : 'Off'}</span>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" aria-label="Saving" />}
            </label>
          )}
    </SettingCardShell>
  );
};

/** Message column + one column per channel on a wide screen; stacked (2 per row) on a phone. */
function gridCols(n: number): string {
  if (n >= 4) return 'grid-cols-2 md:grid-cols-[minmax(200px,1.6fr)_repeat(4,minmax(0,1fr))] [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1';
  if (n === 3) return 'grid-cols-2 md:grid-cols-[minmax(200px,1.6fr)_repeat(3,minmax(0,1fr))] [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1';
  if (n === 2) return 'grid-cols-2 md:grid-cols-[minmax(200px,1.6fr)_repeat(2,minmax(0,1fr))] [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1';
  return 'grid-cols-1 md:grid-cols-[minmax(200px,1.6fr)_minmax(0,1fr)]';
}

const ChannelCell: React.FC<{
  row: NotificationRow; channel: MsgCh; canWrite: boolean; busy: boolean; canOpen: boolean;
  onToggle: (on: boolean) => void; onOpen: () => void;
}> = ({ row, channel, canWrite, busy, canOpen, onToggle, onOpen }) => {
  const c = row.channels[channel];
  const name = MSG_CHANNEL_LABEL[channel];
  if (!c) {
    return (
      <div className="text-xs text-ink-mute">
        <span className="md:hidden">{name}: </span>Not used
      </div>
    );
  }
  const warn = cellNeedsAttention(channel, c);
  // A cell exists = words exist on the channel; `available` false = the channel cannot send for this store now
  // (no account resolves, MSG-2 CellView). The switch still works: it is the message's own flag.
  const why = !canWrite ? 'Needs the marketing.manage permission' : !c.available ? 'This channel is not set up to send for your store yet' : busy ? 'Saving…' : undefined;
  const approval = channel === 'whatsapp' && c.approval ? APPROVAL[c.approval] : null;
  return (
    <div className={cn('min-w-0 rounded-md p-1.5', warn && 'bg-warn-bg/60')} data-channel={channel}>
      <div className="flex items-center gap-2">
        <Switch checked={c.enabled} disabled={!canWrite || busy} onCheckedChange={onToggle}
          aria-label={`${row.label} by ${name}`} title={why} />
        <button type="button" onClick={onOpen} disabled={!canOpen}
          className="min-w-0 truncate text-left text-xs font-medium text-ink hover:underline disabled:no-underline disabled:opacity-60"
          title={canOpen ? `Preview and edit the ${name} text` : 'The template catalogue did not load'}>
          <span className="md:hidden">{name} · </span>{c.enabled ? 'On' : 'Off'}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {!c.available && <span title="No account sends on this channel for your store yet"><Chip tone="neutral" className="text-[10px]">Not set up</Chip></span>}
        {c.customised && <Chip tone="blue" className="text-[10px]">Your text</Chip>}
        {approval && <Chip tone={approval.tone} className="text-[10px]">{approval.label}</Chip>}
        {channel === 'sms' && c.dlt && <Chip tone={c.dlt === 'mapped' ? 'green' : 'amber'} className="text-[10px]">{c.dlt === 'mapped' ? 'DLT mapped' : 'DLT not mapped'}</Chip>}
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-ink-soft" title={c.last_sent_at ? `Last sent ${formatDateTime(c.last_sent_at)}` : undefined}>
        {fmtCount(c.sent_30d)} in 30 days{c.last_sent_at ? ` · last ${formatDayShort(c.last_sent_at)}` : ''}
      </p>
      {warn && <p className="mt-0.5 text-[11px] text-warn-ink">{warn}</p>}
    </div>
  );
};

export default Notifications;
