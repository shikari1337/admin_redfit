import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isBulk ? 'Schedule Bulk Pickup' : 'Schedule Pickup'}</DialogTitle>
          {isBulk && (
            <p className="text-sm text-muted-foreground mt-2">
              Scheduling pickup for <strong>{shipmentCount}</strong> shipment(s)
            </p>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="pickupDate">Pickup Date *</Label>
            <Input
              id="pickupDate"
              type="datetime-local"
              value={pickupDate}
              onChange={(e) => onDateChange(e.target.value)}
              required
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timeSlot">Time Slot *</Label>
            <Select value={pickupTimeSlot} onValueChange={onTimeSlotChange}>
              <SelectTrigger id="timeSlot">
                <SelectValue placeholder="Select Time Slot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="09:00 AM - 12:00 PM">Morning: 09:00 AM - 12:00 PM</SelectItem>
                <SelectItem value="12:00 PM - 03:00 PM">Afternoon: 12:00 PM - 03:00 PM</SelectItem>
                <SelectItem value="03:00 PM - 06:00 PM">Evening: 03:00 PM - 06:00 PM</SelectItem>
                <SelectItem value="06:00 PM - 09:00 PM">Night: 06:00 PM - 09:00 PM</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Select preferred time slot for pickup</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={pickupNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
              placeholder={isBulk ? "Additional notes for bulk pickup..." : "Additional notes for pickup..."}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || !pickupDate || !pickupTimeSlot}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? 'Scheduling...' : isBulk ? `Schedule Pickup (${shipmentCount})` : 'Schedule Pickup'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PickupModal;

