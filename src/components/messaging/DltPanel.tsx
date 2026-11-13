import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Send, ShieldAlert, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, BlockSkeleton, type Tone } from '@/components/erp';
import PhoneInput, { DEFAULT_DIAL } from '@/components/PhoneInput';
import { useToast } from '@/hooks/use-toast';
import { smsConfigAPI } from '@/services/api';
import { formatDateTime } from '@/utils/date';
import {
  messagingAPI, errText, fmtCount,
  type DltCheck, type DltCheckList, type DltCheckState, type DltProposal, type NotificationRow, type ProviderTemplate, type UnsentReport,
} from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * SMS page, DLT mapping tab. An Indian operator refuses an SMS whose words are not the words registered on DLT
 * under the template id it carries ("Invalid Template Match"). The tab leads with that answer for every
 * message (`GET /comms/sms-config/text-checks`): the words the sender uses beside the registered words,
 * the part where they differ, and the fix (`POST /comms/sms-config/mappings` with the event and the
 * registration). Then what was refused before sending (`GET /comms/dispatches/unsent`), the suggested
 * matches (`GET /comms/sms-config/mappings`) and the list registered on the store's sender.
 */
const CONFIDENCE_TONE: Record<string, Tone> = { high: 'green', medium: 'amber', low: 'red' };

const STATE_LABEL: Record<DltCheckState, string> = {
  matches: 'Matches', text_differs: 'Text differs', not_registered: 'Not registered', no_template_id: 'No DLT id',
  no_template: 'No own text', off: 'Off', growcord: 'Growcord text', no_sender: 'No sender',
};
const STATE_TONE: Record<DltCheckState, Tone> = {
  matches: 'green', growcord: 'green', off: 'neutral',
  text_differs: 'red', not_registered: 'red', no_template_id: 'amber', no_template: 'amber', no_sender: 'amber',
};
/** Blocked first, then passing, then the ones the store switched off. */
const STATE_ORDER: Record<DltCheckState, number> = {
  text_differs: 0, not_registered: 1, no_template_id: 2, no_template: 3, no_sender: 4, matches: 5, growcord: 6, off: 7,
};
const blocks = (s: DltCheckState) => s !== 'matches' && s !== 'growcord' && s !== 'off';

function explain(c: DltCheck, sender: DltCheckList['sender']): string {
  switch (c.state) {
    case 'text_differs': return 'The DLT id is registered, but these words are not the registered words, so the operator refuses the SMS.';
    case 'not_registered': return 'This DLT id is not registered (or no longer active) on your sender, so the operator refuses the SMS.';
    case 'no_template_id': return sender === 'own'
      ? 'This message carries no DLT id, so it is not sent by SMS.'
      : 'Growcord has not registered this message on its sender yet, so it is not sent by SMS.';
    case 'no_template': return 'No registered text is set for this message on your sender, so it is not sent by SMS.';
    case 'no_sender': return 'No SMS sender is set up for this store.';
    case 'off': return 'Switched off on the Notifications page.';
    default: return '';
  }
}

/* The two texts side by side, with the part where they differ marked. */

interface Tok { t: string; v: boolean }
const STORED_VAR = /\{\{\s*\w+\s*\}\}/g;
const DLT_SLOT = /\{#\w+#\}/g;

/** A text as the server compares it (line breaks as \n, ends trimmed), cut into characters and variables. */
function tokens(text: string, re: RegExp): Tok[] {
  const src = text.replace(/\r\n/g, '\n').trim();
  const out: Tok[] = [];
  let last = 0;
  for (const m of src.matchAll(re)) {
    const at = m.index ?? 0;
    for (const ch of src.slice(last, at)) out.push({ t: ch, v: false });
    out.push({ t: m[0], v: true });
    last = at + m[0].length;
  }
  for (const ch of src.slice(last)) out.push({ t: ch, v: false });
  return out;
}
const same = (a: Tok, b: Tok) => (a.v && b.v) || (!a.v && !b.v && a.t === b.t);

/** How many tokens the two share at the start and at the end. */
function shared(a: Tok[], b: Tok[]): { head: number; tail: number } {
  let head = 0;
  while (head < a.length && head < b.length && same(a[head], b[head])) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && same(a[a.length - 1 - tail], b[b.length - 1 - tail])) tail += 1;
  return { head, tail };
}

const Marked: React.FC<{ toks: Tok[]; head: number; tail: number; tone: 'bad' | 'good' }> = ({ toks, head, tail, tone }) => {
  const piece = (list: Tok[], key: string, mark: boolean) => (
    <span key={key} className={mark ? (tone === 'bad' ? 'rounded-sm bg-bad-bg text-bad-ink' : 'rounded-sm bg-good-bg text-good-ink') : undefined}>
      {list.map((k, i) => (k.v ? <span key={i} className="text-ink-mute">{k.t}</span> : k.t))}
    </span>
  );
  const end = toks.length - tail;
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-xs text-ink-soft">
      {piece(toks.slice(0, head), 'a', false)}
      {piece(toks.slice(head, end), 'b', true)}
      {piece(toks.slice(end), 'c', false)}
    </p>
  );
};

const TextDiff: React.FC<{ stored: string; registered: string }> = ({ stored, registered }) => {
  const a = useMemo(() => tokens(stored, STORED_VAR), [stored]);
  const b = useMemo(() => tokens(registered, DLT_SLOT), [registered]);
  const { head, tail } = shared(a, b);
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      <div className="min-w-0 rounded-md border border-line bg-surface-2 p-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Your text</p>
        <Marked toks={a} head={head} tail={tail} tone="bad" />
      </div>
      <div className="min-w-0 rounded-md border border-line bg-surface-2 p-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Registered on DLT</p>
        <Marked toks={b} head={head} tail={tail} tone="good" />
      </div>
    </div>
  );
};

/* One message. */

const TestSend: React.FC<{ event: string }> = ({ event }) => {
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true); setResult(null);
    const r: any = await smsConfigAPI.sendTest({ phoneNumber: `${dial}${number}`, event });
    setResult(r?.ok
      ? { ok: true, text: `Sent: ${String(r?.sent_text ?? r?.sentText ?? '')}`.trim() }
      : { ok: false, text: String(r?.message || 'The test SMS was not sent.') });
    setBusy(false);
  };
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line p-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <PhoneInput value={number} dialCode={dial} className="min-w-0 flex-1"
          onChange={({ number: nb, dialCode }) => { setNumber(nb); setDial(dialCode); }} />
        <Button size="sm" onClick={send} disabled={busy || number.length < 6}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
        </Button>
      </div>
      <p className="text-[11px] text-ink-soft">Sends this message's real text with its DLT id, placeholders unfilled. A test SMS is charged like any other.</p>
      {result && <p role="status" className={`text-xs ${result.ok ? 'text-good-ink' : 'text-bad-ink'}`}>{result.text}</p>}
    </div>
  );
};

const CheckRow: React.FC<{
  c: DltCheck; sender: DltCheckList['sender']; canWrite: boolean; canTest: boolean;
  applying: string | null; onFix: (c: DltCheck) => void;
}> = ({ c, sender, canWrite, canTest, applying, onFix }) => {
  const [testing, setTesting] = useState(false);
  const blocked = blocks(c.state);
  const why = explain(c, sender);
  return (
    <li className="py-3" data-testid={`dlt-check-${c.event}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-medium text-ink">{c.title}</span>
        <Chip tone={STATE_TONE[c.state] ?? 'neutral'}>{STATE_LABEL[c.state] ?? c.state}</Chip>
        {c.template_id && <span className="font-mono text-[11px] text-ink-mute">DLT {c.template_id}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {blocked && c.fix_template_id && (
            <Button size="sm" onClick={() => onFix(c)} disabled={!canWrite || !!applying}
              title={canWrite ? 'Save the registered words as this message\'s SMS text' : 'Needs the settings.manage permission'}>
              {applying === c.event ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />} Use registered text
            </Button>
          )}
          {canTest && c.state !== 'off' && c.state !== 'no_sender' && (
            <Button variant="outline" size="sm" onClick={() => setTesting((v) => !v)} aria-expanded={testing}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Test
            </Button>
          )}
        </span>
      </div>
      {why && <p className="mt-1 text-xs text-ink-soft">{why}</p>}
      {blocked && c.stored_text && c.registered_text && <TextDiff stored={c.stored_text} registered={c.registered_text} />}
      {blocked && !c.registered_text && c.stored_text && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 p-2 font-mono text-xs text-ink-soft">{c.stored_text}</p>
      )}
      {blocked && c.fix_text && (
        <div className="mt-2 rounded-md border border-good bg-good-bg p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-good-ink">
            The fix: registered text {c.fix_template_id ? `(DLT ${c.fix_template_id})` : ''} with your variables
          </p>
          <p className="whitespace-pre-wrap break-words font-mono text-xs text-ink">{c.fix_text}</p>
        </div>
      )}
      {blocked && !c.fix_text && sender === 'own' && (
        <p className="mt-2 text-xs text-warn-ink">No registered text on your sender looks like this message. Register one on DLT, then ask Growcord to add it to your sender.</p>
      )}
      {testing && <TestSend event={c.event} />}
    </li>
  );
};

/* The panel. */

const DltPanel: React.FC<{ canWrite: boolean; rows: NotificationRow[] | null; onApplied?: () => void }> = ({ canWrite, rows, onApplied }) => {
  const { toast } = useToast();
  const [check, setCheck] = useState<DltCheckList | null>(null);
  const [cFail, setCFail] = useState<LoadFailure | null>(null);
  const [unsent, setUnsent] = useState<UnsentReport | null>(null);
  const [uFail, setUFail] = useState<LoadFailure | null>(null);
  const [templates, setTemplates] = useState<ProviderTemplate[] | null>(null);
  const [tFail, setTFail] = useState<LoadFailure | null>(null);
  const [proposals, setProposals] = useState<DltProposal[] | null>(null);
  const [pFail, setPFail] = useState<LoadFailure | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [showPassing, setShowPassing] = useState(false);

  const load = useCallback(async () => {
    setCFail(null); setUFail(null); setTFail(null); setPFail(null);
    setCheck(null); setUnsent(null); setTemplates(null); setProposals(null);
    messagingAPI.dltChecks().then(setCheck).catch((e) => setCFail(failureOf(e, 'Could not check the SMS texts against DLT.')));
    messagingAPI.unsent({ channel: 'sms' }).then(setUnsent).catch((e) => setUFail(failureOf(e, 'Could not read the messages refused before sending.')));
    messagingAPI.providerTemplates().then(setTemplates).catch((e) => setTFail(failureOf(e, 'Could not read the registered DLT templates.')));
    messagingAPI.dltProposals().then((r) => setProposals(r.rows)).catch((e) => setPFail(failureOf(e, 'Could not work out the DLT matches.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (events?: string[], templateId?: string | null) => {
    setApplying(events?.[0] ?? '*');
    try {
      const r = await messagingAPI.applyDlt(events, templateId);
      toast({ title: 'DLT texts matched', description: r.message || `${r.applied.length} message${r.applied.length === 1 ? '' : 's'} now use the registered wording.` });
      load(); onApplied?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not applied', description: errText(e, 'The server refused the mapping.') });
    } finally { setApplying(null); }
  };

  const sorted = useMemo(() => [...(check?.rows ?? [])].sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9)), [check]);
  const blockedRows = sorted.filter((c) => blocks(c.state));
  const passingRows = sorted.filter((c) => !blocks(c.state));
  const titleOf = (event: string) => check?.rows.find((c) => c.event === event)?.title
    ?? rows?.find((r) => r.key === event || r.key.endsWith(`.${event}`))?.label
    ?? event.replace(/_/g, ' ');
  /** A suggestion whose registration the message already uses and fits. */
  const inPlace = (p: DltProposal) => check?.rows.some((c) => c.event === p.event && c.state === 'matches' && c.template_id === p.provider_template_id) ?? false;
  const sms = (rows ?? []).filter((r) => r.channels.sms);
  const unmapped = sms.filter((r) => r.channels.sms?.dlt === 'unmapped');
  const canTest = canWrite && check?.sender !== 'none';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4" data-testid="dlt-check">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-ink">Will operators take your SMS?</p>
          <Button variant="outline" size="sm" onClick={load} aria-label="Check again"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {cFail?.gap ? (
          <>
            <GapNotice what="Checking each SMS against its registered DLT text is not on this server yet. The list below only says whether a DLT id is set." className="mb-3" />
            {!rows ? <p className="text-xs text-ink-soft">The notifications list did not load, so the per-message DLT state is not known here.</p>
              : sms.length === 0 ? <p className="text-xs text-ink-soft">No Commerce message uses SMS.</p> : (
                <>
                  <p className="mb-2 text-xs text-ink-soft">{fmtCount(sms.length - unmapped.length)} of {fmtCount(sms.length)} SMS messages carry a DLT id.</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {sms.map((r) => {
                      const d = r.channels.sms?.dlt;
                      return <li key={r.key}><Chip tone={d === 'mapped' ? 'green' : d === 'unmapped' ? 'amber' : 'neutral'}>{r.label}{d === 'unmapped' ? ', no DLT id' : ''}</Chip></li>;
                    })}
                  </ul>
                </>
              )}
          </>
        ) : cFail ? <ErrorNotice message={cFail.message} onRetry={load} />
          : !check ? <BlockSkeleton lines={5} /> : (
            <>
              {check.blocked > 0 ? (
                <div role="alert" className="mb-2 flex items-start gap-2 rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad-ink">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {fmtCount(check.blocked)} of {fmtCount(check.rows.length)} SMS messages will not go out as they stand.
                    {check.sender === 'own' && blockedRows.some((c) => c.fix_template_id) && ' Use the registered text on each one below.'}
                  </span>
                </div>
              ) : check.rows.length > 0 && (
                <p role="status" className="mb-2 flex items-center gap-1.5 text-sm text-good-ink">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Every SMS message passes as it stands.
                </p>
              )}
              {check.note && <p className="mb-2 text-xs text-ink-soft">{check.note}</p>}
              {check.sender === 'own' && (
                <p className="mb-2 text-xs text-ink-soft">{fmtCount(check.registered)} DLT template{check.registered === 1 ? '' : 's'} registered on your sender.</p>
              )}
              {blockedRows.length > 0 && (
                <ul className="divide-y divide-line">
                  {blockedRows.map((c) => (
                    <CheckRow key={c.event} c={c} sender={check.sender} canWrite={canWrite} canTest={canTest}
                      applying={applying} onFix={(x) => apply([x.event], x.fix_template_id)} />
                  ))}
                </ul>
              )}
              {passingRows.length > 0 && (
                <div className="mt-2 border-t border-line pt-2">
                  <button type="button" className="text-xs font-medium text-ink-soft underline underline-offset-2 hover:no-underline"
                    onClick={() => setShowPassing((v) => !v)} aria-expanded={showPassing}>
                    {showPassing ? 'Hide' : 'Show'} the {fmtCount(passingRows.length)} message{passingRows.length === 1 ? '' : 's'} that pass or are off
                  </button>
                  {showPassing && (
                    <ul className="divide-y divide-line">
                      {passingRows.map((c) => (
                        <CheckRow key={c.event} c={c} sender={check.sender} canWrite={canWrite} canTest={canTest}
                          applying={applying} onFix={(x) => apply([x.event], x.fix_template_id)} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4" data-testid="dlt-unsent">
        <p className="text-sm font-semibold text-ink">Refused before sending</p>
        <p className="mb-2 text-xs text-ink-soft">SMS the store did not send because no registered DLT text stood behind them.</p>
        {uFail?.gap ? <GapNotice what="The report of messages refused for want of a registered text is not on this server yet." />
          : uFail ? <ErrorNotice message={uFail.message} onRetry={load} />
            : !unsent ? <BlockSkeleton lines={2} />
              : unsent.items.length === 0 ? (
                <p className="text-xs text-ink-soft">None{unsent.from && unsent.to ? ` from ${unsent.from} to ${unsent.to}` : ''}.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {unsent.items.map((u) => (
                    <li key={`${u.event}:${u.channel}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="min-w-0 flex-1 text-sm text-ink">{titleOf(u.event)}</span>
                      <span className="text-xs text-bad-ink">{fmtCount(u.refused)} refused</span>
                      {u.reached_on_another_channel > 0 && <span className="text-xs text-ink-soft">{fmtCount(u.reached_on_another_channel)} reached on another channel</span>}
                      {u.last_at && <span className="text-xs text-ink-mute">last {formatDateTime(u.last_at, '')}</span>}
                    </li>
                  ))}
                </ul>
              )}
        {unsent && unsent.items.length > 0 && unsent.from && unsent.to && (
          <p className="mt-2 text-[11px] text-ink-soft">From {unsent.from} to {unsent.to}{unsent.timezone ? `, days in ${unsent.timezone}` : ''}.</p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-ink">Suggested matches</p>
          {proposals && proposals.some((p) => !inPlace(p)) && (
            <Button size="sm" onClick={() => apply()} disabled={!canWrite || !!applying}
              title={canWrite ? 'Use the registered wording for every suggestion' : 'Needs the settings.manage permission'}>
              {applying === '*' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />} Apply all
            </Button>
          )}
        </div>
        {pFail?.gap ? <GapNotice what="DLT matching is not on this server yet." />
          : pFail ? <ErrorNotice message={pFail.message} onRetry={load} />
            : !proposals ? <BlockSkeleton lines={4} />
              : proposals.length === 0 ? <p className="text-xs text-ink-soft">Nothing to match: no registered text on your sender resembles one of the messages.</p> : (
                <ul className="divide-y divide-line">
                  {proposals.map((p) => {
                    const done = inPlace(p);
                    return (
                      <li key={`${p.event}:${p.provider_template_id ?? ''}`} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-ink">{p.title}</span>
                            {done ? <Chip tone="green">In place</Chip>
                              : p.confidence && <Chip tone={CONFIDENCE_TONE[p.confidence] ?? 'neutral'}>{p.confidence} match</Chip>}
                            {p.provider_template_id && <span className="font-mono text-[11px] text-ink-mute">DLT {p.provider_template_id}</span>}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-ink-soft">{p.provider_text || p.content}</p>
                        </div>
                        {!done && (
                          <Button variant="outline" size="sm" className="shrink-0" onClick={() => apply([p.event])} disabled={!canWrite || !!applying}
                            title={canWrite ? undefined : 'Needs the settings.manage permission'}>
                            {applying === p.event && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Use this
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-ink">Registered on your sender {templates && <span className="font-normal text-ink-soft">({fmtCount(templates.length)})</span>}</p>
        {tFail?.gap ? <GapNotice what="Reading the provider's registered templates is not on this server yet." />
          : tFail ? <ErrorNotice message={tFail.message} onRetry={load} />
            : !templates ? <BlockSkeleton lines={4} />
              : templates.length === 0 ? <p className="text-xs text-ink-soft">No DLT template is registered to the store's own sender. Until one is, SMS goes out on Growcord's registered texts.</p> : (
                <ul className="max-h-[28rem] divide-y divide-line overflow-auto">
                  {templates.map((t) => (
                    <li key={t.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-ink-mute">{t.id}</span>
                        {t.title && <span className="text-sm text-ink">{t.title}</span>}
                        {!t.active && <Chip tone="neutral">Inactive</Chip>}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs text-ink-soft">{t.template}</p>
                    </li>
                  ))}
                </ul>
              )}
      </div>
    </div>
  );
};

export default DltPanel;
