import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Campaigns — SMS | WhatsApp | Email | Push in one panel.
 * Wizard: channel → approved template → audience (dynamic / marketing list /
 * custom filter) → tracking → send now or schedule. Everything pre-filled;
 * estimates auto-run; every entity cross-links to its own page.
 */
const CHANNELS = ['all', 'sms', 'whatsapp', 'email', 'push'] as const;
const CHANNEL_ICON: Record<string, string> = { sms: '💬', whatsapp: '🟢', email: '✉️', push: '🔔' };

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-amber-100 text-amber-800 animate-pulse', sent: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-700',
};

const MarketingCampaigns: React.FC = () => {
  const { hasPerm } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof CHANNELS)[number]>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [systemAudiences, setSystemAudiences] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ channel: 'sms', audienceKind: 'system', system: 'all_customers', audience: {}, utm: {}, when: 'now' });
  const [detail, setDetail] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    const r = await api.get('/marketing-hub/campaigns', { params: tab !== 'all' ? { channel: tab } : {} });
    setRows(payload(r) ?? []);
  };
  useEffect(() => { load().catch(() => {}); }, [tab]);
  useEffect(() => {
    api.get('/marketing-hub/templates', { params: { status: 'approved' } })
      .then((r) => setTemplates(payload(r) ?? [])).catch(() => {});
    api.get('/marketing-hub/audiences/lists').then((r) => setLists(payload(r) ?? [])).catch(() => {});
    api.get('/marketing-hub/audiences/system').then((r) => setSystemAudiences(payload(r) ?? [])).catch(() => {});
  }, [showNew]);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message); }
  };

  const channelTemplates = templates.filter((t) => t.channel === form.channel);
  const selectedAudience = systemAudiences.find((a) => a.key === form.system);
  const selectedTemplate = channelTemplates.find((t) => t.id === form.template_ref);

  // ── Autofill: name / template / UTM follow the choices until edited ───────
  const autoName = useMemo(() => {
    const aud = form.audienceKind === 'list'
      ? (lists.find((l) => l.id === form.list_id)?.name ?? 'List')
      : (selectedAudience?.label ?? 'Audience');
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${form.channel.toUpperCase()} · ${aud} · ${date}`;
  }, [form.channel, form.system, form.audienceKind, form.list_id, systemAudiences, lists]);

  useEffect(() => { setForm((f: any) => (f.nameTouched ? f : { ...f, name: autoName })); }, [autoName]);
  useEffect(() => {
    if (!form.template_ref || !channelTemplates.some((t) => t.id === form.template_ref)) {
      setForm((f: any) => ({ ...f, template_ref: channelTemplates[0]?.id ?? '' }));
    }
  }, [form.channel, templates]);
  useEffect(() => {
    setForm((f: any) => ({
      ...f,
      utm: {
        utm_source: f.utmTouched?.utm_source ? f.utm?.utm_source : f.channel,
        utm_medium: f.utmTouched?.utm_medium ? f.utm?.utm_medium : 'crm',
        utm_campaign: f.utmTouched?.utm_campaign ? f.utm?.utm_campaign
          : String(f.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      },
    }));
  }, [form.channel, form.name]);

  const create = () => act(async () => {
    const body: any = {
      name: form.name, channel: form.channel, template_ref: form.template_ref,
      template_ref_b: form.abEnabled ? form.template_ref_b || null : null,
      ab_split: form.ab_split ?? 50,
      utm: form.utm,
      scheduled_at: form.when === 'schedule' && form.scheduled_at ? form.scheduled_at : null,
    };
    if (form.channel !== 'push') {
      if (form.audienceKind === 'list') body.list_id = form.list_id;
      else if (form.audienceKind === 'system') body.audience = { system: form.system };
      else body.audience = form.audience;
    }
    const r = await api.post('/marketing-hub/campaigns', body);
    setShowNew(false);
    setForm({ channel: 'sms', audienceKind: 'system', system: 'all_customers', audience: {}, utm: {}, when: 'now' });
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
        className="mt-1 w-full rounded-md border px-2 py-1.5" />
    </label>
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) { const ch = r.channel ?? r.type; c[ch] = (c[ch] ?? 0) + 1; }
    return c;
  }, [rows]);

  const fmtAudience = (c: any) =>
    c.list_name ? `List: ${c.list_name}`
      : c.audience?.system ? (systemAudiences.find((a) => a.key === c.audience.system)?.label ?? c.audience.system)
      : 'Custom filter';

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      {/* Header + breadcrumb links */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-gray-400">
            <Link to="/panel/marketing" className="hover:underline">Marketing</Link> / Campaigns
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500">
            Approved templates only · consent-filtered audiences · wallet-billed · scheduled sends fire automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/panel/marketing/templates" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Templates</Link>
          <Link to="/panel/marketing/audiences" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Audiences</Link>
          <Link to="/panel/marketing/analytics" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Analytics</Link>
          {hasPerm('marketing.manage') && (
            <button onClick={() => setShowNew((s) => !s)}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm">
              {showNew ? 'Close' : '+ New campaign'}
            </button>
          )}
        </div>
      </div>

      {/* Channel tabs with counts */}
      <div className="flex gap-1">
        {CHANNELS.map((c) => (
          <button key={c} onClick={() => setTab(c)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === c ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:bg-gray-100'}`}>
            {c !== 'all' && <span className="mr-1">{CHANNEL_ICON[c]}</span>}{c}
            <span className="ml-1 text-xs opacity-70">{counts[c] ?? 0}</span>
          </button>
        ))}
      </div>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {/* Wizard */}
      {showNew && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">
            New campaign <span className="font-normal text-gray-400">— everything is prefilled; adjust what you like.</span>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-medium">1 · Channel
                <select value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value, template_ref: undefined })}
                  className="mt-1 w-full rounded-md border px-2 py-2 capitalize focus:ring-2 focus:ring-primary/30">
                  {['sms', 'whatsapp', 'email', 'push'].map((c) => <option key={c} value={c}>{CHANNEL_ICON[c]} {c}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">2 · Approved template
                <select value={form.template_ref ?? ''} onChange={(e) => setForm({ ...form, template_ref: e.target.value })}
                  className="mt-1 w-full rounded-md border px-2 py-2 focus:ring-2 focus:ring-primary/30">
                  {channelTemplates.length === 0 && <option value="">— none approved yet —</option>}
                  {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {!channelTemplates.length ? (
                  <span className="text-xs text-amber-600">
                    No approved {form.channel} templates — <Link className="underline" to="/panel/marketing/templates">open Templates</Link> (starter set + SMS/WhatsApp sync are automatic).
                  </span>
                ) : selectedTemplate && (
                  <span className="mt-0.5 block truncate text-xs text-gray-400" title={selectedTemplate.body}>
                    “{selectedTemplate.body}”
                  </span>
                )}
              </label>
              <label className="text-sm font-medium">Campaign name <span className="font-normal text-gray-400">(auto)</span>
                <input value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value, nameTouched: true })}
                  className="mt-1 w-full rounded-md border px-2 py-2 focus:ring-2 focus:ring-primary/30" />
              </label>
            </div>

            {/* A/B test */}
            {form.channel !== 'push' && (
              <div className="rounded-md border bg-gray-50 p-3">
                <label className="text-sm font-medium">
                  <input type="checkbox" checked={!!form.abEnabled}
                    onChange={(e) => setForm({ ...form, abEnabled: e.target.checked, template_ref_b: e.target.checked ? form.template_ref_b : undefined })} />
                  {' '}A/B test <span className="font-normal text-gray-400">— split the audience between two approved templates (deterministic split, per-variant results)</span>
                </label>
                {form.abEnabled && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <select value={form.template_ref_b ?? ''} onChange={(e) => setForm({ ...form, template_ref_b: e.target.value })}
                      className="rounded-md border px-2 py-1.5">
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

            {form.channel !== 'push' && (
              <div className="space-y-2 rounded-md border bg-gray-50 p-3">
                <div className="text-sm font-medium">3 · Audience</div>
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
                      className="w-full max-w-md rounded-md border px-2 py-2 text-sm focus:ring-2 focus:ring-primary/30">
                      {systemAudiences
                        .filter((a) => a.channels.includes(form.channel))
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
                      className="w-full max-w-md rounded-md border px-2 py-2 text-sm focus:ring-2 focus:ring-primary/30">
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
                        className="mt-1 w-full rounded-md border px-2 py-1.5">
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
              <div className="rounded-md border bg-gray-50 p-3">
                <div className="mb-2 text-sm font-medium">4 · Tracking (UTM) <span className="font-normal text-gray-400">— feeds Attribution</span></div>
                <div className="grid gap-2 md:grid-cols-3">
                  {['utm_source', 'utm_medium', 'utm_campaign'].map((k) => (
                    <label key={k} className="text-xs text-gray-600">{k}
                      <input value={form.utm?.[k] ?? ''}
                        onChange={(e) => setForm({
                          ...form,
                          utm: { ...form.utm, [k]: e.target.value },
                          utmTouched: { ...(form.utmTouched ?? {}), [k]: true },
                        })}
                        className="mt-1 w-full rounded-md border px-2 py-1.5 font-mono text-xs" />
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-md border bg-gray-50 p-3">
                <div className="mb-2 text-sm font-medium">5 · When</div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label><input type="radio" checked={form.when === 'now'}
                    onChange={() => setForm({ ...form, when: 'now' })} /> Create draft (send manually)</label>
                  <label><input type="radio" checked={form.when === 'schedule'}
                    onChange={() => setForm({ ...form, when: 'schedule' })} /> Schedule</label>
                  {form.when === 'schedule' && (
                    <input type="datetime-local" value={form.scheduled_at ?? ''}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      className="rounded-md border px-2 py-1.5 text-sm" />
                  )}
                </div>
                {form.when === 'schedule' && (
                  <p className="mt-1 text-xs text-gray-500">Fires automatically (checked every ~2 minutes) — all the same gates apply.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={create}
                disabled={!form.name || !form.template_ref
                  || (form.channel !== 'push' && form.audienceKind === 'list' && !form.list_id)
                  || (form.when === 'schedule' && !form.scheduled_at)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50">
                {form.when === 'schedule' ? 'Schedule campaign' : 'Create draft'}
              </button>
              <span className="text-xs text-gray-400">Drafts open with an automatic size/cost estimate; nothing sends without your click.</span>
            </div>
          </div>
        </div>
      )}

      {/* Campaign table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Campaign</th><th>Channel</th><th>Audience</th>
              <th>Status</th><th className="text-right">Sent</th><th className="text-right">Cost ₹</th>
              <th className="text-right">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                No campaigns yet — hit <b>+ New campaign</b>. Templates and audiences are auto-provisioned.
              </td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} onClick={() => openDetail(c.id)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{c.name}
                  {c.template_name_resolved && <div className="text-xs font-normal text-gray-400">tpl: {c.template_name_resolved}</div>}
                </td>
                <td className="capitalize">{CHANNEL_ICON[c.channel ?? c.type]} {c.channel ?? c.type}</td>
                <td className="text-xs text-gray-500">{fmtAudience(c)}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${STATUS_BADGE[c.status] ?? 'bg-gray-100'}`}>{c.status}</span>
                  {c.status === 'scheduled' && c.scheduled_at && (
                    <div className="text-xs text-gray-400">{new Date(c.scheduled_at).toLocaleString()}</div>
                  )}
                </td>
                <td className="text-right">{c.stats?.sent ?? '—'}</td>
                <td className="text-right font-mono">{c.actual_cost != null ? Number(c.actual_cost).toFixed(2) : '—'}</td>
                <td className="text-right text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail */}
      {detail && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
            <div className="font-semibold">
              {detail.name}
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">{detail.channel ?? detail.type}</span>
              <span className={`ml-2 rounded px-1.5 py-0.5 text-xs capitalize ${STATUS_BADGE[detail.status] ?? ''}`}>{detail.status}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={() => navigate('/panel/marketing/analytics')} className="text-primary hover:underline">View in analytics →</button>
              <button onClick={() => setDetail(null)} className="text-gray-500">Close</button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
              {(detail.recipient_stats ?? []).map((s: any) => (
                <div key={s.status} className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold">{s.count}</div>
                  <div className="text-xs capitalize text-gray-500">{s.status}</div>
                </div>
              ))}
              {detail.funnel && ['opened', 'clicked', 'converted'].map((k) => (
                <div key={k} className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold">{detail.funnel[k]}</div>
                  <div className="text-xs capitalize text-gray-500">{k}</div>
                </div>
              ))}
            </div>
            {estimate && (
              <div className="rounded-md border bg-blue-50/50 p-3 text-sm">
                Audience <b>{estimate.audience_size}</b>
                {estimate.blocked_by_consent > 0 && <> · <span className="text-amber-700">{estimate.blocked_by_consent} excluded (no consent — <Link className="underline" to="/panel/marketing/compliance">manage consent</Link>)</span></>}
                {' '}· est. cost <b>₹{estimate.estimated_cost}</b> · wallet ₹{estimate.wallet_balance}
                {!estimate.affordable && <span className="ml-2 text-red-600">Insufficient — <Link className="underline" to="/settings/wallet">top up wallet</Link></span>}
              </div>
            )}
            <div className="flex gap-2">
              {['draft', 'scheduled', 'failed', 'partial'].includes(detail.status) && hasPerm('marketing.send') && (
                <button onClick={() => send(detail.id)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">
                  Send now
                </button>
              )}
              {hasPerm('marketing.manage') && ['draft', 'scheduled', 'failed'].includes(detail.status) && (
                <button onClick={() => act(async () => { await api.delete(`/marketing-hub/campaigns/${detail.id}`); setDetail(null); })}
                  className="rounded-md border px-3 py-2 text-sm text-red-600">Delete</button>
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
                    <div key={v} className={`rounded-md border p-3 text-sm ${rate >= otherRate ? 'border-green-300 bg-green-50/50' : ''}`}>
                      <div className="font-semibold">Variant {v} {rate >= otherRate && <span className="text-xs text-green-700">← leading</span>}</div>
                      <div className="text-xs text-gray-500">{s?.template}</div>
                      <div className="mt-1">size {s?.size} · sent {s?.sent ?? 0} · failed {s?.failed ?? 0}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {detail.stats?.scheduler_error && (
              <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                Scheduler: [{detail.stats.code}] {detail.stats.scheduler_error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingCampaigns;
