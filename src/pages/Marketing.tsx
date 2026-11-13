import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Send, Trash2, Zap } from 'lucide-react';
import { api } from '../services/api';
import { payload } from '../lib/unwrap';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '@/components/erp';
import { CHANNEL_LIST, CHANNEL_META, CAMPAIGN_STATUS_TONE, isChannelKey, type ChannelKey } from './panels/marketing/campaigns/channelMeta';
import type { ChannelStatus } from './panels/marketing/campaigns/ChannelReadiness';
import { ChannelPreview } from './panels/marketing/campaigns/ChannelPreview';
import { SendCheck, estimateOf, sendBlockers, type CampaignEstimate } from './panels/marketing/campaigns/SendCheck';
import { Figure, Lead, LoadFailure, ago, linkCls, moneyMajor, num, plural, useLoad, writeError } from './panels/marketing/meta/common';
import { localeDate, localeDateTime } from '../utils/date';

/**
 * Message campaigns > Quick send (`/marketing`, MENU-1 mkt-messaging): one screen to send a campaign and see what
 * was sent. It opens with what to act on (campaigns that did not fully send, drafts waiting, channels that cannot
 * send), then a short sender: channel, an approved template with its preview, an audience, a check of who it reaches
 * and what it costs (the shared SendCheck, from the campaign estimate), and the send. Below it, the history with
 * results.
 *
 * It runs on the hub contract only (lib/v2/areas/marketing.ts rows to /api/v2/marketing/campaigns and
 * /api/v2/comms/marketing-templates): approved templates, people who agreed to marketing, billed to the wallet,
 * the plan's monthly allowance checked, every send behind a click. The full composer (A/B, UTM, filters, schedule)
 * is the channel's own page. Abandoned carts are handled on Orders, Abandoned carts.
 */

type AudienceKind = 'system' | 'list';
interface Draft { id: string; name: string; channel: ChannelKey }

const OPEN_STATUSES = ['draft', 'scheduled', 'failed', 'partial'];

/** A campaign's results line from its `stats` ({total, sent, failed, skipped}). */
function resultOf(c: any): { sent: number; failed: number; total: number } | null {
  const s = c?.stats;
  if (!s || typeof s !== 'object' || s.sent === undefined) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { sent: n(s.sent), failed: n(s.failed), total: n(s.total) };
}

export default function Marketing() {
  const { hasPerm } = useAuth();
  const { currentStore } = useStore();
  const canCompose = hasPerm('marketing.manage');
  const canSend = hasPerm('marketing.send');
  const canDelete = hasPerm('marketing.delete');

  const channelsQ = useLoad(async () => (payload(await api.get('/marketing-hub/channels'))?.channels ?? []) as ChannelStatus[], []);
  const campaignsQ = useLoad(async () => (payload(await api.get('/marketing-hub/campaigns', { params: { limit: 50 } })) ?? []) as any[], []);
  const templatesQ = useLoad(async () => (payload(await api.get('/marketing-hub/templates', { params: { status: 'approved' } })) ?? []) as any[], []);
  const audiencesQ = useLoad(async () => (payload(await api.get('/marketing-hub/audiences/system')) ?? []) as any[], []);
  const listsQ = useLoad(async () => (payload(await api.get('/marketing-hub/audiences/lists')) ?? []) as any[], []);

  const channels = channelsQ.data ?? [];
  const campaigns = campaignsQ.data ?? [];
  const templates = templatesQ.data ?? [];
  const audiences = audiencesQ.data ?? [];
  const lists = listsQ.data ?? [];

  const readyChannels = channels.filter((c) => c.ready).map((c) => c.channel);
  const [channel, setChannel] = useState<ChannelKey | null>(null);
  // Start on the first channel that can send; the store's own readiness decides, not a typed order.
  useEffect(() => {
    if (channel || !channels.length) return;
    const first = readyChannels[0] ?? channels[0]?.channel;
    if (first && isChannelKey(first)) setChannel(first);
  }, [channels, channel, readyChannels]);

  const ch: ChannelKey = channel ?? 'sms';
  const status = channels.find((c) => c.channel === ch);
  const channelTemplates = templates.filter((t) => t.channel === ch);
  const channelAudiences = audiences.filter((a) => Array.isArray(a.channels) && a.channels.includes(ch));

  const [templateRef, setTemplateRef] = useState('');
  const [kind, setKind] = useState<AudienceKind>('system');
  const [systemKey, setSystemKey] = useState('');
  const [listId, setListId] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  // Keep the picks valid for the channel in hand.
  useEffect(() => {
    if (!channelTemplates.some((t) => t.id === templateRef)) setTemplateRef(channelTemplates[0]?.id ?? '');
    if (!channelAudiences.some((a) => a.key === systemKey)) setSystemKey(channelAudiences[0]?.key ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch, templates, audiences]);

  const template = channelTemplates.find((t) => t.id === templateRef);
  const audienceLabel = ch === 'push' ? 'Push subscribers'
    : kind === 'list' ? (lists.find((l) => l.id === listId)?.name ?? 'List')
    : (channelAudiences.find((a) => a.key === systemKey)?.label ?? 'Audience');
  const autoName = `${CHANNEL_META[ch].label}, ${audienceLabel}, ${localeDate(new Date(), { day: 'numeric', month: 'short' }, 'en-IN')}`;
  useEffect(() => { if (!nameTouched) setName(autoName); }, [autoName, nameTouched]);

  // The check-then-send step, for a new campaign or a draft from the history.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'send' | 'discard' | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const runCheck = async (d: Draft) => {
    setDraft(d); setEstimate(null); setCheckError(null); setChecking(true); setInfo(''); setError('');
    try { setEstimate(estimateOf(payload(await api.post(`/marketing-hub/campaigns/${d.id}/estimate`)))); }
    catch (e) { setCheckError(writeError(e, 'The estimate was refused.')); }
    finally { setChecking(false); }
  };

  const createAndCheck = async () => {
    setBusy('create'); setError(''); setInfo('');
    try {
      const body: Record<string, unknown> = { name: name.trim() || autoName, channel: ch, template_ref: templateRef };
      if (ch !== 'push') {
        if (kind === 'list') body.list_id = listId;
        else body.audience = { system: systemKey };
      }
      const created = payload(await api.post('/marketing-hub/campaigns', body));
      campaignsQ.reload();
      await runCheck({ id: String(created?.id ?? ''), name: String(created?.name ?? body.name), channel: ch });
    } catch (e) {
      setError(writeError(e, 'The campaign was not saved.'));
    } finally { setBusy(null); }
  };

  const sendNow = async () => {
    if (!draft) return;
    setBusy('send'); setError('');
    try {
      const started = payload(await api.post(`/marketing-hub/campaigns/${draft.id}/send`));
      const n = Number(started?.audience_size ?? estimate?.audience_size ?? 0);
      setInfo(`"${draft.name}" is sending to ${plural(n, 'person', 'people')}. Results fill in below as messages go out.`);
      setDraft(null); setEstimate(null); setNameTouched(false);
      campaignsQ.reload(); channelsQ.reload();
    } catch (e) {
      setError(writeError(e, 'The send was refused.'));
    } finally { setBusy(null); }
  };

  const discard = async () => {
    if (!draft) return;
    setBusy('discard'); setError('');
    try {
      await api.delete(`/marketing-hub/campaigns/${draft.id}`);
      setInfo(`"${draft.name}" was discarded.`);
      setDraft(null); setEstimate(null);
      campaignsQ.reload();
    } catch (e) {
      setError(writeError(e, 'The draft was not discarded.'));
    } finally { setBusy(null); }
  };

  // What to act on.
  const notFullySent = campaigns.filter((c) => c.status === 'failed' || c.status === 'partial');
  const drafts = campaigns.filter((c) => c.status === 'draft');
  const scheduled = campaigns
    .filter((c) => c.status === 'scheduled' && c.scheduled_at)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const sent30 = useMemo(() => {
    const since = Date.now() - 30 * 86_400_000;
    return campaigns.filter((c) => c.sent_at && new Date(c.sent_at).getTime() >= since);
  }, [campaigns]);
  const spent30 = sent30.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const reached30 = sent30.reduce((s, c) => s + (resultOf(c)?.sent ?? 0), 0);
  const blockers = estimate ? sendBlockers(estimate) : [];
  const composeBlocked = !templateRef || (ch !== 'push' && (kind === 'list' ? !listId : !systemKey));
  const channelHref = (c: string) => (isChannelKey(c) ? `/panel/marketing/campaigns/${c}` : '/panel/marketing/campaigns');

  return (
    <Page>
      <PageHeader
        title="Quick send"
        icon={Zap}
        description="Send a campaign from one screen and see what went out. Approved templates only, to people who agreed to marketing, billed to the wallet."
        actions={(
          <>
            <Btn variant="outline" size="sm" onClick={() => { channelsQ.reload(); campaignsQ.reload(); }}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/templates">Templates</Link></Btn>
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/campaigns">All campaigns</Link></Btn>
          </>
        )}
      />

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}

      {/* What to act on first. */}
      {campaignsQ.data && (notFullySent.length > 0 ? (
        <Lead tone="bad" title={`${plural(notFullySent.length, 'campaign')} did not fully send`}>
          <ul className="space-y-0.5">
            {notFullySent.slice(0, 3).map((c) => {
              const r = resultOf(c);
              return (
                <li key={c.id}>
                  <Link className={linkCls} to={channelHref(c.channel)}>{c.name}</Link>
                  {r ? `: ${num(r.sent)} sent, ${num(r.failed)} failed` : ''}{c.stats?.scheduler_error ? `. ${c.stats.scheduler_error}` : ''}
                </li>
              );
            })}
            {notFullySent.length > 3 && <li>and {plural(notFullySent.length - 3, 'more')}</li>}
          </ul>
        </Lead>
      ) : drafts.length > 0 ? (
        <Lead tone="info" title={`${plural(drafts.length, 'draft')} waiting to be sent`}>
          The oldest is "{drafts[drafts.length - 1].name}", saved {ago(drafts[drafts.length - 1].created_at)}. Use Check and send in the history below.
        </Lead>
      ) : scheduled.length > 0 ? (
        <Lead tone="info" title={`Next send: "${scheduled[0].name}"`}>
          {localeDateTime(scheduled[0].scheduled_at)}{scheduled.length > 1 ? `, then ${plural(scheduled.length - 1, 'more scheduled campaign')}` : ''}.
        </Lead>
      ) : (
        <Lead tone="good" title="Nothing is waiting">Every campaign has gone out. Start a new one below.</Lead>
      ))}
      {channelsQ.data && readyChannels.length === 0 && channels.length > 0 && (
        <Lead tone="warn" title="No channel can send yet"
          actions={channels[0]?.fix_path ? <Btn size="sm" variant="outline" asChild><Link to={channels[0].fix_path}>{channels[0].fix_label || 'Fix it'}</Link></Btn> : undefined}>
          {channels.map((c) => `${CHANNEL_META[c.channel]?.label ?? c.channel}: ${c.blockers[0] ?? 'not ready'}`).join(' ')}
        </Lead>
      )}

      {campaignsQ.data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label="Campaigns sent, 30 days" value={num(sent30.length)} sub={`${plural(reached30, 'message')} sent`} />
          <Figure label="Spent in 30 days" value={moneyMajor(spent30)} />
          <Figure label="Drafts" value={num(drafts.length)} tone={drafts.length ? 'info' : 'neutral'} />
          <Figure label="Did not fully send" value={num(notFullySent.length)} tone={notFullySent.length ? 'bad' : 'neutral'} />
        </div>
      )}

      {/* The sender. */}
      {canCompose ? (
        <SectionCard title="Send a campaign" description="Pick a channel, an approved template and who gets it. Nothing sends until you press Send now.">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
              {(channels.length ? channels.map((c) => c.channel) : CHANNEL_LIST.map((c) => c.key)).filter(isChannelKey).map((k) => {
                const st = channels.find((c) => c.channel === k);
                const Icon = CHANNEL_META[k].icon;
                return (
                  <button key={k} type="button" role="radio" aria-checked={ch === k}
                    onClick={() => { setChannel(k); setDraft(null); setEstimate(null); }}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${ch === k ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                    <Icon className="h-4 w-4" /> {CHANNEL_META[k].label}
                    {st && !st.ready && <span className={`text-xs ${ch === k ? 'text-amber-200' : 'text-amber-700'}`}>(not ready)</span>}
                  </button>
                );
              })}
            </div>
            {status && !status.ready && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {status.blockers.join(' ')}{' '}
                {status.fix_path && (!status.configured || !status.enabled) && <Link className={linkCls} to={status.fix_path}>{status.fix_label}</Link>}
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm font-medium">Approved template
                  <select value={templateRef} onChange={(e) => { setTemplateRef(e.target.value); setDraft(null); }}
                    className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                    {channelTemplates.length === 0 && <option value="">{templatesQ.loading ? 'Loading...' : 'None approved yet'}</option>}
                    {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {!templatesQ.loading && channelTemplates.length === 0 && (
                    <span className="mt-1 block text-xs font-normal text-amber-700">
                      No approved {CHANNEL_META[ch].label} template yet. <Link className={linkCls} to="/panel/marketing/templates">Open Templates</Link>.
                    </span>
                  )}
                </label>

                {ch === 'push' ? (
                  <p className="text-sm text-gray-600">Push goes to every browser that allowed your notifications.</p>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Who gets it</legend>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <label className="inline-flex items-center gap-1.5"><input type="radio" checked={kind === 'system'} onChange={() => { setKind('system'); setDraft(null); }} /> A saved audience</label>
                      <label className="inline-flex items-center gap-1.5"><input type="radio" checked={kind === 'list'} onChange={() => { setKind('list'); setDraft(null); }} /> A contact list</label>
                    </div>
                    {kind === 'system' ? (
                      <select aria-label="Saved audience" value={systemKey} onChange={(e) => { setSystemKey(e.target.value); setDraft(null); }}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                        {channelAudiences.length === 0 && <option value="">{audiencesQ.loading ? 'Loading...' : 'No audience reaches this channel'}</option>}
                        {channelAudiences.map((a) => <option key={a.key} value={a.key}>{a.label} ({num(a.count)})</option>)}
                      </select>
                    ) : (
                      <select aria-label="Contact list" value={listId} onChange={(e) => { setListId(e.target.value); setDraft(null); }}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                        <option value="">{listsQ.loading ? 'Loading...' : lists.length ? 'Pick a contact list' : 'No contact lists yet'}</option>
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({num(l.member_count)})</option>)}
                      </select>
                    )}
                    <p className="text-xs text-gray-500">Counts are before consent; the check below says how many can really be reached.</p>
                  </fieldset>
                )}

                <label className="block text-sm font-medium">Name <span className="font-normal text-gray-400">(for your history)</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm" />
                </label>
              </div>

              <div className="rounded-md border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">What they see</div>
                {template
                  ? <ChannelPreview channel={ch} subject={template.subject} body={template.body} storeName={currentStore?.storeName} />
                  : <p className="text-sm text-gray-500">Pick a template to see the message.</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Btn onClick={createAndCheck} disabled={composeBlocked || !!busy || !!draft}>
                {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />} Check before sending
              </Btn>
              <span className="text-xs text-gray-500">
                Saves a draft and shows who it reaches and what it costs. A/B tests, tracking and scheduling are on the
                {' '}<Link className={linkCls} to={`/panel/marketing/campaigns/${ch}?new=1`}>{CHANNEL_META[ch].label} campaigns page</Link>.
              </span>
            </div>
          </div>
        </SectionCard>
      ) : (
        <p className="text-sm text-gray-600">Writing a campaign needs the marketing manage permission. The history is below.</p>
      )}

      {/* The check, then the send: for a new campaign or a draft picked from the history. */}
      {draft && (
        <SectionCard title={`Check and send "${draft.name}"`} description={`${CHANNEL_META[draft.channel].label}. Nothing goes out until you press Send now.`}>
          <div className="space-y-3">
            <SendCheck estimate={estimate} loading={checking} error={checkError} />
            <div className="flex flex-wrap gap-2">
              {canSend ? (
                <Btn onClick={sendNow} disabled={checking || !!checkError || !estimate || blockers.length > 0 || !!busy}>
                  {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
                </Btn>
              ) : <span className="self-center text-sm text-gray-600">Sending needs the marketing send permission. The draft stays saved for someone who has it.</span>}
              <Btn variant="outline" onClick={() => { setDraft(null); setEstimate(null); }} disabled={!!busy}>Keep as draft</Btn>
              {canDelete && (
                <Btn variant="dangerOutline" onClick={discard} disabled={!!busy}>
                  {busy === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Discard
                </Btn>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* The history. */}
      <SectionCard title="History" description="The latest 50 campaigns on every channel, newest first." flush>
        {campaignsQ.error && !campaignsQ.data ? (
          <div className="p-4"><LoadFailure failure={campaignsQ.error} what="The campaign history is not served on this backend yet." onRetry={campaignsQ.reload} /></div>
        ) : (
          <TableShell className="rounded-none border-0 shadow-none">
            <table className="w-full min-w-[40rem] text-sm">
              <THead>
                <Th>Campaign</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th num>Sent</Th>
                <Th num>Failed</Th>
                <Th num>Cost</Th>
                <Th num>When</Th>
                <Th />
              </THead>
              <TBody>
                {campaigns.length === 0 && (
                  <EmptyRow colSpan={8}>{campaignsQ.loading ? 'Loading...' : 'No campaigns yet. The first one you send shows here.'}</EmptyRow>
                )}
                {campaigns.map((c) => {
                  const r = resultOf(c);
                  const cKey = String(c.channel ?? '');
                  const cm = isChannelKey(cKey) ? CHANNEL_META[cKey] : null;
                  const when = c.sent_at ?? (c.status === 'scheduled' ? c.scheduled_at : null) ?? c.created_at;
                  return (
                    <Tr key={c.id}>
                      <Td>
                        <Link className="font-medium text-gray-900 hover:underline" to={channelHref(c.channel)}>{c.name}</Link>
                        {c.template_name && <div className="text-xs text-gray-500">{c.template_name}</div>}
                      </Td>
                      <Td>{cm?.label ?? c.channel}</Td>
                      <Td><StatusChip status={c.status} tone={CAMPAIGN_STATUS_TONE[c.status]} /></Td>
                      <Td num>{r ? num(r.sent) : ''}</Td>
                      <Td num>{r && r.failed ? num(r.failed) : ''}</Td>
                      <Td num>{c.actual_cost != null ? moneyMajor(Number(c.actual_cost)) : ''}</Td>
                      <Td num muted className="text-xs">{when ? localeDate(when) : ''}</Td>
                      <Td num>
                        {canSend && OPEN_STATUSES.includes(c.status) && isChannelKey(c.channel) && (
                          <Btn size="sm" variant="outline" disabled={!!busy || checking}
                            onClick={() => { void runCheck({ id: String(c.id), name: String(c.name ?? 'Campaign'), channel: c.channel as ChannelKey }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                            Check and send
                          </Btn>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        )}
      </SectionCard>

      <p className="text-xs text-gray-500">
        Reminders for carts people left behind are on <Link className={linkCls} to="/orders/abandoned-carts">Orders, Abandoned carts</Link>.
      </p>
    </Page>
  );
}
