/**
 * Product services, "Your requests" (PSVC-1): the work rows, newest first, filtered by kind and
 * status (open by default: asked or in progress). Read only when this list scrolls into view. A store
 * admin (billing.manage) may cancel a row Growcord has not started, with a reason.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { Btn, Field, SectionCard, SelectInput, StatusChip } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInView } from '@/components/panelAnalytics/useInView';
import { billingAPI, errorText } from '@/services/api';
import { fmtCurrencyMinor } from '@/lib/money';
import { formatDay } from '@/utils/date';
import { KINDS, SERVICE_STATUS, STATUS_FILTERS, asItems, kindLabel, type ServiceItem } from '@/lib/productServices';

const LIMIT = 50;
const money = (minor: number | null | undefined, currency?: string | null) => fmtCurrencyMinor(minor ?? 0, currency || 'INR', 'en-IN');

function CancelDialog({ item, onClose, onDone }: { item: ServiceItem; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await billingAPI.cancelProductService(item.id, reason.trim() || undefined);
      onDone();
    } catch (err) {
      setError(errorText(err, 'This request could not be cancelled.'));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>{kindLabel(item.kind)} for {item.product_name}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Why are you cancelling it?">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="For example: we made these pictures ourselves" autoFocus />
          </Field>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="outline" disabled={busy} onClick={onClose}>Keep it</Btn>
            <Btn type="submit" variant="danger" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <XCircle />} Cancel request</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ServiceRequests({ canManage, version, onChanged }: {
  canManage: boolean;
  /** Bumped after any change on the page; the list is read again when it is on screen. */
  version: number;
  onChanged: () => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('open');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ServiceItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<ServiceItem | null>(null);
  const ask = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const n = (ask.current += 1);
    setLoading(true);
    billingAPI.getProductServiceItems({ kind: kind || undefined, status: status || undefined, limit: LIMIT, offset })
      .then((d) => { if (n === ask.current) { setRows(asItems(d)); setError(null); } })
      .catch((e) => { if (n === ask.current) setError(errorText(e, 'Your requests could not be loaded.')); })
      .finally(() => { if (n === ask.current) setLoading(false); });
  }, [inView, kind, status, offset, version]);

  const more = (rows?.length ?? 0) === LIMIT;

  return (
    <div ref={ref}>
      <SectionCard
        flush
        title="Your requests"
        description="Work asked of Growcord, newest first. A request can be cancelled until Growcord starts it."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0); }} aria-label="Work">
              <option value="">All work</option>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </SelectInput>
            <SelectInput value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
              {STATUS_FILTERS.map((s) => <option key={s.value || 'all'} value={s.value}>{s.label}</option>)}
            </SelectInput>
          </div>
        )}
      >
        {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading your requests</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            {offset > 0 ? 'No more requests.' : status === 'open' ? 'No open requests.' : 'No requests match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Work</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rate before GST</TableHead>
                  <TableHead>Asked</TableHead>
                  <TableHead>Note</TableHead>
                  {canManage && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className={loading ? 'opacity-60' : undefined}>
                {rows.map((r) => {
                  const s = SERVICE_STATUS[r.status];
                  return (
                    <TableRow key={r.id} data-service-request={r.id}>
                      <TableCell className="min-w-[200px]">
                        <div className="line-clamp-2 text-sm text-gray-900">{r.product_name}</div>
                        {r.product_sku && <div className="text-xs text-gray-500">{r.product_sku}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-700">{kindLabel(r.kind)}</TableCell>
                      <TableCell>
                        <StatusChip status={r.status} tone={s?.tone ?? 'neutral'} label={s?.label ?? r.status} />
                        {r.status === 'delivered' && r.delivered_at && <div className="mt-0.5 text-xs text-gray-500">{formatDay(r.delivered_at, '')}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                        {r.rate_minor != null ? money(r.rate_minor, r.currency) : <span className="text-gray-500">Price to be agreed</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-700">
                        {formatDay(r.requested_at, '')}
                        <div className="text-xs text-gray-500">{r.source === 'growcord' ? 'Recorded by Growcord' : r.requested_by}</div>
                      </TableCell>
                      <TableCell className="max-w-[280px] text-sm text-gray-700">
                        {r.status === 'cancelled' && r.cancel_reason
                          ? <span className="text-gray-500">Cancelled: {r.cancel_reason}</span>
                          : r.note ? <span className="line-clamp-3">{r.note}</span> : <span className="text-gray-400">None</span>}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {r.status === 'requested' && (
                            <Btn size="sm" variant="dangerOutline" onClick={() => setCancelling(r)}>Cancel</Btn>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {(offset > 0 || more) && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2 text-sm text-gray-600">
            {rows?.length ? <span>Showing {offset + 1} to {offset + rows.length}</span> : <span />}
            <span className="flex gap-2">
              <Btn size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>Previous</Btn>
              <Btn size="sm" variant="outline" disabled={!more || loading} onClick={() => setOffset((o) => o + LIMIT)}>Next</Btn>
            </span>
          </div>
        )}
      </SectionCard>

      {cancelling && (
        <CancelDialog
          item={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => { setCancelling(null); onChanged(); }}
        />
      )}
    </div>
  );
}
