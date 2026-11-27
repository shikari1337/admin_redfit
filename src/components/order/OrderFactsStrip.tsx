/**
 * OrderFactsStrip: the order's facts the page did not show anywhere, as one compact row of chips with icons
 * (ADMIN-BRAND-1; owner 27 Nov 2026: "many details are missing add them, show everything but smartly and
 * information chips and icons throughout").
 *
 * Every value is the staff order view's own field (growcord-rs `views/order_desk.rs` OrderStaffView), read under
 * both of its spellings as the rest of OrderDetail does. A fact the order does not have is left out, never shown
 * as an empty chip. Nothing here writes; the controls that change these facts stay where they are.
 */
import React from 'react';
import {
  Ban, Building2, CalendarClock, CalendarDays, CreditCard, Download, FileText, Flag, Globe, MessageCircle,
  PackageCheck, ShieldCheck, Smartphone, Store, Ticket, Truck, UserPlus, Wallet,
} from 'lucide-react';
import { Chip, type Tone } from '../erp/StatusChip';
import { formatDate, formatDateTime } from '../../utils/date';
import { cn } from '@/lib/utils';

type Order = Record<string, any>;

/** The first value present under any of the field's spellings. */
const pick = (o: Order, ...keys: string[]): any => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** "partially_received" to "Partially received". */
const words = (s: unknown): string => {
  const t = String(s ?? '').replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

/** The Growcord orange chip (the shared Chip has no orange tone; its classes give way to these). */
const BRAND = 'bg-brand-50 text-brand-700 ring-brand-600/20';

interface Fact {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  brand?: boolean;
  title?: string;
}

/** Where the order came from: the channel's own icon. */
function channelIcon(kind: string, channel: string): Fact['icon'] {
  const k = `${kind} ${channel}`.toLowerCase();
  if (k.includes('whatsapp')) return MessageCircle;
  if (k.includes('app')) return Smartphone;
  if (k.includes('marketplace') || k.includes('amazon') || k.includes('flipkart')) return Store;
  return Globe;
}

function factsOf(order: Order): Fact[] {
  const f: Fact[] = [];
  const now = Date.now();

  const placed = pick(order, 'createdAt', 'created_at');
  if (placed) f.push({ key: 'placed', icon: CalendarDays, label: 'Placed', value: formatDateTime(placed) });

  const channelLabel = pick(order, 'channelLabel', 'channel_label');
  const salesChannel = pick(order, 'salesChannel', 'sales_channel');
  const channelKind = pick(order, 'channelKind', 'channel_kind') ?? '';
  const channelRef = pick(order, 'channelRef', 'channel_ref');
  if (channelLabel || salesChannel) {
    f.push({
      key: 'channel', icon: channelIcon(String(channelKind), String(salesChannel ?? '')), label: 'From',
      value: channelLabel || words(salesChannel), brand: true,
      title: channelRef ? `Channel reference ${channelRef}` : undefined,
    });
  }

  const createdBy = pick(order, 'createdBy', 'created_by');
  if (createdBy) f.push({ key: 'created-by', icon: UserPlus, label: 'Created by', value: String(createdBy) });

  const imported = pick(order, 'importedFrom', 'imported_from');
  if (imported) f.push({ key: 'imported', icon: Download, label: 'Imported from', value: words(imported) });

  const method = String(pick(order, 'paymentMethod', 'payment_method') ?? '').toLowerCase();
  const gateway = pick(order, 'paymentGateway', 'payment_gateway');
  if (method) {
    const cod = method === 'cod';
    f.push({
      key: 'pay', icon: cod ? Wallet : CreditCard, label: cod ? 'Cash on delivery' : 'Prepaid',
      value: cod ? '' : words(gateway && gateway !== method ? `${method} ${gateway}` : method),
    });
  }

  const due = pick(order, 'dueDate', 'due_date');
  if (due) {
    const paid = String(pick(order, 'paymentStatus', 'payment_status') ?? '').toLowerCase() === 'paid';
    const late = !paid && new Date(due).getTime() < now;
    f.push({
      key: 'due', icon: CalendarClock, label: late ? 'Payment overdue since' : 'Payment due',
      value: formatDate(due, 'dd MMM yyyy', ''), tone: paid ? 'green' : late ? 'red' : 'amber',
    });
  }

  const inv = pick(order, 'invoiceNumber', 'invoice_number');
  if (inv) {
    const invDate = pick(order, 'invoiceDate', 'invoice_date');
    const issued = pick(order, 'invoiceIssuedAt', 'invoice_issued_at');
    const source = pick(order, 'invoiceNumberSource', 'invoice_number_source');
    f.push({
      key: 'invoice', icon: FileText, label: 'Invoice',
      value: `${inv}${invDate ? `, ${formatDate(invDate, 'dd MMM yyyy', '')}` : ''}`, tone: 'blue',
      title: [issued ? `Issued ${formatDateTime(issued)}` : '', source ? `Number ${words(source).toLowerCase()}` : '']
        .filter(Boolean).join('. ') || undefined,
    });
  } else {
    f.push({ key: 'invoice', icon: FileText, label: 'Invoice', value: 'not issued yet', tone: 'neutral' });
  }

  const gstin = pick(order, 'customerGstin', 'customer_gstin');
  if (gstin) f.push({ key: 'gstin', icon: Building2, label: 'Buyer GSTIN', value: String(gstin) });

  const coupon = pick(order, 'couponCode', 'coupon_code');
  if (coupon) f.push({ key: 'coupon', icon: Ticket, label: 'Coupon', value: String(coupon), brand: true });

  const delivered = pick(order, 'deliveredAt', 'delivered_at');
  const expected = pick(order, 'expectedDelivery', 'expected_delivery');
  const courier = pick(order, 'courierName', 'courier_name');
  if (delivered) {
    f.push({ key: 'delivered', icon: PackageCheck, label: 'Delivered', value: formatDateTime(delivered), tone: 'green' });
  } else if (expected || courier) {
    f.push({
      key: 'eta', icon: Truck, label: expected ? 'Arrives by' : 'Courier',
      value: [expected ? formatDate(expected, 'dd MMM yyyy', '') : '', courier ? String(courier) : ''].filter(Boolean).join(', '),
    });
  }

  if (pick(order, 'isOtpVerified', 'is_otp_verified') === true) {
    f.push({ key: 'otp', icon: ShieldCheck, label: 'Phone verified by code', value: '', tone: 'green' });
  }

  if (pick(order, 'cancellationRequested', 'cancellation_requested') === true) {
    const why = pick(order, 'cancellationReason', 'cancellation_reason');
    f.push({
      key: 'cancel-ask', icon: Ban, label: 'Customer asked to cancel', value: why ? String(why) : '', tone: 'red',
    });
  }

  const flaggedAt = pick(order, 'flaggedAt', 'flagged_at');
  if (pick(order, 'isFlagged', 'is_flagged') === true && flaggedAt) {
    f.push({
      key: 'flagged', icon: Flag, label: 'Flagged', value: formatDateTime(flaggedAt), tone: 'red',
      title: pick(order, 'flagReason', 'flag_reason') ?? undefined,
    });
  }

  return f;
}

export const OrderFactsStrip: React.FC<{ order: Order; className?: string }> = ({ order, className }) => {
  const facts = factsOf(order);
  if (!facts.length) return null;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5',
        'shadow-[0_1px_2px_rgb(32_24_16/0.05),0_6px_18px_-12px_rgb(32_24_16/0.20)]',
        className,
      )}
      aria-label="Order facts"
    >
      {facts.map(({ key, icon: Icon, label, value, tone, brand, title }) => (
        <Chip key={key} tone={tone ?? 'neutral'} className={cn('gap-1.5 py-1', brand && !tone && BRAND)}>
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className={cn(value ? 'opacity-75' : 'font-semibold')} title={title}>{label}</span>
          {value ? <span className="font-semibold" title={title}>{value}</span> : null}
        </Chip>
      ))}
    </div>
  );
};

export default OrderFactsStrip;
