import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { smsTemplatesAPI, type MsgCatalogueEntry } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/erp/StatusChip';
import { useToast } from '@/hooks/use-toast';

/**
 * WHAT THE WHATSAPP GATEWAY ACTUALLY HAS APPROVED — asked of the gateway, not
 * of our catalogue. A template can be perfectly written here and still be
 * refused at send time because Meta never approved it (homeomead's `cod_confirm`
 * and `payment_link`, COMMON_MISTAKES #320). Moved from the old Notification
 * Templates page into the WhatsApp column of the message catalogue.
 */
export interface WaLiveState {
  status: any | null;
  approved: Set<string>;
  busy: boolean;
  error: string | null;
  reload: (refresh?: boolean) => Promise<void>;
}

export function useWhatsAppLiveStatus(enabled: boolean): WaLiveState {
  const [status, setStatus] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (refresh = false) => {
    setBusy(true); setError(null);
    try {
      const res: any = await smsTemplatesAPI.whatsappLiveStatus(refresh);
      setStatus(res?.data ?? res ?? {});
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not reach the WhatsApp gateway to check approval.');
      setStatus({});
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (enabled) reload(false); }, [enabled, reload]);

  const approved = useMemo(() => {
    const s = new Set<string>();
    for (const e of (status?.events ?? [])) {
      if (String(e?.status ?? '').toUpperCase() === 'APPROVED') s.add(String(e.event ?? e.name));
    }
    return s;
  }, [status]);

  return { status, approved, busy, error, reload };
}

/** The names a gateway knows an entry by — its event and its Meta template name. */
export const waNamesOf = (e: MsgCatalogueEntry): string[] =>
  [e.def.event, e.def.whatsapp?.name, e.resolved.whatsapp?.providerRef].filter(Boolean) as string[];

const WhatsAppStatusPanel: React.FC<{
  live: WaLiveState;
  entries: MsgCatalogueEntry[];
  canWrite: boolean;
}> = ({ live, entries, canWrite }) => {
  const { toast } = useToast();
  const waEntries = entries.filter((e) => e.def.channels.includes('whatsapp'));
  const missing = live.status
    ? waEntries.filter((e) => !waNamesOf(e).some((n) => live.approved.has(n))).map((e) => e.def.event)
    : [];

  const submit = async () => {
    try {
      const res: any = await smsTemplatesAPI.whatsappSubmitTemplates(missing);
      toast({ title: 'Sent to Meta for approval', description: res?.message || `${missing.length} submitted.` });
      await live.reload(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not submit', description: e?.response?.data?.message || 'The WhatsApp platform refused the submission.' });
    }
  };

  const blockers: string[] = live.status?.health?.blockers ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {live.status === null ? (
          <span className="text-sm text-ink-soft">Checking with the gateway…</span>
        ) : live.error ? (
          <span className="text-sm text-bad-ink">{live.error}</span>
        ) : (
          <span className="text-sm text-ink">
            {waEntries.length - missing.length} of {waEntries.length} WhatsApp messages here are approved on your number.
          </span>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => live.reload(true)} disabled={live.busy}>
          {live.busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Re-check
        </Button>
        {missing.length > 0 && canWrite && (
          <Button type="button" size="sm" onClick={submit} disabled={live.busy}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Submit {missing.length} to Meta
          </Button>
        )}
      </div>
      {blockers.length > 0 && (
        <div className="rounded-md border border-bad bg-bad-bg px-3 py-2 text-xs text-bad-ink">{blockers.join(' · ')}</div>
      )}
      {missing.length > 0 && (
        <div className="rounded-md border border-warn bg-warn-bg p-3">
          <p className="text-xs font-semibold text-warn-ink">No approved template — these will not send on WhatsApp:</p>
          <div className="mt-1.5 flex flex-wrap gap-1">{missing.map((m) => <Chip key={m} tone="amber">{m}</Chip>)}</div>
          <p className="mt-1.5 text-[11px] text-warn-ink">
            Submitting sends them to Meta. Approval is Meta's decision and takes time; SMS and email keep working meanwhile.
          </p>
        </div>
      )}
    </div>
  );
};

export default WhatsAppStatusPanel;
