/**
 * "Orders to the ERP" on a connection's Settings tab (ERP-ORDER-1): the switch that places the
 * store's orders in the ERP, the moment it starts from, and the ERP customers B2C orders are
 * booked to. Saved through the connection's own PATCH (`config` merge: a key left out keeps its
 * value, an empty one clears it); the server's refusal is shown as it said it.
 *
 * The owner's rule (2 Nov 2026): every B2C order goes under one ERP customer (CU0875 for now,
 * changeable); a B2B order goes under the buyer's own code, typed on its order page.
 * Switching this on starts statutory invoices in the ERP, so a person confirms every save.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { Btn, Field, SectionCard, TextInput } from '@/components/erp';
import {
  ORDER_PUSH_KEYS as K, erpApi, errorText, fromMicros, whenText,
  type ErpConnection, type ErpOrderPushSettings,
} from '../../../lib/v2/erp';
import { fromStoreDateTimeInput, getStoreTimeZone, storeDateTimeInput } from '../../../utils/date';
import { Code, ConfirmDialog, MANAGE, Notice, OnOff } from './shared';

/** The B2C customer the owner named (2 Nov 2026); offered when none is saved, saved only on confirm. */
const B2C_CUSTOMER_HINT = 'CU0875';

const LABEL: Record<string, string> = {
  [K.send]: 'Send orders to this ERP',
  [K.from]: 'Send orders placed from',
  [K.customer]: 'B2C customer code',
  [K.adminCustomer]: 'Customer code for staff-created B2C orders',
};

const ErpOrderPushSettingsCard: React.FC<{ c: ErpConnection; settings: ErpOrderPushSettings; onChange: () => void }> = ({
  c, settings: op, onChange,
}) => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const savedFrom = storeDateTimeInput(fromMicros(op.send_from_us));
  const savedCode = op.customer_code ?? '';
  const savedAdmin = op.admin_customer_code ?? '';

  const [on, setOn] = useState(op.on);
  const [from, setFrom] = useState(savedFrom);
  const [code, setCode] = useState(savedCode || B2C_CUSTOMER_HINT);
  const [adminCode, setAdminCode] = useState(savedAdmin);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // A save reloads the connection: start again from what is now stored.
  useEffect(() => {
    setOn(op.on);
    setFrom(savedFrom);
    setCode(savedCode || B2C_CUSTOMER_HINT);
    setAdminCode(savedAdmin);
  }, [op.on, savedFrom, savedCode, savedAdmin]);

  const fromInstant = from ? fromStoreDateTimeInput(from) : null;
  const fromMs = fromInstant ? Date.parse(fromInstant) : null;

  // Only what changed is sent.
  const patch: Record<string, string> = {};
  if (on !== op.on) patch[K.send] = on ? 'on' : 'off';
  if (from !== savedFrom) patch[K.from] = fromInstant ?? '';
  if (code.trim() !== savedCode) patch[K.customer] = code.trim();
  if (adminCode.trim() !== savedAdmin) patch[K.adminCustomer] = adminCode.trim();
  const changed = Object.keys(patch);

  const switchingOn = on && !op.on;
  const switchingOff = !on && op.on;
  const inPast = fromMs !== null && fromMs < Date.now();
  const movedEarlier = on && op.on && fromMs !== null && typeof op.send_from_us === 'number' && fromMs < op.send_from_us / 1000;
  // Refused here only where the server would accept it but the push would quietly stop.
  const blocked = from && !fromInstant
    ? 'The start is not a date and time.'
    : on && op.on && !from && !!savedFrom
      ? 'Set the moment orders are sent from, or switch sending off.'
      : null;

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await erpApi.update(c.id, { config: patch });
      setAsk(false);
      setNote({
        ok: true,
        text: switchingOn ? 'Saved: sending orders to the ERP is on.' : switchingOff ? 'Saved: orders are no longer sent to the ERP.' : 'Saved.',
      });
      onChange();
    } catch (err) {
      setAsk(false);
      setNote({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const shown = (key: string, v: string) => {
    if (key === K.send) return v === 'on' ? 'on' : 'off';
    if (key === K.from) return v ? whenText(Date.parse(v) * 1000) : 'the moment sending is switched on';
    if (key === K.adminCustomer && !v) return 'same as the B2C code';
    return v || 'not set';
  };
  const wasShown = (key: string) => {
    if (key === K.send) return op.on ? 'on' : 'off';
    if (key === K.from) return op.send_from_us ? whenText(op.send_from_us) : 'not set';
    if (key === K.adminCustomer) return savedAdmin || 'same as the B2C code';
    return savedCode || 'not set';
  };
  const startText = fromInstant ? whenText(Date.parse(fromInstant) * 1000) : 'the moment you confirm';
  const b2c = code.trim();

  return (
    <SectionCard
      title="Orders to the ERP"
      description="Every order placed in the ERP, and the ERP's invoice number written back onto the order."
    >
      <div className="space-y-4">
        {op.on
          ? <Notice tone="good" title="Sending orders is on">Orders placed from {op.send_from_us ? whenText(op.send_from_us) : 'the start time'} go to {c.label}.</Notice>
          : <Notice tone="info" title="Sending orders is off">No order is placed in {c.label}; orders go to it only by the hand export.</Notice>}
        {!op.deployment_allows && (
          <Notice tone="warn" title="This server does not send orders">
            {op.deployment_note || 'This deployment never places orders in an ERP.'} The settings are kept and take effect on a server that sends.
          </Notice>
        )}
        {op.on && op.missing.length > 0 && (
          <Notice tone="warn" title="Nothing is sent until these are set">{op.missing.map((k) => LABEL[k] ?? k).join(', ')}.</Notice>
        )}
        {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (changed.length && !blocked) setAsk(true); }}>
          <div className="flex flex-wrap items-center gap-3">
            <OnOff
              on={on}
              label={LABEL[K.send]}
              disabled={!canManage || busy}
              title={canManage ? (on ? 'Switch sending off' : 'Switch sending on') : 'You need the Manage settings permission.'}
              onToggle={() => setOn(!on)}
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium text-gray-900">{LABEL[K.send]}</div>
              <div className="text-xs text-gray-500">
                While on, every new order is placed in the ERP within a few minutes, and the invoice number the ERP issues comes back onto the order and its invoice.
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={LABEL[K.from]}>
              <TextInput type="datetime-local" value={from} disabled={!canManage || busy} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-xs text-gray-500">
                Orders placed from this moment are sent (store time, {getStoreTimeZone()}). Leave empty to start from the moment you switch sending on.
              </span>
            </Field>
            <Field label={LABEL[K.customer]}>
              <TextInput
                value={code}
                maxLength={80}
                autoComplete="off"
                placeholder={`e.g. ${B2C_CUSTOMER_HINT}`}
                disabled={!canManage || busy}
                onChange={(e) => setCode(e.target.value)}
              />
              <span className="text-xs text-gray-500">
                The ERP customer every B2C order is booked to, e.g. {B2C_CUSTOMER_HINT}. A B2B order goes under the buyer’s own code, typed on its order page.
                {!savedCode && ' Filled in for you; it is saved only when you press Save and confirm.'}
              </span>
            </Field>
            <Field label={<>{LABEL[K.adminCustomer]} <span className="font-normal text-gray-400">(optional)</span></>}>
              <TextInput
                value={adminCode}
                maxLength={80}
                autoComplete="off"
                placeholder="same as the B2C code"
                disabled={!canManage || busy}
                onChange={(e) => setAdminCode(e.target.value)}
              />
              <span className="text-xs text-gray-500">B2C orders staff create in the admin. Leave blank to book them to the B2C customer above.</span>
            </Field>
          </div>

          {blocked && changed.length > 0 && <p className="text-xs text-red-700">{blocked}</p>}
          <div className="flex justify-end">
            <Btn
              type="submit"
              disabled={!canManage || busy || !changed.length || !!blocked}
              title={canManage ? (changed.length ? undefined : 'Nothing has changed.') : 'You need the Manage settings permission.'}
            >
              {busy ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={ask}
        title={switchingOn ? 'Start sending orders to the ERP?' : switchingOff ? 'Stop sending orders to the ERP?' : 'Save the order settings?'}
        confirmLabel={switchingOn ? 'Yes, start sending' : switchingOff ? 'Stop sending' : 'Save'}
        busy={busy}
        onClose={() => setAsk(false)}
        onConfirm={() => void save()}
      >
        {switchingOn && (
          <>
            <p className="font-medium text-gray-900">
              A person makes this change: it starts statutory invoices in the ERP.
            </p>
            <p>
              From {startText}, every order is placed in {c.label} and the ERP issues its invoice; that number becomes the order’s invoice number.
              B2C orders are booked to <Code>{b2c || 'not set'}</Code>
              {adminCode.trim() ? <>, staff-created ones to <Code>{adminCode.trim()}</Code></> : null}. B2B orders wait on their page for the buyer’s own code.
            </p>
            {inPast && <p>That moment is in the past: orders placed since then that were not exported by hand are sent too.</p>}
            {!op.deployment_allows && <p>This server does not send orders yet, so nothing goes until it does.</p>}
          </>
        )}
        {switchingOff && <p>New orders are no longer placed in {c.label}. Orders already sent keep their ERP invoices.</p>}
        {!switchingOn && !switchingOff && (
          <p>These settings decide which ERP customer each order, and its statutory invoice, is booked to.</p>
        )}
        {movedEarlier && <p>The start moves earlier: orders placed since then that were not sent or exported are sent too.</p>}
        <ul className="list-disc space-y-0.5 pl-5">
          {changed.map((k) => (
            <li key={k}>{LABEL[k] ?? k}: {wasShown(k)} → {shown(k, patch[k])}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </SectionCard>
  );
};

export default ErpOrderPushSettingsCard;
