import React from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, CalendarClock, PhoneCall, Undo2, Truck } from 'lucide-react';
import type { StatusCounts, TabType } from './ShipmentTabs';

/**
 * What the shipping desk should act on now, before the full board (MENU-1 shipments): orders
 * still to book, booked parcels with no pickup, failed deliveries waiting for an answer before the
 * courier sends them back, and parcels on their way back. Each tile opens its tab. The counts are
 * the board's own `status_counts` (ship `GET /shipments`), never a second tally.
 */
interface Props {
  counts: StatusCounts;
  onOpen: (tab: TabType) => void;
  /** False when the store has no carrier it can book through (no Growcord Ship, no own account). */
  hasCarrier: boolean;
}

const ActNow: React.FC<Props> = ({ counts, onOpen, hasCarrier }) => {
  const tiles: Array<{ tab: TabType; label: string; hint: string; n: number; icon: React.ElementType; tone: string }> = [
    { tab: 'pending_orders', label: 'To book', hint: 'Orders waiting for a parcel to be booked', n: counts.pending_orders, icon: PackagePlus, tone: 'text-blue-700 bg-blue-50 border-blue-200' },
    { tab: 'ready_to_pick', label: 'Need a pickup', hint: 'Booked, waiting for the courier to collect', n: counts.ready_to_pick, icon: CalendarClock, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
    { tab: 'ndr_failed_delivery', label: 'Failed delivery', hint: 'Answer before the courier sends it back', n: counts.ndr_failed_delivery, icon: PhoneCall, tone: 'text-red-700 bg-red-50 border-red-200' },
    { tab: 'rto_in_transit', label: 'Coming back', hint: 'Returning to you; check it in when it lands', n: counts.rto_in_transit, icon: Undo2, tone: 'text-purple-700 bg-purple-50 border-purple-200' },
  ];
  const open = tiles.filter((t) => t.n > 0);

  return (
    <div className="mb-5 space-y-3">
      {!hasCarrier && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Truck className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            No courier is connected, so parcels can only be entered by hand. Switch on Growcord Ship to book any courier from here.
          </span>
          <Link to="/settings/shipping" className="font-medium underline underline-offset-2">Shipping settings</Link>
        </div>
      )}
      {open.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {open.map(({ tab, label, hint, n, icon: Icon, tone }) => (
            <button
              key={tab}
              type="button"
              onClick={() => onOpen(tab)}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-shadow hover:shadow-sm ${tone}`}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight tabular-nums">{n}</span>
                <span className="block text-xs font-semibold">{label}</span>
                <span className="hidden sm:block text-[11px] opacity-80">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing waits on you: every order is booked, picked up and moving.</p>
      )}
    </div>
  );
};

export default ActNow;
