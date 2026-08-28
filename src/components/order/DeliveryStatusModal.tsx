import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaUndo } from 'react-icons/fa';
import Modal from './Modal';
import { shipmentsAPI } from '../../services/api';

interface OrderShipmentRow {
  id: string;
  shipmentNumber?: string;
  shipment_number?: string;
  status: string;
  shippingProvider?: string;
  shipping_provider?: string;
  awb?: string | null;
}

interface DeliveryStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipments: OrderShipmentRow[];
  /** Which action opened this modal — decides the default target status and copy. */
  mode: 'delivered' | 'rto';
  onUpdated: () => void;
}

const TERMINAL = new Set(['delivered', 'cancelled', 'returned', 'rto_delivered', 'rto_failed']);

const RTO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'rto_delivered', label: 'RTO Delivered (parcel is back with us)' },
  { value: 'rto_in_transit', label: 'RTO In Transit (courier is returning it)' },
  { value: 'rto_failed', label: 'RTO Failed / Lost / Damaged' },
];

/**
 * Manual override for delivery/RTO status — the button the admin panel never
 * had (owner-reported gap). Acts on one or more SHIPMENTS (never the order
 * directly), through the existing `PUT /shipments/:id/status`, so the
 * multi-shipment rollup in `resolveAndApplyOrderStatusFromShipments`
 * (backend `db/queries/shipments.ts`) decides the order's own status the
 * SAME way an automatic sync event would — a manual mark on a 2-parcel order
 * doesn't wrongly flip the whole order to 'delivered' until both parcels are.
 */
const DeliveryStatusModal: React.FC<DeliveryStatusModalProps> = ({
  isOpen, onClose, shipments, mode, onUpdated,
}) => {
  const eligible = shipments.filter((s) => !TERMINAL.has(s.status));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rtoStatus, setRtoStatus] = useState('rto_delivered');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(eligible.map((s) => s.id)));
      setRtoStatus('rto_delivered');
      setNotes('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => { if (!loading) onClose(); };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const targetStatus = mode === 'delivered' ? 'delivered' : rtoStatus;
  const isValid = selectedIds.size > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true); setError(null);
    try {
      for (const id of selectedIds) {
        await shipmentsAPI.updateStatus(id, targetStatus, notes.trim() || undefined);
      }
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not update this shipment.');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'delivered' ? 'Mark Delivered' : 'Mark RTO / Failed Delivery';

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={loading}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
        Cancel
      </button>
      <button type="button" onClick={handleSubmit} disabled={loading || !isValid}
        className={`flex items-center gap-2 px-4 py-2 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          mode === 'delivered' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'
        }`}>
        {mode === 'delivered' ? <FaCheckCircle size={14} /> : <FaUndo size={14} />}
        {loading ? 'Updating…' : title}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} footer={footer} maxWidth="md">
      <div className="space-y-4">
        {eligible.length === 0 ? (
          <p className="text-sm text-gray-600">
            Every shipment on this order is already in a final state — there's nothing left to mark.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              {mode === 'delivered'
                ? 'Confirm the courier actually delivered this parcel. If the order has more than one shipment, only the ones you select here are affected — the order itself only shows fully "Delivered" once every parcel is.'
                : 'Record that this parcel failed delivery and is coming back to you (or already has). This does NOT cancel the whole order if other parcels on it still delivered.'}
            </p>

            {eligible.length > 1 && (
              <div className="border border-gray-200 rounded-md divide-y">
                {eligible.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-gray-900">
                      {s.shipmentNumber || s.shipment_number || s.id.slice(0, 8)}
                    </span>
                    {s.awb && <span className="font-mono text-xs text-gray-500">{s.awb}</span>}
                    <span className="text-xs text-gray-500 capitalize ml-auto">{s.status.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            )}

            {mode === 'rto' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">RTO outcome *</label>
                <select value={rtoStatus} onChange={(e) => setRtoStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {RTO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Reason, courier reference, anything worth recording…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
      </div>
    </Modal>
  );
};

export default DeliveryStatusModal;
