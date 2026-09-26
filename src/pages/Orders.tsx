import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ordersAPI, shippingAPI } from '../services/api';
import { formatDate } from '../utils/date';
import { fmtRupees, fmtCurrencyMinor } from '../lib/money';
import { FaTruck, FaEye, FaDownload, FaPlus, FaSearchDollar, FaFileExcel, FaWhatsapp } from 'react-icons/fa';
import RecoverPaymentModal from '../components/order/RecoverPaymentModal';
import ErpExportModal from '../components/order/ErpExportModal';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { saveOrderNav } from '../lib/orderNav';
import { FilterChip, MenuChip, SegmentTabs, SearchBox, ListHeader, SavedViewBar, useSavedViews } from '../components/sales/ListChrome';
import type { SegmentTab } from '../components/sales/ListChrome';
import { Columns3 as FaTableColumns, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useListControls } from '../hooks/useListControls';
import { DASHBOARD_PRESETS } from '../components/panelAnalytics/DateRangeBar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast"; // Assuming useToast is available, fallback to alert if not
import { FaCheckCircle } from 'react-icons/fa';
import OrderBulkBar from '../components/order/OrderBulkBar';

/**
 * THE OPTIONAL COLUMNS.
 *
 * The list showed seven columns — order, customer, amount, payment, status,
 * date, actions — while the row it renders already carries the GST, the
 * discount, the refund, the invoice number, the channel, the salesperson and
 * (since the list decoration) how many lines and units it holds and how many of
 * them have shipped. None of that was reachable without opening each order.
 *
 * ⚠️ ONE REGISTRY, so the header and the body can never drift apart — the same
 * mistake `OrderItems` fixed in #215 by deriving every span from one object
 * instead of keeping two hand-maintained lists in step. `cell` renders the body,
 * the key renders the head, and `visibleCols` counts from the same array the
 * empty/loading rows span.
 */
interface OptionalColumn {
  key: string;
  label: string;
  /** On for a store that has never touched the picker. */
  defaultOn: boolean;
  align?: 'right' | 'center';
  title?: string;
  cell: (o: any) => React.ReactNode;
}

const num = (v: any) => Number(v) || 0;

const OPTIONAL_COLUMNS: OptionalColumn[] = [
  {
    key: 'items', label: 'Items', defaultOn: true, align: 'center',
    title: 'Lines and units on the order',
    cell: (o) => {
      const lines = num(o.lineCount ?? o.line_count);
      const units = num(o.unitCount ?? o.unit_count);
      const cancelled = num(o.cancelledUnits ?? o.cancelled_units);
      if (!lines && !units) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="leading-tight">
          <div className="font-medium tabular-nums">{units}<span className="text-muted-foreground"> u</span></div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{lines} line{lines === 1 ? '' : 's'}</div>
          {cancelled > 0 && (
            <div className="text-[11px] font-semibold text-rose-600 tabular-nums">{cancelled} cancelled</div>
          )}
        </div>
      );
    },
  },
  {
    key: 'fulfilment', label: 'Fulfilment', defaultOn: true, align: 'center',
    title: 'How much of the order has actually gone out',
    cell: (o) => {
      const state = o.fulfilment ?? o.fulfillment_state;
      const shipped = num(o.shippedUnits ?? o.shipped_units);
      const left = num(o.unshippedUnits ?? o.unshipped_units);
      const parcels = num(o.shipmentCount ?? o.shipment_count);
      if (!state || state === 'none') return <span className="text-muted-foreground">—</span>;
      const tone = state === 'shipped' ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
        : state === 'partial' ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-amber-300 bg-amber-50 text-amber-800';
      return (
        <div className="leading-tight">
          <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-semibold uppercase ${tone}`}>
            {state === 'shipped' ? 'Shipped' : state === 'partial' ? 'Part' : 'To ship'}
          </Badge>
          {state === 'partial' && (
            <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{shipped} out · {left} left</div>
          )}
          {parcels > 1 && <div className="text-[11px] text-muted-foreground">{parcels} parcels</div>}
        </div>
      );
    },
  },
  {
    key: 'invoice', label: 'Invoice', defaultOn: false,
    title: 'Tax invoice number, once one has been issued',
    cell: (o) => {
      const n = o.invoiceNumber ?? o.invoice_number;
      return n
        ? <span className="font-mono text-xs">{n}</span>
        : <span className="text-[11px] italic text-muted-foreground">not issued</span>;
    },
  },
  {
    key: 'gst', label: 'GST', defaultOn: false, align: 'right',
    title: 'Tax inside the order total',
    cell: (o) => num(o.tax) > 0
      ? <span className="tabular-nums">{fmtRupees(num(o.tax))}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'discount', label: 'Discount', defaultOn: false, align: 'right',
    cell: (o) => num(o.discount) > 0
      ? <span className="tabular-nums text-emerald-700">− {fmtRupees(num(o.discount))}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'refunded', label: 'Refunded', defaultOn: false, align: 'right',
    title: 'Money already sent back on this order',
    cell: (o) => num(o.refundedAmount ?? o.refunded_amount) > 0
      ? <span className="tabular-nums font-medium text-rose-700">{fmtRupees(num(o.refundedAmount ?? o.refunded_amount))}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'salesperson', label: 'Sold by', defaultOn: false,
    cell: (o) => {
      const who = o.salesAgentName ?? o.sales_agent_name ?? o.salesperson;
      return who ? <span className="text-xs">{who}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    key: 'delivery', label: 'Delivered', defaultOn: false,
    title: 'When it arrived, and when its return window closes',
    cell: (o) => {
      const d = o.deliveredAt ?? o.delivered_at;
      const rd = o.returnDeadline ?? o.return_deadline;
      if (!d) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="leading-tight text-xs">
          <div>{formatDate(d, 'MMM dd', '—')}</div>
          {rd && <div className="text-[11px] text-muted-foreground">window {formatDate(rd, 'MMM dd', '')}</div>}
        </div>
      );
    },
  },
];

const COLUMN_PREF_KEY = 'orders.columns.v1';

const Orders: React.FC = () => {
  const { canAccess, hasPerm } = useAuth();
  // Backend (routes/orders.ts): status change / manual order create / payment
  // mark-paid all require orders.manage. Send-to-Shiprocket is a DIFFERENT
  // permission (routes/shipping.ts POST /create-shipment -> shipments.manage) —
  // this page previously gated it only on canAccess('shipping'), a module-
  // enabled flag, not an actual permission (same class of gap already fixed on
  // OrderDetail.tsx 2026-08-28). This page had ZERO hasPerm gating before.
  const canManageOrders = hasPerm('orders.manage');
  const canManageShipments = hasPerm('shipments.manage');
  const [orders, setOrders] = useState<any[]>([]);
  /**
   * Which optional columns are on. Remembered per browser — a packing desk and
   * an accounts desk want different columns off the same list, and neither
   * should have to re-pick them every morning. A malformed/blocked localStorage
   * simply falls back to the defaults (never throws on read).
   */
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COLUMN_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((k) => OPTIONAL_COLUMNS.some((c) => c.key === k));
      }
    } catch { /* fall through to defaults */ }
    return OPTIONAL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const activeCols = OPTIONAL_COLUMNS.filter((c) => visibleCols.includes(c.key));
  const toggleCol = (key: string) => {
    setVisibleCols((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      try { localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  // Retail vs B2B tab — only meaningful (and only shown) when the B2B module is on.
  const [typeFilter, setTypeFilter] = useState<'all' | 'retail' | 'b2b'>('all');
  // WHERE the sale came from (migration 162) — a POS bill, the website, a manual
  // entry, the bulk portal. Distinct from the retail/B2B tab above, which is the
  // PRICE SCOPE: a counter sale to a wholesale customer is both `pos` and `b2b`.
  const [channelFilter, setChannelFilter] = useState('all');
  const [channels, setChannels] = useState<Array<{ code: string; label: string; description?: string }>>([]);
  // Channels this user is scoped to. EMPTY = every channel; when it is not empty
  // the page says so, because "there are no orders" and "you cannot see them"
  // must never look the same.
  const [channelAccess, setChannelAccess] = useState<string[]>([]);
  // Free-text search (order #, SKU, name, email, phone) — debounced the same
  // way Customers.tsx does (plain useState + setTimeout), not useListControls.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /**
   * PAYMENT and the two flags. All three are things the desk asks for every
   * day — "what is unpaid", "what did somebody flag", "which of these are
   * against a customer PO" — and none of them had a control, so the answer was
   * to read 100 rows. They are applied to the page the server returned, and the
   * strip says so, because a client-side narrowing of one page is not the same
   * thing as a query and must not be shown as one.
   */
  /** Payment is a SERVER filter (`payment_status`) — the route has always taken it. */
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'completed' | 'pending' | 'failed' | 'refunded'>('all');
  /** Fulfilment is decorated per page (decorateOrderListRows), so it narrows the loaded rows. */
  const [fulfilFilter, setFulfilFilter] = useState<'all' | 'to_ship' | 'partial' | 'shipped'>('all');
  /**
   * The date window. State is `useListControls` (the one list state hook) and the
   * presets are DateRangeBar's own — no new date component (Prompt 9 §5.2).
   */
  const dates = useListControls();
  const [datePreset, setDatePreset] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged' | 'po'>('all');
  // Same page size as before pagination existed (100) — adding page controls,
  // not shrinking how many orders staff see per screen.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 100;
  const b2bEnabled = canAccess('b2b');
  const [sendingToShiprocket, setSendingToShiprocket] = useState<string | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // People the bulk bar may hand orders to. Loaded once — the list is small and
  // the bar needs it the moment a row is ticked.
  const [assignableStaff, setAssignableStaff] = useState<Array<{ id: string; name: string | null; role: string }>>([]);
  const [showRecoverPayment, setShowRecoverPayment] = useState(false);
  // ERP hand-off: the legacy "Order Items Export" workbook the store's ERP
  // imports (since-last-export watermark or a custom date range).
  const [showErpExport, setShowErpExport] = useState(false);

  // Try to use toast, fallback to window.alert if not available
  let toast: any;
  try {
    const hook = useToast();
    toast = hook.toast;
  } catch (e) {
    toast = ({ title, description }: any) => window.alert(`${title ? title + ': ' : ''}${description}`);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Best-effort: the bulk bar drops its Assign picker rather than blocking if
  // this fails (a desk role may not be allowed to read the staff list).
  useEffect(() => {
    if (!canManageOrders) return;
    ordersAPI.assignableStaff().then(setAssignableStaff).catch(() => setAssignableStaff([]));
  }, [canManageOrders]);

  // Any filter/search change starts back at page 1 — otherwise a narrower
  // result set can leave the page number pointing past the last real page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, channelFilter, paymentFilter, debouncedSearch, dates.from, dates.to]);

  /** Filters that are applied to the page already fetched, not to the query. */
  const onPageFiltered = React.useMemo(() => orders.filter((o: any) => {
    const notes = String(o.notes ?? '');
    if (flagFilter === 'flagged' && !(o.isFlagged ?? o.is_flagged)) return false;
    if (flagFilter === 'po' && !/PO Ref:/i.test(notes)) return false;
    const fs = String(o.fulfilment ?? o.fulfillment_state ?? 'none');
    if (fulfilFilter === 'shipped' && fs !== 'shipped') return false;
    if (fulfilFilter === 'partial' && fs !== 'partial') return false;
    if (fulfilFilter === 'to_ship' && (fs === 'shipped' || fs === 'partial')) return false;
    // The date window is a SERVER filter (GET /orders from/to, store-civil
    // days), so it is not re-applied here.
    return true;
  }), [orders, flagFilter, fulfilFilter]);
  const hidingOnPage = orders.length - onPageFiltered.length;

  /** Every filter as one object — what a saved view is. */
  const currentView = { statusFilter, typeFilter, channelFilter, paymentFilter, flagFilter, fulfilFilter, datePreset, search };
  const { views, save: saveView, remove: removeView } = useSavedViews<typeof currentView>('orders');
  const applyView = (v: typeof currentView) => {
    setStatusFilter(v.statusFilter ?? 'all');
    setTypeFilter((v.typeFilter ?? 'all') as any);
    setChannelFilter(v.channelFilter ?? 'all');
    setPaymentFilter((v.paymentFilter ?? 'all') as any);
    setFlagFilter((v.flagFilter ?? 'all') as any);
    setFulfilFilter((v.fulfilFilter ?? 'all') as any);
    pickDate(v.datePreset ?? 'all');
    setSearch(v.search ?? '');
    setPage(1);
  };
  const clearFilters = () => applyView({
    statusFilter: 'all', typeFilter: 'all', channelFilter: 'all',
    paymentFilter: 'all', flagFilter: 'all', fulfilFilter: 'all', datePreset: 'all', search: '',
  } as any);
  /** A preset is recomputed when applied, so a saved "Past 7 days" means the last 7 days TODAY. */
  function pickDate(key: string) {
    setDatePreset(key);
    const preset = DASHBOARD_PRESETS.find((x) => x.key === key);
    const r = preset ? preset.range() : {};
    dates.setRange(r.from ?? '', r.to ?? '');
  }

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, typeFilter, channelFilter, paymentFilter, debouncedSearch, page, dates.from, dates.to]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.order_type = typeFilter;
      if (channelFilter !== 'all') params.channel = channelFilter;
      if (paymentFilter !== 'all') params.payment_status = paymentFilter;
      if (dates.from) params.from = dates.from;
      if (dates.to) params.to = dates.to;
      if (debouncedSearch) params.search = debouncedSearch;
      const response = await ordersAPI.getAll({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

      let fetchedOrders: any[] = [];
      if (Array.isArray(response)) {
        fetchedOrders = response;
      } else if (response?.data && Array.isArray(response.data)) {
        fetchedOrders = response.data;
      } else if (response?.success && response?.data && Array.isArray(response.data)) {
        fetchedOrders = response.data;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        fetchedOrders = response.data.data;
      } else {
        console.warn('Unexpected orders response structure:', response);
      }

      setOrders(fetchedOrders);
      // The axios interceptor unwraps { success, data, total } to the array
      // itself, with `total` preserved as a non-enumerable property (same
      // pattern Customers.tsx relies on) — read it off whichever value above
      // actually held the array.
      const resolvedTotal = (response as any)?.total ?? (fetchedOrders as any)?.total ?? fetchedOrders.length;
      setTotal(resolvedTotal);
      // The channel picker and this user's scope ride the SAME response, so the
      // page never fires a second call just to know what to draw.
      const ch = (response as any)?.channels ?? (fetchedOrders as any)?.channels;
      if (Array.isArray(ch)) setChannels(ch);
      const acc = (response as any)?.channelAccess ?? (fetchedOrders as any)?.channelAccess;
      if (Array.isArray(acc)) setChannelAccess(acc);
      setSelectedIds([]);
      // Publish this page's exact sequence so Order Detail can offer
      // "Previous / Next order" through the same filters the operator is
      // looking at (lib/orderNav.ts). Purely a navigation convenience — every
      // consumer works fine without it.
      const navLabels: Record<string, string> = {};
      fetchedOrders.forEach((o) => {
        const key = o._id ?? o.id;
        if (key) navLabels[key] = o.orderId ?? o.order_id ?? '';
      });
      saveOrderNav({
        ids: fetchedOrders.map((o) => o._id ?? o.id).filter(Boolean),
        labels: navLabels,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        total: resolvedTotal,
        params,
      });
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.response?.data?.message || 'Failed to load orders. Please try again.',
      });
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToShiprocket = async (orderId: string) => {
    if (!confirm('Send this order to Shiprocket for shipment creation?')) return;
    
    setSendingToShiprocket(orderId);
    try {
      // shippingProvider is REQUIRED by the backend (express-validator
      // `body('shippingProvider').notEmpty()`) — omitting it (as this call
      // always did) 400'd on every single click, always, before the request
      // ever reached the booking logic. This button's own confirm dialog
      // already says "Send this order to Shiprocket" — it just never told
      // the backend that.
      const response = await shippingAPI.createShipment(orderId, { shippingProvider: 'shiprocket' });
      toast({
        title: "Shipment Created",
        description: `Shipment created successfully!${response.data?.shipment?.awbCode ? ` AWB: ${response.data.shipment.awbCode}` : ''}`,
      });
      fetchOrders(); 
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      toast({
        variant: "destructive",
        title: "Shipment Failed",
        description: error.response?.data?.message || 'Failed to create shipment. Please try again.',
      });
    } finally {
      setSendingToShiprocket(null);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    if (!confirm('Confirm this order? After confirmation, you can create a shipment.')) return;
    
    setConfirmingOrder(orderId);
    try {
      await ordersAPI.confirmOrder(orderId);
      toast({ title: "Confirmed", description: 'Order confirmed successfully!' });
      fetchOrders();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to confirm order.' });
    } finally {
      setConfirmingOrder(null);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? [...new Set([...prev, id])] : prev.filter(x => x !== id));
  };

  /** Export the selected orders' sales data — or everything in the filter. */
  const handleExport = async (onlySelected: boolean) => {
    setExporting(true);
    try {
      await ordersAPI.exportCsv({
        ids: onlySelected ? selectedIds : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.response?.data?.message || 'Could not export orders' });
    } finally {
      setExporting(false);
    }
  };

  // Was a coarse 4-bucket variant scheme (default/secondary/destructive/
  // outline) that couldn't distinguish e.g. 'shipped' from 'confirmed' from
  // 'processing' — now sources real per-status colors from the same palette
  // components/order/StatusBadge.tsx centralizes for every other order/
  // payment-status display in the admin.

  const anyFilter = statusFilter !== 'all' || paymentFilter !== 'all' || flagFilter !== 'all'
    || typeFilter !== 'all' || channelFilter !== 'all' || fulfilFilter !== 'all' || datePreset !== 'all' || !!search;

  /**
   * THE TABS — where the sale came from, and which price book priced it.
   *
   * These two were dropdowns among six others, which buried the dimension staff
   * switch between most: "show me the counter", "show me the wholesale orders".
   * They are the shape of the business, so they sit on the surface.
   *
   * ⚠️ Channel and type are INDEPENDENT and both can be lit at once — a counter
   * sale to a wholesale account is `pos` AND `b2b` (migration 162 exists because
   * the two were once conflated). "All orders" is the only tab that clears both,
   * and clicking a lit tab turns just that one off, so every combination is
   * reachable in one click and none is unreachable.
   */
  const orderTabs: SegmentTab[] = React.useMemo(() => {
    const tabs: SegmentTab[] = [{
      key: 'all',
      label: 'All orders',
      on: channelFilter === 'all' && typeFilter === 'all',
      onPick: () => { setChannelFilter('all'); setTypeFilter('all'); },
      title: 'Every channel and both price books',
    }];

    // The price book. Only when the store actually sells B2B.
    if (b2bEnabled) {
      ([['retail', 'Retail'], ['b2b', 'B2B']] as const).forEach(([key, label], i) => {
        tabs.push({
          key: `type-${key}`,
          label,
          on: typeFilter === key,
          onPick: () => setTypeFilter(typeFilter === key ? 'all' : (key as any)),
          title: key === 'b2b'
            ? 'Orders priced from a wholesale price book, wherever they were taken'
            : 'Orders priced at retail, wherever they were taken',
          startsGroup: i === 0,
        });
      });
    }

    /**
     * The place. A staff member scoped to some channels (users.channel_access,
     * EMPTY = all) is offered only those — a tab that can only ever return an
     * empty page is worse than no tab.
     */
    const visible = channelAccess.length
      ? channels.filter((c) => channelAccess.includes(c.code))
      : channels;
    if (visible.length > 1) {
      visible.forEach((c, i) => {
        tabs.push({
          key: `ch-${c.code}`,
          label: c.label,
          on: channelFilter === c.code,
          onPick: () => setChannelFilter(channelFilter === c.code ? 'all' : c.code),
          title: (c as any).description || `Orders taken through ${c.label}`,
          startsGroup: i === 0,
        });
      });
    }
    return tabs;
  }, [channels, channelAccess, channelFilter, typeFilter, b2bEnabled]);

  const label = <T extends string>(list: ReadonlyArray<readonly [T, string]>, v: T) => list.find(([k]) => k === v)?.[1];
  const STATUS: ReadonlyArray<readonly [string, string]> = [
    ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['processing', 'Processing'], ['on_hold', 'On hold'],
    ['shipped', 'Shipped'], ['partially_delivered', 'Part delivered'], ['delivered', 'Delivered'],
    ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['returned', 'Returned'],
  ];
  const PAYMENT: ReadonlyArray<readonly [string, string]> = [
    ['completed', 'Paid'], ['pending', 'Unpaid'], ['failed', 'Failed'], ['refunded', 'Refunded'],
  ];
  const FULFIL: ReadonlyArray<readonly [string, string]> = [
    ['to_ship', 'To ship'], ['partial', 'Part shipped'], ['shipped', 'Shipped'],
  ];
  // (Retail/B2B moved out of the chip row and onto the tab strip — `orderTabs`.)
  const shown = onPageFiltered;
  const firstRow = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <ListHeader
        title="Orders"
        purpose="Every sale, wherever it came from — the website, the counter, the bulk portal or a phone call."
        action={canManageOrders && (
          <Button size="sm" className="h-9" asChild>
            <Link to="/orders/new"><FaPlus className="mr-1.5 h-3 w-3" /> New order</Link>
          </Button>
        )}
      />

      {/* ONE toolbar: search · every filter as a chip · columns · the ⋯ menu */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Order #, SKU, product, customer name, email or phone"
            label="Search orders"
            className="w-full sm:w-96"
          />
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs"
                onClick={() => setShowColumnPicker((v) => !v)}>
                <FaTableColumns className="h-3 w-3" /> Columns
                <span className="text-ink-mute tabular-nums">({activeCols.length})</span>
              </Button>
              {showColumnPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColumnPicker(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-60 rounded-md border border-line bg-surface-raised p-2 shadow-lg">
                    <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-mute">Extra columns</p>
                    {OPTIONAL_COLUMNS.map((c) => (
                      <label key={c.key} title={c.title}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-surface-2">
                        <Checkbox checked={visibleCols.includes(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs text-ink-mute">Export</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport(false)} disabled={exporting}>
                  <FaDownload className="mr-2 h-3 w-3" /> {exporting ? 'Exporting…' : 'All orders (CSV)'}
                </DropdownMenuItem>
                {/* Exporting the SELECTION lives on the bulk bar, where the
                    selection is — one place per action, not two. */}
                <DropdownMenuItem onClick={() => setShowErpExport(true)}>
                  <FaFileExcel className="mr-2 h-3 w-3" /> For the ERP (Excel)
                </DropdownMenuItem>
                {canManageOrders && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowRecoverPayment(true)}>
                      <FaSearchDollar className="mr-2 h-3 w-3" /> Recover a payment
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* WHERE it came from and WHICH price book — on the surface, not in a
            dropdown. Channel and type are separate groups: both can be lit. */}
        <SegmentTabs tabs={orderTabs} ariaLabel="Filter orders by channel and price book" />

        <div className="flex flex-wrap items-center gap-1.5">
          <MenuChip name="Status" value={label(STATUS, statusFilter)} options={STATUS}
            current={statusFilter} onPick={(v) => setStatusFilter(v ?? 'all')} />
          <MenuChip name="Date"
            value={datePreset !== 'all' ? DASHBOARD_PRESETS.find((x) => x.key === datePreset)?.label : undefined}
            options={DASHBOARD_PRESETS.map((x) => [x.key, x.label] as const)}
            current={datePreset} onPick={(v) => pickDate(v ?? 'all')} />
          <MenuChip name="Payment" value={label(PAYMENT, paymentFilter)} options={PAYMENT}
            current={paymentFilter} onPick={(v) => setPaymentFilter((v ?? 'all') as any)} />
          <MenuChip name="Fulfilment" value={label(FULFIL, fulfilFilter)} options={FULFIL}
            current={fulfilFilter} onPick={(v) => setFulfilFilter((v ?? 'all') as any)}
            hint="Worked out from the shipments on each order, so it narrows the orders on this page." />
          <FilterChip on={flagFilter === 'flagged'} tone="warn"
            onClick={() => setFlagFilter(flagFilter === 'flagged' ? 'all' : 'flagged')}>Flagged</FilterChip>
          <FilterChip on={flagFilter === 'po'}
            onClick={() => setFlagFilter(flagFilter === 'po' ? 'all' : 'po')}>Has a customer PO</FilterChip>
          {anyFilter && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft" onClick={clearFilters}>
              Clear all
            </Button>
          )}
        </div>

        <SavedViewBar views={views} current={currentView} onApply={applyView}
          onSave={saveView} onRemove={removeView} />

        {channelAccess.length > 0 && (
          <p className="text-xs text-warn-ink">
            You work orders from {channelAccess.length === 1 ? 'one channel' : `${channelAccess.length} channels`} only —
            other channels' orders are not shown.
          </p>
        )}
      </div>

      {/* What you can DO with a selection. Sits between the filters and the
          table, so it appears exactly where the ticked rows are. */}
      <OrderBulkBar
        rows={shown}
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onDone={fetchOrders}
        canManageOrders={canManageOrders}
        canManageShipments={canAccess('shipping') && canManageShipments}
        onExportSelected={() => handleExport(true)}
        exporting={exporting}
        staff={assignableStaff}
      />

      <div className="w-0 min-w-full overflow-x-auto rounded-md border border-line bg-surface">
        <Table>
          {/* `bg-surface` is not decoration: shadcn's TableHeader carries a built-in
              `bg-muted/60`, and only a later bg-* class beats it through twMerge. */}
          <TableHeader className="bg-surface border-b border-line">
            <TableRow>
              <TableHead className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={shown.length > 0 && selectedIds.length === shown.length}
                  aria-label="Select every order on this page"
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    setSelectedIds(checked ? shown.map(o => o._id) : [])}
                />
              </TableHead>
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Order</TableHead>
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Type</TableHead>
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Customer</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-semibold text-ink-soft">Amount</TableHead>
              {activeCols.map((c) => (
                <TableHead key={c.key} title={c.title}
                  className={`px-3 py-2.5 font-semibold text-ink-soft ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Payment</TableHead>
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Status</TableHead>
              <TableHead className="px-3 py-2.5 font-semibold text-ink-soft">Placed</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-semibold text-ink-soft">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell colSpan={9 + activeCols.length} className="px-3 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
                  </TableCell>
                </TableRow>
              ))
            ) : shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9 + activeCols.length} className="h-40 text-center">
                  <p className="text-sm font-medium text-ink">
                    {total === 0 && !anyFilter ? 'No orders yet' : 'Nothing matches those filters'}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {total === 0 && !anyFilter
                      ? 'The first sale from the website, the counter or a phone call will land here.'
                      : 'Clear a chip above, or search by order number, SKU, name, email or phone.'}
                  </p>
                  {anyFilter && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={clearFilters}>Clear the filters</Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((order) => {
                const phone = order.shippingAddress?.mobileNumber;
                const b2b = (order.orderType ?? order.order_type) === 'b2b';
                const tier = order.b2bTier ?? order.b2b_tier;
                const channelCode = order.salesChannel ?? order.sales_channel;
                const poRef = String(order.notes ?? '').match(/PO Ref:\s*([^\n]+)/i)?.[1]?.trim();
                const canConfirm = canManageOrders && order.orderStatus === 'pending';
                const confirmBlocked = order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed';
                const canShip = canAccess('shipping') && canManageShipments
                  && (order.orderStatus === 'confirmed' || order.orderStatus === 'processing');
                return (
                  <TableRow key={order._id} className="group hover:bg-surface-2">
                    <TableCell className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedIds.includes(order._id)}
                        aria-label={`Select order ${order.orderId ?? ''}`}
                        onCheckedChange={(checked: boolean | "indeterminate") => toggleSelect(order._id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <Link to={`/orders/${order._id}`}
                        className="whitespace-nowrap font-medium tabular-nums text-ink hover:underline">
                        {order.orderId || order._id?.substring(0, 8).toUpperCase()}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {channelCode && channelCode !== 'online_store' && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {channels.find(c => c.code === channelCode)?.label ?? channelCode}
                          </Badge>
                        )}
                        {(order.isFlagged ?? order.is_flagged) && (
                          <Badge variant="outline" className="border-bad bg-bad-bg px-1.5 py-0 text-[10px] text-bad-ink">Flagged</Badge>
                        )}
                        {/Source:\s*Bulk Order Platform/i.test(String(order.notes ?? '')) && (
                          <Badge variant="outline" className="border-warn bg-warn-bg px-1.5 py-0 text-[10px] text-warn-ink">Bulk platform</Badge>
                        )}
                        {poRef && (
                          <Badge variant="outline" className="border-info bg-info-bg px-1.5 py-0 text-[10px] text-info-ink"
                            title="The buyer's purchase-order reference">PO {poRef}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      {b2b ? (
                        <Badge variant="outline" className="whitespace-nowrap border-info bg-info-bg px-1.5 py-0 text-[10px] text-info-ink">
                          B2B{tier ? ` · ${tier}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-soft">Retail</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="font-medium text-ink">{order.shippingAddress?.fullName || 'Unknown customer'}</div>
                      {phone && (
                        /* The number IS the WhatsApp link, as it always was — one click, always visible. */
                        <button type="button" onClick={() => handleWhatsAppClick(phone)}
                          title="Open WhatsApp" aria-label={`Message ${phone} on WhatsApp`}
                          className="mt-0.5 flex items-center gap-1 text-xs font-medium tabular-nums text-info-ink hover:underline">
                          <FaWhatsapp size={13} className="text-good" />
                          {phone}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                      {fmtRupees(order.total || 0)}
                      {(() => {
                        const cur = String(order.currency ?? '').toUpperCase();
                        const pm = order.presentmentTotalMinor ?? order.presentment_total_minor;
                        const mkt = String(order.marketCode ?? order.market_code ?? '').toLowerCase();
                        if ((!cur || cur === 'INR') && (!mkt || mkt === 'in')) return null;
                        return (
                          <div className="mt-0.5 text-[11px] font-normal text-ink-soft">
                            {cur && cur !== 'INR' && pm != null && <span>≈ {fmtCurrencyMinor(pm, cur)}</span>}
                            {mkt && mkt !== 'in' && <span className="ml-1 uppercase">{mkt}</span>}
                          </div>
                        );
                      })()}
                    </TableCell>
                    {activeCols.map((c) => (
                      <TableCell key={c.key}
                        className={`px-3 py-2.5 text-sm ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''}`}>
                        {c.cell(order)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[11px] font-semibold uppercase text-ink-soft">
                          {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
                        </span>
                        <Badge variant="outline" className={`rounded-sm border-transparent px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider ${getStatusColorClass('payment', order.paymentStatus)}`}>
                          {order.paymentStatus}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <Badge variant="outline" className={`whitespace-nowrap border-transparent text-[11px] font-bold uppercase tracking-wider ${getStatusColorClass('order', order.orderStatus)}`}>
                        {String(order.orderStatus ?? '').replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums text-ink-soft">
                      <div>{formatDate(order.createdAt ?? order.created_at, 'dd MMM yyyy', '—')}</div>
                      <div className="text-xs text-ink">{formatDate(order.createdAt ?? order.created_at, 'hh:mm a', '')}</div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      {/* The row's actions stay IN the row, as they always did: confirm a
                          pending order, send a confirmed one to Shiprocket, open it. */}
                      <div className="isolate flex items-center justify-end gap-2">
                        {canConfirm && (
                          <Button
                            variant="default"
                            size="sm"
                            title={confirmBlocked ? 'Confirm — waiting for payment' : 'Confirm order'}
                            aria-label={`Confirm order ${order.orderId ?? ''}`}
                            className="h-8 w-8 shrink-0 rounded-full p-0"
                            onClick={() => handleConfirmOrder(order._id)}
                            disabled={confirmingOrder === order._id || confirmBlocked}
                          >
                            {confirmingOrder === order._id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                            ) : (
                              <FaCheckCircle size={14} />
                            )}
                          </Button>
                        )}
                        {canShip && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 gap-1.5 px-3"
                            onClick={() => handleSendToShiprocket(order._id)}
                            disabled={sendingToShiprocket === order._id}
                          >
                            <FaTruck size={12} />
                            <span className="hidden sm:inline">
                              {sendingToShiprocket === order._id ? 'Sending…' : 'Shiprocket'}
                            </span>
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-8 px-3" asChild>
                          <Link to={`/orders/${order._id}`}>
                            <FaEye className="mr-1.5 h-3.5 w-3.5 text-ink-mute" />
                            View
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* The count lives here, where the rows are — never as prose under the title. */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
        <div className="tabular-nums">
          {total > 0
            ? `Showing ${firstRow.toLocaleString('en-IN')}–${lastRow.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`
            : 'No orders'}
          {hidingOnPage > 0 && (
            <span className="ml-1 text-warn-ink">· {hidingOnPage} on this page hidden by a filter</span>
          )}
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>
              Next
            </Button>
          </div>
        )}
      </div>

      <RecoverPaymentModal
        isOpen={showRecoverPayment}
        onClose={() => setShowRecoverPayment(false)}
        onRecovered={fetchOrders}
      />
      <ErpExportModal
        isOpen={showErpExport}
        onClose={() => setShowErpExport(false)}
        canManage={canManageOrders}
      />
    </div>
  );
};

export default Orders;
