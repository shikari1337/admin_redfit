/**
 * Admin notification bell — polls for NEW ORDERS (every 30s) and surfaces them
 * as a dropdown feed + a browser notification (permission asked on first click).
 * Last-seen watermark lives in localStorage so refreshes don't re-announce.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { ordersAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Notif {
  id: string;
  orderId: string;
  title: string;
  detail: string;
  at: string;
  seen: boolean;
}

const SEEN_KEY = 'admin_notif_last_seen_v1';
const POLL_MS = 30_000;

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const lastSeenRef = useRef<string>(localStorage.getItem(SEEN_KEY) || '');
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const r = await ordersAPI.getAll({ limit: 15 });
      const orders: any[] = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
      const items: Notif[] = orders.map((o: any) => ({
        id: o._id ?? o.id,
        orderId: o.orderId ?? o.order_id,
        title: `Order ${o.orderId ?? o.order_id}`,
        detail: `₹${Number(o.total ?? 0).toLocaleString('en-IN')} · ${o.paymentMethod === 'cod' ? 'COD' : 'Prepaid'} · ${(o.shippingAddress?.fullName ?? 'Customer')}`,
        at: o.createdAt ?? o.created_at,
        seen: !!lastSeenRef.current && String(o.createdAt ?? o.created_at) <= lastSeenRef.current,
      }));
      setNotifs(items);
      setUnread(items.filter(n => !n.seen).length);

      // Browser notification for orders that appeared since the previous poll —
      // never on the first poll (that would re-announce history on every reload).
      if (!firstPollRef.current) {
        for (const n of items) {
          if (!knownIdsRef.current.has(n.id) && !n.seen && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`🛒 New order ${n.orderId}`, { body: n.detail, tag: n.id });
          }
        }
      }
      knownIdsRef.current = new Set(items.map(n => n.id));
      firstPollRef.current = false;
    } catch { /* polling is best-effort */ }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const markAllSeen = () => {
    const newest = notifs[0]?.at;
    if (newest) {
      lastSeenRef.current = String(newest);
      localStorage.setItem(SEEN_KEY, String(newest));
    }
    setNotifs(ns => ns.map(n => ({ ...n, seen: true })));
    setUnread(0);
    // First interaction is the moment to ask for browser-notification permission.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) markAllSeen(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Notifications">
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <span className="text-[10px] font-normal text-muted-foreground">latest orders · refreshes every 30s</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifs.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet.</div>
        ) : (
          notifs.slice(0, 10).map((n) => (
            <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 cursor-pointer"
              onClick={() => navigate(`/orders/${n.id}`)}>
              <div className="flex items-center gap-2 w-full">
                <span className="font-medium text-sm">{n.title}</span>
                {!n.seen && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {n.at ? new Date(n.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{n.detail}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
