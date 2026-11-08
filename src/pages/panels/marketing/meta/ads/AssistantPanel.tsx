/**
 * The Ads Manager's assistant (lane META-17, MCP-02): a side panel where a person asks about the store's Meta ad
 * account. The server reads the account through Meta's ads MCP server with read tools only and answers with its
 * sources; any change comes back as a proposal, a paused ad draft. Preview makes the draft through the same drafts
 * route Create ad uses (as this person) and shows Meta's previews; Apply creates campaign, ad set and ad, all paused,
 * after a confirmation in money. Nothing spends until a person resumes it. Off by default (store setting
 * `meta_assistant`); not verified with a real token until the owner's spike (MCP-01), which the panel says.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ChevronDown, Loader2, RefreshCw, Send, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  metaAdsApi, metaAssistantApi,
  type AdsDraft, type AdsDraftInput, type AssistantAnswer, type AssistantProposal, type AssistantStatus, type AssistantTools, type AssistantTurn,
} from '@/lib/v2/areas/meta';
import { Lead, LoadFailure, StateChip, ago, linkCls, money, plural, useLoad, writeError, type Tone } from '../common';
import { ADS_ROUTES, metaHref } from '../routes';
import { PreviewGrid } from './pieces';

const SUGGESTIONS = [
  'Explain my account: what is working and what is not?',
  'Which campaigns lose money, and why?',
  'Is my pixel sending good purchase data?',
  'Propose a sales ad for my best performing video',
];

const LEVEL_NAME: Record<string, string> = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };

/** One turn on screen: the person's question, then the answer (or the failure in words). */
interface Exchange { question: string; answer: AssistantAnswer | null; error: string | null }

const proposalKey = (p: AssistantProposal, i: number) => p.id ?? `unsaved-${i}-${p.title}`;

const budgetLine = (p: AssistantProposal, cur: string): string => {
  const b = p.budget;
  if (!b || typeof b.amount_minor !== 'number') return 'Budget: the store default';
  return `${money(b.amount_minor, cur)} ${b.kind === 'lifetime' ? 'in total' : 'a day'}`;
};

const statusTone = (s: string): Tone => (s === 'drafted' ? 'info' : s === 'dismissed' ? 'neutral' : s === 'applied' ? 'good' : 'warn');
const statusWord = (p: AssistantProposal): string => {
  if (p.draft_status === 'applied') return 'Applied, paused';
  if (p.status === 'drafted') return 'Draft made';
  if (p.status === 'dismissed') return 'Dismissed';
  return 'Proposed';
};

export const AssistantPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  /** The ad account's currency (budgets are in its minor units). */
  cur: string;
  canAct: boolean;
  /** A campaign was created (paused): the table reloads. */
  onApplied: () => void;
}> = ({ open, onClose, cur, canAct, onApplied }) => {
  const { toast } = useToast();
  const status = useLoad(() => (open ? metaAssistantApi.status() : Promise.resolve(null as AssistantStatus | null)), [open]);
  const s = status.data;
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [switching, setSwitching] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [exchanges.length, asking]);

  const enabled = !!s?.settings.enabled;
  const maxChars = s?.settings.limits.max_message_chars ?? 2000;

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || asking) return;
    const history: AssistantTurn[] = exchanges.flatMap((x) => [
      { role: 'user' as const, text: x.question },
      ...(x.answer?.reply ? [{ role: 'assistant' as const, text: x.answer.reply }] : []),
    ]);
    setExchanges((xs) => [...xs, { question, answer: null, error: null }]);
    setText('');
    setAsking(true);
    try {
      const answer = await metaAssistantApi.ask(question, history);
      setExchanges((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, answer } : x)));
    } catch (e) {
      const error = writeError(e, 'The assistant could not answer.');
      setExchanges((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, error } : x)));
    } finally {
      setAsking(false);
    }
  };

  const switchOn = async (on: boolean) => {
    setSwitching(true);
    try { status.setData(await metaAssistantApi.saveSettings({ enabled: on })); toast({ title: on ? 'Ads assistant switched on' : 'Ads assistant switched off' }); }
    catch (e) { toast({ title: 'Could not change it', description: writeError(e, 'The setting was not saved.'), variant: 'destructive' }); }
    finally { setSwitching(false); }
  };

  const shown = new Set(exchanges.flatMap((x) => x.answer?.proposals.map((p) => p.id).filter(Boolean) ?? []));
  const earlier = (s?.proposals ?? []).filter((p) => !shown.has(p.id));

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <div className="border-b p-4 sm:px-6">
          <SheetHeader className="space-y-1 pr-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 shrink-0" /> Ads assistant</SheetTitle>
            <SheetDescription>
              Reads your ad account through Meta&apos;s ads MCP server and never changes anything. A change you ask for comes back as a paused draft that you preview and apply.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6">
          {status.error && <LoadFailure failure={status.error} what="The ads assistant (GET /api/v2/marketing/meta/assistant) is not served yet." onRetry={status.reload} />}
          {!s && !status.error && <p className="text-sm text-gray-500">Loading...</p>}

          {s && !enabled && (
            <Lead tone="neutral" title="The ads assistant is off"
              actions={s.can_manage && canAct ? <Button size="sm" onClick={() => switchOn(true)} disabled={switching}>{switching && <Loader2 className="animate-spin" />} Turn on</Button> : undefined}>
              <p>{s.off_note}</p>
              <p className="mt-2">It needs the store&apos;s Meta token to hold Meta&apos;s ads_mcp_management permission; Meta refuses Admin role system user tokens.</p>
              {!s.can_manage && <p className="mt-2">Ask a person with the ads manage permission to turn it on.</p>}
            </Lead>
          )}
          {s && enabled && s.state === 'not_connected' && <Lead tone="warn" title="Meta is not connected for ads">{s.note}</Lead>}

          {s && enabled && exchanges.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Ask about {s.account?.name ?? 'your ad account'}, for example:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)} disabled={asking}
                    className="max-w-full rounded-full border bg-white px-3 py-1 text-left text-sm text-gray-800 hover:border-gray-400 disabled:opacity-60">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {exchanges.map((x, i) => (
            <div key={i} className="space-y-3">
              <div className="ml-auto w-fit max-w-[85%] whitespace-pre-line break-words rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">{x.question}</div>
              {x.error && <Lead tone="bad" title="No answer">{x.error}</Lead>}
              {!x.answer && !x.error && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading the ad account...</p>}
              {x.answer && <AnswerView answer={x.answer} cur={cur} canAct={canAct && !!s?.can_manage} onClose={onClose} onApplied={onApplied} />}
            </div>
          ))}

          {s && enabled && earlier.length > 0 && (
            <details className="rounded-lg border bg-white">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-900">Earlier proposals ({earlier.length})</summary>
              <div className="space-y-3 border-t p-3">
                {earlier.map((p, i) => <ProposalCard key={proposalKey(p, i)} proposal={p} cur={cur} canAct={canAct && !!s.can_manage} onApplied={onApplied} />)}
              </div>
            </details>
          )}

          {s && s.can_manage && canAct && enabled && (
            <div className="rounded-lg border bg-white">
              <button type="button" onClick={() => setShowSettings((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-gray-900">
                <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Assistant settings</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', showSettings && 'rotate-180')} />
              </button>
              {showSettings && <SettingsBox status={s} onSaved={(n) => status.setData(n)} switching={switching} onSwitch={switchOn} />}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {s && enabled && (
          <form className="border-t p-3 sm:px-6" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <div className="flex items-end gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, maxChars))} rows={2} placeholder="Ask about your ads, or ask for a new ad"
                className="min-h-[2.75rem] flex-1 resize-none" disabled={asking}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
              <Button type="submit" size="icon" disabled={asking || !text.trim()} aria-label="Ask">{asking ? <Loader2 className="animate-spin" /> : <Send />}</Button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{s.not_verified}</p>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};

/** One answer: the reply, the objects it names, the proposals, and the sources it read. */
const AnswerView: React.FC<{ answer: AssistantAnswer; cur: string; canAct: boolean; onClose: () => void; onApplied: () => void }> = ({ answer, cur, canAct, onClose, onApplied }) => {
  if (answer.state !== 'ready') {
    const title = answer.state === 'refused' ? 'Meta refused the store\'s token'
      : answer.state === 'off' ? 'The ads assistant is off'
        : answer.state === 'not_connected' ? 'Meta is not connected for ads'
          : answer.state === 'ai_off' ? 'No AI provider is set up'
            : 'Meta\'s ads MCP server did not answer';
    return <Lead tone={answer.state === 'refused' ? 'bad' : 'warn'} title={title}>{answer.note}</Lead>;
  }
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-line break-words rounded-lg border bg-white px-3 py-2 text-sm text-gray-900">{answer.reply}</div>
      {answer.links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {answer.links.map((l) => (
            <Link key={`${l.level}-${l.id}`} to={metaHref(ADS_ROUTES.manager, { ...(l.level === 'campaign' ? {} : { level: l.level }), focus: l.id })} onClick={onClose}
              className={cn(linkCls, 'max-w-full truncate')}>
              Open the {LEVEL_NAME[l.level] ?? l.level} {l.name || l.id}
            </Link>
          ))}
        </div>
      )}
      {answer.proposals.map((p, i) => <ProposalCard key={proposalKey(p, i)} proposal={p} cur={cur} canAct={canAct} onApplied={onApplied} />)}
      {answer.dropped.length > 0 && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer select-none">{plural(answer.dropped.length, 'proposal')} left out</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{answer.dropped.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>
        </details>
      )}
      {answer.sources.length > 0 && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer select-none">Read with {plural(answer.sources.length, 'Meta tool')}{answer.model ? `, answered by ${answer.model}` : ''}</summary>
          <ul className="mt-1 space-y-1.5">
            {answer.sources.map((src, i) => (
              <li key={i} className="rounded border bg-gray-50 px-2 py-1.5">
                <span className="font-medium text-gray-800">{src.title || src.tool}</span>
                {!src.ok && <StateChip tone="warn" className="ml-2">failed</StateChip>}
                <span className="block break-all font-mono text-[11px] text-gray-500">{src.tool}</span>
                {src.excerpt && <span className="mt-0.5 block whitespace-pre-line break-words">{src.excerpt}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

/**
 * One proposal: what it does, its budget in money, why. Preview makes the draft (the drafts route, as this person;
 * a kept proposal is then linked to it) and shows Meta's previews; Apply asks first, then creates everything paused.
 */
const ProposalCard: React.FC<{ proposal: AssistantProposal; cur: string; canAct: boolean; onApplied: () => void }> = ({ proposal, cur, canAct, onApplied }) => {
  const { toast } = useToast();
  const [p, setP] = useState(proposal);
  const [draft, setDraft] = useState<AdsDraft | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'refresh' | 'apply' | 'dismiss'>('');
  const [confirm, setConfirm] = useState(false);
  const [applied, setApplied] = useState<{ campaign_id?: string | null } | null>(null);
  const closed = p.status === 'dismissed';
  const isApplied = !!applied || p.draft_status === 'applied';

  const preview = async () => {
    setBusy('preview');
    try {
      if (p.draft_id) {
        setDraft(await metaAdsApi.draft(p.draft_id));
      } else {
        const made = await metaAdsApi.createDraft(p.draft as unknown as AdsDraftInput);
        const full = made.previews ? made : await metaAdsApi.draft(made.id);
        setDraft(full);
        if (p.id) setP(await metaAssistantApi.drafted(p.id, made.id).catch(() => ({ ...p, status: 'drafted', draft_id: made.id, draft_status: 'draft' })));
        else setP({ ...p, status: 'drafted', draft_id: made.id, draft_status: 'draft' });
      }
    } catch (e) {
      toast({ title: 'Could not make the draft', description: writeError(e, 'The drafts route refused it.'), variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const refresh = async () => {
    if (!draft) return;
    setBusy('refresh');
    try { setDraft(await metaAdsApi.refreshPreviews(draft.id)); }
    catch (e) { toast({ title: 'Meta could not refresh the preview', description: writeError(e, 'Try again in a moment.'), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  const apply = async () => {
    if (!draft) return;
    setBusy('apply');
    try {
      const r = await metaAdsApi.applyDraft(draft.id);
      setApplied({ campaign_id: r?.campaign_id ?? null });
      setConfirm(false);
      toast({ title: 'Created, paused', description: 'Nothing spends until a person resumes it in Ads Manager.' });
      onApplied();
    } catch (e) {
      toast({ title: 'Meta did not create the campaign', description: writeError(e, 'Meta refused it.'), variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const dismiss = async () => {
    setBusy('dismiss');
    try { setP(p.id ? await metaAssistantApi.dismiss(p.id) : { ...p, status: 'dismissed' }); }
    catch (e) { toast({ title: 'Could not dismiss it', description: writeError(e, 'Try again.'), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  return (
    <div className={cn('rounded-lg border bg-white p-3', closed && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words font-semibold text-gray-900">{p.title}</p>
        <StateChip tone={statusTone(isApplied ? 'applied' : p.status)}>{isApplied ? 'Applied, paused' : statusWord(p)}</StateChip>
      </div>
      <p className="mt-1 break-words text-sm text-gray-800">{p.summary}</p>
      <p className="mt-1 text-sm font-medium tabular-nums text-gray-900">{budgetLine(p, cur)}</p>
      {p.rationale && <p className="mt-1 break-words text-xs text-gray-600">Why: {p.rationale}</p>}
      {p.created_at && <p className="mt-1 text-xs text-gray-500">Proposed {ago(p.created_at)}{p.saved ? '' : ' (not kept: the store\'s database is not updated yet)'}</p>}

      {!closed && !isApplied && canAct && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={preview} disabled={!!busy}>{busy === 'preview' && <Loader2 className="animate-spin" />} {draft ? 'Preview again' : 'Preview'}</Button>
          <Button size="sm" onClick={() => setConfirm(true)} disabled={!!busy || !draft} title={draft ? undefined : 'Preview first'}>Apply</Button>
          {p.status === 'proposed' && <Button size="sm" variant="ghost" onClick={dismiss} disabled={!!busy}>{busy === 'dismiss' && <Loader2 className="animate-spin" />} Dismiss</Button>}
        </div>
      )}
      {!canAct && !closed && !isApplied && <p className="mt-2 text-xs text-gray-500">Making drafts needs the ads manage permission.</p>}

      {draft && !isApplied && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {(draft.warnings ?? []).map((w, k) => <Lead key={k} tone="warn" title="Meta may refuse this">{w.text}</Lead>)}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600">Meta&apos;s previews</span>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={!!busy}>{busy === 'refresh' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh</Button>
          </div>
          {draft.previews?.length
            ? <PreviewGrid previews={draft.previews} height={420} className="grid gap-3 sm:grid-cols-2" />
            : <p className="text-sm text-gray-500">Meta sent no preview yet. Press Refresh.</p>}
        </div>
      )}
      {isApplied && (
        <p className="mt-2 text-sm text-emerald-800">
          Created paused.{' '}
          {applied?.campaign_id && <Link to={metaHref(ADS_ROUTES.manager, { focus: applied.campaign_id })} className={linkCls}>Open the campaign</Link>}
        </p>
      )}

      {confirm && draft && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirm(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="break-words">Create &quot;{p.title}&quot; paused?</DialogTitle>
              <DialogDescription>Meta makes the campaign, ad set and ad, all paused. Nothing spends until a person resumes it in Ads Manager.</DialogDescription>
            </DialogHeader>
            <p className="text-sm font-medium tabular-nums text-gray-900">Budget when resumed: {budgetLine(p, cur)}</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy === 'apply'}>Cancel</Button>
              <Button onClick={apply} disabled={busy === 'apply'}>{busy === 'apply' && <Loader2 className="animate-spin" />} Create paused</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

/** On or off, and which of Meta's read tools the assistant may use (Meta's list read now; write tools never). */
const SettingsBox: React.FC<{ status: AssistantStatus; onSaved: (s: AssistantStatus) => void; switching: boolean; onSwitch: (on: boolean) => void }> = ({ status, onSaved, switching, onSwitch }) => {
  const { toast } = useToast();
  const [tools, setTools] = useState<AssistantTools | null>(null);
  const [checking, setChecking] = useState(false);
  const [chosen, setChosen] = useState<string[]>(status.settings.read_tools);
  const [saving, setSaving] = useState(false);
  const dirty = chosen.join() !== status.settings.read_tools.join();

  const check = async () => {
    setChecking(true);
    try { setTools(await metaAssistantApi.tools()); }
    catch (e) { toast({ title: 'Could not ask Meta', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' }); }
    finally { setChecking(false); }
  };
  const save = async () => {
    setSaving(true);
    try { onSaved(await metaAssistantApi.saveSettings({ read_tools: chosen })); toast({ title: 'Read tools saved' }); }
    catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The setting was refused.'), variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const toggle = (name: string, on: boolean) => setChosen((c) => (on ? [...c, name] : c.filter((n) => n !== name)));

  return (
    <div className="space-y-3 border-t p-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span>Assistant on for this store</span>
        <Switch checked={status.settings.enabled} disabled={switching} onCheckedChange={onSwitch} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-700">{plural(chosen.length, 'read tool')} allowed</span>
        <Button size="sm" variant="outline" onClick={check} disabled={checking}>{checking && <Loader2 className="animate-spin" />} Check Meta&apos;s tools</Button>
      </div>
      {tools && tools.state !== 'ready' && <Lead tone={tools.state === 'refused' ? 'bad' : 'warn'} title="Meta did not list its tools">{tools.note}</Lead>}
      {tools && tools.state === 'ready' && (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded border p-2">
          {tools.tools.map((t) => (
            <li key={t.name} className="flex items-start gap-2">
              <Checkbox id={`tool-${t.name}`} checked={!t.writes && chosen.includes(t.name)} disabled={t.writes} onCheckedChange={(v) => toggle(t.name, v === true)} className="mt-0.5" />
              <label htmlFor={`tool-${t.name}`} className="min-w-0 flex-1">
                <span className="block break-all font-mono text-xs text-gray-900">{t.name}</span>
                <span className="block break-words text-xs text-gray-600">{t.writes ? 'Changes the ad account: never allowed.' : t.description}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {dirty && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save read tools</Button>
          <Button size="sm" variant="ghost" onClick={() => setChosen(status.settings.read_tools)} disabled={saving}>Undo</Button>
        </div>
      )}
      <p className="text-xs text-gray-500">{status.not_verified}</p>
    </div>
  );
};
