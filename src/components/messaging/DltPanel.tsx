import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, BlockSkeleton, type Tone } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { messagingAPI, errText, fmtCount, type DltProposal, type NotificationRow, type ProviderTemplate } from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * SMS ▸ DLT mapping: an Indian operator refuses an SMS whose text is not
 * registered on DLT, so each message needs its text matched to one of the
 * templates registered to the store's sender. Three answers side by side:
 * which messages are mapped today (the notifications list's SMS cells), what
 * is registered on the provider (`GET /comms/sms-config/provider-templates`),
 * and which registration the server would match to which message
 * (`GET /comms/sms-config/mappings`, applied with `POST` on the same path).
 */
const CONFIDENCE_TONE: Record<string, Tone> = { high: 'green', medium: 'amber', low: 'red' };

const DltPanel: React.FC<{ canWrite: boolean; rows: NotificationRow[] | null; onApplied?: () => void }> = ({ canWrite, rows, onApplied }) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ProviderTemplate[] | null>(null);
  const [tFail, setTFail] = useState<LoadFailure | null>(null);
  const [proposals, setProposals] = useState<DltProposal[] | null>(null);
  const [pFail, setPFail] = useState<LoadFailure | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTFail(null); setPFail(null); setTemplates(null); setProposals(null);
    messagingAPI.providerTemplates().then(setTemplates).catch((e) => setTFail(failureOf(e, 'Could not read the registered DLT templates.')));
    messagingAPI.dltProposals().then((r) => setProposals(r.rows)).catch((e) => setPFail(failureOf(e, 'Could not work out the DLT matches.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (events?: string[]) => {
    setApplying(events?.[0] ?? '*');
    try {
      const r = await messagingAPI.applyDlt(events);
      toast({ title: 'DLT texts matched', description: r.message || `${r.applied.length} message${r.applied.length === 1 ? '' : 's'} now use the registered wording.` });
      load(); onApplied?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not applied', description: errText(e, 'The server refused the mapping.') });
    } finally { setApplying(null); }
  };

  const sms = (rows ?? []).filter((r) => r.channels.sms);
  const unmapped = sms.filter((r) => r.channels.sms?.dlt === 'unmapped');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-ink">Messages and their DLT text</p>
          <Button variant="outline" size="sm" onClick={load} aria-label="Check again"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {!rows ? <p className="text-xs text-ink-soft">The notifications list did not load, so the per-message DLT state is not known here.</p>
          : sms.length === 0 ? <p className="text-xs text-ink-soft">No Commerce message uses SMS.</p> : (
            <>
              <p className="mb-2 text-xs text-ink-soft">{fmtCount(sms.length - unmapped.length)} of {fmtCount(sms.length)} SMS messages are mapped to a registered text.</p>
              <ul className="flex flex-wrap gap-1.5">
                {sms.map((r) => {
                  const d = r.channels.sms?.dlt;
                  return <li key={r.key}><Chip tone={d === 'mapped' ? 'green' : d === 'unmapped' ? 'amber' : 'neutral'}>{r.label}{d === 'unmapped' ? ' · not mapped' : ''}</Chip></li>;
                })}
              </ul>
            </>
          )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-ink">Suggested matches</p>
          {proposals && proposals.length > 0 && (
            <Button size="sm" onClick={() => apply()} disabled={!canWrite || !!applying}
              title={canWrite ? 'Use the registered wording for every suggestion' : 'Needs the settings.manage permission'}>
              {applying === '*' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />} Apply all
            </Button>
          )}
        </div>
        {pFail?.gap ? <GapNotice what="DLT matching is not on this server yet." />
          : pFail ? <ErrorNotice message={pFail.message} onRetry={load} />
            : !proposals ? <BlockSkeleton lines={4} />
              : proposals.length === 0 ? <p className="text-xs text-ink-soft">Nothing to match: either every message is mapped, or no registered text resembles one.</p> : (
                <ul className="divide-y divide-line">
                  {proposals.map((p) => (
                    <li key={`${p.event}:${p.provider_template_id ?? ''}`} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-ink">{p.title}</span>
                          {p.confidence && <Chip tone={CONFIDENCE_TONE[p.confidence] ?? 'neutral'}>{p.confidence} match</Chip>}
                          {p.provider_template_id && <span className="font-mono text-[11px] text-ink-mute">DLT {p.provider_template_id}</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-ink-soft">{p.provider_text || p.content}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => apply([p.event])} disabled={!canWrite || !!applying}
                        title={canWrite ? undefined : 'Needs the settings.manage permission'}>
                        {applying === p.event && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Use this
                      </Button>
                    </li>
                  ))}
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
