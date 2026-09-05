import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Megaphone, Send, Trash2, RefreshCw, ArrowLeft, Clock, Users, Wallet } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useStore } from '../../../contexts/StoreContext';
import { payload } from '../../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '@/components/erp';
import {
  CHANNEL_LIST, CHANNEL_META, CAMPAIGN_STATUS_TONE, isChannelKey, type ChannelKey,
} from './campaigns/channelMeta';
import { ChannelCard, ChannelReadinessBanner, type ChannelStatus } from './campaigns/ChannelReadiness';
import { ChannelPreview } from './campaigns/ChannelPreview';

/**
 * CAMPAIGNS — a hub plus one dedicated panel per channel.
 *
 * `/panel/marketing/campaigns`           → hub: every channel's live readiness
 *                                          and rollup, then recent campaigns.
 * `/panel/marketing/campaigns/:channel`  → that channel alone: what is blocking
 *                                          it, its own KPIs, a composer locked
 *                                          to it with a real preview, and only
 *                                          its campaigns.
 *
 * The four channels genuinely differ — SMS bills per 160-char part and needs a
 * DLT template, WhatsApp needs Meta approval and a gateway phone number, email
 * has a subject and no provider approval, push has no audience picker at all.
 * One shared table with a channel dropdown hid all of that; each panel now
 * states its own constraints. Presentation lives once in `channelMeta.tsx`.
 *
 * Readiness comes from `GET /marketing-hub/channels`, which resolves
 * credentials with the SAME code a real send uses — the old checklist read the
 * settings row in a shape that no longer existed and reported "WhatsApp not
 * configured" for stores that were actively sending on WhatsApp.
 */
const MarketingCampaigns: React.FC = () => {
  const { hasPerm } = useAuth();
  const { currentStore } = useStore();
  const navigate = useNavigate();
  const { channel: channelParam } = useParams<{ channel?: string }>();
  const channel: ChannelKey | null = isChannelKey(channelParam) ? channelParam : null;
  const meta = channel ? CHANNEL_META[channel] : null;

  const [rows, setRows] = useState<any[]>([]);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [systemAudiences, setSystemAudiences] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ audienceKind: 'system', system: 'all_customers', audience: {}, utm: {}, when: 'now' });
  const [detail, setDetail] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);

  // The composer always builds for the panel you are standing in; on the hub
  // it keeps the old free choice so nothing is lost when no channel is picked.
  const formChannel: ChannelKey = channel ?? (form.channel ?? 'sms');

  const load = useCallback(async () => {
    const r = await api.get('/marketing-hub/campaigns', { params: channel ? { channel } : {} });
    setRows(payload(r) ?? []);
  }, [channel]);

  const loadChannels = useCallback(async () => {
    const r = await api.get('/marketing-hub/channels');
    setChannels(payload(r)?.channels ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    Promise.all([load().catch(() => {}), loadChannels().catch(() => {})]).finally(() => setLoading(false));
  }, [load, loadChannels]);

  useEffect(() => {
    api.get('/marketing-hub/templates', { params: { status: 'approved' } })
      .then((r) => setTemplates(payload(r) ?? [])).catch(() => {});
    api.get('/marketing-hub/audiences/lists').then((r) => setLists(payload(r) ?? [])).catch(() => {});
    api.get('/marketing-hub/audiences/system').then((r) => setSystemAudiences(payload(r) ?? [])).catch(() => {});
  }, [showNew]);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); await loadChannels(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message); }
  };

  const status = channel ? channels.find((c) => c.channel === channel) : undefined;
  const channelTemplates = templates.filter((t) => t.channel === formChannel);
  const selectedAudience = systemAudiences.find((a) => a.key === form.system);
  const selectedTemplate = channelTemplates.find((t) => t.id === form.template_ref);

  // ── Autofill: name / template / UTM follow the choices until edited ───────
  const autoName = useMemo(() => {
    const aud = form.audienceKind === 'list'
      ? (lists.find((l) => l.id === form.list_id)?.name ?? 'List')
      : (selectedAudience?.label ?? 'Audience');
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${formChannel.toUpperCase()} · ${aud} · ${date}`;
  }, [formChannel, form.system, form.audienceKind, form.list_id, systemAudiences, lists]);

  useEffect(() => { setForm((f: any) => (f.nameTouched ? f : { ...f, name: autoName })); }, [autoName]);
  useEffect(() => {
    if (!form.template_ref || !channelTemplates.some((t) => t.id === form.template_ref)) {
      setForm((f: any) => ({ ...f, template_ref: channelTemplates[0]?.id ?? '' }));
    }
  }, [formChannel, templates]);
  useEffect(() => {
    setForm((f: any) => ({
      ...f,
      utm: {
        utm_source: f.utmTouched?.utm_source ? f.utm?.utm_source : formChannel,
        utm_medium: f.utmTouched?.utm_medium ? f.utm?.utm_medium : 'crm',
        utm_campaign: f.utmTouched?.utm_campaign ? f.utm?.utm_campaign
          : String(f.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      },
    }));
  }, [formChannel, form.name]);

  const create = () => act(async () => {
    const body: any = {
      name: form.name, channel: formChannel, template_ref: form.template_ref,
      template_ref_b: form.abEnabled ? form.template_ref_b || null : null,
      ab_split: form.ab_split ?? 50,
      utm: form.utm,
      scheduled_at: form.when === 'schedule' && form.scheduled_at ? form.scheduled_at : null,
    };
    if (formChannel !== 'push') {
      if (form.audienceKind === 'list') body.list_id = form.list_id;
      else if (form.audienceKind === 'system') body.audience = { system: form.system };
      else body.audience = form.audience;
    }
    const r = await api.post('/marketing-hub/campaigns', body);
    setShowNew(false);
    setForm({ audienceKind: 'system', system: 'all_customers', audience: {}, utm: {}, when: 'now' });
    setInfo(form.when === 'schedule'
      ? `Scheduled — will send automatically at ${new Date(payload(r).scheduled_at).toLocaleString()}.`
      : 'Draft created — opening it below (estimate runs automatically).');
    if (form.when !== 'schedule') await openDetail(payload(r).id);
  });

  const openDetail = async (id: string) => {
    setEstimate(null);
    const r = await api.get(`/marketing-hub/campaigns/${id}`);
    setDetail(payload(r));
    if (['draft', 'scheduled', 'failed', 'partial'].includes(payload(r)?.status)) {
      api.post(`/marketing-hub/campaigns/${id}/estimate`)
        .then((er) => setEstimate(payload(er))).catch(() => {});
    }
  };

  const send = (id: string) => act(async () => {
    if (!window.confirm('Send this campaign now? Marketing sends are billed to the store wallet.')) return;
    await api.post(`/marketing-hub/campaigns/${id}/send`);
    await openDetail(id);
  });

  const numInput = (key: string, label: string) => (
    <label className="text-xs text-gray-600">{label}
      <input type="number" min={0} value={form.audience?.[key] ?? ''}
        onChange={(e) => setForm({ ...form, audience: { ...form.audience, [key]: e.target.value === '' ? undefined : Number(e.target.value) } })}
        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5" />
    </label>
  );

  const fmtAudience = (c: any) =>
    c.list_name ? `List: ${c.list_name}`
      : c.audience?.system ? (systemAudiences.find((a) => a.key === c.audience.system)?.label ?? c.audience.system)
      : 'Custom filter';

  const canCompose = hasPerm('marketing.manage');
  const composerBlocked = !!status && !status.ready;

  // ── Composer (shared by the hub and every channel panel) ──────────────────
  const composer = (
    <SectionCard
      title={meta ? `New ${meta.label} campaign` : 'New campaign'}
      description={meta ? meta.composerHint : 'Everything is prefilled; adjust what you like.'}
      action={<Btn variant="ghost" size="sm" onClick={() => setShowNew(false)}>Close</Btn>}
    >
      <div className="space-y-4">
        {composerBlocked && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You can still prepare this campaign — it just can’t be sent until the blockers above are cleared.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {!channel && (
            <label className="text-sm font-medium">1 · Channel
              <select value={formChannel}
                onChange={(e) => setForm({ ...form, channel: e.target.value, template_ref: undefined })}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 capitalize focus:ring-2 focus:ring-gray-300">
                {CHANNEL_LIST.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm font-medium">{channel ? '1' : '2'} · Approved template
            <select value={form.template_ref ?? ''} onChange={(e) => setForm({ ...form, template_ref: e.target.value })}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 focus:ring-2 focus:ring-gray-300">
              {channelTemplates.length === 0 && <option value="">— none approved yet —</option>}
              {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!channelTemplates.length && (
              <span className="text-xs text-amber-600">
                No approved {formChannel} templates — <Link className="underline" to="/panel/marketing/templates">open Templates</Link>.
              </span>
            )}
          </label>
          <label className="text-sm font-medium">Campaign name <span className="font-normal text-gray-400">(auto)</span>
            <input value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value, nameTouched: true })}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 focus:ring-2 focus:ring-gray-300" />
          </label>
        </div>

        {/* What the recipient sees — rendered the way this channel renders. */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</div>
            <ChannelPreview
              channel={formChannel}
              subject={selectedTemplate?.subject}
              body={selectedTemplate?.body}
              storeName={currentStore?.storeName}
            />
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
            <div className="mb-1 font-semibold uppercase tracking-wide text-gray-500">Worth knowing</div>
            <p className="leading-relaxed">{CHANNEL_META[formChannel].gotcha}</p>
            <p className="mt-2 leading-relaxed">
              {CHANNEL_META[formChannel].preApproved
                ? 'The provider pre-approves every body — you pick from approved templates, you don’t write here.'
                : 'No provider approval needed — this panel’s own draft → approved workflow is the only gate.'}
            </p>
            <p className="mt-2 leading-relaxed">
              {CHANNEL_META[formChannel].addressedBy === 'device'
                ? 'Addressed by browser subscription — there is no contact detail to be missing.'
                : <>Addressed by <b>{CHANNEL_META[formChannel].addressedBy}</b>; contacts without one are skipped automatically.</>}
            </p>
          </div>
        </div>

        {/* A/B test */}
        {formChannel !== 'push' && (
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
            <label className="text-sm font-medium">
              <input type="checkbox" checked={!!form.abEnabled}
                onChange={(e) => setForm({ ...form, abEnabled: e.target.checked, template_ref_b: e.target.checked ? form.template_ref_b : undefined })} />
              {' '}A/B test <span className="font-normal text-gray-400">— split the audience between two approved templates (deterministic split, per-variant results)</span>
            </label>
            {form.abEnabled && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <select value={form.template_ref_b ?? ''} onChange={(e) => setForm({ ...form, template_ref_b: e.target.value })}
                  className="rounded-md border border-gray-200 px-2 py-1.5">
                  <option value="">— variant B template —</option>
                  {channelTemplates.filter((t) => t.id !== form.template_ref)
                    .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <label className="flex items-center gap-2">Split A
                  <input type="range" min={10} max={90} step={5} value={form.ab_split ?? 50}
                    onChange={(e) => setForm({ ...form, ab_split: Number(e.target.value) })} />
                  <span className="font-mono text-xs">{form.ab_split ?? 50}% / {100 - (form.ab_split ?? 50)}%</span>
                </label>
              </div>
            )}
          </div>
        )}

        {formChannel === 'push' ? (
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 text-sm text-gray-600">
            <b>Audience:</b> every active push subscriber. Push has no contact list — a browser either
            granted permission or it didn’t.
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50/60 p-3">
            <div className="text-sm font-medium">{channel ? '2' : '3'} · Audience</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <label><input type="radio" checked={form.audienceKind === 'system'}
                onChange={() => setForm({ ...form, audienceKind: 'system' })} /> Dynamic audience (always fresh)</label>
              <label><input type="radio" checked={form.audienceKind === 'list'}
                onChange={() => setForm({ ...form, audienceKind: 'list' })} /> Marketing list</label>
              <label><input type="radio" checked={form.audienceKind === 'filter'}
                onChange={() => setForm({ ...form, audienceKind: 'filter' })} /> Custom filter</label>
            </div>
            {form.audienceKind === 'system' ? (
              <div className="flex flex-wrap items-center gap-2">
                <select value={form.system ?? 'all_customers'} onChange={(e) => setForm({ ...form, system: e.target.value })}
                  className="w-full max-w-md rounded-md border border-gray-200 px-2 py-2 text-sm focus:ring-2 focus:ring-gray-300">
                  {systemAudiences
                    .filter((a) => a.channels.includes(formChannel))
                    .map((a) => <option key={a.key} value={a.key}>{a.label} ({a.count})</option>)}
                </select>
                {selectedAudience && (
                  <span className="text-xs text-gray-500">
                    {selectedAudience.description} · <b>{selectedAudience.count}</b> people (before consent filter)
                  </span>
                )}
              </div>
            ) : form.audienceKind === 'list' ? (
              <div className="flex flex-wrap items-center gap-2">
                <select value={form.list_id ?? ''} onChange={(e) => setForm({ ...form, list_id: e.target.value })}
                  className="w-full max-w-md rounded-md border border-gray-200 px-2 py-2 text-sm focus:ring-2 focus:ring-gray-300">
                  <option value="">— select a marketing list —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>)}
                </select>
                <span className="text-xs text-gray-500">
                  Lists are marketing-only and auto-populated —{' '}
                  <Link className="underline" to="/panel/marketing/audiences">create one from a dynamic audience</Link>.
                </span>
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-5">
                {numInput('min_orders', 'Min orders')}
                {numInput('min_spent', 'Min spend ₹')}
                {numInput('active_within_days', 'Active within (days)')}
                {numInput('inactive_for_days', 'Inactive for (days)')}
                <label className="text-xs text-gray-600">Segment
                  <select value={form.audience?.b2b_only ? 'b2b' : form.audience?.b2c_only ? 'b2c' : 'all'}
                    onChange={(e) => setForm({
                      ...form,
                      audience: { ...form.audience,
                        b2b_only: e.target.value === 'b2b' ? true : undefined,
                        b2c_only: e.target.value === 'b2c' ? true : undefined },
                    })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5">
                    <option value="all">All customers</option>
                    <option value="b2c">Retail (B2C) only</option>
                    <option value="b2b">B2B only</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
            <div className="mb-2 text-sm font-medium">Tracking (UTM) <span className="font-normal text-gray-400">— feeds Attribution</span></div>
            <div className="grid gap-2 md:grid-cols-3">
              {['utm_source', 'utm_medium', 'utm_campaign'].map((k) => (
                <label key={k} className="text-xs text-gray-600">{k}
                  <input value={form.utm?.[k] ?? ''}
                    onChange={(e) => setForm({
                      ...form,
                      utm: { ...form.utm, [k]: e.target.value },
                      utmTouched: { ...(form.utmTouched ?? {}), [k]: true },
                    })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 font-mono text-xs" />
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
            <div className="mb-2 text-sm font-medium">When</div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label><input type="radio" checked={form.when === 'now'}
                onChange={() => setForm({ ...form, when: 'now' })} /> Create draft (send manually)</label>
              <label><input type="radio" checked={form.when === 'schedule'}
                onChange={() => setForm({ ...form, when: 'schedule' })} /> Schedule</label>
              {form.when === 'schedule' && (
                <input type="datetime-local" value={form.scheduled_at ?? ''}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
              )}
            </div>
            {form.when === 'schedule' && (
              <p className="mt-1 text-xs text-gray-500">Fires automatically (checked every ~2 minutes) — all the same gates apply.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Btn onClick={create}
            disabled={!form.name || !form.template_ref
              || (formChannel !== 'push' && form.audienceKind === 'list' && !form.list_id)
              || (form.when === 'schedule' && !form.scheduled_at)}>
            {form.when === 'schedule' ? 'Schedule campaign' : 'Create draft'}
          </Btn>
          <span className="text-xs text-gray-400">Drafts open with an automatic size/cost estimate; nothing sends without your click.</span>
        </div>
      </div>
    </SectionCard>
  );

  // ── Campaign table (channel column only on the hub) ───────────────────────
  const table = (
    <TableShell>
      <table className="w-full text-sm">
        <THead>
          <Th>Campaign</Th>
          {!channel && <Th>Channel</Th>}
          <Th>Audience</Th>
          <Th>Status</Th>
          <Th num>Sent</Th>
          <Th num>Cost ₹</Th>
          <Th num>Created</Th>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <EmptyRow colSpan={channel ? 6 : 7}>
              {loading ? 'Loading…' : (
                <>No {meta ? meta.label : ''} campaigns yet — hit <b>New campaign</b>.</>
              )}
            </EmptyRow>
          )}
          {rows.map((c) => {
            const ch = (c.channel ?? c.type) as ChannelKey;
            const cm = CHANNEL_META[ch];
            const Icon = cm?.icon;
            return (
              <Tr key={c.id} onClick={() => openDetail(c.id)} className="cursor-pointer">
                <Td>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {c.template_name_resolved && (
                    <div className="text-xs text-gray-400">tpl: {c.template_name_resolved}</div>
                  )}
                </Td>
                {!channel && (
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {Icon && <Icon className={`h-4 w-4 ${cm.accent}`} strokeWidth={2.25} />}
                      {cm?.label ?? ch}
                    </span>
                  </Td>
                )}
                <Td muted className="text-xs">{fmtAudience(c)}</Td>
                <Td>
                  <StatusChip status={c.status} tone={CAMPAIGN_STATUS_TONE[c.status]} />
                  {c.status === 'scheduled' && c.scheduled_at && (
                    <div className="mt-0.5 text-xs text-gray-400">{new Date(c.scheduled_at).toLocaleString()}</div>
                  )}
                </Td>
                <Td num>{c.stats?.sent ?? '—'}</Td>
                <Td num>{c.actual_cost != null ? Number(c.actual_cost).toFixed(2) : '—'}</Td>
                <Td num muted className="text-xs">{new Date(c.created_at).toLocaleDateString()}</Td>
              </Tr>
            );
          })}
        </TBody>
      </table>
    </TableShell>
  );

  // ── Detail drawer-style card (unchanged behaviour) ────────────────────────
  const detailCard = detail && (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          {detail.name}
          <StatusChip status={detail.status} tone={CAMPAIGN_STATUS_TONE[detail.status]} />
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="sm" onClick={() => navigate('/panel/marketing/analytics')}>View in analytics</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
          {(detail.recipient_stats ?? []).map((s: any) => (
            <div key={s.status} className="rounded-md border border-gray-200 p-2 text-center">
              <div className="text-lg font-bold tabular-nums">{s.count}</div>
              <div className="text-xs capitalize text-gray-500">{s.status}</div>
            </div>
          ))}
          {detail.funnel && ['opened', 'clicked', 'converted'].map((k) => (
            <div key={k} className="rounded-md border border-gray-200 p-2 text-center">
              <div className="text-lg font-bold tabular-nums">{detail.funnel[k]}</div>
              <div className="text-xs capitalize text-gray-500">{k}</div>
            </div>
          ))}
        </div>
        {estimate && (
          <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 text-sm">
            Audience <b>{estimate.audience_size}</b>
            {estimate.blocked_by_consent > 0 && <> · <span className="text-amber-700">{estimate.blocked_by_consent} excluded (no consent — <Link className="underline" to="/panel/marketing/compliance">manage consent</Link>)</span></>}
            {' '}· est. cost <b>₹{estimate.estimated_cost}</b> · wallet ₹{estimate.wallet_balance}
            {!estimate.affordable && <span className="ml-2 text-red-600">Insufficient — <Link className="underline" to="/settings/wallet">top up wallet</Link></span>}
          </div>
        )}
        <div className="flex gap-2">
          {['draft', 'scheduled', 'failed', 'partial'].includes(detail.status) && hasPerm('marketing.send') && (
            <Btn onClick={() => send(detail.id)}><Send className="h-4 w-4" /> Send now</Btn>
          )}
          {hasPerm('marketing.manage') && ['draft', 'scheduled', 'failed'].includes(detail.status) && (
            <Btn variant="dangerOutline"
              onClick={() => act(async () => { await api.delete(`/marketing-hub/campaigns/${detail.id}`); setDetail(null); })}>
              <Trash2 className="h-4 w-4" /> Delete
            </Btn>
          )}
        </div>
        {detail.stats?.ab && (
          <div className="grid gap-2 md:grid-cols-2">
            {(['A', 'B'] as const).map((v) => {
              const s = detail.stats.ab[v];
              const other = detail.stats.ab[v === 'A' ? 'B' : 'A'];
              const rate = s?.size ? (s.sent ?? 0) / s.size : 0;
              const otherRate = other?.size ? (other.sent ?? 0) / other.size : 0;
              return (
                <div key={v} className={`rounded-md border p-3 text-sm ${rate >= otherRate ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}>
                  <div className="font-semibold">Variant {v} {rate >= otherRate && <span className="text-xs text-emerald-700">← leading</span>}</div>
                  <div className="text-xs text-gray-500">{s?.template}</div>
                  <div className="mt-1">size {s?.size} · sent {s?.sent ?? 0} · failed {s?.failed ?? 0}</div>
                </div>
              );
            })}
          </div>
        )}
        {detail.stats?.scheduler_error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            Scheduler: [{detail.stats.code}] {detail.stats.scheduler_error}
          </div>
        )}
      </div>
    </SectionCard>
  );

  const alerts = (
    <>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}
    </>
  );

  // ══ Single-channel panel ═══════════════════════════════════════════════════
  if (channel && meta) {
    const Icon = meta.icon;
    return (
      <Page>
        <PageHeader
          title={<span className="flex items-center gap-2"><Icon className={`h-5 w-5 ${meta.accent}`} strokeWidth={2.25} />{meta.label} campaigns</span>}
          description={meta.blurb}
          actions={
            <>
              <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/campaigns"><ArrowLeft className="h-4 w-4" /> All channels</Link></Btn>
              <Btn variant="outline" size="sm" onClick={() => { loadChannels(); load(); }}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
              <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/templates">Templates</Link></Btn>
              {canCompose && (
                <Btn size="sm" onClick={() => setShowNew((s) => !s)}>
                  {showNew ? 'Close' : `New ${meta.label} campaign`}
                </Btn>
              )}
            </>
          }
        />

        {status && <ChannelReadinessBanner status={status} />}
        {alerts}

        {status && (
          <StatGrid cols={5}>
            <StatCard label="Campaigns" value={status.campaigns_total} accent={meta.dot}
              sub={`${status.campaigns_draft} draft · ${status.campaigns_scheduled} scheduled`} />
            <StatCard label="Messages (30d)" value={status.messages_30d} icon={Users}
              sub={status.failed_30d ? `${status.failed_30d} failed` : 'no failures'}
              tone={status.failed_30d ? 'warn' : 'default'} />
            <StatCard label="Spend (30d)" value={`₹${Number(status.spend_30d).toFixed(2)}`} icon={Wallet} />
            <StatCard label="Approved templates" value={status.templates_approved} icon={Megaphone}
              sub={status.templates_pending ? `${status.templates_pending} pending` : undefined}
              tone={status.templates_approved ? 'default' : 'warn'} />
            <StatCard label="Last sent" icon={Clock}
              value={status.last_sent_at ? new Date(status.last_sent_at).toLocaleDateString() : '—'}
              sub={status.last_sent_at ? new Date(status.last_sent_at).toLocaleTimeString() : 'never'} />
          </StatGrid>
        )}

        {showNew && canCompose && composer}
        {table}
        {detailCard}
      </Page>
    );
  }

  // ══ Hub — every channel at a glance ════════════════════════════════════════
  return (
    <Page>
      <PageHeader
        title="Campaigns"
        icon={Megaphone}
        description="Each channel has its own panel — its own readiness, limits and history. Approved templates only · consent-filtered audiences · wallet-billed."
        actions={
          <>
            <Btn variant="outline" size="sm" onClick={() => { loadChannels(); load(); }}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/templates">Templates</Link></Btn>
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/audiences">Audiences</Link></Btn>
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/analytics">Analytics</Link></Btn>
          </>
        }
      />
      {alerts}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {channels.length === 0 && loading && CHANNEL_LIST.map((c) => (
          <div key={c.key} className="h-44 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
        {channels
          .slice()
          .sort((a, b) => CHANNEL_LIST.findIndex((c) => c.key === a.channel) - CHANNEL_LIST.findIndex((c) => c.key === b.channel))
          .map((s) => <ChannelCard key={s.channel} status={s} />)}
      </div>

      <SectionCard title="All campaigns" description="Every channel, newest first — open a channel panel above to compose." flush>
        {table}
      </SectionCard>
      {detailCard}
    </Page>
  );
};

export default MarketingCampaigns;
