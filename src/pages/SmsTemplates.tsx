import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Send, Settings2, CircleCheck } from 'lucide-react';
import { messageTemplatesAPI, type MsgCatalogue, type MsgCatalogueEntry, type MsgChannel } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Chip } from '@/components/erp/StatusChip';
import { FilterChips, TableSkeleton, type ChipGroup } from '@/components/erp/ListKit';
import { ListHeader, SearchBox, SegmentTabs, EmptyRowState } from '@/components/sales/ListChrome';
import InfoTip from '@/components/common/InfoTip';
import { useToast } from '@/hooks/use-toast';
import TemplateEditorDrawer from '@/components/templates/TemplateEditorDrawer';
import SmsGatewayPanel from '@/components/templates/SmsGatewayPanel';
import WhatsAppStatusPanel, { useWhatsAppLiveStatus, waNamesOf } from '@/components/templates/WhatsAppStatusPanel';
import {
  CHANNEL_LABEL, CHANNEL_ORDER, KIND_HELP, KIND_LABEL, KIND_TONE, LAYER_FILTER_LABEL, LAYER_TONE,
  approvalOf, layerOf, productLabel, productTabs, rowHaystack, type LayerKey,
} from '@/components/templates/model';

/**
 * MESSAGE TEMPLATES — every message every product this store runs can send,
 * per channel, with WHICH text goes out: Growcord's default (the catalogue,
 * in code) or the store's own override. docs/MESSAGE_TEMPLATES_PLAN.md §5.
 *
 * Rebuilt in place of the old "Notification Templates" page (same route, same
 * menu item). The SMS gateway credentials and DLT auto-map it carried live
 * behind "Gateway"; the WhatsApp gateway's live approval and "Submit missing
 * to Meta" live in the WhatsApp column header.
 *
 * The layer a badge names comes from the server's `resolved` block — the same
 * resolver a send uses — never from this page's own reasoning.
 */

const SmsTemplates: React.FC = () => {
  const { toast } = useToast();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('marketing.manage');
  const [params, setParams] = useSearchParams();

  const [cat, setCat] = useState<MsgCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [channelF, setChannelF] = useState('');
  const [layerF, setLayerF] = useState('');

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCat(await messageTemplatesAPI.catalogue());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load the message catalogue.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tabs = useMemo(() => productTabs(cat), [cat]);
  const product = params.get('product') && tabs.includes(params.get('product')!) ? params.get('product')! : (tabs[0] ?? 'commerce');
  const setProduct = (p: string) => { const n = new URLSearchParams(params); n.set('product', p); setParams(n, { replace: true }); };

  const productEntries = useMemo(() => (cat?.entries ?? []).filter((e) => e.def.product === product), [cat, product]);
  const hasWhatsApp = productEntries.some((e) => e.def.channels.includes('whatsapp'));
  const live = useWhatsAppLiveStatus(!!cat && hasWhatsApp);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productEntries.filter((e) => {
      if (q && !rowHaystack(e).includes(q)) return false;
      if (kind && e.def.kind !== kind) return false;
      if (channelF && !e.def.channels.includes(channelF as MsgChannel)) return false;
      if (layerF && !e.def.channels.some((c) => layerOf(e, c, cat?.smsOwnHeader) === layerF)) return false;
      return true;
    });
  }, [productEntries, search, kind, channelF, layerF, cat]);

  const columns = useMemo(() => CHANNEL_ORDER.filter((c) => productEntries.some((e) => e.def.channels.includes(c))), [productEntries]);

  const groups: ChipGroup[] = [
    {
      key: 'kind', label: 'Kind', value: kind, onChange: setKind, help: 'What the message is for — it decides consent and price.',
      options: (['authentication', 'update', 'marketing'] as const)
        .filter((k) => productEntries.some((e) => e.def.kind === k))
        .map((k) => ({ value: k, label: KIND_LABEL[k], hint: String(productEntries.filter((e) => e.def.kind === k).length) })),
    },
    {
      key: 'channel', label: 'Channel', value: channelF, onChange: setChannelF,
      options: columns.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
    },
    {
      key: 'layer', label: 'Text', value: layerF, onChange: setLayerF, help: 'Which text a send uses today.',
      options: (Object.keys(LAYER_FILTER_LABEL) as LayerKey[])
        .filter((l) => productEntries.some((e) => e.def.channels.some((c) => layerOf(e, c, cat?.smsOwnHeader) === l)))
        .map((l) => ({ value: l, label: LAYER_FILTER_LABEL[l] })),
    },
  ];
  const clearAll = () => { setKind(''); setChannelF(''); setLayerF(''); setSearch(''); };

  const openEntry = cat?.entries.find((e) => e.def.key === openKey) ?? null;
  const overrides = productEntries.reduce((n, e) => n + e.def.channels.filter((c) => { const l = layerOf(e, c, cat?.smsOwnHeader); return l === 'store' || l === 'store_registered'; }).length, 0);

  const waApprovedCount = live.status
    ? productEntries.filter((e) => e.def.channels.includes('whatsapp') && waNamesOf(e).some((n) => live.approved.has(n))).length
    : null;
  const waTotal = productEntries.filter((e) => e.def.channels.includes('whatsapp')).length;

  const ChannelCell: React.FC<{ e: MsgCatalogueEntry; c: MsgChannel }> = ({ e, c }) => {
    if (!e.def.channels.includes(c)) return <span className="text-xs text-ink-mute">—</span>;
    const l = layerOf(e, c, cat?.smsOwnHeader);
    let a = approvalOf(e.resolved[c]);
    if (c === 'whatsapp' && (!a || a.label === 'Not checked') && live.status) {
      a = waNamesOf(e).some((n) => live.approved.has(n)) ? { label: 'Approved', tone: 'green' } : { label: 'Not approved', tone: 'amber' };
    }
    return (
      <div className="flex flex-col items-start gap-1" data-layer={l}>
        <Chip tone={LAYER_TONE[l]}>{LAYER_FILTER_LABEL[l]}</Chip>
        {a && (c === 'whatsapp' || c === 'sms') && <Chip tone={a.tone} className="text-[10px]">{a.label}</Chip>}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      <ListHeader
        title="Message templates"
        purpose="Every message your store sends, per channel — Growcord's default until you write your own."
        aside={
          <Button variant="outline" size="sm" onClick={() => setGatewayOpen(true)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> SMS gateway
          </Button>
        }
        action={
          <Button size="sm" onClick={() => setTestOpen(true)} disabled={!productEntries.length}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Test send
          </Button>
        }
      />

      {cat?.degraded && (
        <div className="rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn-ink">{cat.degraded}</div>
      )}
      {error && <div className="rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad-ink">{error}</div>}

      <SegmentTabs ariaLabel="Product" tabs={tabs.map((p) => ({
        key: p, label: productLabel(cat, p), on: p === product, onPick: () => { setProduct(p); clearAll(); },
      }))} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search messages" className="w-72" />
        <FilterChips groups={groups} onClearAll={clearAll} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {loading ? <table className="w-full"><TableSkeleton rows={8} cols={5} /></table> : (
          <table className="w-full text-sm" data-testid="templates-table">
            <thead className="border-b border-line bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2">Message</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      {CHANNEL_LABEL[c]}
                      {c === 'whatsapp' && (
                        <button type="button" onClick={() => setWaOpen(true)} data-testid="wa-status-button"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium normal-case text-ink-soft hover:border-brand hover:text-ink">
                          <CircleCheck className="h-3 w-3" />
                          {waApprovedCount === null ? (live.busy ? 'Checking…' : 'Status') : `${waApprovedCount}/${waTotal} approved`}
                        </button>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.def.key} data-key={e.def.key} onClick={() => setOpenKey(e.def.key)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{e.def.title}</span>
                      <Chip tone={KIND_TONE[e.def.kind]}>{KIND_LABEL[e.def.kind]}</Chip>
                      <InfoTip text={KIND_HELP[e.def.kind]} />
                    </div>
                    <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-ink-soft">{e.def.description}</p>
                  </td>
                  {columns.map((c) => <td key={c} className="px-3 py-2.5 align-top"><ChannelCell e={e} c={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && rows.length === 0 && (
          <EmptyRowState pristine={productEntries.length === 0} noun={`${productLabel(cat, product)} messages`}
            firstLine="This product sends nothing from this store yet." onClear={clearAll} />
        )}
      </div>

      {!loading && (
        <p className="text-xs text-ink-soft" data-testid="templates-footer">
          {rows.length} of {productEntries.length} messages · {overrides} channel{overrides === 1 ? '' : 's'} on your own text · everything else sends Growcord's default.
        </p>
      )}

      <TemplateEditorDrawer entry={openEntry} smsOwnHeader={cat?.smsOwnHeader} canWrite={canWrite}
        waApproved={live.approved} onClose={() => setOpenKey(null)} onChanged={load} />

      <Sheet open={gatewayOpen} onOpenChange={setGatewayOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>SMS gateway</SheetTitle>
            <SheetDescription>The store's own SMS account and its DLT registered texts.</SheetDescription>
          </SheetHeader>
          <div className="mt-4"><SmsGatewayPanel canWrite={canWrite} onChanged={load} /></div>
        </SheetContent>
      </Sheet>

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>WhatsApp approval</DialogTitle>
            <DialogDescription>Asked of the WhatsApp gateway itself, not of this list.</DialogDescription>
          </DialogHeader>
          <WhatsAppStatusPanel live={live} entries={productEntries} canWrite={canWrite} />
        </DialogContent>
      </Dialog>

      <TestSendDialog open={testOpen} onOpenChange={setTestOpen} entries={productEntries}
        onResult={(ok, title, message) => toast({ variant: ok ? undefined : 'destructive', title, description: message })} />
    </div>
  );
};

/** The page's one primary: send any message of this product to the signed-in person. */
const TestSendDialog: React.FC<{
  open: boolean; onOpenChange: (o: boolean) => void; entries: MsgCatalogueEntry[];
  onResult: (ok: boolean, title: string, message: string) => void;
}> = ({ open, onOpenChange, entries, onResult }) => {
  const [key, setKey] = useState('');
  const [channel, setChannel] = useState<MsgChannel | ''>('');
  const [busy, setBusy] = useState(false);
  const entry = entries.find((e) => e.def.key === key) ?? entries[0];
  const chans = entry ? CHANNEL_ORDER.filter((c) => entry.def.channels.includes(c)) : [];
  const ch = (channel && chans.includes(channel as MsgChannel) ? channel : chans[0]) as MsgChannel | undefined;

  const send = async () => {
    if (!entry || !ch) return;
    setBusy(true);
    const r = await messageTemplatesAPI.testSend(entry.def.key, ch);
    setBusy(false);
    onResult(r.ok, r.ok ? `Test ${CHANNEL_LABEL[ch]} sent${r.to ? ` to ${r.to}` : ''}` : `Test ${CHANNEL_LABEL[ch]} not sent`, r.message);
    if (r.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test send</DialogTitle>
          <DialogDescription>Goes to your own email or phone, with example values filled in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Message</span>
            <select aria-label="Message" className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm" value={entry?.def.key ?? ''}
              onChange={(e) => { setKey(e.target.value); setChannel(''); }}>
              {entries.map((e) => <option key={e.def.key} value={e.def.key}>{e.def.title}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Channel</span>
            <select aria-label="Channel" className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm" value={ch ?? ''}
              onChange={(e) => setChannel(e.target.value as MsgChannel)}>
              {chans.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={busy || !entry || !ch}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Send to me</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SmsTemplates;
