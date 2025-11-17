import React from 'react';

interface PickupModalProps {
  isOpen: boolean;
  isBulk?: boolean;
  shipmentCount?: number;
  onClose: () => void;
  onSubmit: () => void;
  pickupDate: string;
  pickupTimeSlot: string;
  pickupNotes: string;
  onDateChange: (date: string) => void;
  onTimeSlotChange: (slot: string) => void;
  onNotesChange: (notes: string) => void;
  isSubmitting: boolean;
}

const PickupModal: React.FC<PickupModalProps> = ({
  isOpen,
  isBulk = false,
  shipmentCount = 1,
  onClose,
  onSubmit,
  pickupDate,
  pickupTimeSlot,
  pickupNotes,
  onDateChange,
  onTimeSlotChange,
  onNotesChange,
  isSubmitting,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">
          {isBulk ? 'Schedule Bulk Pickup' : 'Schedule Pickup'}
        </h2>
        {isBulk && (
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Scheduling pickup for <strong>{shipmentCount}</strong> shipment(s)
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Date *</label>
            <input
              type="datetime-local"
              value={pickupDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
              required
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Slot *</label>
            <select
              value={pickupTimeSlot}
              onChange={(e) => onTimeSlotChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
              required
            >
              <option value="">Select Time Slot</option>
              <option value="09:00 AM - 12:00 PM">Morning: 09:00 AM - 12:00 PM</option>
              <option value="12:00 PM - 03:00 PM">Afternoon: 12:00 PM - 03:00 PM</option>
              <option value="03:00 PM - 06:00 PM">Evening: 03:00 PM - 06:00 PM</option>
              <option value="06:00 PM - 09:00 PM">Night: 06:00 PM - 09:00 PM</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Select preferred time slot for pickup</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={pickupNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
              placeholder={isBulk ? "Additional notes for bulk pickup..." : "Additional notes for pickup..."}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting || !pickupDate || !pickupTimeSlot}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : isBulk ? `Schedule Pickup (${shipmentCount})` : 'Schedule Pickup'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PickupModal;

