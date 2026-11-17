import React from 'react';
import { formatDate } from '../../utils/date';

/**
 * A shipment's tracking events as the carrier reported them, newest first: one definition for
 * every parcel, forward or coming back. The shipment drawer (ShipmentDetailDrawer, "Full timeline")
 * drew this list inline; a return's collection (ReturnPickup) and the order page read the same
 * shipment register's `timeline`, so they draw it through here too.
 */

export interface TrackingEvent {
  event?: string | null;
  description?: string | null;
  location?: string | null;
  timestamp?: string | null;
}

interface Props {
  /** As stored on the shipment: oldest first. */
  events?: TrackingEvent[] | null;
  emptyText?: string;
}

const when = (d: unknown): string => formatDate(d, 'MMM dd, yyyy HH:mm', '');

const ShipmentTimeline: React.FC<Props> = ({ events, emptyText = 'No timeline events yet.' }) => {
  const list = Array.isArray(events) ? [...events].reverse() : [];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-3">
      {list.map((e, i) => (
        <div key={i} className="text-sm border-l-2 border-slate-200 pl-3">
          <p className="font-medium">{e.event || e.description || 'Update'}</p>
          {e.description && e.description !== e.event && (
            <p className="text-xs text-muted-foreground">{e.description}</p>
          )}
          {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
          <p className="text-xs text-muted-foreground">{when(e.timestamp)}</p>
        </div>
      ))}
    </div>
  );
};

export default ShipmentTimeline;
