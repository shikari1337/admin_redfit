import React, { useState } from 'react';
import { FaWhatsapp, FaWarehouse, FaRegCopy, FaCheck, FaMapMarkerAlt, FaFileInvoiceDollar } from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Shipping and billing addresses, side by side.
 *
 * They used to sit in two cards several screens apart with a payment card and a
 * refund card between them, so comparing "where is it going" against "who are we
 * invoicing" meant scrolling back and forth. They are the same kind of fact and
 * are now read together, each keeping its own Edit control.
 *
 * Most orders never capture a separate billing address (checkout only asks when
 * it differs), so the billing side shows the shipping address explicitly labelled
 * as the fallback — saving from there CREATES a distinct billing address, which
 * is exactly what the editor already does.
 */
interface Address {
  fullName?: string; full_name?: string;
  address?: string;
  addressLine2?: string; address_line2?: string;
  district?: string;
  state?: string;
  pincode?: string;
  mobileNumber?: string; mobile_number?: string;
  email?: string;
}

interface Warehouse {
  _id?: string;
  name?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  gstin?: string;
}

interface GstInfo {
  storeId?: string;
  storeName?: string;
  storeGstin?: string;
  storeState?: string;
  orderState?: string;
  taxType?: string;
}

interface OrderAddressPanelProps {
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  warehouseId?: Warehouse | string | null;
  gst?: GstInfo | null;
  /** Customer GSTIN the tax invoice is raised against (order column, not the address). */
  customerGstin?: string | null;
  onWhatsAppClick?: (phone: string) => void;
  /** Edit controls, supplied by the page so this component stays presentational. */
  shippingAction?: React.ReactNode;
  billingAction?: React.ReactNode;
}

const line = (a: Address) => [
  a.fullName || a.full_name,
  a.address,
  a.addressLine2 || a.address_line2,
  [a.district, a.state, a.pincode].filter(Boolean).join(' '),
  a.mobileNumber || a.mobile_number,
  a.email,
].filter(Boolean).join('\n');

/** Copy the whole address as a courier/WhatsApp-pasteable block. */
const CopyButton: React.FC<{ text: string; title: string }> = ({ text, title }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }).catch(() => { /* clipboard blocked — nothing useful to say */ });
      }}
      className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {done ? <FaCheck className="h-3 w-3 text-emerald-600" /> : <FaRegCopy className="h-3 w-3" />}
    </button>
  );
};

const AddressBlock: React.FC<{
  address: Address;
  onWhatsAppClick?: (phone: string) => void;
}> = ({ address, onWhatsAppClick }) => {
  const phone = address.mobileNumber || address.mobile_number;
  const name = address.fullName || address.full_name;
  const l2 = address.addressLine2 || address.address_line2;
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      <p className="text-base font-black leading-tight text-slate-900">{name || '—'}</p>
      {address.address && <p className="font-medium text-slate-700">{address.address}</p>}
      {l2 && <p className="font-medium text-slate-700">{l2}</p>}
      <p className="font-medium text-slate-700">
        {[address.district, address.state].filter(Boolean).join(', ')}
        {address.pincode && <span className="ml-1.5 font-black tabular-nums text-slate-900">{address.pincode}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-xs">
        {phone && (
          <>
            <a href={`tel:${phone}`} className="font-black tabular-nums text-slate-800 hover:underline">{phone}</a>
            {onWhatsAppClick && (
              <button type="button" onClick={() => onWhatsAppClick(phone)}
                className="flex items-center gap-1 font-bold text-green-700 hover:underline" title="Open WhatsApp">
                <FaWhatsapp className="h-3.5 w-3.5" />WhatsApp
              </button>
            )}
          </>
        )}
        {address.email && (
          <a href={`mailto:${address.email}`} className="font-bold text-blue-700 hover:underline">{address.email}</a>
        )}
      </div>
    </div>
  );
};

const OrderAddressPanel: React.FC<OrderAddressPanelProps> = ({
  shippingAddress, billingAddress, warehouseId, gst, customerGstin,
  onWhatsAppClick, shippingAction, billingAction,
}) => {
  const warehouse = typeof warehouseId === 'object' && warehouseId ? warehouseId : null;
  const shipping = shippingAddress ?? null;
  // Checkout only captures billing when it differs from shipping — show shipping
  // in that slot, clearly labelled, instead of an empty panel.
  const billingIsFallback = !billingAddress;
  const billing = billingAddress ?? shippingAddress ?? null;

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="border-b-2 bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-700">
          Addresses
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 divide-y-2 divide-slate-100 md:grid-cols-2 md:divide-x-2 md:divide-y-0">
          {/* ── Ship to ── */}
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
                <FaMapMarkerAlt className="h-3 w-3 text-slate-400" /> Ship to
              </h3>
              <div className="flex items-center gap-1">
                {shipping && <CopyButton text={line(shipping)} title="Copy shipping address" />}
                {shippingAction}
              </div>
            </div>
            {shipping
              ? <AddressBlock address={shipping} onWhatsAppClick={onWhatsAppClick} />
              : <p className="text-sm font-semibold text-slate-400">No shipping address on this order.</p>}
          </div>

          {/* ── Bill to ── */}
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
                <FaFileInvoiceDollar className="h-3 w-3 text-slate-400" /> Bill to
                {billingIsFallback && (
                  <Badge variant="outline" className="ml-1 border-slate-200 text-[9px] font-bold uppercase text-slate-500">
                    same as shipping
                  </Badge>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {billing && <CopyButton text={line(billing)} title="Copy billing address" />}
                {billingAction}
              </div>
            </div>
            {billing
              ? <AddressBlock address={billing} onWhatsAppClick={onWhatsAppClick} />
              : <p className="text-sm font-semibold text-slate-400">No billing address on this order.</p>}
            {customerGstin && (
              <p className="mt-2 rounded border-2 border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[11px] font-black text-slate-700">
                Invoice GSTIN · {customerGstin}
              </p>
            )}
          </div>
        </div>

        {/* ── Where it ships FROM, and who invoices it ── */}
        {(warehouse || gst?.storeId) && (
          <div className="grid grid-cols-1 gap-4 border-t-2 border-slate-100 bg-slate-50/50 p-4 text-xs md:grid-cols-2">
            {warehouse && (
              <div>
                <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <FaWarehouse className="h-3 w-3" /> Ships from
                </h3>
                <p className="font-black text-slate-900">{warehouse.name || 'N/A'}</p>
                {warehouse.address && (
                  <p className="font-medium text-slate-600">
                    {[warehouse.address.line1, warehouse.address.line2, warehouse.address.city,
                      warehouse.address.state, warehouse.address.pincode].filter(Boolean).join(', ')}
                  </p>
                )}
                {warehouse.gstin && <p className="mt-0.5 font-mono font-bold text-slate-700">GSTIN {warehouse.gstin}</p>}
              </div>
            )}
            {gst?.storeId && (
              <div>
                <h3 className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Invoiced by</h3>
                <p className="font-black text-slate-900">{gst.storeName || 'N/A'}</p>
                {gst.storeGstin && <p className="font-mono font-bold text-slate-700">GSTIN {gst.storeGstin}</p>}
                {(gst.storeState || gst.orderState) && (
                  <p className="font-medium text-slate-600">
                    {gst.storeState ?? '?'} → {gst.orderState ?? '?'}
                    {gst.taxType ? ` · ${gst.taxType}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderAddressPanel;
