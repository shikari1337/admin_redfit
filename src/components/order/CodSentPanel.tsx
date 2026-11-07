import React, { useState } from 'react';
import { FaExclamationTriangle, FaSpinner, FaTruck } from 'react-icons/fa';
import Modal from './Modal';
import { fmtRupees } from '../../lib/money';
import { shipmentsAPI } from '../../services/api';
import { Button } from '@/components/ui/button';

/**
 * COD against the courier, on the order page's Shipping and tracking card
 * (owner, 7 Nov 2026: "show the cod amount sent to shiprocket").
 *
 * The figures come from the server (`cod_sent` and each parcel's `cod_sent_*`,
 * Ship's `cod_sent` contract); this file does no arithmetic of its own. A figure
 * worked out for an older parcel is labelled Estimated, never shown as recorded.
 *
 * The rebook is offered only when the server says a parcel can take it: the
 * courier has not picked it up and the order is overcharged. Cancelling comes
 * first and a refusal changes nothing; a booking that fails after the cancel comes
 * back as "needs booking", which this panel shows until someone books the parcel.
 */

interface Parcel {
  id?: string;
  _id?: string;
  awb?: string | null;
  courier?: string | null;
  cod_sent?: number | null;
  codSent?: number | null;
  cod_sent_basis?: string | null;
  codSentBasis?: string | null;
  cod_sent_note?: string | null;
  codSentNote?: string | null;
  cod_booked_due?: number | null;
  codBookedDue?: number | null;
  can_rebook?: boolean;
  canRebook?: boolean;
}

interface RebookAnswer {
  state?: string;
  message?: string;
  new_awb?: string;
  courier_changed?: boolean;
  carrier_note?: string | null;
  reprint?: string[];
  pickup?: { scheduled?: boolean; date?: string; reason?: string } | null;
}

const BASIS_WORD: Record<string, string> = { recorded: 'Recorded', estimated: 'Estimated', mixed: 'Part estimated' };

const basisClass = (basis: string) => (basis === 'recorded'
  ? 'border-good bg-good-bg text-good-ink'
  : 'border-warn bg-warn-bg text-warn-ink');

const Amount: React.FC<{ label: string; value: number; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
    <span className="text-xs font-medium text-slate-600">{label}</span>
    <span className="flex items-baseline gap-1.5">
      {children}
      <span className="font-semibold tabular-nums text-slate-900">{fmtRupees(value)}</span>
    </span>
  </div>
);

const reasonOf = (e: any): string => e?.response?.data?.message || e?.message || 'The rebook did not go through.';

const CodSentPanel: React.FC<{
  order: any;
  /** `shipments.manage`: the rebook is hidden without it. */
  canManage: boolean;
  /** Reload the order after a rebook. */
  onChanged: () => void;
}> = ({ order, canManage, onChanged }) => {
  const cod = order.cod_sent ?? order.codSent;
  const needs = order.needs_booking ?? order.needsBooking;
  const parcels: Parcel[] = Array.isArray(order.shipments) ? order.shipments : [];
  const rebookable = parcels.filter((p) => p.can_rebook ?? p.canRebook);
  const withCod = parcels.filter((p) => (p.cod_sent ?? p.codSent) != null);

  const [asked, setAsked] = useState<{ id: string; awb: string; courier: string; due?: number } | null>(null);
  const [note, setNote] = useState('');
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<RebookAnswer | null>(null);
  const [refusal, setRefusal] = useState('');

  if (!cod && !needs) return null;

  const close = () => {
    if (running) return;
    const finished = answer !== null;
    setAsked(null); setAnswer(null); setRefusal(''); setNote('');
    if (finished) onChanged();
  };

  const run = async () => {
    if (!asked) return;
    setRunning(true); setRefusal('');
    try {
      setAnswer(await shipmentsAPI.codRebook(asked.id, note.trim() || undefined));
    } catch (e: any) {
      setRefusal(reasonOf(e));
    } finally {
      setRunning(false);
    }
  };

  const over = Number(cod?.over) || 0;
  const delivered = !!cod?.delivered;
  const basis = String(cod?.basis ?? '');
  const onlyParcel = withCod.length === 1 ? withCod[0] : null;
  const failed = answer?.state === 'needs_booking';

  return (
    <div className="space-y-2">
      {needs && (
        <div role="alert" className="space-y-2 rounded-md border border-bad bg-bad-bg p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-bad-ink">
            <FaExclamationTriangle className="h-3 w-3 shrink-0" /> Needs booking: this order has no live parcel
          </p>
          <p className="text-xs text-bad-ink">
            AWB {needs.awb ?? 'unknown'} was cancelled at the courier and the new booking failed
            {needs.reason ? `: ${needs.reason}` : '.'}
          </p>
          {canManage && needs.shipment_id && (
            <Button size="sm" variant="outline" className="h-8"
              onClick={() => setAsked({ id: String(needs.shipment_id), awb: String(needs.awb ?? ''), courier: String(needs.courier ?? 'the courier') })}>
              <FaTruck className="mr-1.5 h-3 w-3" /> Book again with {needs.courier ?? 'the courier'}
            </Button>
          )}
        </div>
      )}

      {cod && (
        <div className="space-y-1.5 rounded-md border border-line bg-surface-2 p-2.5 text-sm">
          <Amount label="COD sent to courier" value={Number(cod.sent) || 0}>
            <span title={onlyParcel ? String(onlyParcel.cod_sent_note ?? onlyParcel.codSentNote ?? '') : undefined}
              className={`rounded border px-1 text-[10px] font-semibold uppercase tracking-wide ${basisClass(basis)}`}>
              {BASIS_WORD[basis] ?? basis}
            </span>
          </Amount>
          <Amount label={delivered ? 'Due when booked' : 'Due from customer'} value={Number(cod.due) || 0} />

          {basis !== 'recorded' && (
            <p className="text-[11px] leading-snug text-slate-500">
              {String(onlyParcel?.cod_sent_note ?? onlyParcel?.codSentNote ?? 'Some parcels were booked before the amount was recorded, so this figure is worked out.')}
            </p>
          )}

          {withCod.length > 1 && (
            <ul className="space-y-0.5 border-t border-line pt-1.5 text-[11px] text-slate-600">
              {withCod.map((p) => (
                <li key={String(p.id ?? p._id)} className="flex justify-between gap-2">
                  <span className="font-mono">{p.awb ?? 'No AWB'}</span>
                  <span className="tabular-nums">
                    {fmtRupees(Number(p.cod_sent ?? p.codSent) || 0)}{' '}
                    {BASIS_WORD[String(p.cod_sent_basis ?? p.codSentBasis)] ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {over > 0 && (
            <div role="alert" className="rounded border border-bad bg-bad-bg px-2 py-1.5 text-xs text-bad-ink">
              <p className="flex items-center gap-1.5 font-semibold">
                <FaExclamationTriangle className="h-3 w-3 shrink-0" />
                {delivered ? `Courier collected ${fmtRupees(over)} too much` : `Courier will collect ${fmtRupees(over)} too much`}
              </p>
              {delivered ? (
                <p className="mt-0.5">Refund {fmtRupees(over)} to the customer.</p>
              ) : rebookable.length === 0 ? (
                <p className="mt-0.5">The parcel is already with the courier, so it can no longer be rebooked. Refund {fmtRupees(over)} after delivery.</p>
              ) : null}
            </div>
          )}

          {over > 0 && canManage && rebookable.map((p) => (
            <Button key={String(p.id ?? p._id)} size="sm" variant="outline" className="h-auto min-h-8 w-full justify-center whitespace-normal py-1.5 text-center leading-snug"
              onClick={() => setAsked({
                id: String(p.id ?? p._id), awb: String(p.awb ?? ''), courier: String(p.courier ?? 'the courier'),
                // One parcel collects the whole due; of several, each collects its own share.
                due: withCod.length > 1 ? Number(p.cod_booked_due ?? p.codBookedDue) || 0 : Number(cod.due) || 0,
              })}>
              <FaTruck className="mr-1.5 h-3 w-3 shrink-0" />
              Rebook at correct COD amount{rebookable.length > 1 && p.awb ? ` (${p.awb})` : ''}
            </Button>
          ))}
        </div>
      )}

      <Modal
        isOpen={asked !== null}
        onClose={close}
        title={answer ? (failed ? 'Needs booking' : 'Parcel rebooked') : 'Rebook at correct COD amount'}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close} disabled={running}>{answer ? 'Close' : 'Keep the parcel as it is'}</Button>
            {!answer && (
              <Button size="sm" onClick={run} disabled={running}>
                {running && <FaSpinner className="mr-1.5 h-3 w-3 animate-spin" />}
                {running ? 'Working…' : needs ? 'Book again' : 'Cancel and rebook'}
              </Button>
            )}
          </div>
        }
      >
        {!answer ? (
          <div className="space-y-3 text-sm text-slate-700">
            {needs ? (
              <p>This books the parcel again with {asked?.courier} at the due amount. The order keeps its status.</p>
            ) : (
              <>
                <p>
                  AWB <span className="font-mono">{asked?.awb}</span> is cancelled at the courier first. If the courier
                  refuses, nothing changes. It is then booked again with {asked?.courier} so the courier collects{' '}
                  <strong>{fmtRupees(asked?.due ?? 0)}</strong>. The order keeps its status.
                </p>
                <p className="text-xs text-slate-500">
                  The AWB changes, so the printed label and manifest must be replaced. You will be told exactly what to reprint.
                </p>
              </>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} disabled={running}
                className="h-9 w-full rounded border border-line bg-surface px-2 text-sm" />
            </label>
            {refusal && <p role="alert" className="rounded border border-bad bg-bad-bg px-2 py-1.5 text-xs text-bad-ink">{refusal}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-700">
            <p className={failed ? 'font-medium text-bad-ink' : undefined}>{answer.message}</p>
            {failed && <p>The order is flagged and has no live parcel. Book it again from this card.</p>}
            {answer.courier_changed && (
              <p role="alert" className="rounded border border-warn bg-warn-bg px-2 py-1.5 text-xs text-warn-ink">
                The courier gave this parcel to a different courier than before.
              </p>
            )}
            {answer.carrier_note && <p className="text-xs text-slate-500">The courier said: {answer.carrier_note}</p>}
            {answer.pickup && (
              <p className={answer.pickup.scheduled ? 'text-xs text-slate-600' : 'text-xs font-medium text-warn-ink'}>
                {answer.pickup.scheduled ? `Pickup booked for ${answer.pickup.date}.` : answer.pickup.reason}
              </p>
            )}
            {!!answer.reprint?.length && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Print again</p>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {answer.reprint.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CodSentPanel;
