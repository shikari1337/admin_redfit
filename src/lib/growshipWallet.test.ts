/**
 * Tests for lib/growshipWallet.ts. The admin has no test runner, so this file runs on its own:
 *   npx esbuild src/lib/growshipWallet.test.ts --bundle --platform=node --outfile=<scratch>/gsw.test.js && node <scratch>/gsw.test.js
 * It throws on the first failure and prints "growshipWallet: N checks passed" otherwise. The app never imports it.
 * The movements are Homeomed's of 26 Nov 2026 (times IST) as the brief GS-ACC-M lists them; the balances are made up
 * but chained as the wallet chains them.
 */
import {
  isShipRefund, linkMoves, netFor, plainNote, walletForParcels, walletGap, type WalletMove,
} from './growshipWallet';
import type { GsWalletLeg } from './v2/growship';

let checks = 0;
function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
  checks += 1;
}

let bal = 500;
const mv = (id: string, when: string, direction: 'credit' | 'debit', amount: number, category: string, reference: string | null, note: string): WalletMove => {
  bal = Math.round((bal + (direction === 'credit' ? amount : -amount)) * 100) / 100;
  return { id, direction, amount, balance_after: bal, category, reference, note, created_at: `2026-11-26T${when}+05:30` };
};
const OLD_FREIGHT = 'Growcord Ship freight — Delhivery Surface Delhivery Surface';
const OLD_RELEASE = 'Growcord Ship — reservation released: publish webhook event';
const day = [
  mv('d1', '12:54:19', 'debit', 43.72, 'shipping', 'SM-13391', OLD_FREIGHT),
  mv('r1', '12:54:20', 'credit', 43.72, 'refund', null, OLD_RELEASE),
  mv('top', '13:48:00', 'credit', 10000, 'recharge', 'pay_X', 'Wallet recharge'),
  mv('d2', '14:08:10', 'debit', 73.10, 'shipping', 'SM-13402', OLD_FREIGHT),
  mv('r2', '14:08:11', 'credit', 73.10, 'refund', null, OLD_RELEASE),
  mv('d3', '14:43:00', 'debit', 74.34, 'shipping', 'SM-13402-P2', OLD_FREIGHT),
  mv('d4', '15:59:00', 'debit', 43.72, 'shipping', 'SM-13394', OLD_FREIGHT),
  mv('d5', '16:13:05', 'debit', 286.74, 'shipping', 'SM-13386', OLD_FREIGHT),
  mv('r5', '16:13:06', 'credit', 286.74, 'refund', null, OLD_RELEASE),
];
// The wallet lists newest first.
const newestFirst = [...day].reverse();
const parcels = [
  { id: 'p10', consignment_number: 'SHP/26-27/000010', shipper_reference: 'SM-13402' },
  { id: 'p11', consignment_number: 'SHP/26-27/000011', shipper_reference: 'SM-13402-P2' },
  { id: 'p12', consignment_number: 'SHP/26-27/000012', shipper_reference: 'SM-13394' },
  { id: 'p13', consignment_number: 'SHP/26-27/000013', shipper_reference: 'SM-13386' },
  { id: 'p14', consignment_number: 'SHP/26-27/000014', shipper_reference: 'SM-13391' },
];
const period = { from: '2026-11-26', to: '2026-11-26' };
const noLegs: GsWalletLeg[] = [];

// Old releases (no reference, no Ship record) link to the charge they directly follow in the wallet's balance.
const l = linkMoves(newestFirst, noLegs);
eq(l.debitOf.get('r1')?.id, 'd1', 'r1 gives back d1');
eq(l.debitOf.get('r2')?.id, 'd2', 'r2 gives back d2');
eq(l.debitOf.get('r5')?.id, 'd5', 'r5 gives back d5');
eq([l.orderOf.get('r1'), l.orderOf.get('r2'), l.orderOf.get('r5')], ['SM-13391', 'SM-13402', 'SM-13386'], 'each refund names its order');
eq(l.unlinked.size, 0, 'no plain refund line');
eq(l.refundsOf.has('d3') || l.refundsOf.has('d4'), false, 'kept charges are not refunded');

// Billing: what the wallet took and gave back per parcel, against the Finals.
const w = walletForParcels(parcels, newestFirst, noLegs, l, period);
const net = (id: string) => w.get(id)!.net;
eq([net('p14'), net('p10'), net('p11'), net('p12'), net('p13')], [0, 0, 74.34, 43.72, 0], 'wallet net per parcel');
const groups = [...new Set(w.values())];
eq(Math.round(groups.reduce((s, g) => s + g.back, 0) * 100) / 100, 403.56, 'went back to the wallet: 43.72 + 73.10 + 286.74');
eq(Math.round(groups.reduce((s, g) => s + g.net, 0) * 100) / 100, 118.06, 'wallet net of the period');
const gap = walletGap(w.get('p14')!, [172.28]);
eq(gap.differs, true, 'SM-13391 differs');
eq(gap.text, 'Wallet took ₹0.00 for this parcel; Final is ₹172.28. It took ₹43.72 and gave back ₹43.72.', 'SM-13391 warning');
eq(walletGap(w.get('p10')!, [0]).differs, false, 'a cancelled parcel with no fee and its refund match');
eq(walletGap(w.get('p11')!, [74.34]).differs, false, 'a kept parcel matches');
eq(walletGap(w.get('p13')!, [null]).final, null, 'a fee not read yet is not checked');
eq(walletGap(w.get('p12')!, [43.72]).text, '', 'no words when it matches');

// The person's correction (the console's Debit: category adjustment, the order as reference) closes the gap.
const fix: WalletMove = { id: 'a1', direction: 'debit', amount: 172.28, balance_after: 10209.66, category: 'adjustment', reference: 'SM-13391', note: 'Freight not taken at booking', created_at: '2026-11-27T10:00:00+05:30' };
const withFix = [fix, ...newestFirst];
const lf = linkMoves(withFix, noLegs);
eq(lf.corrections.has('a1'), true, 'an adjustment naming a Growcord Ship order is a correction');
eq(lf.orderOf.get('a1'), 'SM-13391', 'its order');
eq(netFor(lf, 'SM-13391', withFix, { lo: 0, hi: Infinity, olderOpen: false, newerOpen: false }), 172.28, 'net for the order counts the correction');
const wf = walletForParcels(parcels, withFix, noLegs, lf, period);
eq(walletGap(wf.get('p14')!, [172.28]).differs, false, 'SM-13391 matches after the correction (taken after the period)');
// A manual credit naming no Growcord Ship order is not a correction; a recharge never is.
const credit: WalletMove = { id: 'c1', direction: 'credit', amount: 10, balance_after: 0, category: 'manual_credit', reference: 'GIFT-1', note: 'Goodwill', created_at: '2026-11-27T11:00:00+05:30' };
const lc = linkMoves([credit, ...newestFirst], noLegs);
eq([lc.corrections.has('c1'), lc.corrections.has('top')], [false, false], 'no order, no correction');
eq(linkMoves([credit, ...newestFirst], noLegs, ['GIFT-1']).corrections.has('c1'), true, 'a known parcel order makes it one');

// The balance link needs the very next movement: anything in between, or another amount, leaves a plain refund.
bal = 100;
const gapDay = [
  mv('x1', '10:00:00', 'debit', 50, 'shipping', 'SM-1', OLD_FREIGHT),
  mv('x2', '10:00:01', 'debit', 5, 'whatsapp', null, 'Message'),
  mv('x3', '10:00:02', 'credit', 50, 'refund', null, OLD_RELEASE),
].reverse();
const lg = linkMoves(gapDay, noLegs);
eq([lg.debitOf.has('x3'), lg.unlinked.has('x3')], [false, true], 'a movement in between: not linked');
bal = 100;
const lateDay = [
  mv('y1', '10:00:00', 'debit', 50, 'shipping', 'SM-2', OLD_FREIGHT),
  mv('y2', '10:30:00', 'credit', 50, 'refund', null, OLD_RELEASE),
].reverse();
eq(linkMoves(lateDay, noLegs).debitOf.has('y2'), false, 'more than 15 minutes later: not linked');
bal = 100;
const otherCarrier = [
  mv('z1', '10:00:00', 'debit', 50, 'shipping', 'AWB123', 'Shipment SM-3 via Shiprocket'),
  mv('z2', '10:00:01', 'credit', 50, 'refund', null, OLD_RELEASE),
].reverse();
eq(linkMoves(otherCarrier, noLegs).debitOf.has('z2'), false, "another carrier's charge never takes a Growcord Ship refund");

// New notes since XB-FIX: the order as reference, "Refund: ..."; the latest charge at or before it (input newest first).
bal = 100;
const retry = [
  mv('n1', '09:00:00', 'debit', 40, 'shipping', 'SM-9', 'Shipping charge: Delhivery, Surface'),
  mv('n2', '09:00:01', 'credit', 40, 'refund', 'SM-9', 'Refund: the booking could not be completed'),
  mv('n3', '11:00:00', 'debit', 45, 'shipping', 'SM-9', 'Shipping charge: Xpressbees'),
  mv('n4', '11:00:01', 'credit', 45, 'refund', 'SM-9', 'Refund: the courier did not take the parcel'),
].reverse();
eq(isShipRefund(retry[0]), true, 'a "Refund: ..." credit is a Growcord Ship refund');
const lr = linkMoves(retry, noLegs);
eq([lr.debitOf.get('n2')?.id, lr.debitOf.get('n4')?.id], ['n1', 'n3'], 'each refund takes the latest charge before it');
eq(netFor(lr, 'SM-9', retry, { lo: 0, hi: Infinity, olderOpen: false, newerOpen: false }), 0, 'net for the order');

// Ship's own record links a cancel refund (the Growcord Ship number) through its parcel, before any balance link.
bal = 100;
const cancelDay = [
  mv('k1', '09:00:00', 'debit', 60, 'shipping', 'SM-5', 'Shipping charge: Delhivery'),
  mv('k2', '12:00:00', 'credit', 60, 'refund', 'SHP/26-27/000020', 'Refund: shipment SHP/26-27/000020 cancelled'),
].reverse();
const legs: GsWalletLeg[] = [
  { id: 'L1', leg: 'freight_debit', consignment_id: 'p20', reference: 'SHP/26-27/000020', platform_ref: 'k1', awb: '1490001' },
  { id: 'L2', leg: 'refund', consignment_id: 'p20', reference: 'SHP/26-27/000020', platform_ref: 'k2', awb: '1490001' },
];
const lk = linkMoves(cancelDay, legs);
eq([lk.debitOf.get('k2')?.id, lk.orderOf.get('k2'), lk.awbOf.get('k2')], ['k1', 'SM-5', '1490001'], 'a cancel refund meets its charge through the parcel');
const wk = walletForParcels([{ id: 'p20', consignment_number: 'SHP/26-27/000020', shipper_reference: 'SM-5' }], cancelDay, legs, lk, period);
eq(wk.get('p20')!.net, 0, 'cancelled with no fee: nothing kept');

// The period: a later booking of the same order is not this parcel's; a refund of an earlier attempt is not counted
// without its charge.
bal = 100;
const span = [
  mv('s0', '09:00:00', 'debit', 30, 'shipping', 'SM-7', 'Shipping charge: Delhivery'),
].map((t) => ({ ...t, created_at: '2026-11-20T09:00:00+05:30' }));
const later: WalletMove = { id: 's2', direction: 'debit', amount: 31, balance_after: 39, category: 'shipping', reference: 'SM-7', note: 'Shipping charge: Delhivery', created_at: '2026-11-28T09:00:00+05:30' };
const inside: WalletMove = { id: 's1', direction: 'debit', amount: 30, balance_after: 40, category: 'shipping', reference: 'SM-7', note: 'Shipping charge: Delhivery', created_at: '2026-11-26T09:00:00+05:30' };
const sp = [later, inside, ...span];
const ws = walletForParcels([{ id: 'p7', consignment_number: 'SHP/X/7', shipper_reference: 'SM-7' }], sp, noLegs, linkMoves(sp, noLegs), period);
eq([ws.get('p7')!.took, ws.get('p7')!.moves], [30, ['s1']], 'only the charge taken in the period counts by the order');

// Two parcels of one order are checked together.
const two = walletForParcels([
  { id: 'a', consignment_number: 'N1', shipper_reference: 'SM-8' }, { id: 'b', consignment_number: 'N2', shipper_reference: 'SM-8' },
], [inside].map((t) => ({ ...t, reference: 'SM-8' })), noLegs, linkMoves([], noLegs), period);
eq(two.get('a') === two.get('b'), true, 'one group');
eq(walletGap(two.get('a')!, [30, 10]).text, 'Wallet took ₹30.00 for order SM-8; the Finals of its 2 parcels add to ₹40.00.', 'group warning');

// Notes in plain words; the stored note is never changed.
eq(plainNote(OLD_FREIGHT), 'Shipping charge: Delhivery Surface', 'courier words once');
eq(plainNote('Growcord Ship freight — Delhivery Delhivery Surface'), 'Shipping charge: Delhivery Surface', 'courier name repeated in the service');
eq(plainNote('Growcord Ship freight — Delhivery Surface'), 'Shipping charge: Delhivery Surface', 'nothing repeated');
eq(plainNote(OLD_RELEASE), 'Refund: the booking could not be completed', 'no internal error text');
eq(plainNote('Growcord Ship: SHP/26-27/000013 cancelled, no courier took it, reservation released'), 'Refund: the courier did not take the parcel', 'an old release of a parcel no courier took');
eq(plainNote('Growcord Ship — SHP/26-27/000010 cancelled'), 'Refund: shipment SHP/26-27/000010 cancelled', 'an old cancel');
eq(plainNote('Shipping charge: Delhivery, Surface'), 'Shipping charge: Delhivery, Surface', 'a new note as it is');
eq(plainNote('Top up — “Diwali” → wallet'), 'Top up: "Diwali" to wallet', 'plain punctuation');
eq(plainNote(null), '', 'no note');
eq(day[0].note, OLD_FREIGHT, 'the stored note is unchanged');

console.log(`growshipWallet: ${checks} checks passed`);
