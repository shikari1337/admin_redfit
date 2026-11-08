/**
 * Admin notification bell — polls for NEW ORDERS (every 30s) and surfaces them
 * as a dropdown feed + a browser notification (permission asked on first click).
 * Last-seen watermark lives in localStorage so refreshes don't re-announce.
 *
 * META-21 (INS-07): the bell also lists the store team's in-app notifications from the comms app
 * (`lib/v2/staffNotifications.ts`): Meta ads alerts, the Meta connection, the Meta catalog push, a post
 * that did not publish, a lead form that could not be read. Each opens its screen and is marked read for
 * this person only; "What I get" holds the person's own switch per kind (and the store's switch for a
 * person who may manage settings). A server without these routes leaves the bell as it was: orders only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowLeft, Bell, Info, Loader2, Settings2, type LucideIcon } from 'lucide-react';
import { ordersAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { localeTime, formatDayShort, formatTime, isoDate, todayIso } from '../utils/date';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  staffNotesApi, staffNotesGap, staffNoteHref,
  type StaffKindList, type StaffNote, type StaffSeverity,
} from '@/lib/v2/staffNotifications';
import { metaHref } from '@/pages/panels/marketing/meta/routes';
import { cn } from '@/lib/utils';

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
/** How many staff notifications the dropdown lists. */
const NOTES_SHOWN = 10;

const SEVERITY: Record<StaffSeverity, { icon: LucideIcon; tone: string; label: string }> = {
  critical: { icon: AlertOctagon, tone: 'text-red-600', label: 'Stopped working' },
  warning: { icon: AlertTriangle, tone: 'text-amber-600', label: 'Needs a look' },
  info: { icon: Info, tone: 'text-blue-600', label: 'For your information' },
};

/** Today: the time; earlier: the day. Both in the store's zone. */
const whenOf = (at: string): string => (isoDate(at) === todayIso() ? formatTime(at, '') : formatDayShort(at, ''));

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const lastSeenRef = useRef<string>(localStorage.getItem(SEEN_KEY) || '');
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);

  // META-21: the store team's notifications (null = not loaded yet).
  const [notes, setNotes] = useState<StaffNote[] | null>(null);
  const [notesUnread, setNotesUnread] = useState(0);
  const [notesError, setNotesError] = useState(false);
  const notesOffRef = useRef(false);
  const [notesOff, setNotesOff] = useState(false);
  const [view, setView] = useState<'feed' | 'kinds'>('feed');
  const [kinds, setKinds] = useState<StaffKindList | null>(null);
  const [kindsError, setKindsError] = useState(false);
  const [busyKind, setBusyKind] = useState<string | null>(null);

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

  /** META-21: the unread count only (cheap); a server without the routes stops being asked. */
  const pollNotes = useCallback(async () => {
    if (notesOffRef.current) return;
    try {
      setNotesUnread(await staffNotesApi.count());
    } catch (e) {
      if (staffNotesGap(e)) { notesOffRef.current = true; setNotesOff(true); }
    }
  }, []);

  useEffect(() => {
    poll();
    pollNotes();
    const t = setInterval(() => { poll(); pollNotes(); }, POLL_MS);
    return () => clearInterval(t);
  }, [poll, pollNotes]);

  const loadNotes = useCallback(async () => {
    if (notesOffRef.current) return;
    setNotesError(false);
    try {
      const l = await staffNotesApi.list({ limit: NOTES_SHOWN });
      setNotes(l.items);
      setNotesUnread(l.unread);
    } catch (e) {
      if (staffNotesGap(e)) { notesOffRef.current = true; setNotesOff(true); } else setNotesError(true);
    }
  }, []);

  const loadKinds = useCallback(async () => {
    setKindsError(false);
    try { setKinds(await staffNotesApi.kinds()); } catch { setKindsError(true); }
  }, []);

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

  /** Opens the note's screen; marks it read for this person (best effort: the screen opens either way). */
  const openNote = (n: StaffNote) => {
    if (!n.read_at) {
      const at = new Date().toISOString();
      setNotes(ns => (ns ?? []).map(x => (x.id === n.id ? { ...x, read_at: at } : x)));
      staffNotesApi.read([n.id]).then(setNotesUnread).catch(() => {});
    }
    const href = staffNoteHref(n.link);
    if (href) navigate(metaHref(href.path, href.query));
  };

  const markNotesRead = async () => {
    const at = new Date().toISOString();
    setNotes(ns => (ns ?? []).map(x => (x.read_at ? x : { ...x, read_at: at })));
    setNotesUnread(0);
    try { setNotesUnread(await staffNotesApi.read()); } catch { pollNotes(); }
  };

  const switchKind = async (kind: string, on: boolean, scope: 'mine' | 'store') => {
    setBusyKind(`${scope}:${kind}`);
    try {
      setKinds(scope === 'mine' ? await staffNotesApi.setMine(kind, on) : await staffNotesApi.setStore(kind, on));
      loadNotes();
    } catch {
      setKindsError(true);
    } finally { setBusyKind(null); }
  };

  const total = unread + notesUnread;
  const notesOn = !notesOff;

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) { markAllSeen(); setView('feed'); loadNotes(); } }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Notifications">
          <Bell className="h-4.5 w-4.5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-1rem)] max-h-[75vh] overflow-y-auto">
        {view === 'kinds' ? (
          <KindsView kinds={kinds} failed={kindsError} busy={busyKind} onBack={() => setView('feed')}
            onRetry={loadKinds} onSwitch={switchKind} />
        ) : (
          <>
            {notesOn && (
              <>
                <DropdownMenuLabel className="flex items-center justify-between gap-2">
                  <span>Needs attention</span>
                  <span className="flex items-center gap-1">
                    {notesUnread > 0 && (
                      <button type="button" onClick={markNotesRead}
                        className="rounded px-1.5 py-0.5 text-[11px] font-normal text-blue-700 hover:bg-muted">
                        Mark all read
                      </button>
                    )}
                    <button type="button" onClick={() => { setView('kinds'); loadKinds(); }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="What I get" aria-label="Choose which notifications you get">
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notesError ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    Could not load the notifications.{' '}
                    <button type="button" className="underline" onClick={loadNotes}>Try again</button>
                  </div>
                ) : notes === null ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading
                  </div>
                ) : notes.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">Nothing needs your attention.</div>
                ) : (
                  notes.map((n) => <NoteItem key={n.id} note={n} onOpen={() => openNote(n)} />)
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{notesOn ? 'Latest orders' : 'Notifications'}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{notesOn ? 'refreshes every 30s' : 'latest orders, refreshes every 30s'}</span>
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
                      {n.at ? localeTime(n.at, { hour: '2-digit', minute: '2-digit' }, 'en-IN') : ''}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{n.detail}</span>
                </DropdownMenuItem>
              ))
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** One staff notification: the tone icon, the headline, the sentence (two lines), the kind and when. */
const NoteItem: React.FC<{ note: StaffNote; onOpen: () => void }> = ({ note: n, onOpen }) => {
  const sev = SEVERITY[n.severity] ?? SEVERITY.warning;
  const Icon = sev.icon;
  const unreadNow = !n.read_at && !n.cleared_at;
  return (
    <DropdownMenuItem className="flex cursor-pointer items-start gap-2 py-2" onClick={onOpen}
      title={n.link ? 'Open the screen' : undefined}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', n.cleared_at ? 'text-muted-foreground' : sev.tone)} aria-label={sev.label} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className={cn('min-w-0 flex-1 break-words text-sm leading-snug', unreadNow ? 'font-semibold' : 'font-medium')}>
            {n.title}
          </span>
          {unreadNow && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
        </div>
        {n.body && <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground" title={n.body}>{n.body}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{n.kind_label}</span>
          <span>{whenOf(n.created_at)}</span>
          {n.cleared_at && <span className="rounded bg-green-50 px-1 font-medium text-green-700">Resolved</span>}
        </div>
      </div>
    </DropdownMenuItem>
  );
};

/** "What I get": the person's own switch per kind, and the store's switch for a person who may manage settings. */
const KindsView: React.FC<{
  kinds: StaffKindList | null; failed: boolean; busy: string | null;
  onBack: () => void; onRetry: () => void; onSwitch: (kind: string, on: boolean, scope: 'mine' | 'store') => void;
}> = ({ kinds, failed, busy, onBack, onRetry, onSwitch }) => {
  const shown = (kinds?.items ?? []).filter((k) => k.may_see);
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to notifications">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <span>What I get</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {failed ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Could not load or save the switches.{' '}
          <button type="button" className="underline" onClick={onRetry}>Try again</button>
        </div>
      ) : !kinds ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading
        </div>
      ) : shown.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">Your role sees none of these notifications.</div>
      ) : (
        <ul className="space-y-1 px-2 pb-2">
          {shown.map((k) => (
            <li key={k.kind} className="rounded-md px-1 py-1.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium">{k.label}</div>
                  <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{k.help}</p>
                  {!k.store_on && <p className="mt-0.5 text-[11px] text-amber-700">Off for the whole store.</p>}
                </div>
                <Switch checked={k.store_on && k.mine_on} disabled={!k.store_on || busy !== null}
                  onCheckedChange={(on) => onSwitch(k.kind, on, 'mine')} aria-label={`${k.label}: for me`}
                  title={!k.store_on ? 'Switched off for the whole store' : undefined} />
              </div>
              {kinds.can_manage && (
                <label className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                  For the whole store
                  <Switch checked={k.store_on} disabled={busy !== null} className="scale-90"
                    onCheckedChange={(on) => onSwitch(k.kind, on, 'store')} aria-label={`${k.label}: for the whole store`} />
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default NotificationBell;
