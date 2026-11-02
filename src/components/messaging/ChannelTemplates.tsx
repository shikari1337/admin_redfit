import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { messageTemplatesAPI, type MsgChannel } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Chip, TableSkeleton } from '@/components/erp';
import { SearchBox, EmptyRowState } from '@/components/sales/ListChrome';
import { useToast } from '@/hooks/use-toast';
import TemplateEditorDrawer from '@/components/templates/TemplateEditorDrawer';
import WhatsAppStatusPanel, { waNamesOf, type WaLiveState } from '@/components/templates/WhatsAppStatusPanel';
import { LAYER_FILTER_LABEL, LAYER_TONE, approvalOf, layerOf, rowHaystack, KIND_LABEL, KIND_TONE } from '@/components/templates/model';
import { MSG_CHANNEL_LABEL, errText } from '@/lib/v2/messaging';
import { ErrorNotice, GapNotice, type CommerceCatalogue } from './common';

/**
 * One channel's column of the Commerce message catalogue — every message that
 * can go out on it, which text it sends today (Growcord's default or the
 * store's own), and, for WhatsApp and SMS, what Meta / the DLT registry say.
 * A row opens the SAME editor the Message templates page uses
 * (`TemplateEditorDrawer`: preview, edit, revert, test send, versions) on this
 * channel. WhatsApp adds the gateway's live approval and "submit to Meta".
 */
const ChannelTemplates: React.FC<{
  channel: MsgChannel;
  catalogue: CommerceCatalogue;
  canWrite: boolean;
  /** WhatsApp only: the gateway's live approval (one hook per page). */
  live?: WaLiveState;
}> = ({ channel, catalogue, canWrite, live }) => {
  const { toast } = useToast();
  const { cat, entries, loading, failure, reload } = catalogue;
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const mine = useMemo(() => entries.filter((e) => e.def.channels.includes(channel)), [entries, channel]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? mine.filter((e) => rowHaystack(e).includes(q)) : mine;
  }, [mine, search]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r: any = await messageTemplatesAPI.syncApproval(channel);
      toast({ title: 'Approval refreshed', description: r?.message || `Asked the provider for the ${MSG_CHANNEL_LABEL[channel]} approval of every template.` });
      await reload();
      if (live) await live.reload(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not ask the provider', description: errText(e, 'The provider did not answer.') });
    } finally { setSyncing(false); }
  };

  const openEntry = entries.find((e) => e.def.key === openKey) ?? null;

  if (failure?.gap) return <GapNotice what="The message catalogue route is not on this server yet." />;

  return (
    <div className="space-y-3">
      {channel === 'whatsapp' && live && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Approved on your WhatsApp number</p>
          <WhatsAppStatusPanel live={live} entries={mine} canWrite={canWrite} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search messages" className="w-full sm:w-72" />
        {(channel === 'whatsapp' || channel === 'sms') && (
          <Button variant="outline" size="sm" className="h-9" onClick={sync} disabled={syncing || !canWrite}
            title={canWrite ? undefined : 'Needs the marketing.manage permission'}>
            {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {channel === 'whatsapp' ? 'Sync approval from Meta' : 'Sync DLT status'}
          </Button>
        )}
        <Link to={`/settings/sms-templates`} className="ml-auto text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
          Every product’s templates
        </Link>
      </div>

      {cat?.degraded && <div className="rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn-ink">{cat.degraded}</div>}
      {failure && <ErrorNotice message={failure.message} onRetry={reload} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {loading ? <table className="w-full"><TableSkeleton rows={8} cols={3} /></table> : (
          <table className="w-full min-w-[560px] text-sm" data-testid={`templates-${channel}`}>
            <thead className="border-b border-line bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2">Message</th>
                <th scope="col" className="px-3 py-2">Text it sends</th>
                {(channel === 'whatsapp' || channel === 'sms') && <th scope="col" className="px-3 py-2">{channel === 'whatsapp' ? 'Meta' : 'DLT'}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const l = layerOf(e, channel, cat?.smsOwnHeader);
                let a = approvalOf(e.resolved[channel]);
                if (channel === 'whatsapp' && (!a || a.label === 'Not checked') && live?.status) {
                  a = waNamesOf(e).some((nm) => live.approved.has(nm)) ? { label: 'Approved', tone: 'green' } : { label: 'Not approved', tone: 'amber' };
                }
                if (channel === 'sms' && !a && e.def.sms) {
                  a = e.def.sms.dlt.registered ? { label: 'Registered', tone: 'green' } : { label: 'Not registered', tone: 'amber' };
                }
                return (
                  <tr key={e.def.key} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => setOpenKey(e.def.key)}>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className="text-left font-medium text-ink hover:underline"
                          onClick={(ev) => { ev.stopPropagation(); setOpenKey(e.def.key); }}>
                          {e.def.title}
                        </button>
                        <Chip tone={KIND_TONE[e.def.kind]}>{KIND_LABEL[e.def.kind]}</Chip>
                      </div>
                      {e.def.description && <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-ink-soft">{e.def.description}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top"><Chip tone={LAYER_TONE[l]}>{LAYER_FILTER_LABEL[l]}</Chip></td>
                    {(channel === 'whatsapp' || channel === 'sms') && (
                      <td className="px-3 py-2.5 align-top">{a ? <Chip tone={a.tone}>{a.label}</Chip> : <span className="text-xs text-ink-mute">—</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && rows.length === 0 && (
          <EmptyRowState pristine={mine.length === 0} noun={`${MSG_CHANNEL_LABEL[channel]} messages`}
            firstLine={`No Commerce message uses ${MSG_CHANNEL_LABEL[channel]} yet.`} onClear={() => setSearch('')} />
        )}
      </div>

      <TemplateEditorDrawer entry={openEntry} smsOwnHeader={cat?.smsOwnHeader} canWrite={canWrite}
        waApproved={live?.approved} initialChannel={channel}
        onClose={() => setOpenKey(null)} onChanged={reload} />
    </div>
  );
};

export default ChannelTemplates;
