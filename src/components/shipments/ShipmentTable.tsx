import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ClipboardList, Download, FileText, RotateCcw, Phone, Undo2, Eye } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import StatusBadge, { getStatusLabel } from '@/components/order/StatusBadge';
import { fmtRupees } from '@/lib/money';
import { formatDate, formatPickupWhen } from '../../utils/date';
import {
  chargeBasisText, chargeLine, hasCarrierDocuments, isTerminal, nextStatuses, nextStep, providerLabel, providerOf,
  shipmentAwb, shipmentCharge, shipmentCod, shipmentCourier,
} from './shipmentFacts';

interface Shipment {
  _id: string;
  shipmentNumber: string;
  orders: any[];
  warehouseId: any;
  shippingProvider: string;
  status: string;
  pickup?: {
    scheduledDate?: Date | string;
    /** The carrier's own scheduled datetime string, verbatim ("2026-09-09 09:00:00"). */
    scheduledFor?: string | null;
    pickupTimeSlot?: string;
    pickupId?: string | null;
    pickupToken?: string | null;
    manifestId?: string | null;
    pickupException?: string | null;
    source?: 'app' | 'carrier';
  };
  providerData?: Record<string, any>;
  awb?: string;
  courierName?: string;
  expectedDelivery?: Date | string;
  ndrDetails?: {
    reason?: string | null;
    attempts?: number | null;
    raisedAt?: Date | string | null;
  } | null;
  trackingUrl?: string;
  createdAt: Date | string;
  [k: string]: any;
}

interface ShipmentTableProps {
  shipments: Shipment[];
  /** Ids that may be ticked for a bulk action on this tab (the page decides; the header box ticks exactly these). */
  selectableIds: string[];
  selectedShipments: string[];
  onSelectShipment: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onSchedulePickup: (shipment: Shipment) => void;
  onUpdateStatus: (shipmentId: string, status: string) => void;
  onDownloadLabel?: (shipmentId: string, size?: '4R' | 'A4') => void;
  onDownloadManifest?: (shipmentId: string) => void;
  onDownloadPickupReceipt?: (shipmentId: string) => void;
  onNdrReattempt?: (shipmentId: string) => void;
  onNdrUpdatePhone?: (shipmentId: string, phone: string) => void;
  onNdrRequestRto?: (shipmentId: string) => void;
  onViewDetails?: (shipmentId: string) => void;
  /** The store's carrier names by code (GET /shipping/providers); a code not in it is spelled out. */
  providerNames?: Record<string, string>;
}

const ShipmentTable: React.FC<ShipmentTableProps> = ({
  shipments,
  selectableIds,
  selectedShipments,
  onSelectShipment,
  onSelectAll,
  onSchedulePickup,
  onUpdateStatus,
  onDownloadLabel,
  onDownloadManifest,
  onDownloadPickupReceipt,
  onNdrReattempt,
  onNdrUpdatePhone,
  onNdrRequestRto,
  onViewDetails,
  providerNames,
}) => {
  const safeFormatDate = (date: any, fmt: string) => formatDate(date, fmt, '');
  const selectable = new Set(selectableIds);
  const allTicked = selectableIds.length > 0 && selectableIds.every((id) => selectedShipments.includes(id));

  // What this page of parcels costs to ship and carries in COD (the board's own total over the whole filter
  // is shown above the table).
  let pageCharge = 0; let pageUnpriced = 0; let pageCod = 0;
  for (const s of shipments) {
    const c = shipmentCharge(s);
    if (c && s.status !== 'cancelled') pageCharge += c.total; else if (s.status !== 'cancelled') pageUnpriced += 1;
    pageCod += shipmentCod(s) ?? 0;
  }

  return (
    <div className="bg-white rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">
              <div className="flex items-center gap-2">
                {selectableIds.length > 0 && (
                  <Checkbox
                    checked={allTicked}
                    onCheckedChange={(checked: boolean | 'indeterminate') => onSelectAll(checked === true)}
                    aria-label="Select every shipment on this page that the bulk actions apply to"
                  />
                )}
                <span>Shipment</span>
              </div>
            </TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Carrier</TableHead>
            <TableHead>AWB</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">COD</TableHead>
            <TableHead className="text-right">Shipping charge</TableHead>
            <TableHead>Pickup</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center">
                No shipments found.
              </TableCell>
            </TableRow>
          ) : (
            shipments.map((shipment) => {
              const provider = providerOf(shipment);
              const manual = provider === 'manual';
              const awb = shipmentAwb(shipment);
              const courier = shipmentCourier(shipment);
              const cod = shipmentCod(shipment);
              const charge = shipmentCharge(shipment);
              const moves = nextStatuses(shipment.status);
              const step = nextStep(shipment);
              const warehouse = typeof shipment.warehouseId === 'object' ? shipment.warehouseId?.name : null;
              const docs = hasCarrierDocuments(shipment);
              return (
                <TableRow key={shipment._id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {selectable.has(shipment._id) && (
                        <Checkbox
                          checked={selectedShipments.includes(shipment._id)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => onSelectShipment(shipment._id, checked === true)}
                          aria-label={`Select ${shipment.shipmentNumber}`}
                        />
                      )}
                      <span>{shipment.shipmentNumber}</span>
                    </div>
                    {warehouse && <div className="text-xs text-muted-foreground mt-0.5">from {warehouse}</div>}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(shipment.orders) && shipment.orders.length > 0 ? (
                      <div className="text-sm space-y-0.5">
                        {shipment.orders.slice(0, 2).map((order: any) => (
                          <Link
                            key={order._id || order}
                            to={`/orders/${typeof order === 'object' ? order._id : order}`}
                            className="block text-blue-600 hover:underline"
                          >
                            {typeof order === 'object' ? order.orderId : order}
                          </Link>
                        ))}
                        {shipment.orders.length > 2 && <span className="text-xs text-muted-foreground">and {shipment.orders.length - 2} more</span>}
                        {typeof shipment.orders[0] === 'object' && shipment.orders[0]?.customerName && (
                          <span className="block text-xs text-muted-foreground">{shipment.orders[0].customerName}</span>
                        )}
                      </div>
                    ) : <span className="text-sm text-muted-foreground">No order linked</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{providerLabel(provider, providerNames)}</div>
                    {courier && courier.toLowerCase() !== provider.toLowerCase() && (
                      <div className="text-xs text-muted-foreground">{courier}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {awb ? (
                      shipment.trackingUrl ? (
                        <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-blue-600 hover:underline">
                          {awb}
                        </a>
                      ) : <span className="font-mono text-sm">{awb}</span>
                    ) : <span className="text-sm text-muted-foreground">No AWB yet</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={shipment.status} type="shipment" />
                    {shipment.status === 'ndr_failed_delivery' && shipment.ndrDetails && (
                      <div className="text-xs text-muted-foreground mt-1 max-w-[180px]">
                        {shipment.ndrDetails.reason || 'Reason not given'}
                        {shipment.ndrDetails.attempts != null && `, attempt ${shipment.ndrDetails.attempts}`}
                      </div>
                    )}
                    {step && <div className="text-xs text-amber-700 mt-1 max-w-[180px]">Next: {step}</div>}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cod !== null ? fmtRupees(cod) : <span className="text-muted-foreground">Prepaid</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums" title={charge ? chargeBasisText(charge.basis) : undefined}>
                    {charge ? (
                      <>
                        <div className="font-medium">{fmtRupees(charge.total)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {charge.basis === 'gst_included' && charge.gst !== null ? `incl. ${fmtRupees(charge.gst)} GST`
                            : charge.basis === 'quoted' ? 'GST not stated'
                              : charge.basis === 'entered' ? 'entered' : ''}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onViewDetails?.(shipment._id)}
                        className={`text-xs ${manual ? 'text-red-600 font-medium' : 'text-muted-foreground'} hover:underline`}
                        title={manual ? 'Open the shipment to enter what was paid to the carrier' : chargeLine(null)}
                      >
                        {manual ? 'Enter charge' : 'Not recorded'}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {shipment.pickup?.scheduledDate || shipment.pickup?.scheduledFor ? (
                      <div className="text-sm">
                        {/* The carrier's confirmed date and time when it gave one; our slot is only a preference. */}
                        {formatPickupWhen(shipment.pickup)}
                        {shipment.pickup.pickupTimeSlot && (
                          <div className="text-xs text-muted-foreground mt-0.5">preferred {shipment.pickup.pickupTimeSlot}</div>
                        )}
                        {(shipment.pickup.pickupId || shipment.pickup.manifestId) && (
                          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {[shipment.pickup.pickupId, shipment.pickup.manifestId].filter(Boolean).join(', ')}
                          </div>
                        )}
                        {shipment.pickup.pickupException && (
                          <div className="text-xs text-red-600 mt-0.5">{shipment.pickup.pickupException}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {manual ? 'Not needed (own carrier)' : isTerminal(shipment.status) || shipment.status !== 'pending' ? 'None' : 'Not scheduled'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    <div>Booked {safeFormatDate(shipment.createdAt, 'dd MMM yyyy, HH:mm') || 'date unknown'}</div>
                    {shipment.expectedDelivery && !isTerminal(shipment.status) && (
                      <div>Expected {safeFormatDate(shipment.expectedDelivery, 'dd MMM yyyy')}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {onViewDetails && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewDetails(shipment._id)}
                          className="text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                          title="Shipment details, charge and timeline"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {!shipment.pickup?.scheduledDate && shipment.status === 'pending' && !manual && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSchedulePickup(shipment)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Schedule pickup"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Label and manifest: a booked parcel with an AWB, still on its way (a manual parcel's label is its carrier's). */}
                      {docs && onDownloadLabel && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Download shipping label (PDF)"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onDownloadLabel(shipment._id, '4R')}>
                              Label, 4R (thermal)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDownloadLabel(shipment._id, 'A4')}>
                              Label, A4
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {docs && onDownloadManifest && ['pending', 'pickup_scheduled'].includes(shipment.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDownloadManifest(shipment._id)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Download manifest (PDF)"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                      )}
                      {shipment.pickup?.pickupId && !isTerminal(shipment.status) && !manual && onDownloadPickupReceipt && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDownloadPickupReceipt(shipment._id)}
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          title="Download pickup receipt (PDF)"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Failed delivery: the courier's NDR flow (a manual parcel has none; its carrier is called directly). */}
                      {shipment.status === 'ndr_failed_delivery' && !manual && onNdrReattempt && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onNdrReattempt(shipment._id)}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          title="Re-attempt delivery"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {shipment.status === 'ndr_failed_delivery' && !manual && onNdrUpdatePhone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const phone = prompt('The phone number the courier should call for delivery:');
                            if (phone) onNdrUpdatePhone(shipment._id, phone);
                          }}
                          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          title="Update the delivery phone number"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      )}
                      {shipment.status === 'ndr_failed_delivery' && !manual && onNdrRequestRto && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Send this parcel back? The courier stops trying to deliver it and returns it to you.')) {
                              onNdrRequestRto(shipment._id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Stop delivery and return the parcel"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                      {moves.length > 0 && (
                        <div className="w-[150px]">
                          <Select onValueChange={(value) => value && onUpdateStatus(shipment._id, value)} value="">
                            <SelectTrigger className="h-8 text-xs" title={manual ? 'Your own carrier does not report back: move the parcel yourself' : 'Set by hand only when the courier has not reported it'}>
                              <SelectValue placeholder={manual ? 'Move to' : 'Set status'} />
                            </SelectTrigger>
                            <SelectContent>
                              {moves.map((m) => (
                                <SelectItem key={m} value={m}>{getStatusLabel('shipment', m)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        {shipments.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="text-xs text-muted-foreground">
                This page: {shipments.length} shipment{shipments.length === 1 ? '' : 's'}
                {pageUnpriced > 0 ? `, ${pageUnpriced} with no shipping charge recorded` : ''}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">{fmtRupees(pageCod)}</TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">{fmtRupees(pageCharge)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
};

export default ShipmentTable;
